import { buildImageUploadKey } from './image-upload-key';

describe('email image storage keys', () => {
  it('uses different keys for repeated filenames, preventing overwrite and CDN cache collisions', () => {
    const first = buildImageUploadKey('image.png', 'marketing-email', 'image/png');
    const second = buildImageUploadKey('image.png', 'marketing-email', 'image/png');
    expect(first).not.toBe(second);
    expect(first).toMatch(/^marketing-email\/[a-f0-9-]+\.png$/);
  });

  it('uses MIME extensions and does not include untrusted filename paths', () => {
    expect(buildImageUploadKey('../../image.png', 'marketing-email', 'image/jpeg')).toMatch(/^marketing-email\/[a-f0-9-]+\.jpg$/);
  });

  it('preserves the existing key contract for other upload callers', () => {
    expect(buildImageUploadKey('product.png', undefined, 'image/png')).toBe('product.png');
  });
});
