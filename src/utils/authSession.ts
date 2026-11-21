import { safeParseJsonResponse } from '../context/AppContext';

export const PENDING_AUTH_ACTION_STORAGE_KEY = 'lumina_pending_auth_action';
export const REDIRECT_AUTH_IN_PROGRESS_KEY = 'lumina_auth_redirect_pending';
export const REDIRECT_ATTEMPT_TS_KEY = 'lumina_auth_redirect_ts';
export const SESSION_TOKEN_STORAGE_KEY = 'lumina_session_token';
export const AUTH_PERSISTENCE_MODE_KEY = 'lumina_auth_persistence_mode';

let inMemorySessionToken: string | null = null;

export function getStoredPersistenceMode(): 'local' | 'session' | 'none' {
  if (typeof window === 'undefined') return 'local';
  try {
    const mode = sessionStorage.getItem(AUTH_PERSISTENCE_MODE_KEY);
    if (mode === 'session' || mode === 'none' || mode === 'local') return mode;
  } catch {}
  return 'local';
}

export function setStoredSessionToken(
  token: string,
  mode: 'local' | 'session' | 'none' = 'local'
): void {
  inMemorySessionToken = token || null;
  if (typeof window === 'undefined' || !token) return;
  try {
    sessionStorage.setItem(AUTH_PERSISTENCE_MODE_KEY, mode);
  } catch {}

  if (mode === 'local') {
    try {
      localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
      try {
        sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      } catch {}
      return;
    } catch {
      // Fall through to sessionStorage only if localStorage throws unexpectedly
    }
  }

  try {
    localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {}

  if (mode === 'session') {
    try {
      sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    } catch {}
  } else {
    // 'none': never persist into localStorage or sessionStorage (avoid false durability)
    try {
      sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    } catch {}
  }
}

export function getStoredSessionToken(): string | null {
  if (typeof window === 'undefined') return inMemorySessionToken;
  try {
    const localVal = localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (localVal) return localVal;
  } catch {}
  try {
    const sessionVal = sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (sessionVal) return sessionVal;
  } catch {}
  return inMemorySessionToken;
}

export function clearStoredSessionToken(): void {
  inMemorySessionToken = null;
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {}
  try {
    sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_PERSISTENCE_MODE_KEY);
  } catch {}
}

/**
 * Shared Firebase -> Backend Session Exchange helper with bounded retries for Cloud Run
 * cold starts (502/503/504/HTML proxy warmups) and strict cloudPersisted === true enforcement.
 */
export async function exchangeFirebaseSessionWithRetry(
  payload: Record<string, any>,
  maxRetries: number = 4
): Promise<{
  ok: boolean;
  status: number;
  data: any;
  error?: string;
}> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const res = await fetch('/api/auth/firebase-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const parsed = await safeParseJsonResponse<any>(res);
    if (res.ok && parsed.data?.success && parsed.data?.cloudPersisted === true) {
      return { ok: true, status: res.status, data: parsed.data };
    }
    const isRetryableTransient =
      Boolean(parsed.isRetryable) ||
      res.status === 502 ||
      res.status === 504 ||
      (res.status === 503 &&
        Boolean(parsed.data?.retryable || parsed.data?.code === 'SESSION_PERSISTENCE_FAILED' || parsed.isHtml));
    if (isRetryableTransient && attempt < maxRetries) {
      attempt += 1;
      await new Promise((r) => setTimeout(r, Math.min(2500, 750 * attempt)));
      continue;
    }
    const cleanErr =
      parsed.error && !/^<!doctype|<html/i.test(parsed.error.trimStart())
        ? parsed.error
        : `Server returned invalid non-JSON response (HTTP ${res.status}). Please retry.`;
    return {
      ok: false,
      status: res.status,
      data: parsed.data,
      error: parsed.data?.error || cleanErr || 'Authentication session mapping failed.'
    };
  }
  return { ok: false, status: 503, data: null, error: 'Session synchronization timed out.' };
}

export function isMobileOrStandaloneBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isStandalone =
    Boolean((window.navigator as any).standalone) ||
    Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  return isMobileUa || isStandalone;
}

export function isRunningInsideIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function savePendingAuthActionToStorage(action: any): void {
  if (typeof window === 'undefined' || !action) return;
  try {
    const serialized = JSON.stringify(action);
    if (serialized.length <= 512 * 1024) {
      sessionStorage.setItem(PENDING_AUTH_ACTION_STORAGE_KEY, serialized);
    } else if (action.type === 'generate') {
      sessionStorage.setItem(
        PENDING_AUTH_ACTION_STORAGE_KEY,
        JSON.stringify({
          type: 'generate',
          templateId: action.templateId,
          inputMediaUrl: '',
          customPrompt: action.customPrompt
        })
      );
    }
  } catch {}
}

export function readAndClearPendingAuthActionFromStorage(): any | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_AUTH_ACTION_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_AUTH_ACTION_STORAGE_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
