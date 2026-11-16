/**
 * Centralized Media Playback Coordinator, Honest Network-Aware Rendition Selector & Playback Telemetry.
 *
 * Ensures:
 * - Zero concurrent background autoPlay video storms on mobile/low-end devices
 * - Only one active gallery/featured/hero video decodes at a time (pausing others + pausing on tab switch/modals)
 * - Honest rendition selection: switches between preview and HD ONLY when distinct URLs actually exist
 * - Data-Saver (navigator.connection.saveData) and slow-network respect
 * - Scrubbed, rate-limited slow-buffering / decode-error reporting to Admin Error Alerts
 */

export type NetworkTier = 'conserve' | 'standard' | 'high';

export interface NetworkPlaybackProfile {
  saveData: boolean;
  effectiveType: string;
  downlinkMbps: number | null;
  isSlowNetwork: boolean;
  isLowEndDevice: boolean;
  tier: NetworkTier;
  maxPreload: 'none' | 'metadata';
  allowAutoPlay: boolean;
}

export interface RenditionSelectionResult {
  selectedUrl: string;
  qualityTier: 'preview' | 'hd' | 'single_source';
  adaptiveRenditionAvailable: boolean;
  singleSource: boolean;
}

export function getNetworkPlaybackProfile(envOverride?: {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}): NetworkPlaybackProfile {
  const nav: any = typeof navigator !== 'undefined' ? navigator : {};
  const conn: any = nav.connection || nav.mozConnection || nav.webkitConnection || {};

  const saveData = envOverride?.saveData ?? Boolean(conn?.saveData);
  const effectiveType = String(envOverride?.effectiveType ?? conn?.effectiveType ?? '4g').toLowerCase();
  const downlinkMbps: number | null =
    typeof envOverride?.downlink === 'number'
      ? envOverride.downlink
      : typeof conn?.downlink === 'number'
      ? conn.downlink
      : null;

  const deviceMemory: number | undefined =
    typeof envOverride?.deviceMemory === 'number'
      ? envOverride.deviceMemory
      : typeof nav.deviceMemory === 'number'
      ? nav.deviceMemory
      : undefined;

  const hardwareConcurrency: number | undefined =
    typeof envOverride?.hardwareConcurrency === 'number'
      ? envOverride.hardwareConcurrency
      : typeof nav.hardwareConcurrency === 'number'
      ? nav.hardwareConcurrency
      : undefined;

  const isSlowType = effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g';
  const isLowDownlink = downlinkMbps !== null && downlinkMbps < 1.8;
  const isSlowNetwork = saveData || isSlowType || isLowDownlink;
  const isLowEndDevice =
    (deviceMemory !== undefined && deviceMemory <= 2) ||
    (hardwareConcurrency !== undefined && hardwareConcurrency <= 4);

  let tier: NetworkTier = 'standard';
  if (saveData || isSlowNetwork) {
    tier = 'conserve';
  } else if (effectiveType === '4g' && (downlinkMbps === null || downlinkMbps >= 5) && !isLowEndDevice) {
    tier = 'high';
  }

  return {
    saveData,
    effectiveType,
    downlinkMbps,
    isSlowNetwork,
    isLowEndDevice,
    tier,
    maxPreload: isSlowNetwork || isLowEndDevice ? 'none' : 'metadata',
    allowAutoPlay: !saveData && effectiveType !== 'slow-2g' && effectiveType !== '2g'
  };
}

/**
 * Selects the honest best rendition URL.
 * Never claims adaptive bitrate switching when only a single video source exists.
 */
export function selectMediaRendition(options: {
  previewUrl?: string | null;
  hdUrl?: string | null;
  network?: NetworkPlaybackProfile;
  preferHd?: boolean;
}): RenditionSelectionResult {
  const preview = (options.previewUrl || '').trim();
  const hd = (options.hdUrl || '').trim();
  const profile = options.network || getNetworkPlaybackProfile();

  if (!preview && !hd) {
    return {
      selectedUrl: '',
      qualityTier: 'single_source',
      adaptiveRenditionAvailable: false,
      singleSource: true
    };
  }

  // Genuine distinct renditions available?
  const hasDistinctRenditions = Boolean(preview && hd && preview !== hd);
  if (!hasDistinctRenditions) {
    return {
      selectedUrl: hd || preview,
      qualityTier: 'single_source',
      adaptiveRenditionAvailable: false,
      singleSource: true
    };
  }

  const canUpgradeToHd =
    !profile.saveData &&
    !profile.isSlowNetwork &&
    (options.preferHd ? true : profile.tier === 'high');

  return {
    selectedUrl: canUpgradeToHd ? hd : preview,
    qualityTier: canUpgradeToHd ? 'hd' : 'preview',
    adaptiveRenditionAvailable: true,
    singleSource: false
  };
}

