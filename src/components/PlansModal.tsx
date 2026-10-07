import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeft,
  Zap,
  Sparkles,
  Camera,
  UserCheck,
  Ban,
  ArrowRight,
  Tv,
  AlertCircle
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
    triggerHighIntentAction
  } = useApp();

  // Default selection is "Double Bonanza" (₹1)
  const [selectedPlanId, setSelectedPlanId] = useState<string>('plan_intro_daily');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!plansModalOpen) return null;

  const currentPlan =
    CENTRAL_SUBSCRIPTION_PLANS.find((p) => p.id === selectedPlanId) ||
    CENTRAL_SUBSCRIPTION_PLANS[0];

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

    // 1. Request real order or subscription mandate from server
    const res = await initiateCheckout('plan', currentPlan.id, 'razorpay');
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
            ? 'Double Bonanza · ₹1 Intro Access + AutoPay Mandate'
            : `${currentPlan.name} AutoPay`,
        image: logoUrl,
        handler: async (response: any) => {
          // Send real payment & mandate verification payload to server
          const verified = await verifyPayment(
            response.razorpay_order_id || res.orderId || response.razorpay_subscription_id || '',
            'plan',
            currentPlan.id,
            'razorpay',
            response.razorpay_payment_id,
            response.razorpay_signature,
            response.razorpay_subscription_id || res.subscriptionId
          );

          if (verified) {
            await refreshUserData();
            setPlansModalOpen(false);
          } else {
            setErrorMessage('Payment verification failed on the server. If money was debited, it will reflect within a few minutes.');
          }
        },
        prefill: {
          contact: user?.phone || '',
          email: user?.email || 'ai.prime.studio.pro@gmail.com'
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
          ondismiss: () => {
            console.log('[Razorpay] Checkout modal dismissed by user');
          }
        }
      };

      // CRITICAL: For AutoPay plans, pass subscription_id to authorize recurring mandate!
      if (res.subscriptionId) {
        options.subscription_id = res.subscriptionId;
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

  // 6 Clean, high-impact floating feature chips with colorful icons
  const features = [
    { icon: Zap, label: 'Trending AI Effects', color: 'text-amber-400 bg-amber-500/20 border-amber-500/30' },
    { icon: Sparkles, label: '500+ AI Templates', color: 'text-yellow-300 bg-yellow-500/20 border-yellow-500/30' },
    { icon: Camera, label: 'Instagram Reels Trends', color: 'text-pink-400 bg-pink-500/20 border-pink-500/30' },
    { icon: UserCheck, label: 'Face Swap Magic', color: 'text-purple-300 bg-purple-500/20 border-purple-500/30' },
    { icon: Ban, label: 'No Watermark', color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30' },
    { icon: Tv, label: 'Ultra 4K Quality', color: 'text-cyan-300 bg-cyan-500/20 border-cyan-500/30' }
  ];

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
        {/* 1. FULL-BLEED IMMERSIVE VISUAL HERO BANNER */}
        <div className="relative w-full h-[350px] sm:h-[375px] overflow-hidden">
          {/* Creator Portrait - Framed with face perfectly visible in upper third */}
          <motion.img
            src={creatorModelImg}
            alt="AI Prime Studio Visual Hero"
            initial={{ scale: 1.05 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="w-full h-full object-cover object-[center_16%] sm:object-[center_20%]"
          />

          {/* Cinematic Scrims & Dynamic Light Flares */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-[#07060b]" />
          <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-[#07060b] via-[#07060b]/80 to-transparent" />
          <div className="absolute top-0 right-0 w-56 h-56 bg-purple-600/25 blur-[90px] pointer-events-none" />
          <div className="absolute bottom-16 left-0 w-48 h-48 bg-pink-500/20 blur-[80px] pointer-events-none" />
          <div className="absolute top-1/3 left-1/4 w-44 h-44 bg-cyan-400/15 blur-[70px] pointer-events-none" />

          {/* TOP APP BAR OVERLAY */}
          <div className="absolute top-3.5 inset-x-4 flex items-center justify-between z-30">
            <button
              onClick={() => setPlansModalOpen(false)}
              className="w-9 h-9 rounded-full bg-black/60 active:scale-95 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-white/15 transition-all cursor-pointer shadow-lg"
              aria-label="Back"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
            </button>

            {/* Centered Brand & 3-Point Golden Crown Logo */}
            <div className="flex flex-col items-center">
              <svg
                className="w-7 h-7 text-[#ffb703] fill-[#ffb703] filter drop-shadow-[0_2px_12px_rgba(255,183,3,0.7)]"
                viewBox="0 0 24 24"
              >
                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
              </svg>
              <h2 className="text-base sm:text-lg font-black text-white tracking-wide leading-tight drop-shadow-md">
                AI Prime Studio
              </h2>
              <span className="text-[10px] text-amber-200 font-semibold tracking-wide drop-shadow">
                Photo Video Templates
              </span>
            </div>

            {/* Active Status Badge / Spacer */}
            <div className="w-9 flex justify-end">
              {activeSubscription?.status === 'active' && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 text-[9px] font-bold uppercase backdrop-blur-md">
                  Active
                </span>
              )}
            </div>
          </div>

          {/* HERO BANNER CONTENT: Headline & 6 Floating Animated Glass Feature Chips */}
          <div className="absolute bottom-2.5 inset-x-4 z-20 space-y-2">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/65 backdrop-blur-md border border-[#ff9f00]/40 text-[10px] font-bold text-[#ffb703] shadow-[0_0_15px_rgba(255,159,0,0.3)] mb-1">
                <Sparkles className="w-3 h-3 fill-current" />
                <span>VIRAL REELS CREATOR PRO</span>
              </div>
              <h1 className="text-2xl sm:text-[25px] font-black text-white leading-[1.1] font-display tracking-tight drop-shadow-[0_3px_14px_rgba(0,0,0,0.9)]">
                Create Your Reels<br />
                With{' '}
                <span className="bg-gradient-to-r from-[#ff007a] via-[#c084fc] to-[#00dfd8] bg-clip-text text-transparent font-black drop-shadow-[0_2px_15px_rgba(236,72,153,0.6)]">
                  AI
                </span>{' '}
                <span className="text-amber-300 font-extrabold text-lg sm:text-xl">
                  AI Prime Studio
                </span>
              </h1>
            </div>

            {/* 6 Clean Floating Glassmorphism Feature Chips in 2 Columns */}
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              {features.map((feat, idx) => {
                const Icon = feat.icon;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 + 0.08 }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/65 backdrop-blur-md border border-white/15 shadow-sm"
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 border ${feat.color}`}
                    >
                      <Icon className="w-2.5 h-2.5 fill-current" />
                    </div>
                    <span className="text-[10px] font-bold text-stone-100 truncate">
                      {feat.label}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 2. THREE VIBRANT, ANIMATED iPHONE-STYLE PLAN CARDS */}
        <div className="px-3.5 pt-2 space-y-2.5 relative z-20">
          {CENTRAL_SUBSCRIPTION_PLANS.map((plan, index) => {
            const isSelected = selectedPlanId === plan.id;
            const isFirst = index === 0;
            const isSecond = index === 1;

            return (
              <motion.div
                key={plan.id}
                whileTap={{ scale: 0.985 }}
                onClick={() => {
                  setSelectedPlanId(plan.id);
                  setErrorMessage(null);
                }}
                className={`relative rounded-2xl p-3.5 cursor-pointer transition-all duration-300 flex items-center justify-between backdrop-blur-xl ${
                  // Plan 1: Glowing Golden-Amber Card
                  isFirst
                    ? isSelected
                      ? 'bg-gradient-to-r from-[#2c1d0c]/95 via-[#1b140f]/95 to-[#28180c]/95 border-2 border-[#ff9f00] shadow-[0_0_30px_rgba(255,159,0,0.4)]'
                      : 'bg-gradient-to-r from-[#1c140d]/75 to-[#14100c]/75 border border-amber-500/25 hover:border-amber-500/40'
                    // Plan 2: Royal Violet Card
                    : isSecond
                    ? isSelected
                      ? 'bg-gradient-to-r from-[#261942]/95 via-[#171230]/95 to-[#24173e]/95 border-2 border-purple-400 shadow-[0_0_30px_rgba(168,85,247,0.45)]'
                      : 'bg-gradient-to-r from-[#18122c]/80 via-[#120e24]/80 to-[#1a1432]/80 border border-purple-500/25 hover:border-purple-400/45 shadow-[0_4px_20px_rgba(168,85,247,0.12)]'
                    // Plan 3: Ocean Cyan Card
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
                  {/* Plan 1 shows 'Exclusive Intro Offer Plan', Plan 2 shows '7 days validity', Plan 3 shows '30 days validity' */}
                  <p className="text-[11px] font-medium text-stone-300">
                    {plan.validityLabel}
                  </p>
                </div>

                {/* Right Side: Price + Period Label */}
                <div className="text-right shrink-0 pl-3">
                  <div
                    className={`text-2xl sm:text-3xl font-black font-display leading-none ${
                      isFirst
                        ? isSelected ? 'text-[#ffb703]' : 'text-amber-200'
                        : isSecond
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

        {/* 3. PRIMARY CTA BUTTON: High-Impact Gold-to-Electric-Blue Gradient with Sheen */}
        <div className="px-3.5 pt-3">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleStartRealPayment}
            disabled={isPaying}
            className="w-full py-3.5 sm:py-4 px-6 rounded-2xl bg-gradient-to-r from-[#fca311] via-[#ea580c] to-[#2563eb] hover:opacity-95 text-black text-base sm:text-lg font-black flex items-center justify-center gap-2 shadow-[0_12px_40px_rgba(234,88,12,0.5),0_12px_40px_rgba(37,99,235,0.45)] transition-all cursor-pointer disabled:opacity-50 tracking-tight relative overflow-hidden"
          >
            {/* Shimmer laser sheen across button */}
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

        {/* 4. POLICY TEXT: Exactly 1 to 1.5 Lines in Ultra-Clean Small Font */}
        <div className="text-center pt-2 px-5">
          <p className="text-[9px] sm:text-[9.5px] text-stone-400/90 leading-tight font-normal max-w-sm mx-auto">
            Subscription auto-renews at the same price unless cancelled 24 hrs before renewal. Cancel anytime in account settings. Subscription is optional.
          </p>
          <p className="text-[10.5px] text-amber-200/80 font-medium mt-1.5">
            Need more credits? Top-up is available after plan activation.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
