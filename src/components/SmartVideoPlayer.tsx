import React, { useEffect, useRef, useState } from 'react';
import {
  captureFirstFramePoster,
  getNetworkPlaybackProfile,
  mediaPlaybackCoordinator,
  reportMediaPlaybackIssue,
  selectMediaRendition
} from '../services/media/mediaPlaybackManager';

interface SmartVideoPlayerProps {
  playerId: string;
  src: string;
  hdSrc?: string | null;
  poster?: string;
  alt?: string;
  screen?: string;
  isModal?: boolean;
  priority?: number;
  templateId?: string;
  errorStage?: string;
  muted?: boolean;
  loop?: boolean;
  autoPlay?: boolean;
  preferHd?: boolean;
  controls?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onLoadedData?: (videoEl: HTMLVideoElement) => void;
  onPlayStateChange?: (playing: boolean) => void;
  onClick?: () => void;
}

export const SmartVideoPlayer: React.FC<SmartVideoPlayerProps> = ({
  playerId,
  src,
  hdSrc,
  poster,
  alt = 'Video preview',
  screen = 'home',
  isModal = false,
  priority = 1,
  templateId,
  errorStage = 'smart_video_player',
  muted = true,
  loop = true,
  autoPlay = true,
  preferHd = false,
  controls = false,
  className = '',
  style,
  onLoadedData,
  onPlayStateChange,
  onClick
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const waitingTimerRef = useRef<any>(null);

  const [isVisible, setIsVisible] = useState(isModal);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [fallbackPoster, setFallbackPoster] = useState<string>('');

  const networkProfile = getNetworkPlaybackProfile();
  const rendition = selectMediaRendition({
    previewUrl: src,
    hdUrl: hdSrc,
    network: networkProfile,
    preferHd
  });

  useEffect(() => {
    const unregister = mediaPlaybackCoordinator.register(
      playerId,
      () => {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
          onPlayStateChange?.(false);
        }
      },
      { priority, screen, isModal }
    );
    return unregister;
  }, [playerId, priority, screen, isModal, onPlayStateChange]);

  useEffect(() => {
    if (isModal) {
      setIsVisible(true);
      return;
    }
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
            setIsVisible(true);
            mediaPlaybackCoordinator.updateVisibility(playerId, entry.intersectionRatio, () => {
              if (autoPlay && networkProfile.allowAutoPlay && videoRef.current) {
                videoRef.current.muted = muted;
                videoRef.current.play().catch(() => {});
              }
            });
          } else {
            if (videoRef.current && !videoRef.current.paused) {
              videoRef.current.pause();
              onPlayStateChange?.(false);
            }
            mediaPlaybackCoordinator.updateVisibility(playerId, 0);
            mediaPlaybackCoordinator.releasePlay(playerId);
          }
        });
      },
      { threshold: [0.05, 0.25, 0.6], rootMargin: '80px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isModal, autoPlay, muted, playerId, networkProfile.allowAutoPlay, onPlayStateChange]);

  useEffect(() => {
    return () => {
      if (waitingTimerRef.current) {
        clearTimeout(waitingTimerRef.current);
      }
      mediaPlaybackCoordinator.releasePlay(playerId);
    };
  }, [playerId]);

  const effectiveSrc = rendition.selectedUrl;
  const resolvedPoster = poster || fallbackPoster || undefined;

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      {resolvedPoster && (
        <img
          src={resolvedPoster}
          alt={alt}
          loading="lazy"
          style={style}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            hasLoaded && !hasError ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        />
      )}

      {isVisible && effectiveSrc && !hasError && (
        <video
          ref={videoRef}
          src={effectiveSrc}
          poster={resolvedPoster}
          muted={muted}
          loop={loop}
          playsInline
          controls={controls}
          preload={isModal ? 'metadata' : networkProfile.maxPreload}
          onClick={onClick}
          onLoadedData={(e) => {
            setHasLoaded(true);
            setHasError(false);
            if (!poster && !fallbackPoster) {
              const frame = captureFirstFramePoster(e.currentTarget);
              if (frame) setFallbackPoster(frame);
            }
            if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
            onLoadedData?.(e.currentTarget);
            if (autoPlay && (isModal || networkProfile.allowAutoPlay)) {
              if (mediaPlaybackCoordinator.requestPlay(playerId)) {
                e.currentTarget.play().catch(() => {});
              }
            }
          }}
          onPlay={() => {
            mediaPlaybackCoordinator.requestPlay(playerId);
            onPlayStateChange?.(true);
          }}
          onPause={() => {
            mediaPlaybackCoordinator.releasePlay(playerId);
            onPlayStateChange?.(false);
          }}
          onWaiting={() => {
            if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
            waitingTimerRef.current = setTimeout(() => {
              reportMediaPlaybackIssue({
                vector: 'MEDIA_SLOW_BUFFERING',
                message: `Slow media buffering (>4s stall) in ${errorStage}`,
                templateId,
                errorStage,
                endpoint: effectiveSrc
              });
            }, 4000);
          }}
          onPlaying={() => {
            if (waitingTimerRef.current) {
              clearTimeout(waitingTimerRef.current);
              waitingTimerRef.current = null;
            }
          }}
          onError={() => {
            setHasError(true);
            reportMediaPlaybackIssue({
              vector: 'MEDIA_PLAYBACK_FAILURE',
              message: `Video decode/load failed in ${errorStage}`,
              templateId,
              errorStage,
              endpoint: effectiveSrc
            });
          }}
          onContextMenu={(e) => e.preventDefault()}
          style={style}
          className={className}
        />
      )}
    </div>
  );
};
