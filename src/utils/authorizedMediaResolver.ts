import { useState, useEffect, useCallback, useRef } from 'react';
import { getStoredSessionToken } from './authSession';

export interface AuthorizedDeliveryBundle {
  ok: boolean;
  fileId: string;
  url: string;
  fallbackUrl: string;
  downloadUrl: string;
  mimeType: string;
  sizeBytes?: number;
  isPublic?: boolean;
  expiresInSeconds?: number;
  expiresAtMs?: number;
  statusCode?: number;
  error?: string;
}

const BUNDLE_CACHE = new Map<string, AuthorizedDeliveryBundle>();

export function clearAuthorizedMediaCache(): void {
  BUNDLE_CACHE.clear();
}

function decodeBase64UrlSegment(segment: string): string {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLen);
    return atob(padded);
  } catch {
    return '';
  }
}

export function extractMediaFileId(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return null;

  let pathname = trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      pathname = parsed.pathname;
    } catch {
      return null;
    }
  } else {
    pathname = trimmed.split('?')[0].split('#')[0];
  }

  // Signed token format: /api/media/signed/<base64url(fileId).exp.owner.sig>
  const signedMatch = pathname.match(/^\/api\/media\/signed\/([^/]+)$/i);
  if (signedMatch?.[1]) {
    const token = decodeURIComponent(signedMatch[1]);
    const firstPart = token.split('.')[0];
    const decoded = firstPart ? decodeBase64UrlSegment(firstPart) : '';
    return decoded || null;
  }

  // Standard format: /api/media/:fileId or /api/media/:fileId/signed-url or /api/media/:fileId/download
  const stdMatch = pathname.match(/^\/api\/media\/([^/]+)(?:\/(?:signed-url|download))?$/i);
  if (stdMatch?.[1] && stdMatch[1].toLowerCase() !== 'signed') {
    return decodeURIComponent(stdMatch[1]);
  }

  return null;
}

export function isPrivateAppMediaUrl(rawUrl?: string | null): boolean {
  return extractMediaFileId(rawUrl) !== null;
}

function isSameOriginUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/')) return true;
  if (typeof window === 'undefined') return false;
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function inferMediaExtension(mimeType?: string, rawUrl?: string, fallbackType?: 'photo' | 'video'): string {
  const mime = (mimeType || '').toLowerCase();
  const cleanPath = (rawUrl || '').split('?')[0].toLowerCase();

  if (mime.includes('video/mp4') || mime.includes('mp4')) return 'mp4';
  if (mime.includes('video/webm') || mime.includes('webm')) return 'webm';
  if (mime.includes('video/quicktime') || mime.includes('mov')) return 'mov';
  if (mime.startsWith('video/')) return 'mp4';

  if (mime.includes('image/png') || mime.includes('png')) return 'png';
  if (mime.includes('image/webp') || mime.includes('webp')) return 'webp';
  if (mime.includes('image/jpeg') || mime.includes('image/jpg') || mime.includes('jpeg')) return 'jpg';

  if (cleanPath.endsWith('.mp4')) return 'mp4';
  if (cleanPath.endsWith('.webm')) return 'webm';
  if (cleanPath.endsWith('.mov')) return 'mov';
  if (cleanPath.endsWith('.png')) return 'png';
  if (cleanPath.endsWith('.webp')) return 'webp';
  if (cleanPath.endsWith('.jpg') || cleanPath.endsWith('.jpeg')) return 'jpg';

  return fallbackType === 'video' ? 'mp4' : 'png';
}

