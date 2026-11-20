/**
 * Centralized Media Playback Manager, Adaptive Network-Aware Rendition Selector & Playback Telemetry.
 *
 * Designed for seamless, unrestricted automatic gallery video previews:
 * - All visible Template & FaceSwap video cards autoplay simultaneously (muted, inline, looped)
 *   as the user browses and scrolls — NO max-1 or max-2 video cap and NO click-to-play gate.
 * - Quality automatically adapts to mobile hardware capability (RAM/CPU) and network speed
 *   (preview/lighter rendition on weak networks or low-end devices; HD upgrade on fast 4G/Wi-Fi).
 * - Fetches metadata/first-frame safely even on weak connections so real poster/preview frames show
 *   with zero black screens.
 * - Still pauses background gallery videos cleanly during modals (TemplateDetailModal, fullscreen),
 *   tab switches, or screen navigation, and resumes them automatically when returning.
 */

export type NetworkTier = 'conserve' | 'standard' | 'high';

export interface NetworkPlaybackProfile {
  saveData: boolean;
  effectiveType: string;
  downlinkMbps: number | null;
  isSlowNetwork: boolean;
  isLowEndDevice: boolean;
  tier: NetworkTier;
  maxPreload: 'none' | 'metadata' | 'auto';
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
  if (saveData || isSlowNetwork || isLowEndDevice) {
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
    // Always fetch at least metadata/first-frame on slow networks (never blank/black); full auto on high tier
    maxPreload: tier === 'high' ? 'auto' : 'metadata',
    // All template & FaceSwap previews should attempt muted inline autoplay automatically
    allowAutoPlay: true
  };
}

/**
 * Subscribes to live browser Network Information API changes so video quality adjusts dynamically
 * if mobile connectivity improves or weakens mid-session.
 */
export function subscribeNetworkProfileChange(
  onChange: (profile: NetworkPlaybackProfile) => void
): () => void {
  if (typeof navigator === 'undefined') return () => {};
  const nav: any = navigator;
  const conn: any = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn || typeof conn.addEventListener !== 'function') return () => {};

  const handler = () => {
    onChange(getNetworkPlaybackProfile());
  };
  conn.addEventListener('change', handler);
  return () => {
    try {
      conn.removeEventListener('change', handler);
    } catch {}
  };
}

