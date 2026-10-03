import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Sparkles, ArrowRight, User } from 'lucide-react';
import { Logo } from './Logo';
import { useApp } from '../context/AppContext';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=300&q=80'
];

export const OnboardingModal: React.FC = () => {
  const { onboardingOpen, setOnboardingOpen, completeOnboarding } = useApp();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(PRESET_AVATARS[0]);
  const [loading, setLoading] = useState(false);

  if (!onboardingOpen) return null;

  const handleFinish = async () => {
    setLoading(true);
    setStep(2); // Short success animation step
    await completeOnboarding(name || 'Creative Artist', selectedAvatar);
    setTimeout(() => {
      setLoading(false);
      setOnboardingOpen(false);
      setStep(1);
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="relative w-full max-w-md bg-[#111116] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden"
      >
        {/* Subtle decorative gold ambient glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#d4af37]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* 1. Animated Logo Entrance */}
              <div className="text-center flex flex-col items-center">
                <motion.div
                  initial={{ scale: 0.6, rotate: -15, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="mb-3"
                >
                  <Logo size="lg" showText={false} />
                </motion.div>
                <h3 className="text-2xl font-bold font-display text-white tracking-tight">
                  Welcome to AI Prime STUDIO
                </h3>
                <p className="text-sm text-stone-400 mt-1 max-w-xs">
                  Create your profile to unlock 100 free AI generation credits.
                </p>
              </div>

              {/* 2. Profile Name Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                  Your Creator Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Elena Rostova"
                    maxLength={32}
                    className="w-full px-4 py-3 bg-stone-900/90 border border-white/10 rounded-xl text-white placeholder-stone-500 focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] transition-all text-sm"
                  />
                  <User className="absolute right-3.5 top-3.5 w-4 h-4 text-stone-500 pointer-events-none" />
                </div>
              </div>

              {/* 3. Choose Avatar */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                  Select Profile Avatar
                </label>
                <div className="flex items-center justify-between gap-2 pt-1">
                  {PRESET_AVATARS.map((url, idx) => {
                    const isSelected = selectedAvatar === url;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedAvatar(url)}
                        className={`relative rounded-xl overflow-hidden w-12 h-12 border-2 transition-all ${
                          isSelected
                            ? 'border-[#d4af37] scale-110 shadow-[0_0_12px_rgba(212,175,55,0.4)]'
                            : 'border-transparent opacity-65 hover:opacity-100'
                        }`}
                      >
                        <img src={url} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                        {isSelected && (
                          <div className="absolute inset-0 bg-[#d4af37]/30 flex items-center justify-center">
                            <Check className="w-4 h-4 text-black stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Continue CTA */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleFinish}
                  className="w-full py-3.5 px-4 gold-button rounded-xl text-sm font-semibold flex items-center justify-center gap-2 group"
                >
                  <span>Claim 100 Credits & Continue</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setOnboardingOpen(false)}
                  className="text-xs text-stone-500 hover:text-stone-300 transition-colors"
                >
                  Skip for now
                </button>
              </div>
            </motion.div>
          ) : (
            /* 5. Short Success Animation */
            <motion.div
              key="step2"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="py-12 flex flex-col items-center justify-center text-center space-y-4"
            >
              <div className="relative">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{ duration: 0.6 }}
                  className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-[#d4af37] to-amber-200 flex items-center justify-center shadow-[0_0_30px_rgba(212,175,55,0.6)]"
                >
                  <Sparkles className="w-10 h-10 text-stone-950 fill-stone-950" />
                </motion.div>
              </div>
              <div>
                <h4 className="text-xl font-bold font-display text-white">
                  Welcome aboard, {name || 'Creator'}!
                </h4>
                <p className="text-sm text-[#d4af37] mt-1 font-semibold">
                  +100 Welcome Credits Added
                </p>
              </div>
              <p className="text-xs text-stone-400 max-w-xs">
                Preparing your personal AI photo and video studio...
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
