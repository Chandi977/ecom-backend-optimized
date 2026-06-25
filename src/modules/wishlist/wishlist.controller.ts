import { Response } from 'express';
import mongoose from 'mongoose';
import Wishlist from '../wishlist/wishlist.model';
import { commonResponse } from '../../utils/response';
import { processImages } from '../../utils/s3';
import { IAuthRequest } from '../../types';

// Wishlist cards render small thumbnails — serve resized derivatives.
const IMAGE_SIGN_OPTIONS = { expiresIn: 86400, width: 400 };

const isAdmin = (req: IAuthRequest) => req.userRole === 'admin';

const normalizeId = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'object') return String((value as Record<string, unknown>)._id || value);
  return String(value);
};

const getTargetUserId = (req: IAuthRequest): string | undefined =>
  req.params?.id || req.body?.user || req.user;

const ensureAuthorizedUser = (req: IAuthRequest, userId?: string): boolean => {
  if (!req.user || !userId) return true;
  return isAdmin(req) || normalizeId(req.user) === normalizeId(userId);
};

const attachSignedWishlistImages = async (wishlist: Record<string, unknown>) => {
  const products = wishlist.products as Array<Record<string, unknown>> | undefined;
  if (!products?.length) return wishlist;
  const signedImagesByProductId = new Map<string, unknown[]>();
  await Promise.all(
    products.map(async (item) => {
      const product = item.product as Record<string, unknown> | undefined;
      const productId = normalizeId(product?._id);
      if (!productId || !Array.isArray(product?.images) || !product.images.length) return;
      if (!signedImagesByProductId.has(productId)) {
        const signedImages = await processImages(product.images as any[], IMAGE_SIGN_OPTIONS);
        signedImagesByProductId.set(productId, signedImages);
      }
      product.images = signedImagesByProductId.get(productId);
    })
  );
  return wishlist;
};

export const addToWishlist = async (req: IAuthRequest, res: Response): Promise<void> => {
  const targetUserId = getTargetUserId(req);
  const { product } = req.body;
  const productId = normalizeId(product?.product);

  if (!ensureAuthorizedUser(req, targetUserId)) {
    res.status(403).json(commonResponse('Forbidden', false)); return;
  }
  if (!(mongoose.Types.ObjectId as any).isValid(targetUserId!) || !(mongoose.Types.ObjectId as any).isValid(productId!)) {
    res.status(400).json(commonResponse('Invalid user or product', false)); return;
  }

  try {
    let wishlist = await Wishlist.findOne({ user: targetUserId }).exec();
    if (!wishlist) {
      wishlist = new Wishlist({ user: targetUserId, products: [productId] });
    } else {
      const productExists = wishlist.products.some((item: any) => normalizeId(item) === productId);
      if (productExists) {
        res.status(400).json(commonResponse('Product already in wishlist', false)); return;
      }
      wishlist.products.push(productId as unknown as string);
    }
    const wishlistUpdated = await wishlist.save();
    res.status(201).json(commonResponse('Item added to wishlist', true, wishlistUpdated));
  } catch (error) {
    res.status(500).json(commonResponse('Something went wrong', false));
  }
};

export const getWishlist = async (req: IAuthRequest, res: Response): Promise<void> => {
  const targetUserId = getTargetUserId(req);
  if (!ensureAuthorizedUser(req, targetUserId)) {
    res.status(403).json(commonResponse('Forbidden', false)); return;
  }
  if (!(mongoose.Types.ObjectId as any).isValid(targetUserId!)) {
    res.status(400).json(commonResponse('Invalid user', false)); return;
  }

  try {
    const wishlist = await Wishlist.findOne({ user: targetUserId }).populate('products').lean().exec();
    if (!wishlist) {
      res.status(404).json(commonResponse('Wishlist not found', false)); return;
    }
    const signedWishlist = await attachSignedWishlistImages(wishlist as unknown as Record<string, unknown>);
    res.status(200).json(commonResponse('Wishlist fetched', true, signedWishlist));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

export const getWishlistCount = async (req: IAuthRequest, res: Response): Promise<void> => {
  const targetUserId = getTargetUserId(req);
  if (!ensureAuthorizedUser(req, targetUserId)) {
    res.status(403).json(commonResponse('Forbidden', false)); return;
  }
  if (!(mongoose.Types.ObjectId as any).isValid(targetUserId!)) {
    res.status(400).json(commonResponse('Invalid user', false)); return;
  }

  try {
    const wishlist = await Wishlist.findOne({ user: targetUserId }).select('products').lean().exec();
    const count = Array.isArray(wishlist?.products) ? wishlist.products.length : 0;
    res.status(200).json(commonResponse(wishlist ? 'Wishlist count fetched' : 'Wishlist not found', !!wishlist, { count }));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

export const removeFromWishlist = async (req: IAuthRequest, res: Response): Promise<void> => {
  const targetUserId = getTargetUserId(req);
  const productId = normalizeId(req.body?.product);

  if (!ensureAuthorizedUser(req, targetUserId)) {
    res.status(403).json(commonResponse('Forbidden', false)); return;
  }
  if (!(mongoose.Types.ObjectId as any).isValid(targetUserId!) || !(mongoose.Types.ObjectId as any).isValid(productId!)) {
    res.status(400).json(commonResponse('Invalid user or product', false)); return;
  }

  try {
    const wishlist = await Wishlist.findOne({ user: targetUserId }).exec();
    if (!wishlist) {
      res.status(404).json(commonResponse('Wishlist not found', false)); return;
    }

    const updatedProducts = wishlist.products.filter((item: any) => normalizeId(item) !== productId);
    if (updatedProducts.length === wishlist.products.length) {
      res.status(404).json(commonResponse('Product not found in wishlist', false)); return;
    }

    wishlist.products = updatedProducts;
    const updatedWishlist = await wishlist.save();
    res.status(200).json(commonResponse('Product removed from wishlist', true, updatedWishlist));
  } catch (error) {
    res.status(500).json(commonResponse('Something went wrong', false));
  }
};
