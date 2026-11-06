import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPopup,
  signInWithPhoneNumber,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  ConfirmationResult
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
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

// Connection test per skill guidelines with timeout and graceful offline resilience
async function testConnection() {
  try {
    const probePromise = getDocFromServer(doc(db, 'test', 'connection'));
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('connection-timeout: the client is offline or backend unreachable')), 4000)
    );
    await Promise.race([probePromise, timeoutPromise]);
  } catch (error) {
    if (error instanceof Error && (error.message.includes('client is offline') || error.message.includes('connection-timeout') || error.message.includes('Could not reach Cloud Firestore'))) {
      console.warn('[Firebase] Firestore client is operating in local/offline-resilient mode.');
    } else {
      console.warn('[Firebase] Firestore probe notice:', error);
    }
  }
}
testConnection();

export type { FirebaseUser, ConfirmationResult };
export {
  RecaptchaVerifier,
  signInWithPopup,
  signInWithPhoneNumber,
  signOut,
  onAuthStateChanged
};