export async function resolveAuthorizedMedia(
  rawUrl: string,
  options?: { forceRefresh?: boolean }
): Promise<AuthorizedDeliveryBundle> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      fileId: '',
      url: '',
      fallbackUrl: '',
      downloadUrl: '',
      mimeType: '',
      error: 'No media URL available'
    };
  }

  // Inline data/blob URLs or non-app external CDN URLs do not go through signed-url resolution
  const fileId = extractMediaFileId(trimmed);
  if (!fileId) {
    return {
      ok: true,
      fileId: '',
      url: trimmed,
      fallbackUrl: trimmed,
      downloadUrl: trimmed,
      mimeType: '',
      isPublic: true
    };
  }

  const token = getStoredSessionToken() || '';
  const cacheKey = `${token ? token.slice(-12) : 'anon'}:${fileId}`;
  const cached = BUNDLE_CACHE.get(cacheKey);
  if (
    !options?.forceRefresh &&
    cached &&
    cached.ok &&
    cached.expiresAtMs &&
    cached.expiresAtMs - Date.now() > 45_000
  ) {
    return cached;
  }

  if (options?.forceRefresh) {
    BUNDLE_CACHE.delete(cacheKey);
  }

  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`/api/media/${encodeURIComponent(fileId)}/signed-url`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null;

    if (!res.ok || !data?.url) {
      return {
        ok: false,
        fileId,
        url: '',
        fallbackUrl: '',
        downloadUrl: '',
        mimeType: '',
        statusCode: res.status,
        error: data?.error || (res.status === 401 || res.status === 403
          ? 'Authorization required to view this private media.'
          : `Failed to authorize media access (HTTP ${res.status}).`)
      };
    }

    const ttlSec = typeof data.expiresInSeconds === 'number' && data.expiresInSeconds > 0 ? data.expiresInSeconds : 300;
    const bundle: AuthorizedDeliveryBundle = {
      ok: true,
      fileId,
      url: data.url,
      fallbackUrl: data.fallbackUrl || `/api/media/${encodeURIComponent(fileId)}`,
      downloadUrl: data.downloadUrl || `/api/media/${encodeURIComponent(fileId)}/download`,
      mimeType: data.mimeType || '',
      sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : undefined,
      isPublic: Boolean(data.isPublic),
      expiresInSeconds: ttlSec,
      expiresAtMs: Date.now() + ttlSec * 1000
    };
    BUNDLE_CACHE.set(cacheKey, bundle);
    return bundle;
  } catch (err: any) {
    return {
      ok: false,
      fileId,
      url: '',
      fallbackUrl: '',
      downloadUrl: '',
      mimeType: '',
      statusCode: 0,
      error: err?.message || 'Network error while authorizing media access.'
    };
  }
}

export function useAuthorizedMedia(
  rawUrl?: string | null,
  options?: { isActive?: boolean }
) {
  const isEnabled = options?.isActive !== false && Boolean(rawUrl && rawUrl.trim());
  const isPrivate = isPrivateAppMediaUrl(rawUrl);

  const [resolvedUrl, setResolvedUrl] = useState<string>(() => (!isPrivate && rawUrl ? rawUrl : ''));
  const [fallbackUrl, setFallbackUrl] = useState<string>('');
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [mimeType, setMimeType] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(() => Boolean(isEnabled && isPrivate));
  const [error, setError] = useState<string | null>(null);
  const retryCountRef = useRef(0);
  const usedFallbackRef = useRef(false);

  const load = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!isEnabled || !rawUrl) {
        setResolvedUrl('');
        setFallbackUrl('');
        setDownloadUrl('');
        setLoading(false);
        setError(null);
        return;
      }

      if (!isPrivateAppMediaUrl(rawUrl)) {
        setResolvedUrl(rawUrl);
        setFallbackUrl(rawUrl);
        setDownloadUrl(rawUrl);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      const bundle = await resolveAuthorizedMedia(rawUrl, { forceRefresh });
      if (bundle.ok && bundle.url) {
        setResolvedUrl(bundle.url);
        setFallbackUrl(bundle.fallbackUrl || bundle.url);
        setDownloadUrl(bundle.downloadUrl || bundle.url);
        setMimeType(bundle.mimeType || '');
        setLoading(false);
        setError(null);
      } else {
        setResolvedUrl('');
        setFallbackUrl('');
        setDownloadUrl('');
        setLoading(false);
        setError(bundle.error || 'Preview could not be loaded.');
      }
    },
    [rawUrl, isEnabled]
  );

  useEffect(() => {
    retryCountRef.current = 0;
    usedFallbackRef.current = false;
    let cancelled = false;

    const run = async () => {
      if (!isEnabled || !rawUrl) {
        if (!cancelled) {
          setResolvedUrl('');
          setLoading(false);
          setError(null);
        }
        return;
      }
      await load(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [rawUrl, isEnabled, load]);

  /**
   * Automatically switches to same-origin signed fallback or refreshes expired signed URL once
   * before showing a final Retry state to the user. Returns true if a recovery attempt started.
   */
  const handleMediaLoadError = useCallback(async (): Promise<boolean> => {
    if (!rawUrl || !isPrivateAppMediaUrl(rawUrl)) {
      return false;
    }

    if (!usedFallbackRef.current && fallbackUrl && fallbackUrl !== resolvedUrl) {
      usedFallbackRef.current = true;
      setResolvedUrl(fallbackUrl);
      return true;
    }

    if (retryCountRef.current < 1) {
      retryCountRef.current += 1;
      await load(true);
      return true;
    }

    setError('Media preview failed to load or signed access expired. Tap Retry.');
    return false;
  }, [rawUrl, fallbackUrl, resolvedUrl, load]);

  return {
    resolvedUrl,
    fallbackUrl,
    downloadUrl,
    mimeType,
    loading,
    error,
    isPrivate,
    refresh: () => {
      retryCountRef.current = 0;
      usedFallbackRef.current = false;
      return load(true);
    },
    handleMediaLoadError
  };
}

function triggerBrowserBlobDownload(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {}
  }, 5000);
}

