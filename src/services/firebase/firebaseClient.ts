import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDocFromServer,
  setLogLevel,
  disableNetwork,
  enableNetwork
} from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

export const CANONICAL_FIREBASE_PROJECT_ID = 'ai-prime-studio';
export const CANONICAL_FIRESTORE_DATABASE_ID = '(default)';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const configuredDbId = ((firebaseConfig as any).firestoreDatabaseId || '(default)').trim();

const projectLockError =
  firebaseConfig.projectId !== CANONICAL_FIREBASE_PROJECT_ID
    ? new Error(
        `CRITICAL_FIREBASE_LOCK: Expected project '${CANONICAL_FIREBASE_PROJECT_ID}' but got '${firebaseConfig.projectId}'.`
      )
    : null;

const databaseLockError =
  configuredDbId !== CANONICAL_FIRESTORE_DATABASE_ID
    ? new Error(
        `CRITICAL_FIRESTORE_LOCK: Expected default Firestore database '${CANONICAL_FIRESTORE_DATABASE_ID}' but got '${configuredDbId}'. Silent fallback to another database is blocked.`
      )
    : null;

export const firestoreClientLockError: Error | null = projectLockError || databaseLockError;

export const firestoreClientLockState = {
  blocked: Boolean(firestoreClientLockError),
  reason: firestoreClientLockError?.message || null,
  expectedProjectId: CANONICAL_FIREBASE_PROJECT_ID,
  expectedDatabaseId: CANONICAL_FIRESTORE_DATABASE_ID,
  configuredProjectId: firebaseConfig.projectId,
  configuredDatabaseId: configuredDbId
};

if (firestoreClientLockError) {
  // Surface fail-closed lock diagnostics via console.warn without crashing React UI or triggering boot error overlay
  console.warn(`[Firebase Client Guard] ${firestoreClientLockError.message}`);
}

export function assertCanonicalFirestoreClient(): void {
  if (firestoreClientLockError) {
    throw firestoreClientLockError;
  }
}

try {
  initializeFirestore(app, {
    experimentalForceLongPolling: true,
  });
} catch {
  // Safe no-op if Firestore was already initialized (e.g., during HMR)
}

export const db = getFirestore(app);

export function getCanonicalDb() {
  assertCanonicalFirestoreClient();
  return db;
}

export const auth = getAuth(app);
export interface AuthPersistenceStatus {
  persisted: boolean;
  mode: 'local' | 'failed';
  error?: string;
}

export const authPersistencePromise: Promise<AuthPersistenceStatus> =
  typeof window !== 'undefined'
    ? setPersistence(auth, browserLocalPersistence)
        .then(() => ({ persisted: true, mode: 'local' as const }))
        .catch((err: any) => {
          const msg = err?.message || String(err || 'setPersistence failed');
          console.warn('[Firebase Auth] browserLocalPersistence fallback note:', msg);
          return { persisted: false, mode: 'failed' as const, error: msg };
        })
    : Promise.resolve({ persisted: true, mode: 'local' as const });

export async function ensureAuthLocalPersistence(): Promise<AuthPersistenceStatus> {
  if (typeof window === 'undefined') {
    return { persisted: true, mode: 'local' };
  }
  try {
    await authPersistencePromise;
    await setPersistence(auth, browserLocalPersistence);
    return { persisted: true, mode: 'local' };
  } catch (err: any) {
    const msg = err?.message || String(err || 'setPersistence failed');
    console.warn('[Firebase Auth] ensureAuthLocalPersistence notice:', msg);
    return { persisted: false, mode: 'failed', error: msg };
  }
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let onlineRecoveryListenerAttached = false;

function attachOnlineRecoveryListener(): void {
  if (onlineRecoveryListenerAttached || typeof window === 'undefined') return;
  onlineRecoveryListenerAttached = true;
  window.addEventListener(
    'online',
    () => {
      enableNetwork(db).catch(() => {});
    },
    { once: true }
  );
}

// Connection test per skill guidelines with timeout, fail-closed DB lock guard, and offline resilience
async function testConnection() {
  if (typeof window === 'undefined') {
    return;
  }
  if (firestoreClientLockError) {
    console.warn('[Firebase] Client Firestore probe skipped because canonical (default) database lock is active.');
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await disableNetwork(db).catch(() => {});
    attachOnlineRecoveryListener();
    console.warn('[Firebase] Browser reports offline; Firestore client operating in local/offline-resilient mode.');
    return;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const probePromise = getDocFromServer(doc(db, 'test', 'connection'));
  try {
    // Suppress internal WebChannel/OnlineStateTracker console.error noise during non-blocking startup probe
    setLogLevel('silent');
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('connection-timeout: the client is offline or backend unreachable')),
        4000
      );
    });
    await Promise.race([probePromise, timeoutPromise]);
    setLogLevel('error');
  } catch (error) {
    probePromise.catch(() => {});
    const errMsg = error instanceof Error ? error.message : String(error);
    const errCode = (error as any)?.code;
    if (errCode === 'permission-denied' || errMsg.includes('Missing or insufficient permissions')) {
      // Cloud Firestore responded cleanly over the network; app data flows via server-side API routes.
      setLogLevel('error');
      return;
    }
    // Cancel lingering background retry timers so OnlineStateTracker never logs delayed console.error
    await disableNetwork(db).catch(() => {});
    attachOnlineRecoveryListener();
    setLogLevel('error');
    if (
      errCode === 'unavailable' ||
      errMsg.includes('client is offline') ||
      errMsg.includes('connection-timeout') ||
      errMsg.includes('Could not reach Cloud Firestore')
    ) {
      console.warn('[Firebase] Firestore client is operating in local/offline-resilient mode.');
    } else {
      console.warn('[Firebase] Firestore probe notice:', error);
    }
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
testConnection();

export type { FirebaseUser };
export {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  signOut,
  onAuthStateChanged
};

