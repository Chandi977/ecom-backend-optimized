import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { config } from '../config';
import { IImageSignOptions } from '../types';
import { logger } from './logger';
import { cacheGet, cacheSet } from './redis';

// Cache signed URLs for less than their lifetime so a cached URL never outlives
// its own signature. Keep a 5-minute safety margin (min 60s).
const SIGN_CACHE_MARGIN = 300;
const signCacheTtl = (expiresIn: number): number => Math.max(60, expiresIn - SIGN_CACHE_MARGIN);

// Resized thumbnails live under this prefix, keyed by target width, as WebP.
const DERIVATIVE_PREFIX = 'derivatives';
const DERIVATIVE_TTL_DAYS = 30; // how long the "this derivative exists" flag is trusted
const derivativeKey = (key: string, width: number): string =>
  `${DERIVATIVE_PREFIX}/w${width}/${key}.webp`;

type ImageOutput = string | { image: string; [key: string]: unknown };

const getImageSourceValue = (imageSource: unknown): string => {
  if (typeof imageSource === 'string') return imageSource;
  if (imageSource && typeof imageSource === 'object') {
    const image = (imageSource as { image?: unknown }).image;
    return typeof image === 'string' ? image : '';
  }
  return '';
};

const buildImageOutput = (original: unknown, url: string): ImageOutput => {
  if (original && typeof original === 'object' && !Array.isArray(original)) {
    return { ...original, image: url };
  }
  return { image: url };
};

const safeDecodePath = (path: string): string =>
  path
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');

const getS3KeyFromImageSource = (imageSource: unknown): string | null => {
  const trimmed = getImageSourceValue(imageSource).trim();
  if (!trimmed) return '';

  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^\/+/, '');
  }

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    const bucketName = config.aws.bucketName.toLowerCase();
    const region = config.aws.region.toLowerCase();
    const cdnDomain = config.aws.cdnDomain.toLowerCase();

    if (cdnDomain && hostname === cdnDomain) {
      return safeDecodePath(url.pathname);
    }

    const virtualHostedS3Hosts = [
      `${bucketName}.s3.${region}.amazonaws.com`,
      `${bucketName}.s3.amazonaws.com`,
    ];

    if (virtualHostedS3Hosts.includes(hostname)) {
      return safeDecodePath(url.pathname);
    }

    const pathStyleS3Hosts = [`s3.${region}.amazonaws.com`, 's3.amazonaws.com'];
    if (pathStyleS3Hosts.includes(hostname)) {
      const path = safeDecodePath(url.pathname);
      const bucketPrefix = `${config.aws.bucketName}/`;
      return path.startsWith(bucketPrefix) ? path.slice(bucketPrefix.length) : null;
    }

    return null;
  } catch {
    return trimmed.replace(/^\/+/, '');
  }
};

const s3Client = new S3Client({
  credentials: {
    accessKeyId: config.aws.accessKey,
    secretAccessKey: config.aws.secretKey,
  },
  region: config.aws.region,
});

const streamToBuffer = async (body: unknown): Promise<Buffer> => {
  const stream = body as AsyncIterable<unknown>;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
};

const objectExists = async (key: string): Promise<boolean> => {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: config.aws.bucketName, Key: key }));
    return true;
  } catch {
    return false;
  }
};

/**
 * Resolve the S3 key to actually sign. For a thumbnail request, lazily generate
 * (once) a WebP derivative resized to `width` and cache it in S3 — subsequent
 * requests just sign the existing derivative. Any failure falls back to the
 * original key so images never break.
 */
const resolveImageKey = async (key: string, width?: number): Promise<string> => {
  if (!width || width <= 0) return key;
  const derivative = derivativeKey(key, width);
  const existsFlagKey = `s3:deriv:${derivative}`;

  try {
    // Fast path: we already know (or can confirm) the derivative exists.
    if (await cacheGet<boolean>(existsFlagKey)) return derivative;
    if (await objectExists(derivative)) {
      await cacheSet(existsFlagKey, true, DERIVATIVE_TTL_DAYS * 86400);
      return derivative;
    }

    // Generate it from the original.
    const original = await s3Client.send(
      new GetObjectCommand({ Bucket: config.aws.bucketName, Key: key })
    );
    const sourceBuffer = await streamToBuffer(original.Body);
    const resized = await sharp(sourceBuffer)
      .rotate() // honour EXIF orientation
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    await uploadToS3(derivative, resized, 'image/webp');
    await cacheSet(existsFlagKey, true, DERIVATIVE_TTL_DAYS * 86400);
    return derivative;
  } catch (error) {
    logger.warn('Thumbnail generation failed — serving original', {
      key,
      width,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return key;
  }
};

// Build a plain CDN URL for an S3 key (path segments URL-encoded individually
// so spaces / unicode in keys are handled).
const cdnUrlForKey = (key: string): string => {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `https://${config.aws.cdnDomain}/${encoded}`;
};

export const getSignedUrlForKey = async (
  imageSource: unknown,
  options: IImageSignOptions
): Promise<string> => {
  const key = getS3KeyFromImageSource(imageSource);
  if (key === null) return getImageSourceValue(imageSource);
  if (!key) return '';

  const keyToSign = await resolveImageKey(key, options.width);

  // CDN mode: CloudFront serves the (already-ensured) object from the edge.
  // No signing, no expiry — the URL is stable and fully browser/edge cacheable.
  if (config.aws.cdnDomain) {
    return cdnUrlForKey(keyToSign);
  }

  // Cache-aside on the (key, expiresIn) pair. Empty/error results are never cached.
  const cacheKey = `s3:sign:${options.expiresIn}:${keyToSign}`;
  const cached = await cacheGet<string>(cacheKey);
  if (cached) return cached;

  try {
    const command = new GetObjectCommand({
      Bucket: config.aws.bucketName,
      Key: keyToSign,
      // Let the browser cache the downloaded bytes for the life of the signed
      // URL. The bytes for a given key never change, so this is safe.
      ResponseCacheControl: `public, max-age=${signCacheTtl(options.expiresIn)}, immutable`,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: options.expiresIn });
    if (url) await cacheSet(cacheKey, url, signCacheTtl(options.expiresIn));
    return url;
  } catch (error) {
    logger.error('Failed to generate signed URL', {
      key: keyToSign,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return '';
  }
};

export const processImages = async (
  images: unknown[] | undefined,
  options: IImageSignOptions
): Promise<ImageOutput[]> => {
  if (!images || images.length === 0) return [];

  const results = await Promise.allSettled(
    images.map((img) => getSignedUrlForKey(img, options))
  );

  return results.map((r, index) =>
    buildImageOutput(images[index], r.status === 'fulfilled' ? r.value : '')
  );
};

export const attachSignedImagesToProducts = async (
  products: Array<{ images?: unknown }>,
  options: IImageSignOptions
): Promise<void> => {
  await Promise.all(
    products.map(async (product) => {
      if (Array.isArray(product.images) && product.images.length > 0) {
        product.images = await processImages(product.images, options);
      }
    })
  );
};

export const attachSignedImagesToOrders = async (
  orders: Array<{ items?: Array<{ product?: { images?: unknown } }> }>,
  options: IImageSignOptions
): Promise<void> => {
  for (const order of orders) {
    if (order.items) {
      for (const item of order.items) {
        if (item.product && Array.isArray(item.product.images)) {
          item.product.images = await processImages(item.product.images, options);
        }
      }
    }
  }
};

export const uploadToS3 = async (
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<void> => {
  const command = new PutObjectCommand({
    Bucket: config.aws.bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });
  await s3Client.send(command);
};
