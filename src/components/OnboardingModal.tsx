import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check,
  Sparkles,
  ArrowRight,
  User,
  Phone,
  Mail,
  ShieldCheck,
  KeyRound
} from 'lucide-react';
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
  const { onboardingOpen, setOnboardingOpen, completeOnboarding, refreshUserData } = useApp();
  const [authMode, setAuthMode] = useState<'otp' | 'gmail' | 'quick'>('otp');
  const [step, setStep] = useState<'input' | 'verify' | 'success'>('input');

  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [name, setName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(PRESET_AVATARS[0]);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [devHint, setDevHint] = useState('');

  if (!onboardingOpen) return null;

  // Step 1: Send OTP
  const handleSendOtp = async () => {
    setErrorMsg('');
    if (!phoneOrEmail.trim()) {
      setErrorMsg(authMode === 'otp' ? 'Please enter a valid mobile number' : 'Please enter your Gmail address');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneOrEmail: phoneOrEmail.trim() })
      });
      const data = await res.json();
      setLoading(false);

      if (res.ok && data.success) {
        if (data.devHint) {
          setDevHint(data.devHint);
          setOtpCode(data.devHint); // Auto-fill for friction-free verification
        }
        setStep('verify');
      } else {
        setErrorMsg(data.error || 'Failed to dispatch verification code');
      }
    } catch {
      setLoading(false);
      setErrorMsg('Network error. Please try again.');
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    setErrorMsg('');
    if (!otpCode.trim() || otpCode.trim().length < 4) {
      setErrorMsg('Please enter the 6-digit verification code');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneOrEmail: phoneOrEmail.trim(),
          otp: otpCode.trim(),
          name: name.trim() || 'AI Prime Creator'
        })
      });
      const data = await res.json();
      setLoading(false);

      if (res.ok && data.success) {
        if (data.token) {
          localStorage.setItem('aiprime_token', data.token);
        }
        setStep('success');
        await refreshUserData();
        setTimeout(() => {
          setOnboardingOpen(false);
          setStep('input');
        }, 1600);
      } else {
        setErrorMsg(data.error || 'Invalid verification code');
      }
    } catch {
      setLoading(false);
      setErrorMsg('Verification failed. Please retry.');
    }
  };

  // Quick Guest Profile
  const handleQuickFinish = async () => {
    setLoading(true);
    setStep('success');
    await completeOnboarding(name || 'AI Prime Creator', selectedAvatar);
    setTimeout(() => {
      setLoading(false);
      setOnboardingOpen(false);
      setStep('input');
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="relative w-full max-w-md bg-[#0f0e15] border border-white/10 rounded-[32px] p-6 sm:p-7 shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden"
      >
        {/* Ambient Top Glow Orbs */}
        <div className="absolute -top-24 -right-24 w-52 h-52 bg-[#ff9f00]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-52 h-52 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* 1. Header & Welcome Title */}
        <div className="text-center flex flex-col items-center mb-5 relative z-10">
          <motion.div
            initial={{ scale: 0.7, rotate: -10, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            className="mb-2.5"
          >
            <Logo size="lg" showText={false} />
          </motion.div>
          <h3 className="text-2xl font-black font-display text-white tracking-tight leading-tight">
            Welcome to AI Prime Studio
          </h3>
          <p className="text-xs text-stone-300 mt-1 flex items-center gap-1 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-[#ffb703] fill-[#ffb703]" />
            <span>Unlock 100 Free AI Credits immediately</span>
          </p>
        </div>

        {/* 2. Login Mode Tabs */}
        {step !== 'success' && (
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-black/50 border border-white/10 mb-4 relative z-10">
            <button
              onClick={() => {
                setAuthMode('otp');
                setStep('input');
                setErrorMsg('');
              }}
              className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                authMode === 'otp'
                  ? 'bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black shadow-md'
                  : 'text-stone-300 hover:text-white'
              }`}
            >
              <Phone className="w-3 h-3" />
              <span>Mobile OTP</span>
            </button>

            <button
              onClick={() => {
                setAuthMode('gmail');
                setStep('input');
                setErrorMsg('');
              }}
              className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                authMode === 'gmail'
                  ? 'bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black shadow-md'
                  : 'text-stone-300 hover:text-white'
              }`}
            >
              <Mail className="w-3 h-3" />
              <span>Gmail</span>
            </button>

            <button
              onClick={() => {
                setAuthMode('quick');
                setStep('input');
                setErrorMsg('');
              }}
              className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                authMode === 'quick'
                  ? 'bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black shadow-md'
                  : 'text-stone-300 hover:text-white'
              }`}
            >
              <User className="w-3 h-3" />
              <span>Quick Profile</span>
            </button>
          </div>
        )}

        {/* Error Alert Message */}
        {errorMsg && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium text-center">
            {errorMsg}
          </div>
        )}

        {/* 3. Tab Contents */}
        <AnimatePresence mode="wait">
          {step === 'success' ? (
            <motion.div
              key="success"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="py-8 flex flex-col items-center justify-center space-y-3 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center shadow-[0_0_24px_rgba(16,185,129,0.4)]">
                <Check className="w-8 h-8 text-emerald-400 stroke-[3]" />
              </div>
              <h4 className="text-xl font-black text-white">Profile Verified!</h4>
              <p className="text-xs text-stone-300 max-w-xs">
                100 Free Credits have been added to your secure wallet. Enjoy creating!
              </p>
            </motion.div>
          ) : authMode === 'quick' ? (
            <motion.div
              key="quick"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-stone-300">
                  Creator Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your creator name"
                    className="w-full px-4 py-3 bg-stone-900/90 border border-white/10 rounded-2xl text-white placeholder-stone-500 focus:outline-none focus:border-[#ff9f00] text-sm"
                  />
                  <User className="absolute right-3.5 top-3.5 w-4 h-4 text-stone-500" />
                </div>
              </div>

              {/* Avatar choices */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-stone-300">
                  Select Profile Avatar
                </label>
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  {PRESET_AVATARS.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedAvatar(url)}
                      className={`relative rounded-2xl overflow-hidden w-11 h-11 border-2 transition-all cursor-pointer ${
                        selectedAvatar === url
                          ? 'border-[#ff9f00] scale-105 shadow-[0_0_12px_rgba(255,159,0,0.5)]'
                          : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={url} alt="Avatar" className="w-full h-full object-cover" />
                      {selectedAvatar === url && (
                        <div className="absolute inset-0 bg-[#ff9f00]/30 flex items-center justify-center">
                          <Check className="w-4 h-4 text-black stroke-[3]" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleQuickFinish}
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black text-sm font-black flex items-center justify-center gap-2 shadow-[0_8px_25px_rgba(255,159,0,0.4)] cursor-pointer mt-2"
              >
                <span>Claim 100 Credits & Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          ) : step === 'input' ? (
            <motion.div
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-stone-300">
                  {authMode === 'otp' ? 'Mobile Number' : 'Gmail Address'}
                </label>
                <div className="relative">
                  <input
                    type={authMode === 'otp' ? 'tel' : 'email'}
                    value={phoneOrEmail}
                    onChange={(e) => setPhoneOrEmail(e.target.value)}
                    placeholder={
                      authMode === 'otp'
                        ? 'e.g. +91 98765 43210'
                        : 'e.g. creator@gmail.com'
                    }
                    className="w-full px-4 py-3 bg-stone-900/90 border border-white/10 rounded-2xl text-white placeholder-stone-500 focus:outline-none focus:border-[#ff9f00] text-sm"
                  />
                  {authMode === 'otp' ? (
                    <Phone className="absolute right-3.5 top-3.5 w-4 h-4 text-stone-500" />
                  ) : (
                    <Mail className="absolute right-3.5 top-3.5 w-4 h-4 text-stone-500" />
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-stone-300">
                  Creator Name (Optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Nikhil"
                  className="w-full px-4 py-3 bg-stone-900/90 border border-white/10 rounded-2xl text-white placeholder-stone-500 focus:outline-none focus:border-[#ff9f00] text-sm"
                />
              </div>

              <button
                type="button"
                onClick={handleSendOtp}
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black text-sm font-black flex items-center justify-center gap-2 shadow-[0_8px_25px_rgba(255,159,0,0.4)] cursor-pointer mt-2 disabled:opacity-50"
              >
                {loading ? (
                  <span>Sending Code...</span>
                ) : (
                  <>
                    <span>Get 6-Digit OTP</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="verify"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-300">
                    Enter Verification Code
                  </label>
                  <button
                    onClick={() => setStep('input')}
                    className="text-[11px] text-[#ff9f00] hover:underline cursor-pointer"
                  >
                    Change Number
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="6-digit code (e.g. 123456)"
                    maxLength={6}
                    className="w-full px-4 py-3 bg-stone-900/90 border border-white/10 rounded-2xl text-white tracking-widest text-center font-mono text-base placeholder-stone-500 focus:outline-none focus:border-[#ff9f00]"
                  />
                  <KeyRound className="absolute right-3.5 top-3.5 w-4 h-4 text-stone-500" />
                </div>
                {devHint && (
                  <p className="text-[10px] text-amber-300 text-center font-mono">
                    Auto-detected OTP: {devHint}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black text-sm font-black flex items-center justify-center gap-2 shadow-[0_8px_25px_rgba(255,159,0,0.4)] cursor-pointer mt-2 disabled:opacity-50"
              >
                {loading ? (
                  <span>Verifying...</span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify & Login</span>
                  </>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer info & dismiss */}
        {step !== 'success' && (
          <div className="text-center pt-3">
            <button
              type="button"
              onClick={() => setOnboardingOpen(false)}
              className="text-xs text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
            >
              Continue as Guest for now
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