async function fetchValidatedMediaBlob(
  url: string,
  includeBearer: boolean
): Promise<{ blob: Blob; contentType: string }> {
  const headers: Record<string, string> = {};
  if (includeBearer) {
    const token = getStoredSessionToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: 'GET',
    headers,
    credentials: includeBearer ? 'include' : 'omit'
  });

  if (!res.ok) {
    const errCt = (res.headers.get('content-type') || '').toLowerCase();
    let msg = `Download failed (HTTP ${res.status})`;
    if (errCt.includes('application/json')) {
      const jsonErr = await res.json().catch(() => null);
      if (jsonErr?.error) msg = jsonErr.error;
    }
    throw new Error(msg);
  }

  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json') || ct.includes('text/html') || ct.startsWith('text/')) {
    throw new Error('Server returned an unexpected error document instead of a media file.');
  }

  const blob = await res.blob();
  const effectiveCt = (ct || blob.type || '').toLowerCase();
  if (effectiveCt.includes('application/json') || effectiveCt.includes('text/html')) {
    throw new Error('Blocked invalid non-media response payload.');
  }
  if (!blob || blob.size === 0) {
    throw new Error('Downloaded media file was empty (0 bytes).');
  }

  return { blob, contentType: effectiveCt };
}

export async function downloadAuthorizedMedia(params: {
  rawUrl?: string | null;
  preferredFilename: string;
  mediaKind?: 'photo' | 'video';
}): Promise<{ ok: boolean; filename?: string; sizeBytes?: number; error?: string }> {
  const rawUrl = (params.rawUrl || '').trim();
  if (!rawUrl) {
    return { ok: false, error: 'No deliverable media file found for this generation.' };
  }

  const baseName = params.preferredFilename
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || `aiprime_${Date.now()}`;

  try {
    // Handle direct inline data URI / blob URL safely
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
      const { blob, contentType } = await fetchValidatedMediaBlob(rawUrl, false);
      const ext = inferMediaExtension(contentType, rawUrl, params.mediaKind);
      const filename = `${baseName}.${ext}`;
      triggerBrowserBlobDownload(blob, filename);
      return { ok: true, filename, sizeBytes: blob.size };
    }

    const fileId = extractMediaFileId(rawUrl);
    if (!fileId) {
      // Public external URL
      const { blob, contentType } = await fetchValidatedMediaBlob(rawUrl, isSameOriginUrl(rawUrl));
      const ext = inferMediaExtension(contentType, rawUrl, params.mediaKind);
      const filename = `${baseName}.${ext}`;
      triggerBrowserBlobDownload(blob, filename);
      return { ok: true, filename, sizeBytes: blob.size };
    }

    // Resolve fresh short-lived bundle from server (never bare unauthenticated fetch)
    const bundle = await resolveAuthorizedMedia(rawUrl, { forceRefresh: true });
    if (!bundle.ok || !bundle.url) {
      return { ok: false, error: bundle.error || 'Could not authorize download for this media.' };
    }

    // Try primary presigned URL first; if R2 CORS or cross-origin fetch fails, fallback seamlessly to same-origin authenticated proxy
    try {
      const isPrimarySameOrigin = isSameOriginUrl(bundle.url);
      const { blob, contentType } = await fetchValidatedMediaBlob(bundle.url, isPrimarySameOrigin);
      const ext = inferMediaExtension(contentType || bundle.mimeType, bundle.url, params.mediaKind);
      const filename = `${baseName}.${ext}`;
      triggerBrowserBlobDownload(blob, filename);
      return { ok: true, filename, sizeBytes: blob.size };
    } catch (primaryErr: any) {
      const proxyCandidates = [
        bundle.downloadUrl,
        `/api/media/${encodeURIComponent(fileId)}/download`
      ].filter((candidate, idx, arr) => Boolean(candidate) && candidate !== bundle.url && arr.indexOf(candidate) === idx);

      let lastErr: any = primaryErr;
      for (const proxyUrl of proxyCandidates) {
        try {
          const { blob, contentType } = await fetchValidatedMediaBlob(proxyUrl, true);
          const ext = inferMediaExtension(contentType || bundle.mimeType, proxyUrl, params.mediaKind);
          const filename = `${baseName}.${ext}`;
          triggerBrowserBlobDownload(blob, filename);
          return { ok: true, filename, sizeBytes: blob.size };
        } catch (proxyErr: any) {
          lastErr = proxyErr;
        }
      }

      return {
        ok: false,
        error: lastErr?.message || 'Unable to download authorized media file. Please retry.'
      };
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unexpected download error. Please retry.' };
  }
}
