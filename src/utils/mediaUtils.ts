/**
 * Media detection utility for high-fidelity audio/video and image handling.
 * Evaluates Data URIs, MIME types, file extensions, and media hosting paths.
 */

export const isVideoMedia = (url?: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (clean.startsWith('data:video/')) return true;
  if (clean.startsWith('data:image/')) return false;
  if (/\.(mp4|webm|mov|m4v|ogg|ogv)(\?.*)?$/i.test(clean)) return true;
  if (
    clean.includes('/video/') ||
    clean.includes('assets.mixkit.co/videos') ||
    clean.includes('admin_upload_video') ||
    clean.includes('preview_video')
  ) {
    return true;
  }
  return false;
};

export const isImageMedia = (url?: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (clean.startsWith('data:image/')) return true;
  if (clean.startsWith('data:video/')) return false;
  if (/\.(jpg|jpeg|png|webp|gif|svg|avif)(\?.*)?$/i.test(clean)) return true;
  if (clean.includes('images.unsplash.com') || clean.includes('/image/')) return true;
  return !isVideoMedia(url);
};

export const getMediaMimeType = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('data:')) {
    const match = url.match(/data:([^;]+)/);
    if (match) return match[1];
  }
  if (/\.mp4(\?.*)?$/i.test(url)) return 'video/mp4';
  if (/\.webm(\?.*)?$/i.test(url)) return 'video/webm';
  if (/\.mov(\?.*)?$/i.test(url)) return 'video/quicktime';
  if (/\.png(\?.*)?$/i.test(url)) return 'image/png';
  if (/\.webp(\?.*)?$/i.test(url)) return 'image/webp';
  if (/\.gif(\?.*)?$/i.test(url)) return 'image/gif';
  return 'image/jpeg';
};