/**
 * Selects the honest best rendition URL based on mobile device capability and internet speed.
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
    !profile.isLowEndDevice &&
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
  visibilityRatio: number;
  pause: () => void;
  play?: () => void;
}

class MediaPlaybackCoordinator {
  private players = new Map<string, RegisteredPlayer>();
  private modalLocks = new Set<string>();
  private activePlayers = new Set<string>();
  private activeScreen: string = 'home';
  private documentHidden: boolean = typeof document !== 'undefined' ? Boolean(document.hidden) : false;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.documentHidden = Boolean(document.hidden);
        if (this.documentHidden) {
          this.pauseAll();
        } else {
          this.resumeVisiblePlayers();
        }
      });
    }
  }

  public register(
    id: string,
    pauseFn: () => void,
    options?: { priority?: number; screen?: string; isModal?: boolean; play?: () => void }
  ): () => void {
    this.players.set(id, {
      id,
      priority: options?.priority ?? 1,
      screen: options?.screen,
      isModal: options?.isModal,
      visibilityRatio: 0,
      pause: pauseFn,
      play: options?.play
    });
    return () => {
      this.players.delete(id);
      this.activePlayers.delete(id);
    };
  }

  /**
   * Updates viewport visibility for an individual video player.
   * All visible videos play concurrently without pausing each other; off-screen videos pause cleanly.
   */
  public updateVisibility(id: string, visibilityRatio: number, playFn?: () => void): void {
    const player = this.players.get(id);
    if (!player) return;
    player.visibilityRatio = Math.max(0, Math.min(1, visibilityRatio));
    if (playFn) {
      player.play = playFn;
    }

    if (player.visibilityRatio <= 0.01) {
      this.activePlayers.delete(id);
      try {
        player.pause();
      } catch {}
      return;
    }

    if (this.canPlayerPlay(player)) {
      this.activePlayers.add(id);
      if (player.play) {
        try {
          player.play();
        } catch {}
      }
    }
  }

  private canPlayerPlay(player: RegisteredPlayer): boolean {
    if (this.documentHidden) return false;
    const isModalPlayer = Boolean(player.isModal || player.id.startsWith('modal:'));
    if (this.modalLocks.size > 0 && !isModalPlayer) return false;
    if (player.screen && !isModalPlayer && player.screen !== this.activeScreen) return false;
    return true;
  }

  private resumeVisiblePlayers(): void {
    if (this.documentHidden || this.modalLocks.size > 0) return;
    for (const player of this.players.values()) {
      if (player.isModal || player.id.startsWith('modal:')) continue;
      if (player.screen && player.screen !== this.activeScreen) continue;
      if (player.visibilityRatio > 0.01) {
        this.activePlayers.add(player.id);
        if (player.play) {
          try {
            player.play();
          } catch {}
        }
      }
    }
  }

  public isPlayerActive(id: string): boolean {
    return this.activePlayers.has(id);
  }

  /**
   * Checks whether a player is allowed to play (tab active, no modal lock, matching screen).
   * Does NOT pause sibling gallery videos so multiple visible templates autoplay together.
   */
  public requestPlay(id: string): boolean {
    if (this.documentHidden) return false;
    const requester = this.players.get(id);
    const isModalPlayer = Boolean(requester?.isModal || id.startsWith('modal:'));

    if (this.modalLocks.size > 0 && !isModalPlayer) {
      return false;
    }

    if (requester?.screen && !isModalPlayer && requester.screen !== this.activeScreen) {
      return false;
    }

    this.activePlayers.add(id);
    return true;
  }

  public releasePlay(id: string): void {
    this.activePlayers.delete(id);
  }

  public setModalLock(modalId: string, locked: boolean): void {
    if (locked) {
      this.modalLocks.add(modalId);
      for (const [id, player] of this.players.entries()) {
        if (!player.isModal && !id.startsWith('modal:')) {
          this.activePlayers.delete(id);
          try {
            player.pause();
          } catch {}
        }
      }
    } else {
      this.modalLocks.delete(modalId);
      if (this.modalLocks.size === 0) {
        this.resumeVisiblePlayers();
      }
    }
  }

  public setActiveScreen(screen: string): void {
    this.activeScreen = screen;
    for (const [id, player] of this.players.entries()) {
      if (!player.isModal && !id.startsWith('modal:') && player.screen && player.screen !== screen) {
        this.activePlayers.delete(id);
        try {
          player.pause();
        } catch {}
      }
    }
    this.resumeVisiblePlayers();
  }

  public pauseAll(): void {
    for (const player of this.players.values()) {
      try {
        player.pause();
      } catch {}
    }
    this.activePlayers.clear();
  }

  public isModalLocked(): boolean {
    return this.modalLocks.size > 0;
  }

  public getStateSnapshot() {
    return {
      activePlayerId: Array.from(this.activePlayers)[0] || null,
      activePlayerIds: Array.from(this.activePlayers),
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

export function reportHtmlVideoError(params: {
  videoEl: HTMLVideoElement | null;
  contextLabel: string;
  templateId?: string;
  errorStage: string;
  endpoint?: string;
}): void {
  const mediaErr = params.videoEl?.error || null;
  const errCode = mediaErr?.code ?? 0;

  // Ignore benign user/lifecycle-triggered MEDIA_ERR_ABORTED (code === 1) caused by element src swap or navigation
  if (errCode === 1) {
    return;
  }

  const codeLabel =
    errCode === 2
      ? 'MEDIA_ERR_NETWORK'
      : errCode === 3
      ? 'MEDIA_ERR_DECODE'
      : errCode === 4
      ? 'MEDIA_ERR_SRC_NOT_SUPPORTED'
      : 'MEDIA_ERR_UNKNOWN';

  let hevcHint = '';
  if ((errCode === 3 || errCode === 4) && params.videoEl && typeof params.videoEl.canPlayType === 'function') {
    const hevcSupport = params.videoEl.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"');
    if (!hevcSupport) {
      hevcHint = ' (browser reports no HEVC/H.265 decode support; verify H.264/yuv420p encoding)';
    }
  }

  reportMediaPlaybackIssue({
    vector: 'MEDIA_PLAYBACK_FAILURE',
    message: `${params.contextLabel} [${codeLabel}/${errCode}]${hevcHint}`,
    templateId: params.templateId,
    errorStage: `${params.errorStage}:${codeLabel.toLowerCase()}`,
    endpoint: params.endpoint
  });
}

/**
 * Safely captures a lightweight first-frame poster JPEG from a decoded video element
 * when no explicit poster image exists. Returns null cleanly on CORS-tainted canvases.
 */
export function captureFirstFramePoster(videoEl: HTMLVideoElement | null, maxWidth = 360): string | null {
  if (!videoEl || typeof document === 'undefined') return null;
  try {
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh || videoEl.readyState < 2) return null;
    const targetWidth = Math.min(maxWidth, vw);
    const targetHeight = Math.max(1, Math.round((vh / vw) * targetWidth));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoEl, 0, 0, targetWidth, targetHeight);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    return dataUrl && dataUrl.startsWith('data:image/') ? dataUrl : null;
  } catch {
    return null;
  }
}
