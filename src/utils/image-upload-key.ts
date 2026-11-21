import { randomUUID } from 'crypto';

// Email images are immutable: a later upload must never change an older email
// or reuse a cached CDN URL, even when both files are named "image.png".
export const buildImageUploadKey = (originalName: string, purpose: unknown, mimeType: string): string => {
  if (purpose !== 'marketing-email') return originalName;
  const extension: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  };
  return `marketing-email/${randomUUID()}.${extension[mimeType] || 'img'}`;
};
