import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Download,
  Share2,
  RotateCw,
  Sparkles,
  AlertTriangle,
  Flag,
  Check,
  ShieldCheck,
  Film,
  RefreshCw
} from 'lucide-react';
import { useApp, safeParseJsonResponse } from '../context/AppContext';
import { Generation, Template } from '../types';
import { isVideoMedia } from '../utils/mediaUtils';
import { reportMediaPlaybackIssue } from '../services/media/mediaPlaybackManager';
import { getStoredSessionToken } from '../utils/authSession';
import { useAuthorizedMedia, downloadAuthorizedMedia } from '../utils/authorizedMediaResolver';

interface GenerationViewerContentProps {
  gen: Generation;
  setActiveGeneration: (gen: Generation | null) => void;
  templates: Template[];
  setSelectedTemplate: (tpl: Template | null) => void;
  setReportModalGenId: (id: string | null) => void;
  refreshUserData: () => Promise<void>;
  refreshGenerations: () => Promise<void>;
}

const GenerationViewerContent: React.FC<GenerationViewerContentProps> = ({
  gen,
  setActiveGeneration,
  templates,
  setSelectedTemplate,
  setReportModalGenId,
  refreshUserData,
  refreshGenerations
}) => {
  const [copied, setCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccessName, setDownloadSuccessName] = useState<string | null>(null);

  const isProcessing =
    gen.status === 'preparing' ||
    gen.status === 'uploading' ||
    gen.status === 'processing' ||
    gen.status === 'finalizing';

  const rawMediaUrl = gen.resultMediaUrl || (gen.status === 'completed' ? gen.inputMediaUrl : '');
  const {
    resolvedUrl: resolvedMediaUrl,
    mimeType: resolvedMimeType,
    loading: mediaAuthLoading,
    error: mediaAuthError,
    refresh: refreshAuthorizedMedia,
    handleMediaLoadError
  } = useAuthorizedMedia(rawMediaUrl, {
    isActive: !isProcessing && gen.status !== 'failed' && Boolean(rawMediaUrl)
  });

  useEffect(() => {
    setDownloadError(null);
    setDownloadSuccessName(null);
  }, [gen.id, gen.resultMediaUrl]);

  // Active polling and live elapsed seconds counter
  useEffect(() => {
    if (!isProcessing) return;

    // Initialize elapsed seconds
    const initialElapsed = gen.createdAt
      ? Math.max(0, Math.floor((Date.now() - new Date(gen.createdAt).getTime()) / 1000))
      : 0;
    setElapsedSeconds(initialElapsed);

    // Live 1-second elapsed counter
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    // Active server polling every 2.5 seconds
    let isMounted = true;
    const pollStatus = async () => {
      try {
        const token = getStoredSessionToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`/api/generations/${gen.id}/status`, {
          headers,
          credentials: 'include'
        });
        const parsed = await safeParseJsonResponse<{ generation?: Generation & { elapsedSeconds?: number } }>(res);
        if (!parsed.ok || !isMounted || !parsed.data?.generation) return;
        const rawGen = parsed.data.generation;
        const updatedGen: Generation = rawGen;
        if (typeof rawGen.elapsedSeconds === 'number') {
          setElapsedSeconds(rawGen.elapsedSeconds);
        }

        // Terminal state transition (completed or failed)
        if (updatedGen.status === 'completed' || updatedGen.status === 'failed') {
          setActiveGeneration(updatedGen);
          if (refreshUserData) await refreshUserData();
          if (refreshGenerations) await refreshGenerations();
        }
      } catch (err) {
        console.warn('[GenerationViewerModal] Polling note:', err);
      }
    };

    const pollInterval = setInterval(pollStatus, 2500);
    pollStatus(); // Immediate first check

    return () => {
      isMounted = false;
      clearInterval(timer);
      clearInterval(pollInterval);
    };
  }, [gen.id, isProcessing, setActiveGeneration, refreshUserData, refreshGenerations]);

  const handleDownload = async () => {
    const targetUrl = gen.resultMediaUrl || gen.inputMediaUrl;
    if (!targetUrl || isDownloading) return;
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadSuccessName(null);

    const mediaKind: 'photo' | 'video' =
      gen.templateType === 'video' || resolvedMimeType.startsWith('video/') || isVideoMedia(targetUrl)
        ? 'video'
        : 'photo';

    const result = await downloadAuthorizedMedia({
      rawUrl: targetUrl,
      preferredFilename: `aiprime_${gen.templateTitle}_${gen.id}`,
      mediaKind
    });

    setIsDownloading(false);
    if (result.ok) {
      setDownloadSuccessName(result.filename || 'Saved');
      setTimeout(() => setDownloadSuccessName(null), 3500);
    } else {
      setDownloadError(result.error || 'Download failed. Please retry.');
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `${gen.templateTitle} · AI Prime Studio`,
      text: `Created with ${gen.templateTitle} on AI Prime Studio`,
      url: window.location.href
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log('Share dismissed');
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCreateAgain = () => {
    const tpl = templates.find((t) => t.id === gen.templateId);
    if (tpl) {
      setActiveGeneration(null);
      setSelectedTemplate(tpl);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#08080a] flex flex-col justify-between overflow-y-auto no-scrollbar">
      {/* Top Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[#08080a]/80 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#d4af37] animate-pulse" />
          <span className="text-xs font-semibold text-white tracking-wide uppercase">
            {isProcessing ? 'Rendering Studio' : 'Generation Result'}
          </span>
        </div>

        <button
          onClick={() => setActiveGeneration(null)}
          className="p-2 text-stone-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="max-w-xl w-full mx-auto px-4 py-6 flex-1 flex flex-col items-center justify-center">
        {isProcessing ? (
          /* CINEMATIC INDETERMINATE PROCESSING UI (NEVER INVENT FAKE PERCENTAGES) */
          <div className="w-full flex flex-col items-center text-center space-y-8 py-12">
            {/* Pulsating Metallic Ring */}
            <div className="relative w-40 h-40 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-dashed border-[#d4af37]/60"
              />
              <motion.div
                animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-4 rounded-full bg-gradient-to-tr from-[#d4af37]/30 to-amber-500/10 blur-xl"
              />
              <div className="relative z-10 w-24 h-24 rounded-2xl bg-stone-900/90 border border-white/15 flex items-center justify-center shadow-2xl">
                <Sparkles className="w-10 h-10 text-[#f5d77f] fill-[#f5d77f] animate-pulse" />
              </div>
            </div>

            {/* Processing Stage Indicators */}
            <div className="space-y-2">
              <h3 className="text-2xl font-bold font-display text-white tracking-tight">
                Synthesizing Template
              </h3>
              <p className="text-sm text-stone-400 max-w-sm mx-auto">
                Applying neural illumination, cinematic color grading, and lens effects for {gen.templateTitle}...
              </p>
            </div>

            {/* Live Elapsed Counter (Truthful seconds, zero fake percentage) */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-stone-900/90 border border-[#d4af37]/30 text-xs font-mono text-[#f5d77f] shadow-lg">
              <span className="w-2 h-2 rounded-full bg-[#d4af37] animate-pulse" />
              <span>Elapsed: {elapsedSeconds}s</span>
            </div>

            {/* Non-linear Cinematic Pipeline Steps */}
            <div className="flex items-center gap-2 text-xs font-semibold text-stone-400">
              <span className="text-[#d4af37]">Neural Grading</span>
              <span aria-hidden="true" className="text-stone-600">→</span>
              <span className="text-[#d4af37]">Micro Contrast</span>
              <span aria-hidden="true" className="text-stone-600">→</span>
              <span className="text-stone-300 animate-pulse">Final Render</span>
            </div>
          </div>
        ) : gen.status === 'failed' ? (
          /* FAILED STATE WITH AUTOMATIC REFUND CONFIRMATION */
          <div className="w-full text-center space-y-6 py-12">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-red-950/60 border border-red-800/80 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Generation Failed</h3>
              <p className="text-sm text-stone-400 mt-2 max-w-xs mx-auto">
                {gen.error || 'The model encountered an unexpected timeout during rendering.'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-stone-900 border border-white/10 max-w-sm mx-auto flex items-center gap-3 text-left">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-emerald-300">Credits Refunded</p>
                <p className="text-stone-400 mt-0.5">
                  {gen.creditCost} credits were automatically returned to your ledger.
                </p>
              </div>
            </div>

            <button
              onClick={handleCreateAgain}
              className="py-3 px-6 gold-button rounded-xl text-sm font-semibold inline-flex items-center gap-2"
            >
              <RotateCw className="w-4 h-4" />
              <span>Retry Template</span>
            </button>
          </div>
        ) : (
          /* COMPLETED RESULT SCREEN */
          <div className="w-full space-y-6">
            {/* Visual Result Frame */}
            <div className="relative rounded-3xl overflow-hidden bg-black border border-white/15 shadow-2xl">
              <div
                className={`relative w-full overflow-hidden flex items-center justify-center ${
                  gen.aspectRatio === '9:16'
                    ? 'aspect-[9/16] max-h-[580px]'
                    : gen.aspectRatio === '4:5'
                    ? 'aspect-[4/5] max-h-[520px]'
                    : 'aspect-square max-h-[460px]'
                }`}
              >
                {(() => {
                  if (mediaAuthLoading) {
                    return (
                      <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
                        <RefreshCw className="w-8 h-8 text-[#d4af37] animate-spin" />
                        <p className="text-xs font-semibold text-stone-300">
                          Securing private media stream…
                        </p>
                      </div>
                    );
                  }
                  if (mediaAuthError || !resolvedMediaUrl) {
                    return (
                      <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 max-w-xs">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                          <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">Preview Unavailable</h4>
                          <p className="text-xs text-stone-400 mt-1">
                            {mediaAuthError || 'Unable to load authorized output preview.'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => refreshAuthorizedMedia()}
                          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Retry Preview</span>
                        </button>
                      </div>
                    );
                  }

                  const isVid =
                    gen.templateType === 'video' ||
                    resolvedMimeType.startsWith('video/') ||
                    isVideoMedia(rawMediaUrl) ||
                    isVideoMedia(resolvedMediaUrl);

                  if (isVid) {
                    return (
                      <video
                        key={resolvedMediaUrl}
                        src={resolvedMediaUrl}
                        controls
                        playsInline
                        loop
                        preload="metadata"
                        onError={async () => {
                          const retried = await handleMediaLoadError();
                          if (!retried) {
                            reportMediaPlaybackIssue({
                              vector: 'MEDIA_PLAYBACK_FAILURE',
                              message: `Generated video viewer failed (${gen.templateId})`,
                              templateId: gen.templateId,
                              errorStage: 'generation_viewer_video',
                              endpoint: rawMediaUrl
                            });
                          }
                        }}
                        className="w-full h-full object-contain bg-black"
                      />
                    );
                  }
                  return (
                    <img
                      key={resolvedMediaUrl}
                      src={resolvedMediaUrl}
                      alt={gen.templateTitle}
                      onError={async () => {
                        const retried = await handleMediaLoadError();
                        if (!retried) {
                          reportMediaPlaybackIssue({
                            vector: 'MEDIA_PLAYBACK_FAILURE',
                            message: `Generated photo viewer failed (${gen.templateId})`,
                            templateId: gen.templateId,
                            errorStage: 'generation_viewer_image',
                            endpoint: rawMediaUrl
                          });
                        }
                      }}
                      className="w-full h-full object-cover"
                    />
                  );
                })()}

                {/* AI Generated Official Badge */}
                <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-[11px] font-medium text-stone-200">
                  <Sparkles className="w-3 h-3 text-[#d4af37]" />
                  <span>AI Generated · AI Prime Studio</span>
                </div>

                {/* Template Aspect Ratio badge */}
                <div className="absolute top-4 right-4 z-10 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-stone-300">
                  {gen.aspectRatio}
                </div>
              </div>
            </div>

            {/* Generation Details & Report */}
            <div className="p-4 rounded-2xl bg-[#121217] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-base font-bold text-white">{gen.templateTitle}</h4>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Rendered via {gen.engine === 'AI_GENERATION' ? 'Gemini AI Studio' : 'Smart Motion Engine'}
                  </p>
                </div>
                <button
                  onClick={() => setReportModalGenId(gen.id)}
                  className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-red-400 transition-colors px-2.5 py-1 rounded-lg hover:bg-white/5"
                  title="Report inappropriate content"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Report</span>
                </button>
              </div>
            </div>

            {/* Action Bar */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleDownload}
                disabled={isDownloading || !rawMediaUrl}
                className="py-3.5 px-4 gold-button rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isDownloading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download</span>
                  </>
                )}
              </button>

              <button
                onClick={handleShare}
                className="py-3.5 px-4 bg-stone-800 hover:bg-stone-700 text-white border border-white/10 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Link Copied</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>Share</span>
                  </>
                )}
              </button>
            </div>

            {downloadSuccessName && (
              <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-300 text-center font-medium">
                Saved cleanly as {downloadSuccessName}
              </div>
            )}

            {downloadError && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-center justify-between gap-2">
                <span className="flex-1">{downloadError}</span>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white shrink-0 cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            <div className="text-center pt-2">
              <button
                onClick={handleCreateAgain}
                className="text-xs text-stone-400 hover:text-[#d4af37] transition-colors inline-flex items-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Create another version with this template</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const GenerationViewerModal: React.FC = () => {
  const {
    activeGeneration,
    setActiveGeneration,
    templates,
    setSelectedTemplate,
    setReportModalGenId,
    refreshUserData,
    refreshGenerations
  } = useApp();

  if (!activeGeneration) return null;

  return (
    <GenerationViewerContent
      gen={activeGeneration}
      setActiveGeneration={setActiveGeneration}
      templates={templates}
      setSelectedTemplate={setSelectedTemplate}
      setReportModalGenId={setReportModalGenId}
      refreshUserData={refreshUserData}
      refreshGenerations={refreshGenerations}
    />
  );
};
