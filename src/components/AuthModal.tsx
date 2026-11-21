import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check
} from 'lucide-react';
import { Logo } from './Logo';
import { useApp } from '../context/AppContext';
import { AUTH_POLICY, PHONE_AUTH_ENABLED } from '../config/authConfig';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithRedirect,
  ensureAuthBestPersistence
} from '../services/firebase/firebaseClient';
import {
  clearStoredSessionToken,
  exchangeFirebaseSessionWithRetry,
  isMobileOrStandaloneBrowser,
  isRunningInsideIframe,
  savePendingAuthActionToStorage,
  REDIRECT_AUTH_IN_PROGRESS_KEY,
  REDIRECT_ATTEMPT_TS_KEY
} from '../utils/authSession';

function reportAuthFailure(
  vector: 'AUTH_LOGIN_FAILURE' | 'SESSION_PERSISTENCE_FAILURE',
  message: string,
  errorStage: string,
  errorCode?: string
) {
  try {
    fetch('/api/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector,
        severity: vector === 'SESSION_PERSISTENCE_FAILURE' ? 'CRITICAL' : 'ERROR',
        message: message.slice(0, 220),
        errorStage,
        errorCode,
        endpoint: '/api/auth/firebase-session'
      })
    }).catch(() => {});
  } catch {}
}

