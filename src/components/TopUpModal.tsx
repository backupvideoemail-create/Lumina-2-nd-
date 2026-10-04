import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  Zap,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const TopUpModal: React.FC = () => {
  const {
    topUpModalOpen,
    setTopUpModalOpen,
    topUps,
    wallet,
    refreshUserData,
    verifyPayment,
    hasActivePlan,
    setPlansModalOpen
  } = useApp();

  const [selectedPackId, setSelectedPackId] = useState<string>('topup_99');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!topUpModalOpen) return null;

  // If user somehow triggers this without an active plan, redirect gracefully to plans
  if (!hasActivePlan) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-[#121217] border border-amber-500/30 rounded-3xl p-6 text-center space-y-4"
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto text-[#ff9f00]">
            <Sparkles className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-bold font-display text-white">Plan Activation Required</h3>
          <p className="text-xs text-stone-300 leading-relaxed">
            Top-up credit packs are exclusively available to creators with an active subscription plan.
            Activate the ₹1 Pro Pass intro plan to unlock instant top-up packs anytime!
          </p>
          <button
            onClick={() => {
              setTopUpModalOpen(false);
              setPlansModalOpen(true);
            }}
            className="w-full py-3.5 px-4 gold-button rounded-xl text-xs font-bold"
          >
            Activate Pro Pass (₹1)
          </button>
          <button
            onClick={() => setTopUpModalOpen(false)}
            className="text-xs text-stone-500 hover:text-stone-300 transition-colors"
          >
            Dismiss
          </button>
        </motion.div>
      </div>
    );
  }

  const selectedPack = topUps.find((p) => p.id === selectedPackId) || topUps[1] || topUps[0];

  const handleStartTopUpPayment = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsProcessing(true);

    try {
      const token = localStorage.getItem('lumina_session_token');
      const orderRes = await fetch('/api/payments/checkout/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          type: 'topup',
          itemId: selectedPack.id
        })
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.orderId) {
        setIsProcessing(false);
        setErrorMessage(orderData.error || 'Failed to initiate Top-Up order on server.');
        return;
      }

      // Fetch live config
      const configRes = await fetch('/api/payments/config');
      const configData = await configRes.json();

      if (!configData?.keyId) {
        setIsProcessing(false);
        setErrorMessage('Razorpay configuration is missing on server.');
        return;
      }

      if (!(window as any).Razorpay) {
        setIsProcessing(false);
        setErrorMessage('Razorpay Checkout SDK is loading. Please retry.');
        return;
      }

      const options = {
        key: configData.keyId,
        order_id: orderData.orderId,
        amount: Math.round(selectedPack.price * 100),
        currency: 'INR',
        name: 'AI Prime Studio · Top-Up',
        description: `${selectedPack.name || 'Top-Up'} · ${selectedPack.credits} Instant Credits`,
        handler: async (response: any) => {
          const verified = await verifyPayment(
            response.razorpay_order_id || orderData.orderId,
            'topup',
            selectedPack.id,
            'razorpay',
            response.razorpay_payment_id,
            response.razorpay_signature
          );

          setIsProcessing(false);
          if (verified) {
            setSuccessMessage(`Success! ${selectedPack.credits} credits have been added to your wallet.`);
            await refreshUserData();
            setTimeout(() => {
              setTopUpModalOpen(false);
            }, 1800);
          } else {
            setErrorMessage('Payment verification failed. If money was deducted, credits will sync shortly.');
          }
        },
        prefill: {
          contact: '',
          email: 'ai.prime.studio.pro@gmail.com'
        },
        notes: {
          itemId: selectedPack.id,
          type: 'topup',
          credits: selectedPack.credits
        },
        theme: {
          color: '#d4af37'
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (failResponse: any) => {
        setIsProcessing(false);
        setErrorMessage(failResponse.error?.description || 'Payment was declined or cancelled.');
      });
      rzp.open();
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err.message || 'Error launching payment checkout.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-xl overflow-hidden">
      <div
        className="absolute inset-0"
        onClick={() => !isProcessing && setTopUpModalOpen(false)}
      />

      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 340 }}
        className="relative w-full max-w-lg bg-[#101014] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 sm:p-7 shadow-2xl z-10 max-h-[92vh] overflow-y-auto"
      >
        {/* Close Button */}
        <button
          onClick={() => setTopUpModalOpen(false)}
          disabled={isProcessing}
          className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="space-y-1 pr-8">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#d4af37]/20 border border-[#d4af37]/40 text-[#f5d77f] text-[10px] font-bold uppercase tracking-wider mb-1">
            <Zap className="w-3 h-3" />
            <span>Instant One-Time Recharge</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold font-display text-white">
            Buy More Credits
          </h3>
          <p className="text-xs text-stone-400 leading-relaxed">
            Need extra credits between renewals? Top up instantly without changing your subscription.
          </p>
        </div>

        {/* Current Balance Banner */}
        <div className="mt-4 p-3 rounded-2xl bg-white/[0.04] border border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#d4af37]" />
            <span className="text-xs text-stone-300 font-medium">Current Balance:</span>
          </div>
          <span className="text-sm font-bold text-amber-200">
            {wallet?.balance ?? 0} Credits
          </span>
        </div>

        {/* Top-Up Packs Grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 mt-4">
          {topUps.map((pack) => {
            const isSelected = selectedPackId === pack.id;
            const isPopular = pack.popular || pack.id === 'topup_99';

            return (
              <motion.div
                key={pack.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedPackId(pack.id)}
                className={`relative p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-gradient-to-b from-[#261f10] via-[#1a150c] to-[#121217] border-[#d4af37] shadow-[0_0_20px_rgba(212,175,55,0.25)]'
                    : 'bg-[#15151c]/90 border-white/10 hover:border-white/20'
                }`}
              >
                {/* Badge if available */}
                {(pack.badge || isPopular) && (
                  <div className="absolute -top-2 right-2.5 px-2 py-0.5 rounded-full bg-[#d4af37] text-stone-950 text-[9px] font-black uppercase tracking-wider shadow">
                    {pack.badge || 'Popular'}
                  </div>
                )}

                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-black font-display text-white">
                      ₹{pack.price}
                    </span>
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-[#d4af37] shrink-0" />
                    )}
                  </div>
                  <div className="text-sm font-bold text-[#f5d77f] mt-1 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>+{pack.credits} Credits</span>
                  </div>
                </div>

                <div className="text-[10px] text-stone-400 font-medium mt-2 pt-2 border-t border-white/5">
                  {pack.tagline || `₹${(pack.price / pack.credits).toFixed(2)}/credit`}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Feedback messages */}
        {errorMessage && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-2 text-emerald-300 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-5 space-y-2">
          <button
            onClick={handleStartTopUpPayment}
            disabled={isProcessing}
            className="w-full py-3.5 px-4 gold-button rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <span>Connecting to Razorpay...</span>
            ) : (
              <>
                <span>Pay ₹{selectedPack.price} · Add {selectedPack.credits} Credits</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-stone-500 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#d4af37]" />
            <span>One-time instant purchase · No recurring charges</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
