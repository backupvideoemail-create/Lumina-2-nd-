import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  Check,
  ShieldCheck,
  CreditCard,
  Lock,
  ArrowRight,
  Zap,
  HelpCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PricingPlan, TopUpOption } from '../types';

export const PlansModal: React.FC = () => {
  const {
    plansModalOpen,
    setPlansModalOpen,
    plans,
    topUps,
    initiateCheckout,
    verifyPayment,
    isPaying,
    wallet,
    setSupportModalOpen
  } = useApp();

  const [activeTab, setActiveTab] = useState<'plans' | 'topup'>('plans');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('plan_intro_daily');
  const [selectedTopUpId, setSelectedTopUpId] = useState<string>('topup_popular');
  const [paymentProvider, setPaymentProvider] = useState<'cashfree' | 'razorpay'>('cashfree');
  const [mandateAgreed, setMandateAgreed] = useState(true);

  // Simulated gateway checkout sheet state
  const [checkoutSheet, setCheckoutSheet] = useState<{
    open: boolean;
    orderId: string;
    amount: number;
    title: string;
    credits: number;
    type: 'plan' | 'topup';
    itemId: string;
    provider: 'cashfree' | 'razorpay';
  } | null>(null);

  const [checkoutSuccess, setCheckoutSuccess] = useState<boolean>(false);

  if (!plansModalOpen) return null;

  const currentPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];
  const currentTopUp = topUps.find((t) => t.id === selectedTopUpId) || topUps[0];

  const handleStartCheckout = async () => {
    const isPlan = activeTab === 'plans';
    const itemId = isPlan ? selectedPlanId : selectedTopUpId;
    const amount = isPlan ? currentPlan?.price || 1 : currentTopUp?.price || 49;
    const title = isPlan ? currentPlan?.name || 'Pro Pass' : `Top-Up Pack`;
    const credits = isPlan
      ? currentPlan?.includedCredits || 500
      : (currentTopUp?.credits || 250) + (currentTopUp?.bonusCredits || 0);

    const res = await initiateCheckout(isPlan ? 'plan' : 'topup', itemId, paymentProvider);
    if (res.success && res.orderId) {
      setCheckoutSheet({
        open: true,
        orderId: res.orderId,
        amount,
        title,
        credits,
        type: isPlan ? 'plan' : 'topup',
        itemId,
        provider: paymentProvider
      });
    }
  };

  const handleAuthorizePayment = async () => {
    if (!checkoutSheet) return;
    const success = await verifyPayment(
      checkoutSheet.orderId,
      checkoutSheet.type,
      checkoutSheet.itemId,
      checkoutSheet.provider
    );
    if (success) {
      setCheckoutSuccess(true);
      setTimeout(() => {
        setCheckoutSuccess(false);
        setCheckoutSheet(null);
        setPlansModalOpen(false);
      }, 1800);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto no-scrollbar">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={() => !checkoutSheet && setPlansModalOpen(false)} />

      {/* Main Sheet Container */}
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative w-full max-w-lg bg-[#0e0e13] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl z-10 max-h-[92vh] overflow-y-auto no-scrollbar space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#d4af37]/20 border border-[#d4af37]/40 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#f5d77f]" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-display text-white">Upgrade & Credits</h3>
              <p className="text-xs text-stone-400">Current balance: {wallet?.balance || 0} credits</p>
            </div>
          </div>

          <button
            onClick={() => setPlansModalOpen(false)}
            className="p-2 text-stone-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher: Subscriptions vs Credit Top-Ups */}
        <div className="flex items-center p-1 rounded-xl bg-stone-900 border border-white/5">
          <button
            onClick={() => setActiveTab('plans')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'plans'
                ? 'bg-gradient-to-r from-[#d4af37] to-amber-500 text-stone-950 shadow-md'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            Pro Passes (From ₹1)
          </button>
          <button
            onClick={() => setActiveTab('topup')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'topup'
                ? 'bg-gradient-to-r from-[#d4af37] to-amber-500 text-stone-950 shadow-md'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            Credit Top-Ups
          </button>
        </div>

        {activeTab === 'plans' ? (
          /* SUBSCRIPTION PLANS */
          <div className="space-y-4">
            {plans.map((plan) => {
              const isSelected = selectedPlanId === plan.id;
              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`relative p-4 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-gradient-to-br from-[#1c1a14] to-[#121217] border-[#d4af37] shadow-[0_0_20px_rgba(212,175,55,0.2)]'
                      : 'bg-stone-900/60 border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Badge */}
                  {plan.badge && (
                    <div className="absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full bg-[#d4af37] text-stone-950 text-[10px] font-extrabold uppercase tracking-wider shadow">
                      {plan.badge}
                    </div>
                  )}

                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-base font-bold text-white flex items-center gap-2">
                        {plan.name}
                        {plan.isIntro && (
                          <span className="text-[11px] font-semibold text-[#f5d77f] px-2 py-0.5 rounded-full bg-[#d4af37]/20 border border-[#d4af37]/30">
                            Daily Autopay
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-amber-200/90 font-semibold mt-0.5">
                        +{plan.includedCredits} Credits immediately
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-2xl font-bold font-display text-white">₹{plan.price}</span>
                      <span className="text-xs text-stone-400 block">
                        {plan.renewalInterval === 'daily' ? '/ 24 hrs' : plan.renewalInterval === 'weekly' ? '/ 7 days' : 'one-time'}
                      </span>
                    </div>
                  </div>

                  {/* Feature Bullets */}
                  <ul className="mt-3 pt-3 border-t border-white/5 space-y-1.5">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-xs text-stone-300">
                        <Check className="w-3.5 h-3.5 text-[#d4af37] shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  {/* MANDATORY CLEAR SUBSCRIPTION DISCLOSURE */}
                  {plan.disclosureText && (
                    <div className="mt-3 p-2 rounded-xl bg-black/40 border border-white/5 text-[11px] text-stone-400 leading-snug">
                      <span className="font-semibold text-stone-300">Terms: </span>
                      {plan.disclosureText}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* CREDIT TOP-UPS */
          <div className="grid grid-cols-1 gap-3">
            {topUps.map((topUp) => {
              const isSelected = selectedTopUpId === topUp.id;
              const totalCredits = topUp.credits + (topUp.bonusCredits || 0);
              return (
                <div
                  key={topUp.id}
                  onClick={() => setSelectedTopUpId(topUp.id)}
                  className={`p-4 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                    isSelected
                      ? 'bg-gradient-to-r from-[#1c1a14] to-[#121217] border-[#d4af37] shadow-[0_0_15px_rgba(212,175,55,0.2)]'
                      : 'bg-stone-900/60 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-[#d4af37]" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {totalCredits} Credits
                      </h4>
                      <p className="text-xs text-stone-400">
                        {topUp.bonusCredits ? `Includes ${topUp.bonusCredits} bonus credits` : 'No expiration'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-lg font-bold text-white">₹{topUp.price}</span>
                    {topUp.popular && (
                      <span className="block text-[10px] font-bold text-[#d4af37] uppercase">Popular</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Payment Gateway Provider Selector (Cashfree / Razorpay) */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 block">
            Payment Method
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentProvider('cashfree')}
              className={`p-3 rounded-xl border text-left flex items-center justify-between text-xs font-semibold transition-all ${
                paymentProvider === 'cashfree'
                  ? 'border-[#d4af37] bg-[#d4af37]/10 text-white'
                  : 'border-white/10 bg-stone-900 text-stone-400'
              }`}
            >
              <span>Cashfree AutoPay</span>
              <span className="text-[10px] font-normal text-stone-400">UPI / Card</span>
            </button>

            <button
              type="button"
              onClick={() => setPaymentProvider('razorpay')}
              className={`p-3 rounded-xl border text-left flex items-center justify-between text-xs font-semibold transition-all ${
                paymentProvider === 'razorpay'
                  ? 'border-[#d4af37] bg-[#d4af37]/10 text-white'
                  : 'border-white/10 bg-stone-900 text-stone-400'
              }`}
            >
              <span>Razorpay Mandate</span>
              <span className="text-[10px] font-normal text-stone-400">Netbanking</span>
            </button>
          </div>
        </div>

        {/* Mandate explicit customer agreement */}
        {activeTab === 'plans' && currentPlan?.isIntro && (
          <label className="flex items-start gap-2.5 text-[11px] text-stone-400 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={mandateAgreed}
              onChange={(e) => setMandateAgreed(e.target.checked)}
              className="mt-0.5 rounded border-white/20 text-[#d4af37] focus:ring-[#d4af37]"
            />
            <span>
              I authorize the ₹1 trial charge for the first 24 hours, followed by ₹199 daily renewal until cancelled. I understand I can cancel anytime with 1-click in my profile.
            </span>
          </label>
        )}

        {/* Main CTA */}
        <div>
          <button
            onClick={handleStartCheckout}
            disabled={isPaying || (activeTab === 'plans' && currentPlan?.isIntro && !mandateAgreed)}
            className="w-full py-4 px-6 gold-button rounded-2xl text-sm font-bold flex items-center justify-center gap-2 group disabled:opacity-50"
          >
            <Lock className="w-4 h-4" />
            <span>
              {activeTab === 'plans'
                ? `Unlock ${currentPlan?.name} (₹${currentPlan?.price})`
                : `Add Credits (₹${currentTopUp?.price})`}
            </span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>

          <p className="text-[11px] text-center text-stone-500 mt-2">
            Secure 256-bit encrypted checkout. Instant server activation.
          </p>
        </div>

        {/* Support Link */}
        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-stone-500">
          <span>Need help with payments?</span>
          <button
            onClick={() => {
              setPlansModalOpen(false);
              setSupportModalOpen(true);
            }}
            className="text-[#d4af37] hover:underline flex items-center gap-1"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>WhatsApp & FAQ</span>
          </button>
        </div>
      </motion.div>

      {/* SIMULATED GATEWAY CHECKOUT MODAL (Cashfree / Razorpay UI Sheet) */}
      <AnimatePresence>
        {checkoutSheet && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-[#14141a] border border-white/15 rounded-3xl p-6 shadow-2xl text-center space-y-5"
            >
              {!checkoutSuccess ? (
                <>
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-[#d4af37]/20 border border-[#d4af37]/40 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-[#f5d77f]" />
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[#d4af37]">
                      {checkoutSheet.provider.toUpperCase()} CHECKOUT
                    </span>
                    <h3 className="text-xl font-bold font-display text-white mt-1">
                      Authorize Payment
                    </h3>
                    <p className="text-xs text-stone-400 mt-1">
                      {checkoutSheet.title} · Order #{checkoutSheet.orderId.slice(-8)}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-stone-900 border border-white/10 text-left space-y-2">
                    <div className="flex justify-between text-xs text-stone-400">
                      <span>Total Payable Now:</span>
                      <span className="text-base font-bold text-white">₹{checkoutSheet.amount}.00</span>
                    </div>
                    <div className="flex justify-between text-xs text-stone-400">
                      <span>Credits to Receive:</span>
                      <span className="font-semibold text-amber-300">+{checkoutSheet.credits} ✦</span>
                    </div>
                    <div className="pt-2 border-t border-white/5 flex items-center gap-1.5 text-[11px] text-emerald-400">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Zero-fraud merchant protection</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={handleAuthorizePayment}
                      disabled={isPaying}
                      className="w-full py-3.5 gold-button rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                    >
                      <span>{isPaying ? 'Verifying Gateway...' : `Pay ₹${checkoutSheet.amount} Securely`}</span>
                    </button>

                    <button
                      onClick={() => setCheckoutSheet(null)}
                      disabled={isPaying}
                      className="w-full py-2 text-xs text-stone-400 hover:text-stone-200"
                    >
                      Cancel Payment
                    </button>
                  </div>
                </>
              ) : (
                /* SUCCESS SCREEN */
                <div className="py-6 space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center">
                    <Check className="w-8 h-8 text-emerald-400 stroke-[3]" />
                  </div>
                  <h4 className="text-lg font-bold text-white">Payment Verified!</h4>
                  <p className="text-xs text-stone-300">
                    +{checkoutSheet.credits} credits activated in your ledger.
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