export const AuthModal: React.FC = () => {
  const { authModalOpen, setAuthModalOpen, onAuthSuccess, pendingAction } = useApp();

  const [step, setStep] = useState<'ready' | 'authenticated'>('ready');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [persistenceNotice, setPersistenceNotice] = useState('');
  const [persistenceMode, setPersistenceMode] = useState<'local' | 'session' | 'none'>('local');
  const [showRedirectFallbackButton, setShowRedirectFallbackButton] = useState(false);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);

  useEffect(() => {
    if (!authModalOpen) {
      setStep('ready');
      setErrorMessage('');
      setPersistenceNotice('');
      setPersistenceMode('local');
      setUnauthorizedDomain(null);
      setCopiedDomain(false);
      setLoading(false);
      setRedirecting(false);
      setShowRedirectFallbackButton(false);
    }
  }, [authModalOpen]);

  if (!authModalOpen) return null;

  const startGoogleRedirectFlow = async (triggerReason: string) => {
    setLoading(true);
    setRedirecting(true);
    setErrorMessage('');
    setPersistenceNotice('');
    try {
      const persistRes = await ensureAuthBestPersistence();
      if (persistRes.mode === 'none' || !persistRes.persisted) {
        clearStoredSessionToken();
        setPersistenceMode('none');
        setLoading(false);
        setRedirecting(false);
        setErrorMessage(
          'Persistent and session browser storage are both blocked. Durable login is unavailable—please enable cookies/site storage in browser settings and try again.'
        );
        reportAuthFailure(
          'SESSION_PERSISTENCE_FAILURE',
          `Both local and session persistence unavailable (${persistRes.error || 'unknown'}) on host ${window.location.hostname}`,
          'google_signin_persistence_blocked',
          'AUTH_STORAGE_COMPLETELY_BLOCKED'
        );
        return;
      }
      if (persistRes.mode === 'session') {
        setPersistenceMode('session');
        setPersistenceNotice(
          persistRes.warning ||
            'Session-only login: persistent storage is blocked in this browser. Your login will last until this tab/browser closes.'
        );
        reportAuthFailure(
          'SESSION_PERSISTENCE_FAILURE',
          `Browser local persistence unavailable (${persistRes.error || 'unknown'}); fell back to browserSessionPersistence on ${window.location.hostname}`,
          'google_signin_session_fallback',
          'AUTH_SESSION_PERSISTENCE_FALLBACK'
        );
      } else {
        setPersistenceMode('local');
      }
      if (pendingAction) {
        savePendingAuthActionToStorage(pendingAction);
      }
      try {
        sessionStorage.setItem(REDIRECT_AUTH_IN_PROGRESS_KEY, '1');
        sessionStorage.setItem(REDIRECT_ATTEMPT_TS_KEY, String(Date.now()));
      } catch {}
      await signInWithRedirect(auth, googleProvider);
    } catch (redirectErr: any) {
      setLoading(false);
      setRedirecting(false);
      try {
        sessionStorage.removeItem(REDIRECT_AUTH_IN_PROGRESS_KEY);
      } catch {}
      if (redirectErr?.code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        setUnauthorizedDomain(domain);
        setErrorMessage(`Hosting domain (${domain}) is not authorized in Firebase Authentication.`);
        reportAuthFailure(
          'AUTH_LOGIN_FAILURE',
          `Unauthorized domain during redirect (${domain})`,
          'google_unauthorized_domain',
          'auth/unauthorized-domain'
        );
      } else {
        const msg = redirectErr?.message || 'Google redirect sign-in failed.';
        setErrorMessage(msg);
        reportAuthFailure(
          'AUTH_LOGIN_FAILURE',
          `Google redirect (${triggerReason}) failed on ${window.location.hostname}: ${msg}`,
          'google_signin_redirect',
          redirectErr?.code || 'AUTH_REDIRECT_ERROR'
        );
      }
    }
  };

  // Real Firebase Google Sign-In (Sole customer authentication method when PHONE_AUTH_ENABLED=false)
  // Primary: browserLocalPersistence -> Fallback: browserSessionPersistence (with notice) -> Fail-honest if both unavailable
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMessage('');
    setPersistenceNotice('');
    setUnauthorizedDomain(null);
    setShowRedirectFallbackButton(false);

    try {
      const persistRes = await ensureAuthBestPersistence();
      if (persistRes.mode === 'none' || !persistRes.persisted) {
        clearStoredSessionToken();
        setPersistenceMode('none');
        setLoading(false);
        setErrorMessage(
          'Persistent and session browser storage are both blocked. Durable login is unavailable—please enable cookies/site storage in browser settings and retry.'
        );
        reportAuthFailure(
          'SESSION_PERSISTENCE_FAILURE',
          `Both local and session persistence unavailable (${persistRes.error || 'unknown'}) on host ${window.location.hostname}`,
          'google_signin_persistence_blocked',
          'AUTH_STORAGE_COMPLETELY_BLOCKED'
        );
        return;
      }

      const activeMode: 'local' | 'session' = persistRes.mode === 'session' ? 'session' : 'local';
      setPersistenceMode(activeMode);
      if (activeMode === 'session') {
        setPersistenceNotice(
          persistRes.warning ||
            'Session-only login: persistent storage is blocked in this browser. Your login will stay active for this session only.'
        );
        reportAuthFailure(
          'SESSION_PERSISTENCE_FAILURE',
          `Browser local persistence unavailable (${persistRes.error || 'unknown'}); fell back to browserSessionPersistence on ${window.location.hostname}`,
          'google_signin_session_fallback',
          'AUTH_SESSION_PERSISTENCE_FALLBACK'
        );
      }

      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      // Establish server session with automatic retry on transient 503 sync delays
      const sessionRes = await exchangeFirebaseSessionWithRetry({
        idToken,
        firebaseUid: result.user.uid,
        email: result.user.email,
        name: result.user.displayName,
        avatar: result.user.photoURL,
        authPolicy: AUTH_POLICY.googleOnly ? 'google_only' : 'multi'
      });

      setLoading(false);

      if (sessionRes.ok && sessionRes.data?.success && sessionRes.data?.cloudPersisted === true) {
        setStep('authenticated');
        setTimeout(() => {
          onAuthSuccess(sessionRes.data.user, sessionRes.data.token, activeMode);
        }, 1200);
      } else {
        const errMsg = sessionRes.error || 'Google authentication mapping failed.';
        setErrorMessage(errMsg);
        reportAuthFailure(
          sessionRes.status >= 500 ? 'SESSION_PERSISTENCE_FAILURE' : 'AUTH_LOGIN_FAILURE',
          errMsg,
          'google_signin_session_exchange',
          sessionRes.data?.code || `HTTP_${sessionRes.status}`
        );
      }
    } catch (err: any) {
      const code = String(err?.code || '');
      const isPopupOrEnvFallbackCode =
        code === 'auth/popup-blocked' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/web-storage-unsupported';

      let lastRedirectTs = 0;
      try {
        lastRedirectTs = Number(sessionStorage.getItem(REDIRECT_ATTEMPT_TS_KEY) || '0');
      } catch {}
      const canAutoRedirect = !lastRedirectTs || Date.now() - lastRedirectTs > 15000;

      // Mobile Chrome / Standalone PWA network or popup block fallback
      const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
      const shouldAutoRedirectOnNetworkErr =
        code === 'auth/network-request-failed' &&
        isOnline &&
        isMobileOrStandaloneBrowser() &&
        !isRunningInsideIframe() &&
        canAutoRedirect;

      if ((isPopupOrEnvFallbackCode && canAutoRedirect) || shouldAutoRedirectOnNetworkErr) {
        await startGoogleRedirectFlow(code || 'popup_fallback');
        return;
      }

      setLoading(false);

      if (code === 'auth/popup-closed-by-user') {
        setErrorMessage('Sign-in popup was closed. Please try again or use Safe Redirect Sign-In.');
        setShowRedirectFallbackButton(true);
      } else if (code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        console.warn('[Google Auth Note]: Domain not yet authorized in Firebase Console:', domain);
        setUnauthorizedDomain(domain);
        setErrorMessage(`Hosting domain (${domain}) is not authorized in Firebase Authentication.`);
        reportAuthFailure(
          'AUTH_LOGIN_FAILURE',
          `Unauthorized domain for Google Sign-In (${domain})`,
          'google_unauthorized_domain',
          'auth/unauthorized-domain'
        );
      } else if (code === 'auth/network-request-failed') {
        const inIframe = isRunningInsideIframe();
        const hint = !isOnline
          ? 'Internet connection looks offline. Reconnect and tap Retry.'
          : inIframe
          ? 'Preview iframe blocked external Google auth network request. Open app directly on production URL or tap Redirect Sign-In.'
          : 'Mobile network or popup interruption occurred (auth/network-request-failed). Please tap Redirect Sign-In below.';
        setErrorMessage(hint);
        setShowRedirectFallbackButton(true);
        reportAuthFailure(
          'AUTH_LOGIN_FAILURE',
          `Google Sign-In network error (iframe=${inIframe}, online=${isOnline}): ${err?.message || code}`,
          'google_signin_network_failed',
          code
        );
      } else {
        console.error('[Google Auth Error]:', err);
        const msg = err?.message || 'Google Sign-In failed.';
        setErrorMessage(msg);
        setShowRedirectFallbackButton(true);
        reportAuthFailure(
          'AUTH_LOGIN_FAILURE',
          `Google Sign-In error (${code || 'unknown'}): ${msg}`,
          'google_signin_popup',
          code || 'AUTH_POPUP_ERROR'
        );
      }
    }
  };

  const actionHint = pendingAction
    ? pendingAction.type === 'generate'
      ? 'Sign in with Google to generate this AI template'
      : pendingAction.type === 'buy_plan'
      ? 'Sign in with Google to continue with your Pro Pass'
      : 'Sign in with Google to view your creations'
    : 'Sign in with Google to create high-definition AI videos & portraits';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl" data-phone-auth-enabled={String(PHONE_AUTH_ENABLED)}>
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
          aria-label="Close Sign-In modal"
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

        {/* Unauthorized Domain Diagnostic Guide */}
        {unauthorizedDomain && (
          <div className="mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs text-left">
            <div className="flex items-center gap-2 text-amber-300 font-bold mb-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Firebase Domain Authorization Required</span>
            </div>
            <p className="text-[11px] text-stone-300 leading-relaxed mb-2">
              This deployment host is not yet added to Firebase Authentication Authorized Domains:
            </p>
            <div className="flex items-center justify-between p-2 rounded-xl bg-black/60 border border-amber-500/25 text-amber-200 font-mono text-[11px] break-all mb-2.5">
              <span className="truncate select-all">{unauthorizedDomain}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(unauthorizedDomain);
                  setCopiedDomain(true);
                  setTimeout(() => setCopiedDomain(false), 2000);
                }}
                className="ml-2 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-sans font-bold shrink-0 transition-colors flex items-center gap-1 cursor-pointer"
              >
                {copiedDomain ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedDomain ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="text-[11px] text-stone-300 space-y-1 bg-white/5 p-2.5 rounded-xl border border-white/5">
              <div className="font-semibold text-amber-300">Quick 1-Minute Fix:</div>
              <ol className="list-decimal list-inside space-y-1 text-stone-400">
                <li>Go to <span className="text-white font-medium">console.firebase.google.com</span></li>
                <li>Project: <span className="text-white font-medium">ai-prime-studio</span></li>
                <li>Open <span className="text-white font-medium">Authentication</span> → <span className="text-white font-medium">Settings</span> → <span className="text-white font-medium">Authorized Domains</span></li>
                <li>Click <span className="text-white font-medium">Add domain</span> and paste the copied host</li>
              </ol>
            </div>
          </div>
        )}

        {/* Session-only Login Notice */}
        {persistenceNotice && (
          <div className="mb-4 p-3 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-200 text-xs font-medium text-center">
            {persistenceNotice}
          </div>
        )}

        {/* Error message (when not unauthorized domain) */}
        {errorMessage && !unauthorizedDomain && (
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
              <h4 className="text-xl font-black text-white">
                {persistenceMode === 'session' ? 'Signed In (Session-Only)' : 'Authenticated!'}
              </h4>
              <p className="text-xs text-stone-300">
                {persistenceMode === 'session'
                  ? 'Active for this browser session only (persistent local storage was blocked).'
                  : 'Resuming your creative studio session...'}
              </p>
            </motion.div>
          ) : (
            <motion.div key="auth_google_only" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="space-y-4 pt-1">
                <p className="text-xs text-stone-300 text-center leading-relaxed">
                  Fast, secure Google Sign-In. Your creations, wallet credits, and history stay strictly private to your account.
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
                  <span>
                    {redirecting
                      ? 'Redirecting to Google...'
                      : loading
                      ? 'Connecting with Google...'
                      : 'Continue with Google'}
                  </span>
                </button>

                {showRedirectFallbackButton && !loading && (
                  <button
                    type="button"
                    onClick={() => startGoogleRedirectFlow('manual_fallback_button')}
                    className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-amber-200 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <span>Safe Mobile Redirect Sign-In (Popup-Free)</span>
                  </button>
                )}
              </div>

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
