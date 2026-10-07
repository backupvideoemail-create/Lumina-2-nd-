import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  ArrowRight,
  Phone,
  ShieldCheck,
  KeyRound,
  CheckCircle2
} from 'lucide-react';
import { Logo } from './Logo';
import { useApp } from '../context/AppContext';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult
} from '../services/firebase/firebaseClient';

export const AuthModal: React.FC = () => {
  const { authModalOpen, setAuthModalOpen, onAuthSuccess, pendingAction } = useApp();

  const [authMode, setAuthMode] = useState<'google' | 'phone'>('google');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'phone_input' | 'otp_verify' | 'authenticated'>('phone_input');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (!authModalOpen) {
      setStep('phone_input');
      setPhoneNumber('');
      setOtpCode('');
      setErrorMessage('');
      setConfirmationResult(null);
    }
  }, [authModalOpen]);

  if (!authModalOpen) return null;

  // 1. Real Firebase Google Sign-In
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      // Establish server session
      const res = await fetch('/api/auth/firebase-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          firebaseUid: result.user.uid,
          email: result.user.email,
          name: result.user.displayName,
          avatar: result.user.photoURL
        })
      });

      const data = await res.json();
      setLoading(false);

      if (res.ok && data.success) {
        setStep('authenticated');
        setTimeout(() => {
          onAuthSuccess(data.user, data.token);
        }, 1200);
      } else {
        setErrorMessage(data.error || 'Google authentication mapping failed.');
      }
    } catch (err: any) {
      setLoading(false);
      console.error('[Google Auth Error]:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setErrorMessage('Sign-in popup was closed. Please try again.');
      } else {
        setErrorMessage(err.message || 'Google Sign-In failed.');
      }
    }
  };

  // 2. Real Firebase Phone Number SMS Dispatch
  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    let cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
    if (!cleanPhone.startsWith('+')) {
      // Default to India (+91) if not prefixed with country code
      cleanPhone = `+91${cleanPhone}`;
    }

    if (cleanPhone.length < 10) {
      setErrorMessage('Please enter a valid mobile number with country code (e.g. +91 9876543210)');
      return;
    }

    setLoading(true);

    try {
      // Initialize Firebase RecaptchaVerifier
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-anchor', {
          size: 'invisible'
        });
      }

      const confirmation = await signInWithPhoneNumber(auth, cleanPhone, recaptchaVerifierRef.current);
      setConfirmationResult(confirmation);
      setStep('otp_verify');
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      console.error('[Firebase Phone Send Error]:', err);
      if (err.code === 'auth/invalid-phone-number') {
        setErrorMessage('The mobile number format is invalid. Please include country code (+91).');
      } else if (err.code === 'auth/too-many-requests') {
        setErrorMessage('Too many SMS requests sent. Please wait a few minutes.');
      } else {
        setErrorMessage(err.message || 'Failed to dispatch SMS verification code.');
      }
    }
  };

  // 3. Real Firebase SMS OTP Verification
  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!confirmationResult) {
      setErrorMessage('Session expired. Please request a new verification code.');
      setStep('phone_input');
      return;
    }

    if (otpCode.trim().length < 6) {
      setErrorMessage('Please enter the 6-digit SMS code.');
      return;
    }

    setLoading(true);

    try {
      const result = await confirmationResult.confirm(otpCode.trim());
      const idToken = await result.user.getIdToken();

      const res = await fetch('/api/auth/firebase-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          firebaseUid: result.user.uid,
          phone: result.user.phoneNumber,
          name: `Creator ${result.user.phoneNumber?.slice(-4) || ''}`
        })
      });

      const data = await res.json();
      setLoading(false);

      if (res.ok && data.success) {
        setStep('authenticated');
        setTimeout(() => {
          onAuthSuccess(data.user, data.token);
        }, 1200);
      } else {
        setErrorMessage(data.error || 'Phone authentication mapping failed.');
      }
    } catch (err: any) {
      setLoading(false);
      console.error('[Firebase Phone Verify Error]:', err);
      if (err.code === 'auth/invalid-verification-code') {
        setErrorMessage('Invalid 6-digit code. Please check your SMS and retry.');
      } else if (err.code === 'auth/code-expired') {
        setErrorMessage('The SMS code has expired. Please request a new code.');
        setStep('phone_input');
      } else {
        setErrorMessage(err.message || 'Verification failed. Please retry.');
      }
    }
  };

  const actionHint = pendingAction
    ? pendingAction.type === 'generate'
      ? 'Sign in to generate this AI template'
      : pendingAction.type === 'buy_plan'
      ? 'Sign in to continue with your Pro Pass'
      : 'Sign in to view your creations'
    : 'Sign in to create high-definition AI videos & portraits';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
      <div id="recaptcha-anchor" />

      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="relative w-full max-w-md bg-[#0f0e15] border border-white/12 rounded-[32px] p-6 sm:p-7 shadow-[0_20px_60px_rgba(0,0,0,0.95)] overflow-hidden"
      >
        {/* Glow Accents */}
        <div className="absolute -top-24 -right-24 w-52 h-52 bg-[#ff9f00]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-52 h-52 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={() => setAuthModalOpen(false)}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-stone-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center flex flex-col items-center mb-5 relative z-10">
          <Logo size="lg" showText={false} />
          <h3 className="text-2xl font-black font-display text-white tracking-tight leading-tight mt-2">
            AI Prime Studio
          </h3>
          <p className="text-xs text-amber-200 mt-1 flex items-center gap-1 font-semibold text-center max-w-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#ffb703] fill-[#ffb703] shrink-0" />
            <span>{actionHint}</span>
          </p>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold text-center">
            {errorMessage}
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 'authenticated' ? (
            <motion.div
              key="auth_success"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="py-8 flex flex-col items-center justify-center space-y-3 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center shadow-[0_0_24px_rgba(16,185,129,0.4)]">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 stroke-[3]" />
              </div>
              <h4 className="text-xl font-black text-white">Authenticated!</h4>
              <p className="text-xs text-stone-300">
                Resuming your creative studio session...
              </p>
            </motion.div>
          ) : (
            <motion.div key="auth_methods" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {/* Method Switcher Tabs */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-black/50 border border-white/10 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('google');
                    setErrorMessage('');
                  }}
                  className={`py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    authMode === 'google'
                      ? 'bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black shadow-md'
                      : 'text-stone-300 hover:text-white'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Google Sign-In</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('phone');
                    setErrorMessage('');
                  }}
                  className={`py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    authMode === 'phone'
                      ? 'bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black shadow-md'
                      : 'text-stone-300 hover:text-white'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Phone OTP</span>
                </button>
              </div>

              {authMode === 'google' ? (
                <div className="space-y-4 pt-1">
                  <p className="text-xs text-stone-300 text-center leading-relaxed">
                    Fast, secure sign-in with your Google Account. Your creations and credits stay private to you.
                  </p>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="w-full py-4 px-4 rounded-2xl bg-white text-stone-900 font-extrabold text-sm flex items-center justify-center gap-3 shadow-lg hover:bg-stone-100 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>{loading ? 'Connecting with Google...' : 'Continue with Google'}</span>
                  </button>
                </div>
              ) : step === 'phone_input' ? (
                <form onSubmit={handleSendPhoneOtp} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-stone-300">
                      Mobile Number
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        required
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full px-4 py-3.5 bg-stone-900/90 border border-white/10 rounded-2xl text-white placeholder-stone-500 focus:outline-none focus:border-[#ff9f00] text-sm font-mono"
                      />
                      <Phone className="absolute right-3.5 top-3.5 w-4 h-4 text-stone-500" />
                    </div>
                    <span className="text-[10px] text-stone-400 block">
                      Include country code (e.g. +91 for India). Real SMS OTP will be sent.
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black font-black text-sm flex items-center justify-center gap-2 shadow-[0_8px_25px_rgba(255,159,0,0.4)] cursor-pointer active:scale-[0.98] disabled:opacity-50"
                  >
                    {loading ? (
                      <span>Sending SMS...</span>
                    ) : (
                      <>
                        <span>Get 6-Digit SMS Code</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-300">
                        Enter 6-Digit SMS Code
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setStep('phone_input');
                          setOtpCode('');
                        }}
                        className="text-[11px] text-[#ff9f00] hover:underline cursor-pointer"
                      >
                        Change Number
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="123456"
                        className="w-full px-4 py-3.5 bg-stone-900/90 border border-white/10 rounded-2xl text-white placeholder-stone-500 focus:outline-none focus:border-[#ff9f00] text-center font-mono text-lg tracking-widest"
                      />
                      <KeyRound className="absolute right-3.5 top-3.5 w-4 h-4 text-stone-500" />
                    </div>
                    <span className="text-[10px] text-stone-400 block text-center">
                      Sent to {phoneNumber}
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black font-black text-sm flex items-center justify-center gap-2 shadow-[0_8px_25px_rgba(255,159,0,0.4)] cursor-pointer active:scale-[0.98] disabled:opacity-50"
                  >
                    {loading ? (
                      <span>Verifying Code...</span>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Verify & Continue</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Dismiss & Browse */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(false)}
                  className="text-xs text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
                >
                  Continue browsing as visitor
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