interface RegisteredPlayer {
  id: string;
  screen?: string;
  isModal?: boolean;
  priority: number;
  pause: () => void;
}

class MediaPlaybackCoordinator {
  private players = new Map<string, RegisteredPlayer>();
  private modalLocks = new Set<string>();
  private activePlayerId: string | null = null;
  private activeScreen: string = 'home';
  private documentHidden: boolean = typeof document !== 'undefined' ? Boolean(document.hidden) : false;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.documentHidden = Boolean(document.hidden);
        if (this.documentHidden) {
          this.pauseAll();
        }
      });
    }
  }

  public register(
    id: string,
    pauseFn: () => void,
    options?: { priority?: number; screen?: string; isModal?: boolean }
  ): () => void {
    this.players.set(id, {
      id,
      priority: options?.priority ?? 1,
      screen: options?.screen,
      isModal: options?.isModal,
      pause: pauseFn
    });
    return () => {
      this.players.delete(id);
      if (this.activePlayerId === id) {
        this.activePlayerId = null;
      }
    };
  }

  public requestPlay(id: string): boolean {
    if (this.documentHidden) return false;
    const requester = this.players.get(id);
    const isModalPlayer = Boolean(requester?.isModal || id.startsWith('modal:'));

    // Do not start background videos if a blocking modal is open
    if (this.modalLocks.size > 0 && !isModalPlayer) {
      return false;
    }

    // Do not play background screen video when user switched to another tab
    if (requester?.screen && !isModalPlayer && requester.screen !== this.activeScreen) {
      return false;
    }

    for (const [otherId, player] of this.players.entries()) {
      if (otherId !== id) {
        try {
          player.pause();
        } catch {}
      }
    }
    this.activePlayerId = id;
    return true;
  }

  public releasePlay(id: string): void {
    if (this.activePlayerId === id) {
      this.activePlayerId = null;
    }
  }

  public setModalLock(modalId: string, locked: boolean): void {
    if (locked) {
      this.modalLocks.add(modalId);
      for (const [id, player] of this.players.entries()) {
        if (!player.isModal && !id.startsWith('modal:')) {
          try {
            player.pause();
          } catch {}
          if (this.activePlayerId === id) {
            this.activePlayerId = null;
          }
        }
      }
    } else {
      this.modalLocks.delete(modalId);
    }
  }

  public setActiveScreen(screen: string): void {
    this.activeScreen = screen;
    for (const [id, player] of this.players.entries()) {
      if (!player.isModal && !id.startsWith('modal:') && player.screen && player.screen !== screen) {
        try {
          player.pause();
        } catch {}
        if (this.activePlayerId === id) {
          this.activePlayerId = null;
        }
      }
    }
  }

  public pauseAll(): void {
    for (const player of this.players.values()) {
      try {
        player.pause();
      } catch {}
    }
    this.activePlayerId = null;
  }

  public isModalLocked(): boolean {
    return this.modalLocks.size > 0;
  }

  public getStateSnapshot() {
    return {
      activePlayerId: this.activePlayerId,
      activeScreen: this.activeScreen,
      modalLocks: Array.from(this.modalLocks),
      registeredCount: this.players.size
    };
  }
}

export const mediaPlaybackCoordinator = new MediaPlaybackCoordinator();

const recentTelemetryTimestamps = new Map<string, number>();

export function reportMediaPlaybackIssue(params: {
  vector: 'MEDIA_PLAYBACK_FAILURE' | 'MEDIA_SLOW_BUFFERING';
  message: string;
  templateId?: string;
  errorStage: string;
  endpoint?: string;
}): void {
  if (typeof fetch !== 'function') return;
  const dedupKey = `${params.vector}:${params.templateId || 'global'}:${params.errorStage}`;
  const now = Date.now();
  const prev = recentTelemetryTimestamps.get(dedupKey) || 0;
  if (now - prev < 30_000) return;
  recentTelemetryTimestamps.set(dedupKey, now);

  fetch('/api/errors/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: params.vector,
      severity: params.vector === 'MEDIA_PLAYBACK_FAILURE' ? 'ERROR' : 'WARNING',
      message: params.message.slice(0, 220),
      templateId: params.templateId,
      errorStage: params.errorStage,
      endpoint: params.endpoint
    })
  }).catch(() => {});
}
