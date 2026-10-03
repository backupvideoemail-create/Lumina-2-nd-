import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Lock,
  ArrowRight,
  Zap,
  Info,
  ArrowLeft,
  Check,
  CheckCheck
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SUBSCRIPTION_CONFIG } from '../config/subscriptionConfig.ts';

export const PlansModal: React.FC = () => {
  const {
    plansModalOpen,
    setPlansModalOpen,
    initiateCheckout,
    verifyPayment,
    isPaying,
    wallet,
    activeSubscription
  } = useApp();

  // Simulated Razorpay UPI AutoPay sheet state
  const [autopaySheet, setAutopaySheet] = useState<{
    open: boolean;
    orderId: string;
    amount: number;
    planId: string;
    merchantRef: string;
  } | null>(null);

  const [authorizing, setAuthorizing] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);

  if (!plansModalOpen) return null;

  const handleStartAutoPay = async () => {
    // Initiate Razorpay UPI AutoPay Order
    const res = await initiateCheckout('plan', SUBSCRIPTION_CONFIG.introPlanId, 'razorpay');
    if (res.success && res.orderId) {
      const randomRef = `OM${Date.now()}${Math.floor(1000 + Math.random() * 9000)}W`;
      setAutopaySheet({
        open: true,
        orderId: res.orderId,
        amount: SUBSCRIPTION_CONFIG.introPrice,
        planId: SUBSCRIPTION_CONFIG.introPlanId,
        merchantRef: randomRef
      });
    }
  };

  const handleConfirmMandate = async () => {
    if (!autopaySheet) return;
    setAuthorizing(true);

    // Call server-authoritative payment verification
    const success = await verifyPayment(
      autopaySheet.orderId,
      'plan',
      autopaySheet.planId,
      'razorpay'
    );

    setAuthorizing(false);
    if (success) {
      setAuthSuccess(true);
      setTimeout(() => {
        setAuthSuccess(false);
        setAutopaySheet(null);
        setPlansModalOpen(false);
      }, 1600);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md overflow-hidden">
      {/* Backdrop click to dismiss */}
      <div
        className="absolute inset-0"
        onClick={() => !autopaySheet && !isPaying && setPlansModalOpen(false)}
      />

      {/* Main Paywall Container */}
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative w-full max-w-md bg-[#0a090e] border-t sm:border border-white/10 rounded-t-[32px] sm:rounded-[32px] shadow-2xl z-10 max-h-[94vh] overflow-y-auto no-scrollbar"
      >
        {/* TOP HERO VISUAL SECTION */}
        <div className="relative w-full h-64 sm:h-72 overflow-hidden bg-gradient-to-b from-[#181622] via-[#0e0c15] to-[#0a090e]">
          {/* Handsome male creator photo with cinematic studio lighting */}
          <img
            src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1200&q=80"
            alt="AI Prime Studio Pro Visual"
            className="w-full h-full object-cover object-top scale-105"
          />

          {/* Cinematic Scrim & Light Leaks */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a090e] via-[#0a090e]/50 to-transparent" />
          <div className="subtle-reflection-sheen" />

          {/* Top Control Bar: Close (X) & Credits Badge */}
          <div className="absolute top-4 inset-x-4 flex items-center justify-between z-20">
            <button
              onClick={() => setPlansModalOpen(false)}
              className="w-9 h-9 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 flex items-center justify-center text-stone-300 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/65 backdrop-blur-xl border border-[#d4af37]/50 text-xs font-bold text-[#f5d77f] shadow-[0_0_16px_rgba(212,175,55,0.3)]">
              <Sparkles className="w-3.5 h-3.5 fill-[#d4af37] text-[#d4af37]" />
              <span>500 DAILY CREDITS</span>
            </div>
          </div>
        </div>

        {/* CONTENT & BENEFITS SECTION */}
        <div className="px-5 sm:px-7 -mt-10 relative z-20 space-y-4 pb-6">
          {/* Header Title & Info Tooltip */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold font-display text-white tracking-tight">
                AI Prime Pro Pass
              </h2>
              <button
                type="button"
                className="text-stone-400 hover:text-stone-200 transition-colors p-0.5"
                title="AI Prime STUDIO Daily Membership Details"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>

            {activeSubscription?.status === 'active' && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold tracking-wider uppercase">
                Active
              </span>
            )}
          </div>

          {/* 4 Value Proposition Bullets */}
          <div className="space-y-2 pt-1">
            {[
              'Realtime update trendy effects',
              '500+ AI video & photo templates',
              'No watermark, no ads, ultra 4K HDR',
              'Auto-renews, Cancel anytime in 1-tap'
            ].map((benefit, idx) => (
              <div key={idx} className="flex items-center gap-2.5 text-xs sm:text-[13px] text-stone-200 font-medium">
                <div className="w-4 h-4 rounded-full bg-gradient-to-r from-[#d4af37] to-amber-500 flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 text-black stroke-[3]" />
                </div>
                <span>{benefit}</span>
              </div>
            ))}
          </div>

          {/* THE HIGHLIGHTED SUBSCRIPTION OFFER CARD */}
          <div className="relative mt-4 rounded-2xl p-4 bg-gradient-to-r from-[#17140e] via-[#100f15] to-[#141219] border-2 border-[#d4af37] shadow-[0_0_24px_rgba(212,175,55,0.22)] flex items-center justify-between transition-all">
            {/* Left offer details */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-wide">
                  Double Bonanza Pro Pass
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-[#ff9f00] text-black text-[9px] font-extrabold uppercase tracking-wider">
                  HOT
                </span>
              </div>

              <p className="text-[11px] text-stone-300">
                1 Day Access Today · 500 Credits Included
              </p>

              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-300 pt-0.5">
                <Zap className="w-3 h-3 fill-amber-300 text-amber-300" />
                <span>UPI AutoPay Mandate Enabled</span>
              </div>
            </div>

            {/* Right price breakdown */}
            <div className="text-right shrink-0 pl-2">
              <div className="text-3xl font-extrabold font-display text-[#f5d77f] leading-none">
                ₹{SUBSCRIPTION_CONFIG.introPrice}
              </div>
              <div className="text-[10px] text-stone-400 font-medium mt-1">
                then ₹{SUBSCRIPTION_CONFIG.renewalPrice} daily
              </div>
            </div>
          </div>

          {/* PRIMARY CALL TO ACTION BUTTON */}
          <div className="pt-2">
            <button
              onClick={handleStartAutoPay}
              disabled={isPaying}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#ff9f00] via-[#f59e0b] to-[#d97706] hover:brightness-105 active:scale-[0.98] text-stone-950 text-base font-extrabold flex items-center justify-center gap-2 shadow-[0_8px_30px_rgba(245,158,11,0.45)] transition-all cursor-pointer disabled:opacity-50"
            >
              <span>Continue & Pay ₹{SUBSCRIPTION_CONFIG.introPrice}</span>
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {/* COMPACT REGULATORY & RENEWAL DISCLOSURE */}
          <div className="text-center space-y-2 pt-1">
            <p className="text-[11px] text-stone-400 leading-snug max-w-xs mx-auto">
              ₹1 today · then ₹499 daily until cancelled. Cancel anytime in account settings.
            </p>

            <div className="flex items-center justify-center gap-3 text-[10.5px] text-stone-500 font-medium">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>RBI Compliant E-Mandate</span>
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Razorpay Verified</span>
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* RAZORPAY UPI AUTOPAY AUTHORIZATION SHEET (Simulates Native UPI Mandate UI) */}
      <AnimatePresence>
        {autopaySheet && (
          <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="relative w-full max-w-sm bg-white text-stone-900 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4"
            >
              {/* Sheet Navigation Header */}
              <div className="flex items-center justify-between pb-1 border-b border-stone-100">
                <button
                  onClick={() => !authorizing && setAutopaySheet(null)}
                  className="p-1 text-stone-600 hover:text-black rounded-full"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h4 className="text-sm font-bold text-stone-800">Autopay details</h4>
                <button className="p-1 text-stone-400 hover:text-stone-700">
                  <Info className="w-4 h-4" />
                </button>
              </div>

              {/* Merchant Identifier */}
              <div className="flex flex-col items-center justify-center pt-1 pb-2">
                <div className="w-12 h-12 rounded-full bg-[#1b873f] text-white flex items-center justify-center text-lg font-bold shadow-md">
                  A
                </div>
                <span className="text-xs font-semibold text-stone-700 mt-2">
                  To AI Prime STUDIO
                </span>
              </div>

              {/* Mandate Details Card */}
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-stone-500 font-medium">First payment</span>
                  <span className="text-xl font-black text-stone-900">₹{autopaySheet.amount}</span>
                </div>

                <div className="pt-2 border-t border-stone-200 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Payment Limit</span>
                    <span className="font-semibold text-stone-800">Up to ₹{SUBSCRIPTION_CONFIG.renewalPrice}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-stone-500">Frequency</span>
                    <span className="font-semibold text-stone-800">Daily / As presented</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-stone-500">Validity</span>
                    <span className="font-semibold text-stone-800">Until Cancelled</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-stone-500">Merchant UPI ID</span>
                    <span className="font-mono text-stone-700 text-[11px]">aiprime.rzp@icici</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-stone-500">Merchant reference ID</span>
                    <span className="font-mono text-stone-700 text-[10px] truncate max-w-[150px]">
                      {autopaySheet.merchantRef}
                    </span>
                  </div>
                </div>
              </div>

              {/* Micro guarantee notice */}
              <p className="text-[11px] text-stone-500 text-center">
                You can pause or cancel this Autopay anytime in your Profile.
              </p>

              {/* Mandate Authorization CTA */}
              <button
                type="button"
                onClick={handleConfirmMandate}
                disabled={authorizing || authSuccess}
                className="w-full py-3.5 px-4 rounded-xl bg-[#0b57d0] hover:bg-[#0842a0] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98] disabled:opacity-60 cursor-pointer"
              >
                {authorizing ? (
                  <span>Securing Mandate...</span>
                ) : authSuccess ? (
                  <span className="flex items-center gap-1.5 text-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Mandate Active!</span>
                  </span>
                ) : (
                  <span>Authorize & Pay ₹{autopaySheet.amount}</span>
                )}
              </button>

              {/* Official UPI AutoPay Footer Emblem */}
              <div className="flex items-center justify-center gap-1.5 pt-1 text-[10px] text-stone-400 font-bold tracking-wider">
                <span>UPI AUTOPAY</span>
                <span>·</span>
                <span>NPCI CERTIFIED</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
