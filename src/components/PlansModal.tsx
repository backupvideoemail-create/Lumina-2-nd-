import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeft,
  Zap,
  Sparkles,
  UserCheck,
  ArrowRight,
  AlertCircle,
  ShieldCheck,
  Lock,
  Clock
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  CENTRAL_SUBSCRIPTION_PLANS
} from '../config/subscriptionConfig';
import creatorModelImg from '../assets/images/nikhil_creator_hero_1791103631854.jpg';
import officialStudioLogo from '../assets/images/ai_prime_studio_logo_1791382901426.jpg';

export const PlansModal: React.FC = () => {
  const {
    plansModalOpen,
    setPlansModalOpen,
    initiateCheckout,
    verifyPayment,
    isPaying,
    activeSubscription,
    refreshUserData,
    user,
    triggerHighIntentAction,
    isIntroEligible
  } = useApp();

  // Default selection: If eligible for intro offer, default to 'plan_intro_daily'
  // If user has already claimed intro offer, default to 'plan_weekly_pass' (Creator Weekly)
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    isIntroEligible ? 'plan_intro_daily' : 'plan_weekly_pass'
  );
  const [showPhoneStep, setShowPhoneStep] = useState<boolean>(false);
  const [phoneInput, setPhoneInput] = useState<string>(user?.phone || '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [pricingBanner, setPricingBanner] = useState<{
    mediaUrl: string;
    mediaType: 'image' | 'video';
    posterUrl?: string;
    isEnabled: boolean;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetch(`/api/pricing-banner?t=${Date.now()}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && data.banner) {
          setPricingBanner(data.banner);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [plansModalOpen]);

  useEffect(() => {
    if (!isIntroEligible && selectedPlanId === 'plan_intro_daily') {
      setSelectedPlanId('plan_weekly_pass');
    }
  }, [isIntroEligible, selectedPlanId]);

  if (!plansModalOpen) return null;

  const visiblePlans = CENTRAL_SUBSCRIPTION_PLANS.filter(
    (p) => isIntroEligible || (!p.isIntro && p.id !== 'plan_intro_daily')
  );

  const currentPlan =
    visiblePlans.find((p) => p.id === selectedPlanId) ||
    visiblePlans[0] ||
    CENTRAL_SUBSCRIPTION_PLANS[0];

  const proceedWithRazorpayCheckout = async (phoneToUse: string) => {
    setErrorMessage(null);
    setPhoneError(null);

    // 1. Request real order or subscription mandate from server with phone
    const res = await initiateCheckout('plan', currentPlan.id, 'razorpay', phoneToUse);
    if (!res.success || (!res.orderId && !res.subscriptionId)) {
      setErrorMessage(res.error || 'Failed to initiate checkout order with payment server. Please try again.');
      return;
    }

    // 2. Fetch live Razorpay client configuration from server
    try {
      const configRes = await fetch('/api/payments/config');
      const configData = await configRes.json();

      if (!configData?.keyId) {
        setErrorMessage('Razorpay live configuration is missing on the server. Please contact support.');
        return;
      }

      if (!(window as any).Razorpay) {
        setErrorMessage('Razorpay Checkout SDK is still loading. Please check your network and retry.');
        return;
      }

      // 3. Open actual Razorpay Checkout Modal
      const isAutoPay = Boolean(res.subscriptionId || currentPlan.autoPayEnabled);
      const logoUrl = `${window.location.origin}/logo.png`;

      const options: any = {
        key: configData.keyId,
        name: 'AI Prime Studio',
        description:
          currentPlan.id === 'plan_intro_daily'
            ? 'Trail Offer · ₹1 Intro (24h) + ₹499 Weekly AutoPay'
            : `${currentPlan.name} AutoPay`,
        image: logoUrl,
        handler: async (response: any) => {
          const effectiveOrderId = response.razorpay_order_id || res.orderId || response.razorpay_subscription_id || res.subscriptionId || '';
          const verifyResult = await verifyPayment(
            effectiveOrderId,
            'plan',
            currentPlan.id,
            'razorpay',
            response.razorpay_payment_id,
            response.razorpay_signature,
            response.razorpay_subscription_id || res.subscriptionId
          );

          if (verifyResult.success) {
            await refreshUserData();
            setPlansModalOpen(false);
          } else {
            console.error('[Razorpay Verify Error]:', verifyResult.error);
            setErrorMessage(
              verifyResult.error
                ? `${verifyResult.error}. If money was debited from your bank, please retry or contact support.`
                : 'Payment verification failed on the server. If money was debited, it will reflect within a few minutes.'
            );
          }
        },
        prefill: {
          name: user?.name || 'AI Prime Creator',
          contact: phoneToUse.startsWith('+91') ? phoneToUse : `+91${phoneToUse.slice(-10)}`,
          email: user?.email || 'ai.prime.studio.pro@gmail.com'
        },
        send_sms_hash: true,
        retry: {
          enabled: true,
          max_count: 3
        },
        notes: {
          planId: currentPlan.id,
          isAutoPay: String(isAutoPay),
          renewalPrice: currentPlan.renewalPrice
        },
        theme: {
          color: '#ff9f00'
        },
        modal: {
          backdropclose: false,
          escape: true,
          handleback: true,
          confirm_close: true,
          ondismiss: () => {
            console.log('[Razorpay] Checkout modal dismissed by user');
          }
        }
      };

      if (res.subscriptionId) {
        options.subscription_id = res.subscriptionId;
        if (res.customerId) {
          options.customer_id = res.customerId;
        }
      } else {
        options.order_id = res.orderId;
        options.amount = Math.round(currentPlan.price * 100);
        options.currency = 'INR';
      }

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (failResponse: any) => {
        console.error('[Razorpay Payment Failed]:', failResponse.error);
        setErrorMessage(failResponse.error?.description || 'Payment was declined or cancelled.');
      });
      rzp.open();
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not launch Razorpay checkout.');
    }
  };

  const handleStartRealPayment = async () => {
    setErrorMessage(null);

    // Gate with high-intent authentication
    if (!user) {
      triggerHighIntentAction({
        type: 'buy_plan',
        planId: currentPlan.id
      });
      return;
    }

    const clean = (phoneInput || user?.phone || '').replace(/[^0-9]/g, '');
    if (clean.length < 10) {
      setShowPhoneStep(true);
      return;
    }

    await proceedWithRazorpayCheckout(clean.slice(-10));
  };

  const handleConfirmPhoneAndPay = async () => {
    setPhoneError(null);
    const clean = phoneInput.replace(/[^0-9]/g, '');
    if (clean.length < 10) {
      setPhoneError('Please enter a valid 10-digit mobile number');
      return;
    }
    setShowPhoneStep(false);
    await proceedWithRazorpayCheckout(clean.slice(-10));
  };


  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-2 bg-black/95 backdrop-blur-xl overflow-hidden">
      {/* Backdrop click to dismiss */}
      <div
        className="absolute inset-0"
        onClick={() => !isPaying && setPlansModalOpen(false)}
      />

      {/* Main Paywall Card - Professional Full-Bleed Cinematic Architecture */}
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 340 }}
        className="relative w-full max-w-[430px] bg-[#07060b] border-t sm:border border-white/10 rounded-t-[36px] sm:rounded-[36px] shadow-[0_-20px_60px_rgba(0,0,0,0.95)] z-10 max-h-[96vh] overflow-y-auto no-scrollbar pb-4"
      >
        {/* 1. FULL-BLEED IMMERSIVE VISUAL HERO BANNER (Clean, Uncluttered Canvas) */}
        <div className="relative w-full aspect-[4/4.2] max-h-[440px] sm:max-h-[460px] overflow-hidden bg-black rounded-t-[36px]">
          {/* Admin Controlled Pricing Banner Media with Fallback to Creator Portrait */}
          {pricingBanner && pricingBanner.isEnabled && pricingBanner.mediaUrl ? (
            pricingBanner.mediaType === 'video' ? (
              <video
                src={pricingBanner.mediaUrl}
                poster={pricingBanner.posterUrl || creatorModelImg}
                autoPlay
                muted
                loop
                playsInline
                className="w-full h-full object-cover object-top"
              />
            ) : (
              <motion.img
                src={pricingBanner.mediaUrl}
                alt="AI Prime Studio Visual Hero"
                initial={{ scale: 1.02 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="w-full h-full object-cover object-top"
              />
            )
          ) : (
            <motion.img
              src={creatorModelImg}
              alt="AI Prime Studio Visual Hero"
              initial={{ scale: 1.02 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="w-full h-full object-cover object-top"
            />
          )}

          {/* Minimal bottom transition blend into plan cards */}
          <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-[#07060b] to-transparent pointer-events-none" />

          {/* TOP APP BAR: Floating clean back button & optional active status badge only */}
          <div className="absolute top-3.5 inset-x-4 flex items-center justify-between z-30 pointer-events-none">
            <button
              onClick={() => setPlansModalOpen(false)}
              className="w-9 h-9 rounded-full bg-black/65 active:scale-95 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all cursor-pointer shadow-lg pointer-events-auto"
              aria-label="Back"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
            </button>

            {/* Active Status Badge if subscribed */}
            <div className="pointer-events-auto">
              {activeSubscription?.status === 'active' && (
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold uppercase backdrop-blur-md shadow-md">
                  Active
                </span>
              )}
            </div>
          </div>
        </div>

        {showPhoneStep ? (
          /* DEDICATED MOBILE VERIFICATION STEP (NPCI & RAZORPAY RECEIPT) */
          <div className="px-4 pt-3 pb-2 space-y-3.5 relative z-20">
            <button
              onClick={() => {
                setShowPhoneStep(false);
                setPhoneError(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-400 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Plan Selection</span>
            </button>

            {/* Plan summary mini-banner */}
            <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/15 to-orange-500/10 border border-amber-500/25 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">
                    {currentPlan.cardTitle}
                  </div>
                  <div className="text-[10.5px] text-stone-300">
                    {currentPlan.validityLabel} · {currentPlan.periodLabel}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-amber-300 font-display">
                  ₹{currentPlan.price}
                </span>
              </div>
            </div>

            {/* Mobile number input container */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-200 block">
                Mobile Number for Payment & Invoice <span className="text-amber-400">*</span>
              </label>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.05] border border-white/15 focus-within:border-amber-400 focus-within:bg-white/[0.08] transition-all">
                <span className="text-xs font-black text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/30 shrink-0">
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  autoFocus
                  placeholder="Enter 10-digit mobile number"
                  value={phoneInput}
                  onChange={(e) => {
                    setPhoneInput(e.target.value.replace(/[^0-9]/g, ''));
                    setPhoneError(null);
                  }}
                  className="bg-transparent text-sm text-white placeholder-stone-500 outline-none w-full font-mono tracking-wider"
                />
              </div>

              {phoneError && (
                <div className="flex items-center gap-1.5 text-[11px] text-rose-400 font-medium pt-0.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{phoneError}</span>
                </div>
              )}

              <p className="text-[10px] text-stone-400 leading-normal pt-1">
                Used to deliver your payment confirmation receipt and link supported UPI payment methods.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Confirm CTA */}
            <div className="pt-1">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleConfirmPhoneAndPay}
                disabled={isPaying}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#fca311] via-[#ea580c] to-[#2563eb] hover:opacity-95 text-black text-base font-black flex items-center justify-center gap-2 shadow-[0_12px_40px_rgba(234,88,12,0.5),0_12px_40px_rgba(37,99,235,0.45)] transition-all cursor-pointer disabled:opacity-50 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full animate-[shimmer_2.5s_infinite]" />
                <span className="relative z-10">
                  {isPaying ? 'Connecting to Razorpay...' : `Proceed to Secure Checkout · ₹${currentPlan.price}`}
                </span>
                <ArrowRight className="w-5 h-5 stroke-[3] text-black relative z-10" />
              </motion.button>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[10px] text-stone-400 pt-1">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Official 256-bit Encrypted Checkout via Razorpay</span>
            </div>
          </div>
        ) : (
          /* CLEAN PLAN SELECTION VIEW (ZERO VISIBLE PHONE INPUT UNDER CARDS) */
          <>
            <div className="px-3.5 pt-2 space-y-2.5 relative z-20">
              {visiblePlans.map((plan, index) => {
                const isSelected = selectedPlanId === plan.id;
                const isFirst = plan.id === 'plan_intro_daily' || plan.isIntro;
                const isSecond = !isFirst && index === (isIntroEligible ? 1 : 0);

                // SPECIAL HIGH-CONVERTING DESIGN FOR ₹1 INTRO OFFER (Verified Terms)
                if (isFirst) {
                  return (
                    <motion.div
                      key={plan.id}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => {
                        setSelectedPlanId(plan.id);
                        setErrorMessage(null);
                      }}
                      className={`relative rounded-2xl p-2.5 sm:p-3 cursor-pointer transition-all duration-300 flex flex-col justify-between backdrop-blur-xl ${
                        isSelected
                          ? 'bg-gradient-to-r from-[#2c1d0c]/95 via-[#1b140f]/95 to-[#28180c]/95 border-2 border-[#ff9f00] shadow-[0_0_30px_rgba(255,159,0,0.4)]'
                          : 'bg-gradient-to-r from-[#1c140d]/75 to-[#14100c]/75 border border-amber-500/35 hover:border-amber-500/50'
                      }`}
                    >
                      {/* Top Row: Left INTRO OFFER badge, Right LIMITED TIME OFFER badge */}
                      <div className="flex items-center justify-between w-full">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-[#ff334b] to-[#ea1c38] text-white text-[11px] sm:text-xs font-black tracking-wide shadow-sm select-none">
                          <span className="text-xs">🔥</span>
                          <span>INTRO OFFER</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#ffb703] text-black text-[10px] sm:text-[11px] font-black uppercase tracking-wider shadow-sm select-none">
                          <span className="text-[10px] font-bold">✨</span>
                          <span>LIMITED TIME OFFER</span>
                        </div>
                      </div>

                      {/* Middle: 1 day validity */}
                      <div className="pt-1">
                        <p className="text-[11px] sm:text-xs font-medium text-stone-300">
                          1 day validity
                        </p>
                      </div>

                      {/* Bottom Row: Large ₹1 with struck-through ₹499 */}
                      <div className="flex items-baseline gap-2.5 pt-0.5">
                        <span className="text-[#ffb703] font-black text-3xl sm:text-4xl leading-none font-display tracking-tight">
                          ₹1
                        </span>
                        <span className="text-white/90 font-bold text-2xl sm:text-3xl line-through decoration-[#ea1c38] decoration-[3px] tracking-tight">
                          ₹499
                        </span>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={plan.id}
                    whileTap={{ scale: 0.985 }}
                    onClick={() => {
                      setSelectedPlanId(plan.id);
                      setErrorMessage(null);
                    }}
                    className={`relative rounded-2xl p-3.5 cursor-pointer transition-all duration-300 flex items-center justify-between backdrop-blur-xl ${
                      isSecond
                        ? isSelected
                          ? 'bg-gradient-to-r from-[#261942]/95 via-[#171230]/95 to-[#24173e]/95 border-2 border-purple-400 shadow-[0_0_30px_rgba(168,85,247,0.45)]'
                          : 'bg-gradient-to-r from-[#18122c]/80 via-[#120e24]/80 to-[#1a1432]/80 border border-purple-500/25 hover:border-purple-400/45 shadow-[0_4px_20px_rgba(168,85,247,0.12)]'
                        : isSelected
                        ? 'bg-gradient-to-r from-[#0f2538]/95 via-[#0b1c28]/95 to-[#0e2938]/95 border-2 border-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.45)]'
                        : 'bg-gradient-to-r from-[#0d1f2d]/80 via-[#0a1822]/80 to-[#0d222e]/80 border border-cyan-500/25 hover:border-cyan-400/45 shadow-[0_4px_20px_rgba(6,182,212,0.12)]'
                    }`}
                  >
                    {/* Left Side: Title + Badge + Subtitle */}
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold text-white tracking-wide">
                          {plan.cardTitle}
                        </span>
                        {plan.badge && isSelected && (
                          <span className="px-1.5 py-0.5 rounded-md bg-[#ff9f00] text-black text-[9px] font-black uppercase tracking-wider shadow-sm animate-pulse">
                            {plan.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-stone-300">
                        {plan.validityLabel}
                      </p>
                    </div>

                    {/* Right Side: Price + Period Label */}
                    <div className="text-right shrink-0 pl-3">
                      <div
                        className={`text-2xl sm:text-3xl font-black font-display leading-none ${
                          isSecond
                            ? isSelected ? 'text-purple-300' : 'text-white'
                            : isSelected ? 'text-cyan-300' : 'text-white'
                        }`}
                      >
                        ₹{plan.price}
                      </div>
                      <div className="text-[10px] text-stone-400 font-semibold mt-1">
                        {plan.periodLabel}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Error notification if checkout fails */}
            {errorMessage && (
              <div className="mx-3.5 mt-3 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center gap-2 text-rose-300 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* PRIMARY CTA BUTTON: High-Impact Gold-to-Electric-Blue Gradient with Sheen */}
            <div className="px-3.5 pt-3">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleStartRealPayment}
                disabled={isPaying}
                className="w-full py-3.5 sm:py-4 px-6 rounded-2xl bg-gradient-to-r from-[#fca311] via-[#ea580c] to-[#2563eb] hover:opacity-95 text-black text-base sm:text-lg font-black flex items-center justify-center gap-2 shadow-[0_12px_40px_rgba(234,88,12,0.5),0_12px_40px_rgba(37,99,235,0.45)] transition-all cursor-pointer disabled:opacity-50 tracking-tight relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full animate-[shimmer_2.5s_infinite]" />
                <span className="relative z-10">
                  {isPaying
                    ? 'Connecting to Razorpay...'
                    : selectedPlanId === 'plan_intro_daily'
                    ? 'Continue & Pay ₹1'
                    : `Continue & Pay ₹${currentPlan.price}`}
                </span>
                <ArrowRight className="w-5 h-5 stroke-[3] text-black relative z-10" />
              </motion.button>
            </div>

            {/* POLICY TEXT: Compact 2 lines matching design */}
            <div className="text-center pt-2 px-5">
              <p className="text-[10px] sm:text-[10.5px] text-stone-400 leading-tight font-normal max-w-sm mx-auto">
                Subscription auto-renews at the fixed price and billing frequency shown on your payment screen, unless cancelled at least 24 hours before renewal.
              </p>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};
