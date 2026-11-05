/**
 * Background HD Media Download Queue.
 * 
 * Implements a prioritized, concurrency-controlled background prefetching
 * and caching queue for heavy HD media assets (video clips and hi-res posters).
 * 
 * Features:
 * - 3-tier priority queue (HIGH, MEDIUM, LOW)
 * - Concurrency limited to max 2 simultaneous downloads to protect UI rendering & main thread
 * - Data Saver / slow cellular network detection (auto-throttles or skips low-priority prefetches)
 * - In-memory object URL cache for instant zero-latency replay
 */

export type QueuePriority = 'high' | 'medium' | 'low';

export interface QueueItem {
  id: string;
  url: string;
  priority: QueuePriority;
  addedAt: number;
  resolve: (cachedUrl: string) => void;
  reject: (err: any) => void;
}

export interface QueueStats {
  pendingCount: number;
  activeCount: number;
  completedCount: number;
  cacheSize: number;
  isDataSaver: boolean;
}

class HdDownloadQueueManager {
  private queue: QueueItem[] = [];
  private inFlight = new Map<string, Promise<string>>();
  private activeDownloads = 0;
  private maxConcurrency = 2;
  private blobCache = new Map<string, string>();
  private completedCount = 0;

  /**
   * Detects whether user has enabled Data Saver or is on a very slow mobile network.
   */
  public isDataSaverActive(): boolean {
    if (typeof navigator === 'undefined') return false;
    const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (!conn) return false;

    if (conn.saveData === true) return true;
    if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g') return true;

    return false;
  }

  /**
   * Enqueues an asset URL for background HD download with priority.
   * High: User opened template modal or is generating.
   * Medium: Featured hero items near viewport.
   * Low: Idle background prefetching for templates further down the list.
   */
  public queueHdDownload(url: string, priority: QueuePriority = 'medium'): Promise<string> {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return Promise.resolve(url);
    }

    // Return immediately if already cached
    if (this.blobCache.has(url)) {
      return Promise.resolve(this.blobCache.get(url)!);
    }

    // In-flight deduplication: return existing promise if already downloading
    if (this.inFlight.has(url)) {
      return this.inFlight.get(url)!;
    }

    // If Data Saver / slow cellular is active and priority is not high, skip download to respect customer bandwidth
    if (this.isDataSaverActive() && (priority === 'low' || priority === 'medium')) {
      return Promise.resolve(url);
    }

    const downloadPromise = new Promise<string>((resolve, reject) => {
      const item: QueueItem = {
        id: `hd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        url,
        priority,
        addedAt: Date.now(),
        resolve,
        reject
      };

      // Priority insertion: high first, then medium, then low
      const priorityWeights: Record<QueuePriority, number> = { high: 3, medium: 2, low: 1 };
      const insertIndex = this.queue.findIndex(
        (existing) => priorityWeights[existing.priority] < priorityWeights[priority]
      );

      if (insertIndex === -1) {
        this.queue.push(item);
      } else {
        this.queue.splice(insertIndex, 0, item);
      }

      this.processNext();
    }).finally(() => {
      this.inFlight.delete(url);
    });

    this.inFlight.set(url, downloadPromise);
    return downloadPromise;
  }

  /**
   * Processes queue items according to concurrency limits.
   */
  private async processNext(): Promise<void> {
    if (this.activeDownloads >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    // Check cache again in case a parallel download for the same URL finished
    if (this.blobCache.has(item.url)) {
      item.resolve(this.blobCache.get(item.url)!);
      this.processNext();
      return;
    }

    this.activeDownloads++;

    try {
      const response = await fetch(item.url, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`HD download HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      this.blobCache.set(item.url, objectUrl);
      this.completedCount++;

      item.resolve(objectUrl);
    } catch {
      // Fallback gracefully to original remote URL without breaking the UI
      item.resolve(item.url);
    } finally {
      this.activeDownloads--;
      this.processNext();
    }
  }

  /**
   * Inspect current queue statistics.
   */
  public getStats(): QueueStats {
    return {
      pendingCount: this.queue.length,
      activeCount: this.activeDownloads,
      completedCount: this.completedCount,
      cacheSize: this.blobCache.size,
      isDataSaver: this.isDataSaverActive()
    };
  }

  /**
   * Clear in-memory blob URLs when needed to release memory.
   */
  public clearCache(): void {
    for (const objUrl of this.blobCache.values()) {
      try {
        URL.revokeObjectURL(objUrl);
      } catch {}
    }
    this.blobCache.clear();
  }
}

export const hdDownloadQueue = new HdDownloadQueueManager();
export const queueHdDownload = (url: string, priority?: QueuePriority) => hdDownloadQueue.queueHdDownload(url, priority);
export const isDataSaverActive = () => hdDownloadQueue.isDataSaverActive();
export const getQueueStats = () => hdDownloadQueue.getStats();
