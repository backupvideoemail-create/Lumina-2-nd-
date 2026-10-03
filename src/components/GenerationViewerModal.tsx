import React, { useState } from 'react';
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
  Film
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const GenerationViewerModal: React.FC = () => {
  const {
    activeGeneration,
    setActiveGeneration,
    templates,
    setSelectedTemplate,
    setReportModalGenId
  } = useApp();

  const [copied, setCopied] = useState(false);

  if (!activeGeneration) return null;

  const gen = activeGeneration;
  const isProcessing =
    gen.status === 'preparing' ||
    gen.status === 'uploading' ||
    gen.status === 'processing' ||
    gen.status === 'finalizing';

  const handleDownload = () => {
    const url = gen.resultMediaUrl || gen.inputMediaUrl;
    const a = document.createElement('a');
    a.href = url;
    a.download = `aiprime_${gen.templateTitle.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShare = async () => {
    const shareData = {
      title: `${gen.templateTitle} · AI Prime STUDIO`,
      text: `Created with ${gen.templateTitle} on AI Prime STUDIO`,
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
                <img
                  src={gen.resultMediaUrl || gen.inputMediaUrl}
                  alt={gen.templateTitle}
                  className="w-full h-full object-cover"
                />

                {/* AI Generated Official Badge */}
                <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-[11px] font-medium text-stone-200">
                  <Sparkles className="w-3 h-3 text-[#d4af37]" />
                  <span>AI Generated · AI Prime STUDIO</span>
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
                className="py-3.5 px-4 gold-button rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>

              <button
                onClick={handleShare}
                className="py-3.5 px-4 bg-stone-800 hover:bg-stone-700 text-white border border-white/10 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
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
