import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, ArrowRight, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const InsufficientCreditsModal: React.FC = () => {
  const {
    insufficientCreditsModal,
    setInsufficientCreditsModal,
    setPlansModalOpen
  } = useApp();

  if (!insufficientCreditsModal?.open) return null;

  const { requiredCredits, availableCredits } = insufficientCreditsModal;
  const shortfall = Math.max(0, requiredCredits - availableCredits);

  const handleOpenPlans = () => {
    setInsufficientCreditsModal(null);
    setPlansModalOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md">
      {/* Background Dim Backdrop */}
      <div
        className="absolute inset-0"
        onClick={() => setInsufficientCreditsModal(null)}
      />

      {/* Spring Bottom Sheet */}
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative w-full max-w-md bg-[#121217] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl z-10 space-y-6"
      >
        {/* Close Button */}
        <button
          onClick={() => setInsufficientCreditsModal(null)}
          className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Diamond / Credit Icon */}
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#d4af37]/20 via-[#d4af37]/30 to-amber-200/20 border border-[#d4af37]/40 flex items-center justify-center shadow-[0_0_24px_rgba(212,175,55,0.25)] mb-4">
            <Sparkles className="w-8 h-8 text-[#f5d77f] fill-[#f5d77f]" />
          </div>

          <h3 className="text-xl font-bold font-display text-white">
            Insufficient Credits
          </h3>
          <p className="text-sm text-stone-400 mt-1 max-w-xs">
            This cinematic template requires {requiredCredits} credits to generate.
          </p>
        </div>

        {/* Ledger Balance Comparison */}
        <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-stone-900/80 border border-white/10">
          <div className="text-center p-2 rounded-xl bg-white/5">
            <span className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold block">
              Required
            </span>
            <span className="text-lg font-bold text-white mt-0.5 block">
              {requiredCredits} ✦
            </span>
          </div>
          <div className="text-center p-2 rounded-xl bg-white/5">
            <span className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold block">
              Your Balance
            </span>
            <span className="text-lg font-bold text-amber-300 mt-0.5 block">
              {availableCredits} ✦
            </span>
          </div>
        </div>

        {/* Call to action */}
        <div className="space-y-3">
          <button
            onClick={handleOpenPlans}
            className="w-full py-3.5 px-4 gold-button rounded-xl text-sm font-semibold flex items-center justify-center gap-2 group"
          >
            <span>Get Credits · Unlock Pro Pass (₹1)</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>

          <button
            onClick={() => setInsufficientCreditsModal(null)}
            className="w-full py-2.5 text-xs text-stone-400 hover:text-stone-200 transition-colors"
          >
            Maybe Later
          </button>
        </div>

        {/* Guarantee */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-stone-500">
          <ShieldCheck className="w-3.5 h-3.5 text-[#d4af37]" />
          <span>Credits activate instantly with safe payment</span>
        </div>
      </motion.div>
    </div>
  );
};
