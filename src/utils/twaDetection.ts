/**
 * Android TWA Environment Detection Helper
 * 
 * Strict Rules:
 * 1. ONLY returns true if the incoming referrer explicitly matches the Android TWA package referrer:
 *    document.referrer.startsWith('android-app://com.aiprimestudio.app')
 * 2. Persists ONLY a positively verified TWA session into sessionStorage ('lumina_twa_verified')
 *    so SPA view navigation and modal transitions retain TWA status.
 * 3. NEVER uses display-mode: standalone as independent proof of TWA (Chrome-installed PWA is standalone and retains full payment).
 * 4. NEVER uses Android User-Agent as independent proof of TWA.
 * 5. Returns false for normal Web, mobile Chrome, and Chrome-installed PWA.
 */

export function isPlayStoreTWA(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    // 1. Check if this session was already positively verified as TWA
    const sessionVerified = sessionStorage.getItem('lumina_twa_verified');
    if (sessionVerified === 'true') {
      return true;
    }

    // 2. Authoritative check: Android TWA referrer
    const referrer = document.referrer || '';
    if (referrer.startsWith('android-app://com.aiprimestudio.app')) {
      sessionStorage.setItem('lumina_twa_verified', 'true');
      return true;
    }

    // Normal Web or Chrome PWA: NOT a Play Store TWA
    return false;
  } catch {
    return false;
  }
}
