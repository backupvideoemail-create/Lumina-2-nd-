/**
 * Centralized Configuration for Customer Support, Subscriptions, and Recurring Mandates.
 * 
 * Rules & Plans:
 * 1. Plan 1: Double Bonanza (₹1 Intro, 40 credits trial, then ₹499 recurring renewal)
 * 2. Plan 2: Creator Weekly (₹199, 230 credits, 7 days validity, renews every 7 days)
 * 3. Plan 3: Creator Monthly (₹998, 1200 credits, 30 days validity, renews monthly)
 * 
 * Centralized: All plans, prices, credits, renewal amounts, validity and disclosures are stored here.
 * Future changes can be made without rebuilding the complete application.
 */

export const SUPPORT_CONFIG = {
  email: 'backupvideoemail@gmail.com',
  name: 'AI Prime Studio Support Desk',
  responseTime: 'Within 24 hours'
} as const;

export interface CentralSubscriptionPlan {
  id: string;
  name: string;
  cardTitle: string;
  validityLabel: string;
  price: number;
  periodLabel: string;
  includedCredits: number;
  renewalPrice: number;
  renewalCredits: number;
  renewalInterval: 'daily' | 'weekly' | 'monthly';
  validityDays: number;
  validityHours: number;
  autoPayEnabled: boolean;
  scheduleRule: 'next_calendar_day' | 'interval_days';
  disclosureText: string;
  badge?: string;
  isPopular?: boolean;
  isIntro?: boolean;
}

export const CENTRAL_SUBSCRIPTION_PLANS: CentralSubscriptionPlan[] = [
  {
    id: 'plan_intro_daily',
    name: 'Double Bonanza',
    cardTitle: 'Double Bonanza',
    validityLabel: '1 day validity',
    price: 1,
    periodLabel: '24 hours',
    includedCredits: 40, // 40 credits immediately unlocked for 24 hours
    renewalPrice: 499, // ₹499 recurring renewal
    renewalCredits: 400, // 400 credits upon verified renewal
    renewalInterval: 'weekly', // Aligned with Razorpay regulatory minimum interval & live plan_TjsjORpnQrwUzl
    validityDays: 1,
    validityHours: 24,
    autoPayEnabled: true,
    scheduleRule: 'next_calendar_day',
    disclosureText: '₹1 today for 24-hr trial · then ₹499 auto-renews via UPI AutoPay for 400 credits until cancelled.',
    badge: 'HOT',
    isIntro: true,
    isPopular: true
  },
  {
    id: 'plan_weekly_pass',
    name: 'Creator Weekly',
    cardTitle: '230 AI Trends Credit',
    validityLabel: '7 days validity',
    price: 199,
    periodLabel: '7 days',
    includedCredits: 230,
    renewalPrice: 199,
    renewalCredits: 230,
    renewalInterval: 'weekly',
    validityDays: 7,
    validityHours: 168,
    autoPayEnabled: true,
    scheduleRule: 'interval_days',
    disclosureText: '₹199 · renews every 7 days until cancelled.',
    badge: 'Weekly'
  },
  {
    id: 'plan_monthly_pass',
    name: 'Creator Monthly',
    cardTitle: '1200 AI Trends Credit',
    validityLabel: '30 days validity',
    price: 998,
    periodLabel: '30 days',
    includedCredits: 1200,
    renewalPrice: 998,
    renewalCredits: 1200,
    renewalInterval: 'monthly',
    validityDays: 30,
    validityHours: 720,
    autoPayEnabled: true,
    scheduleRule: 'interval_days',
    disclosureText: '₹998 · renews monthly until cancelled.',
    badge: 'Best Value'
  }
];

export const SUBSCRIPTION_CONFIG = {
  introPlanId: 'plan_intro_daily',
  introPrice: 1,
  renewalPrice: 499,
  renewalCredits: 400,
  renewalInterval: 'weekly' as const,
  scheduleRule: 'next_calendar_day' as const,
  includedCredits: 40,
  validityHours: 24,
  timezone: 'Asia/Kolkata',
  timezoneOffsetMinutes: 330, // UTC+5:30 (Indian Standard Time for INR ₹ transactions)
  disclosureText: '₹1 today for 24-hr trial · then ₹499 auto-renews via UPI AutoPay for 400 credits until cancelled.',
  plans: CENTRAL_SUBSCRIPTION_PLANS
} as const;

/**
 * Calculates the next calendar day starting boundary according to standard payment gateway
 * scheduled-debit rules.
 */
export function calculateNextCalendarDayStartDate(
  fromDate: Date = new Date(),
  timezoneOffsetMinutes: number = SUBSCRIPTION_CONFIG.timezoneOffsetMinutes
) {
  const utcMs = fromDate.getTime() + fromDate.getTimezoneOffset() * 60000;
  const targetDate = new Date(utcMs + timezoneOffsetMinutes * 60000);

  // Advance to next calendar day at 00:00:00
  targetDate.setDate(targetDate.getDate() + 1);
  targetDate.setHours(0, 0, 0, 0);

  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  const dateString = `${year}-${month}-${day}`;

  const nextDayUtcMs = targetDate.getTime() - timezoneOffsetMinutes * 60000;
  const nextDayDate = new Date(nextDayUtcMs);
  const unixSeconds = Math.floor(nextDayUtcMs / 1000);

  return {
    dateString,
    isoString: nextDayDate.toISOString(),
    unixSeconds,
    displayDate: nextDayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  };
}

/**
 * Centralized Top-Up Packs Configuration
 * 
 * Rules:
 * - One-time credit purchase (NOT a subscription, no AutoPay mandate)
 * - Only available to users who have activated a valid plan
 * - Initial Packs:
 *   ₹49  -> 45 credits
 *   ₹99  -> 95 credits
 *   ₹199 -> 200 credits
 *   ₹399 -> 420 credits
 */
export interface CentralTopUpPack {
  id: string;
  name: string;
  price: number;
  credits: number;
  tagline: string;
  badge?: string;
  isPopular?: boolean;
}

export const CENTRAL_TOP_UP_PACKS: CentralTopUpPack[] = [
  {
    id: 'topup_49',
    name: 'Starter Top-Up',
    price: 49,
    credits: 45,
    tagline: 'Instant 45 Credits',
    badge: 'Quick'
  },
  {
    id: 'topup_99',
    name: 'Creator Top-Up',
    price: 99,
    credits: 95,
    tagline: 'Instant 95 Credits',
    badge: 'Popular',
    isPopular: true
  },
  {
    id: 'topup_199',
    name: 'Power Top-Up',
    price: 199,
    credits: 200,
    tagline: 'Instant 200 Credits',
    badge: 'Recommended'
  },
  {
    id: 'topup_399',
    name: 'Studio Top-Up',
    price: 399,
    credits: 420,
    tagline: 'Instant 420 Credits',
    badge: 'Best Value'
  }
];

export function getTopUpPackById(id: string): CentralTopUpPack | undefined {
  return CENTRAL_TOP_UP_PACKS.find(p => p.id === id);
}

/**
 * Helper to fetch a plan by ID from centralized configuration.
 */
export function getSubscriptionPlanById(planId: string): CentralSubscriptionPlan {
  const found = CENTRAL_SUBSCRIPTION_PLANS.find(p => p.id === planId);
  return found || CENTRAL_SUBSCRIPTION_PLANS[0];
}
