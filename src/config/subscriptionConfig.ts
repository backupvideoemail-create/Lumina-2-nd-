/**
 * Centralized Configuration for Customer Support, Subscriptions, and Recurring Mandates.
 * 
 * Rules:
 * - Introductory Offer: ₹1 introductory charge followed by ₹499 recurring daily subscription.
 * - Next Calendar Day: Recurring schedule begins on the subsequent calendar day (not 24h from purchase).
 *   Example: If paid at 10:00 PM on 3 October, the recurring ₹499 schedule starts on 4 October.
 * - Provider-agnostic: Supports Cashfree firstChargeDate (YYYY-MM-DD) and Razorpay start_at (Unix seconds).
 */

export const SUPPORT_CONFIG = {
  email: 'ai.prime.studio.pro@gmail.com',
  name: 'AI Prime Studio Support',
  responseTime: 'Within 24 hours'
} as const;

export const SUBSCRIPTION_CONFIG = {
  introPlanId: 'plan_intro_daily',
  introPrice: 1,
  renewalPrice: 499,
  renewalInterval: 'daily' as const,
  scheduleRule: 'next_calendar_day' as const,
  includedCredits: 500,
  timezone: 'Asia/Kolkata',
  timezoneOffsetMinutes: 330, // UTC+5:30 (Indian Standard Time for INR ₹ transactions)
  disclosureText: '₹1 introductory payment + ₹499 daily renewal from the next calendar day until cancelled.',
  agreementCheckboxText:
    'I authorize the ₹1 introductory payment. I understand that the recurring ₹499 daily subscription renewal begins from the next calendar day until cancelled, and I can cancel anytime with 1-click in my profile.'
} as const;

/**
 * Calculates the next calendar day starting boundary according to standard payment gateway
 * scheduled-debit rules.
 * 
 * @param fromDate Reference date of purchase (defaults to now)
 * @param timezoneOffsetMinutes Timezone offset in minutes (defaults to IST +330)
 */
export function calculateNextCalendarDayStartDate(
  fromDate: Date = new Date(),
  timezoneOffsetMinutes: number = SUBSCRIPTION_CONFIG.timezoneOffsetMinutes
) {
  // Convert current time to target timezone
  const utcMs = fromDate.getTime() + fromDate.getTimezoneOffset() * 60000;
  const targetDate = new Date(utcMs + timezoneOffsetMinutes * 60000);

  // Advance to next calendar day at 00:00:00
  targetDate.setDate(targetDate.getDate() + 1);
  targetDate.setHours(0, 0, 0, 0);

  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  const dateString = `${year}-${month}-${day}`; // Format YYYY-MM-DD for Cashfree first_charge_date

  // Convert back to UTC ISO timestamp
  const nextDayUtcMs = targetDate.getTime() - timezoneOffsetMinutes * 60000;
  const nextDayDate = new Date(nextDayUtcMs);
  const unixSeconds = Math.floor(nextDayUtcMs / 1000); // Unix timestamp for Razorpay start_at

  return {
    dateString,
    isoString: nextDayDate.toISOString(),
    unixSeconds,
    displayDate: nextDayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  };
}
