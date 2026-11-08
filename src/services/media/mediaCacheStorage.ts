/**
 * Persistent Client-Side IndexedDB Media Cache.
 * 
 * Provides high-performance persistent storage for high-definition templates,
 * preview videos, and poster assets using the browser's IndexedDB API.
 * 
 * Capabilities:
 * - Database: "lumina_media_cache", store: "media_blobs", keyPath: "url"
 * - LRU (Least Recently Used) automatic cache eviction when stored assets exceed 100MB
 *   or browser storage consumption exceeds 80% of navigator.storage quota.
 * - Stale-while-revalidate HEAD validation support with ETag and Last-Modified tracking.
 * - Safe tracked Object URL registry with automatic lifecycle cleanup and revocation.
 * - Cache telemetry: Hit/miss counts, storage size, item count, and eviction counts.
 * - Fails safely in private browsing / SSR environments without breaking UI playback.
 */

export interface CachedMediaEntry {
  url: string;
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  etag?: string;
  lastModified?: string;
  cachedAt: number;
  lastAccessedAt: number;
  mediaRole?: 'hd_video' | 'hd_image' | 'preview_video' | 'preview_image' | 'cover';
  version?: string;
}

export interface MediaCacheTelemetry {
  hitCount: number;
  missCount: number;
  totalBytesStored: number;
  quotaBytes: number;
  itemCount: number;
  evictionCount: number;
  hitRatePercent: number;
}

const DB_NAME = 'lumina_media_cache';
const DB_VERSION = 1;
const STORE_NAME = 'media_blobs';
const MAX_CACHE_BYTES = 100 * 1024 * 1024; // 100 MB target limit
const PRUNE_TARGET_BYTES = 75 * 1024 * 1024; // Prune to 75 MB on eviction

export class MediaCacheStorage {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private objectUrlMap = new Map<string, string>(); // url -> objectUrl
  private protectedUrls = new Set<string>(); // URLs currently active in player or viewport protected from eviction
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;

  /**
   * Protect an active media URL (e.g. playing in modal) from being evicted by LRU pruning.
   */
  public protectUrl(url: string): void {
    if (url) this.protectedUrls.add(url);
  }

  /**
   * Unprotect a media URL when component unmounts or playback terminates.
   */
  public unprotectUrl(url: string): void {
    if (url) this.protectedUrls.delete(url);
  }

  /**
   * Safe asynchronous IndexedDB connection initializer.
   */
  public async getDb(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return null;
    }

    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const request = window.indexedDB.open(DB_NAME, DB_VERSION);

          request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
              store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
              store.createIndex('cachedAt', 'cachedAt', { unique: false });
              store.createIndex('sizeBytes', 'sizeBytes', { unique: false });
            }
          };

          request.onsuccess = () => {
            resolve(request.result);
          };

          request.onerror = () => {
            console.warn('[MediaCacheStorage] IndexedDB open error, continuing with memory fallback');
            resolve(null);
          };
        } catch {
          resolve(null);
        }
      });
    }

    return this.dbPromise;
  }

  /**
   * Retrieves a cached media Blob by URL, touches lastAccessedAt timestamp for LRU ordering,
   * and returns a safe Object URL for immediate video/image playback.
   */
  public async get(url: string): Promise<{ blob: Blob; objectUrl: string; etag?: string } | null> {
    if (!url || typeof url !== 'string') return null;

    // Fast-path: Return cached Object URL if already created in memory
    const existingObjUrl = this.objectUrlMap.get(url);

    const db = await this.getDb();
    if (!db) {
      if (existingObjUrl) {
        this.hitCount++;
        return { blob: new Blob([]), objectUrl: existingObjUrl };
      }
      this.missCount++;
      return null;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(url);

        getReq.onsuccess = () => {
          const entry = getReq.result as CachedMediaEntry | undefined;
          if (entry && entry.blob) {
            this.hitCount++;
            // Update lastAccessedAt for LRU
            entry.lastAccessedAt = Date.now();
            try {
              store.put(entry);
            } catch {}

            let objUrl = existingObjUrl;
            if (!objUrl) {
              try {
                objUrl = URL.createObjectURL(entry.blob);
                this.objectUrlMap.set(url, objUrl);
              } catch {
                objUrl = url;
              }
            }

            resolve({
              blob: entry.blob,
              objectUrl: objUrl,
              etag: entry.etag
            });
          } else {
            this.missCount++;
            resolve(null);
          }
        };

        getReq.onerror = () => {
          this.missCount++;
          resolve(null);
        };
      } catch {
        this.missCount++;
        resolve(null);
      }
    });
  }

  /**
   * Saves a media Blob into IndexedDB with metadata, performs quota & LRU checks,
   * and registers an in-memory Object URL.
   */
  public async set(
    url: string,
    blob: Blob,
    options?: {
      etag?: string;
      lastModified?: string;
      mediaRole?: 'hd_video' | 'hd_image' | 'preview_video' | 'preview_image' | 'cover';
      version?: string;
    }
  ): Promise<string> {
    if (!url || !blob) return url;

    // Create or reuse Object URL
    let objectUrl = this.objectUrlMap.get(url);
    if (!objectUrl) {
      try {
        objectUrl = URL.createObjectURL(blob);
        this.objectUrlMap.set(url, objectUrl);
      } catch {
        objectUrl = url;
      }
    }

    const db = await this.getDb();
    if (!db) return objectUrl;

    const entry: CachedMediaEntry = {
      url,
      blob,
      mimeType: blob.type || 'application/octet-stream',
      sizeBytes: blob.size,
      etag: options?.etag,
      lastModified: options?.lastModified,
      cachedAt: Date.now(),
      lastAccessedAt: Date.now(),
      mediaRole: options?.mediaRole,
      version: options?.version
    };

    try {
      // Check current storage and trigger LRU eviction if needed
      await this.enforceQuotaGuard(blob.size);

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const putReq = store.put(entry);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      });
    } catch (err) {
      console.warn('[MediaCacheStorage] IndexedDB set error:', err);
    }

    return objectUrl;
  }

  /**
   * Evaluates storage footprint and triggers LRU pruning if limit or browser quota is exceeded.
   */
  private async enforceQuotaGuard(incomingBytes: number): Promise<void> {
    try {
      // 1. Check browser quota estimate if available
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate.quota && estimate.usage) {
          const usageRatio = (estimate.usage + incomingBytes) / estimate.quota;
          if (usageRatio > 0.8) {
            await this.evictLru(PRUNE_TARGET_BYTES);
            return;
          }
        }
      }

      // 2. Check total bytes stored in our store
      const totalBytes = await this.getTotalBytesStored();
      if (totalBytes + incomingBytes > MAX_CACHE_BYTES) {
        await this.evictLru(PRUNE_TARGET_BYTES);
      }
    } catch {}
  }

  /**
   * Prunes oldest accessed items (LRU) until total stored bytes falls below target.
   */
  public async evictLru(targetBytes: number = PRUNE_TARGET_BYTES): Promise<number> {
    const db = await this.getDb();
    if (!db) return 0;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('lastAccessedAt');
        const req = index.openCursor(null, 'next'); // oldest first

        let currentBytesPromise = this.getTotalBytesStored();
        currentBytesPromise.then((totalBytes) => {
          let freedBytes = 0;
          let remainingBytes = totalBytes;

          req.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor && remainingBytes > targetBytes) {
              const item = cursor.value as CachedMediaEntry;

              // Safeguard: Never evict active media playing in user viewport or modal
              if (this.protectedUrls.has(item.url)) {
                cursor.continue();
                return;
              }

              const itemSize = item.sizeBytes || 0;

              // Revoke Object URL if active
              const activeObjUrl = this.objectUrlMap.get(item.url);
              if (activeObjUrl) {
                try {
                  URL.revokeObjectURL(activeObjUrl);
                } catch {}
                this.objectUrlMap.delete(item.url);
              }

              cursor.delete();
              freedBytes += itemSize;
              remainingBytes -= itemSize;
              this.evictionCount++;
              cursor.continue();
            } else {
              resolve(freedBytes);
            }
          };

          req.onerror = () => resolve(freedBytes);
        });
      } catch {
        resolve(0);
      }
    });
  }

  /**
   * Calculate total bytes stored in IndexedDB.
   */
  public async getTotalBytesStored(): Promise<number> {
    const db = await this.getDb();
    if (!db) return 0;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();
        let total = 0;

        req.onsuccess = (e: any) => {
          const cursor = e.target.result;
          if (cursor) {
            total += (cursor.value as CachedMediaEntry).sizeBytes || 0;
            cursor.continue();
          } else {
            resolve(total);
          }
        };

        req.onerror = () => resolve(0);
      } catch {
        resolve(0);
      }
    });
  }

  /**
   * Delete a specific asset from cache.
   */
  public async delete(url: string): Promise<boolean> {
    const existing = this.objectUrlMap.get(url);
    if (existing) {
      try {
        URL.revokeObjectURL(existing);
      } catch {}
      this.objectUrlMap.delete(url);
    }

    const db = await this.getDb();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(url);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Clear all cached media assets from IndexedDB and revoke all Object URLs.
   */
  public async clear(): Promise<void> {
    for (const objUrl of this.objectUrlMap.values()) {
      try {
        URL.revokeObjectURL(objUrl);
      } catch {}
    }
    this.objectUrlMap.clear();

    const db = await this.getDb();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Retrieves live cache telemetry statistics.
   */
  public async getStats(): Promise<MediaCacheTelemetry> {
    let totalBytesStored = 0;
    let itemCount = 0;
    let quotaBytes = 0;

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        quotaBytes = est.quota || 0;
      } catch {}
    }

    const db = await this.getDb();
    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.openCursor();
          req.onsuccess = (e: any) => {
            const cursor = e.target.result;
            if (cursor) {
              itemCount++;
              totalBytesStored += (cursor.value as CachedMediaEntry).sizeBytes || 0;
              cursor.continue();
            } else {
              resolve();
            }
          };
          req.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }

    const totalRequests = this.hitCount + this.missCount;
    const hitRatePercent = totalRequests > 0 ? Math.round((this.hitCount / totalRequests) * 100) : 0;

    return {
      hitCount: this.hitCount,
      missCount: this.missCount,
      totalBytesStored,
      quotaBytes,
      itemCount,
      evictionCount: this.evictionCount,
      hitRatePercent
    };
  }
}

export const mediaCacheStorage = new MediaCacheStorage();
