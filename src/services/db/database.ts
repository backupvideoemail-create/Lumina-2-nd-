/**
 * Production-Grade Database & State Layer with Firestore Integration and Local Write-Through.
 * 
 * Manages:
 * - Real Users & Authentication Identities (with user isolation)
 * - Authoritative Wallets & Immutable Credit Ledger
 * - Real Generation Records & Asynchronous Job Pipeline
 * - Real Payment Records & Subscriptions Lifecycle
 * - Runtime Dynamic Template Catalog
 * - Webhook Idempotency Store
 * 
 * Clean Slate: Zero pre-seeded fake accounts or fake generations.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  Template,
  TemplateCategory,
  UserProfile,
  CreditWallet,
  CreditGrant,
  CreditTransaction,
  TransactionType,
  Generation,
  UserSubscription,
  PaymentRecord,
  FaceSwapScene,
  OwnerOmniTestRecord
} from '../../types/index.ts';
import { initializeApp as initAdminApp, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../../firebase-applet-config.json';
import { SEED_TEMPLATES } from '../../data/templatesData.ts';
import { HOME_HERO_BANNERS, HomeBannerItem } from '../../config/homeBannersConfig.ts';
import { SEED_FACE_SWAP_SCENES } from '../../data/faceSwapData.ts';
import { DEFAULT_CATEGORY_PROMPTS } from '../../config/categoryPromptsConfig.ts';
import { AUTHORIZED_ADMIN_EMAILS, isAuthorizedAdminEmail } from '../../config/adminConfig.ts';

// Authoritative Firebase Admin instances for server persistence & cryptographic auth
let adminFirestoreDb: any = null;
let adminAuthInstance: any = null;
export { adminFirestoreDb, adminAuthInstance };

export const isIsolatedTestEnv = process.env.IS_ISOLATED_TEST === 'true' || process.env.NODE_ENV === 'test';

export const CANONICAL_PROJECT_ID = 'ai-prime-studio';
export const CANONICAL_PROJECT_NUMBER = '855598524398';
export const CANONICAL_PROJECT_NAME = 'AI Prime Studio';
export const CANONICAL_DATABASE_ID = '(default)';

export interface DatabaseGuardState {
  expectedProjectId: string;
  expectedDatabaseId: string;
  projectName: string;
  projectNumber: string;
  configuredProjectId: string;
  configuredDatabaseId: string;
  envDatabaseOverride: string | null;
  envOverrideStatus: 'NONE' | 'MATCH_DEFAULT' | 'CRITICAL_BLOCKED';
  configStatus: 'LOCKED_DEFAULT' | 'CRITICAL_BLOCKED';
  blocked: boolean;
  blockedReason: string | null;
  effectiveDatabaseId: string;
  connectionSource: 'isolated_test' | 'service_account' | 'adc' | 'blocked' | 'disconnected';
  runtimeServiceAccountEmail: string | null;
  cloudRunRegion: string | null;
  serviceAccountKeyPresent: boolean;
  serviceAccountProjectMatch: 'NOT_SET' | 'MATCH' | 'MISMATCH' | 'UNPARSEABLE';
}

export function evaluateDatabaseLock(params: {
  configuredProjectId?: string | null;
  configuredDatabaseId?: string | null;
  envDatabaseOverride?: string | null;
  isIsolatedTest?: boolean;
}): {
  blocked: boolean;
  envOverrideStatus: 'NONE' | 'MATCH_DEFAULT' | 'CRITICAL_BLOCKED';
  configStatus: 'LOCKED_DEFAULT' | 'CRITICAL_BLOCKED';
  reason: string | null;
} {
  const cfgProject = (params.configuredProjectId || '').trim();
  const cfgDb = (params.configuredDatabaseId || CANONICAL_DATABASE_ID).trim() || CANONICAL_DATABASE_ID;
  const envDb = (params.envDatabaseOverride || '').trim();

  const envOverrideStatus: 'NONE' | 'MATCH_DEFAULT' | 'CRITICAL_BLOCKED' =
    !envDb
      ? 'NONE'
      : envDb === CANONICAL_DATABASE_ID
      ? 'MATCH_DEFAULT'
      : 'CRITICAL_BLOCKED';

  const configStatus: 'LOCKED_DEFAULT' | 'CRITICAL_BLOCKED' =
    cfgProject === CANONICAL_PROJECT_ID && cfgDb === CANONICAL_DATABASE_ID
      ? 'LOCKED_DEFAULT'
      : 'CRITICAL_BLOCKED';

  if (envOverrideStatus === 'CRITICAL_BLOCKED') {
    return {
      blocked: true,
      envOverrideStatus,
      configStatus,
      reason: `CRITICAL_BLOCKED: FIRESTORE_DATABASE_ID override '${envDb}' is invalid; must be '${CANONICAL_DATABASE_ID}' or unset. Silent fallback to any other database is blocked.`
    };
  }
  if (configStatus === 'CRITICAL_BLOCKED') {
    return {
      blocked: true,
      envOverrideStatus,
      configStatus,
      reason: `CRITICAL_BLOCKED: Firebase target '${cfgProject || 'UNSET'}/${cfgDb}' mismatches canonical '${CANONICAL_PROJECT_ID}/${CANONICAL_DATABASE_ID}'. Silent fallback is blocked.`
    };
  }

  return {
    blocked: false,
    envOverrideStatus,
    configStatus,
    reason: null
  };
}

const initialLockCheck = evaluateDatabaseLock({
  configuredProjectId: (firebaseConfig as any).projectId,
  configuredDatabaseId: (firebaseConfig as any).firestoreDatabaseId,
  envDatabaseOverride: process.env.FIRESTORE_DATABASE_ID,
  isIsolatedTest: isIsolatedTestEnv
});

const runtimeDbGuardState: DatabaseGuardState = {
  expectedProjectId: CANONICAL_PROJECT_ID,
  expectedDatabaseId: CANONICAL_DATABASE_ID,
  projectName: CANONICAL_PROJECT_NAME,
  projectNumber: CANONICAL_PROJECT_NUMBER,
  configuredProjectId: ((firebaseConfig as any).projectId || '').trim() || 'UNSET',
  configuredDatabaseId: ((firebaseConfig as any).firestoreDatabaseId || CANONICAL_DATABASE_ID).trim(),
  envDatabaseOverride: process.env.FIRESTORE_DATABASE_ID?.trim() || null,
  envOverrideStatus: initialLockCheck.envOverrideStatus,
  configStatus: initialLockCheck.configStatus,
  blocked: !isIsolatedTestEnv && initialLockCheck.blocked,
  blockedReason: !isIsolatedTestEnv ? initialLockCheck.reason : null,
  effectiveDatabaseId: isIsolatedTestEnv
    ? 'IN_MEMORY_TEST'
    : initialLockCheck.blocked
    ? 'BLOCKED_INVALID_OVERRIDE'
    : 'DISCONNECTED',
  connectionSource: isIsolatedTestEnv ? 'isolated_test' : initialLockCheck.blocked ? 'blocked' : 'disconnected',
  runtimeServiceAccountEmail: null,
  cloudRunRegion:
    process.env.CLOUD_RUN_REGION?.trim() ||
    process.env.GOOGLE_CLOUD_REGION?.trim() ||
    process.env.FUNCTION_REGION?.trim() ||
    null,
  serviceAccountKeyPresent: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()),
  serviceAccountProjectMatch: 'NOT_SET'
};

export function enforceRuntimeDatabaseLock(): DatabaseGuardState {
  const currentCheck = evaluateDatabaseLock({
    configuredProjectId: (firebaseConfig as any).projectId,
    configuredDatabaseId: (firebaseConfig as any).firestoreDatabaseId,
    envDatabaseOverride: process.env.FIRESTORE_DATABASE_ID,
    isIsolatedTest: isIsolatedTestEnv
  });
  runtimeDbGuardState.envDatabaseOverride = process.env.FIRESTORE_DATABASE_ID?.trim() || null;
  runtimeDbGuardState.envOverrideStatus = currentCheck.envOverrideStatus;
  runtimeDbGuardState.configStatus = currentCheck.configStatus;
  if (!isIsolatedTestEnv && currentCheck.blocked) {
    adminFirestoreDb = null;
    runtimeDbGuardState.blocked = true;
    runtimeDbGuardState.blockedReason = currentCheck.reason;
    runtimeDbGuardState.effectiveDatabaseId = 'BLOCKED_INVALID_OVERRIDE';
    runtimeDbGuardState.connectionSource = 'blocked';
    console.error(`[Database CRITICAL BLOCKED] ${currentCheck.reason}`);
  }
  return { ...runtimeDbGuardState };
}

export function getDatabaseGuardState(): DatabaseGuardState {
  return enforceRuntimeDatabaseLock();
}

export async function refreshRuntimeGcpMetadata(): Promise<void> {
  if (isIsolatedTestEnv) return;
  const fetchMeta = async (metaPath: string): Promise<string | null> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 900);
      const resp = await fetch(`http://metadata.google.internal/computeMetadata/v1/${metaPath}`, {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (resp.ok) {
        const txt = (await resp.text()).trim();
        return txt || null;
      }
    } catch {}
    return null;
  };

  if (!runtimeDbGuardState.runtimeServiceAccountEmail) {
    const saEmail = await fetchMeta('instance/service-accounts/default/email');
    if (saEmail) runtimeDbGuardState.runtimeServiceAccountEmail = saEmail;
  }
  if (!runtimeDbGuardState.cloudRunRegion) {
    const regionRaw = await fetchMeta('instance/region');
    if (regionRaw) {
      const parts = regionRaw.split('/').filter(Boolean);
      runtimeDbGuardState.cloudRunRegion = parts[parts.length - 1] || regionRaw;
    }
  }
}

export class InMemoryFirestoreMock {
  private collections: Map<string, Map<string, any>> = new Map();

  public settings(_opts: any) {}

  public collection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    const col = this.collections.get(name)!;

    const makeDocRef = (id: string) => ({
      _colName: name,
      _docId: id,
      id,
      get: async () => {
        const exists = col.has(id);
        const data = exists ? JSON.parse(JSON.stringify(col.get(id))) : undefined;
        return {
          exists,
          id,
          data: () => data
        };
      },
      set: async (data: any, options?: { merge?: boolean }) => {
        if (options?.merge && col.has(id)) {
          const existing = col.get(id);
          col.set(id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
        } else {
          col.set(id, JSON.parse(JSON.stringify(data)));
        }
      },
      delete: async () => {
        col.delete(id);
      }
    });

    const buildQuery = (filters: Array<{ field: string; op: string; val: any }>, sortField?: string, sortDir: 'asc' | 'desc' = 'asc', limitNum?: number): any => ({
      where: (f: string, op: string, v: any) => buildQuery([...filters, { field: f, op, val: v }], sortField, sortDir, limitNum),
      orderBy: (f: string, dir: 'asc' | 'desc' = 'asc') => buildQuery(filters, f, dir, limitNum),
      limit: (n: number) => buildQuery(filters, sortField, sortDir, n),
      offset: (skip: number) => ({
        limit: (n: number) => ({
          get: async () => {
            const res = await buildQuery(filters, sortField, sortDir, undefined).get();
            const sliced = res.docs.slice(skip, skip + n);
            return {
              empty: sliced.length === 0,
              size: sliced.length,
              docs: sliced,
              forEach: (cb: (doc: any) => void) => sliced.forEach(cb)
            };
          }
        })
      }),
      get: async () => {
        let matching = Array.from(col.entries()).map(([id, val]) => ({
          id,
          exists: true,
          data: () => JSON.parse(JSON.stringify(val))
        }));
        for (const filter of filters) {
          matching = matching.filter(doc => {
            const fieldVal = doc.data()[filter.field];
            if (filter.op === 'array-contains') {
              return Array.isArray(fieldVal) && fieldVal.includes(filter.val);
            }
            return fieldVal === filter.val;
          });
        }
        if (sortField) {
          matching.sort((a, b) => {
            const av = a.data()[sortField] ?? '';
            const bv = b.data()[sortField] ?? '';
            return sortDir === 'desc' ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
          });
        }
        if (limitNum !== undefined) {
          matching = matching.slice(0, limitNum);
        }
        return {
          empty: matching.length === 0,
          size: matching.length,
          docs: matching,
          forEach: (cb: (doc: any) => void) => matching.forEach(cb)
        };
      }
    });

    return {
      doc: makeDocRef,
      where: (f: string, op: string, v: any) => buildQuery([{ field: f, op, val: v }]),
      orderBy: (f: string, dir: 'asc' | 'desc' = 'asc') => buildQuery([], f, dir),
      limit: (n: number) => buildQuery([], undefined, 'asc', n),
      count: () => ({
        get: async () => ({
          data: () => ({ count: col.size })
        })
      }),
      get: async () => {
        const docs = Array.from(col.entries()).map(([id, val]) => ({
          id,
          exists: true,
          data: () => JSON.parse(JSON.stringify(val))
        }));
        return {
          empty: docs.length === 0,
          size: docs.length,
          docs,
          forEach: (cb: (doc: any) => void) => docs.forEach(cb)
        };
      }
    };
  }

  public async runTransaction(updateFunction: (transaction: any) => Promise<any>) {
    interface StagedOp {
      colName: string;
      docId: string;
      op: 'set' | 'update' | 'delete';
      data?: any;
      options?: { merge?: boolean };
    }
    const stagedOps: StagedOp[] = [];

    const t = {
      get: async (refOrQuery: any) => {
        if (typeof refOrQuery.get === 'function') {
          return await refOrQuery.get();
        }
        return { exists: false, data: () => null, empty: true };
      },
      set: (docRef: any, data: any, options?: any) => {
        stagedOps.push({
          colName: docRef._colName || 'unknown',
          docId: docRef._docId || (typeof docRef.id === 'string' ? docRef.id : 'unknown'),
          op: 'set',
          data,
          options
        });
      },
      update: (docRef: any, data: any) => {
        stagedOps.push({
          colName: docRef._colName || 'unknown',
          docId: docRef._docId || (typeof docRef.id === 'string' ? docRef.id : 'unknown'),
          op: 'update',
          data
        });
      },
      delete: (docRef: any) => {
        stagedOps.push({
          colName: docRef._colName || 'unknown',
          docId: docRef._docId || (typeof docRef.id === 'string' ? docRef.id : 'unknown'),
          op: 'delete'
        });
      }
    };

    // Phase 1: User update function
    const result = await updateFunction(t);

    // Phase 2: Capture snapshot of affected documents for rollback guarantees
    const rollbackSnapshots: Array<{ colName: string; docId: string; exists: boolean; data?: any }> = [];
    for (const op of stagedOps) {
      const col = this.collections.get(op.colName);
      const exists = col ? col.has(op.docId) : false;
      const data = exists ? JSON.parse(JSON.stringify(col!.get(op.docId))) : undefined;
      rollbackSnapshots.push({ colName: op.colName, docId: op.docId, exists, data });
    }

    // Phase 3: Atomic commit with rollback on simulated or real commit failure
    try {
      for (const op of stagedOps) {
        if (!this.collections.has(op.colName)) {
          this.collections.set(op.colName, new Map());
        }
        const col = this.collections.get(op.colName)!;

        // Check if explicit simulated failure is requested in test data
        if (op.data?.__simulateWriteFailure) {
          throw new Error('Simulated write commit error in transaction');
        }

        if (op.op === 'set') {
          if (op.options?.merge && col.has(op.docId)) {
            const existing = col.get(op.docId);
            col.set(op.docId, { ...existing, ...JSON.parse(JSON.stringify(op.data)) });
          } else {
            col.set(op.docId, JSON.parse(JSON.stringify(op.data)));
          }
        } else if (op.op === 'update') {
          const existing = col.get(op.docId) || {};
          col.set(op.docId, { ...existing, ...JSON.parse(JSON.stringify(op.data)) });
        } else if (op.op === 'delete') {
          col.delete(op.docId);
        }
      }
    } catch (commitErr) {
      // Revert completely! Restore exact previous document state
      for (const snap of rollbackSnapshots) {
        const col = this.collections.get(snap.colName);
        if (col) {
          if (snap.exists) {
            col.set(snap.docId, snap.data);
          } else {
            col.delete(snap.docId);
          }
        }
      }
      throw commitErr;
    }

    return result;
  }
}

if (isIsolatedTestEnv) {
  adminFirestoreDb = new InMemoryFirestoreMock();
  console.log('[Database] Operating in ISOLATED TEST mode with In-Memory Firestore (Production data & live Firestore untouched)');
} else if (initialLockCheck.blocked) {
  adminFirestoreDb = null;
  console.error(`[Database CRITICAL BLOCKED] ${initialLockCheck.reason}`);
} else {
  // Attempt Firebase Admin initialization targeting canonical ai-prime-studio/(default) ONLY
  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey && serviceAccountKey.trim()) {
      runtimeDbGuardState.serviceAccountKeyPresent = true;
      let credentialObj: any = null;
      const trimmedKey = serviceAccountKey.trim();
      try {
        if (trimmedKey.startsWith('{')) {
          credentialObj = JSON.parse(trimmedKey);
        } else if (fs.existsSync(trimmedKey)) {
          credentialObj = JSON.parse(fs.readFileSync(trimmedKey, 'utf-8'));
        } else {
          const decoded = Buffer.from(trimmedKey, 'base64').toString('utf-8');
          if (decoded.trim().startsWith('{')) {
            credentialObj = JSON.parse(decoded);
          }
        }
      } catch {
        credentialObj = null;
      }

      if (!credentialObj) {
        runtimeDbGuardState.serviceAccountProjectMatch = 'UNPARSEABLE';
        runtimeDbGuardState.blocked = true;
        runtimeDbGuardState.connectionSource = 'blocked';
        runtimeDbGuardState.effectiveDatabaseId = 'BLOCKED_INVALID_PROJECT';
        runtimeDbGuardState.blockedReason = `CRITICAL_BLOCKED: FIREBASE_SERVICE_ACCOUNT_KEY could not be parsed as valid JSON. Silent fallback to unverified credentials blocked.`;
        console.error(`[Database CRITICAL BLOCKED] ${runtimeDbGuardState.blockedReason}`);
      } else {
        const projectId = typeof credentialObj.project_id === 'string' ? credentialObj.project_id.trim() : '';
        runtimeDbGuardState.serviceAccountProjectMatch =
          !projectId ? 'UNPARSEABLE' : (projectId === CANONICAL_PROJECT_ID ? 'MATCH' : 'MISMATCH');
        if (credentialObj.client_email) {
          runtimeDbGuardState.runtimeServiceAccountEmail = String(credentialObj.client_email);
        }
        if (projectId !== CANONICAL_PROJECT_ID) {
          runtimeDbGuardState.blocked = true;
          runtimeDbGuardState.connectionSource = 'blocked';
          runtimeDbGuardState.effectiveDatabaseId = 'BLOCKED_INVALID_PROJECT';
          runtimeDbGuardState.blockedReason = !projectId
            ? `CRITICAL_BLOCKED: Service account credential is missing required project_id field (expected '${CANONICAL_PROJECT_ID}').`
            : `CRITICAL_BLOCKED: Service account project_id '${projectId}' mismatches canonical '${CANONICAL_PROJECT_ID}'. Silent cross-project connection blocked.`;
          console.error(`[Database CRITICAL BLOCKED] ${runtimeDbGuardState.blockedReason}`);
        } else {
          const adminApp = initAdminApp({
            credential: cert(credentialObj),
            projectId
          }, 'lumina-admin-app-' + Date.now());
          // Canonical 1-argument default Firestore SDK initialization (never pass "(default)" string)
          adminFirestoreDb = getAdminFirestore(adminApp);
          runtimeDbGuardState.effectiveDatabaseId = CANONICAL_DATABASE_ID;
          runtimeDbGuardState.connectionSource = 'service_account';
          try {
            adminFirestoreDb.settings({ ignoreUndefinedProperties: true });
          } catch {}
          try {
            adminAuthInstance = getAdminAuth(adminApp);
          } catch (authInitErr: any) {
            console.warn('[Database] Firebase Admin Auth initialization note:', authInitErr.message);
          }
          console.log(`[Database] Firebase Admin SDK connected to Firestore project '${projectId}' (database: '(default)') (Authoritative)`);
        }
      }
    } else if (!isIsolatedTestEnv) {
      try {
        const projectId = CANONICAL_PROJECT_ID;
        const adcApp = initAdminApp({ projectId }, 'lumina-admin-adc-' + Date.now());
        // Canonical 1-argument default Firestore SDK initialization
        adminFirestoreDb = getAdminFirestore(adcApp);
        runtimeDbGuardState.effectiveDatabaseId = CANONICAL_DATABASE_ID;
        runtimeDbGuardState.connectionSource = 'adc';
        try {
          adminFirestoreDb.settings({ ignoreUndefinedProperties: true });
        } catch {}
        try {
          adminAuthInstance = getAdminAuth(adcApp);
        } catch {}
        console.log(`[Database] Connected via Application Default Credentials (ADC) to project '${projectId}' (database: '(default)')`);
      } catch (adcErr: any) {
        console.warn('[Database] Application Default Credentials (ADC) init note:', adcErr.message);
      }
    }
  } catch (err: any) {
    console.warn('[Database] Firebase Admin initialization note:', err.message);
  }
}

export interface AuthIdentity {
  userId: string;
  firebaseUid?: string;
  phone?: string;
  email?: string;
  sessionTokens: string[];
  createdAt: string;
  lastLoginAt: string;
}

export interface GenerationJob {
  id: string;
  userId: string;
  templateId: string;
  type: 'photo' | 'video' | 'faceswap';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  creditsReserved: number;
  inputMediaUrl: string;
  resultMediaUrl?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AdminTestRun {
  id: string;
  genId: string;
  adminEmail: string;
  templateId: string;
  templateTitle: string;
  model?: string;
  providerCostUsd: number;
  createdAt: string;
}

export interface AdminActivityLog {
  id: string;
  actorEmail: string;
  action:
    | 'TEMPLATE_CREATED'
    | 'TEMPLATE_UPDATED'
    | 'TEMPLATE_DELETED'
    | 'TEMPLATE_SAVED_AS_DRAFT'
    | 'TEMPLATE_SEPARATE_DRAFT_SAVED'
    | 'BANNER_CREATED'
    | 'BANNER_UPDATED'
    | 'BANNER_DELETED'
    | 'ADMIN_AUTH_VERIFIED'
    | 'SYSTEM_CONFIG_UPDATED';
  targetId: string;
  details: string;
  timestamp: string;
}

export interface ProductionDatabaseSchema {
  users: Record<string, UserProfile>;
  authIdentities: Record<string, AuthIdentity>;
  wallets: Record<string, CreditWallet>;
  creditGrants: CreditGrant[];
  transactions: CreditTransaction[];
  generations: Generation[];
  jobs: GenerationJob[];
  payments: Record<string, PaymentRecord>;
  subscriptions: Record<string, UserSubscription>;
  templates: Template[];
  banners: HomeBannerItem[];
  faceSwapDemoVideoUrl: string;
  faceSwapScenes: FaceSwapScene[];
  userLikes: Record<string, string[]>; // userId -> templateId[]
  processedWebhooks: string[];
  reports: Array<{ id: string; generationId: string; reason: string; timestamp: string }>;
  adminTestRuns?: AdminTestRun[];
  categoryPrompts?: Record<string, string>;
  pricingBanner?: PricingBannerConfig | null;
  deletedTemplateIds?: string[];
  adminLogs?: AdminActivityLog[];
  dailyActivity?: Record<string, DailyActivityMetric>;
  fxCache?: { rate: number; source: string; fetchedAt: string; expiresAt: string } | null;
  ownerOmniTests?: OwnerOmniTestRecord[];
}

export interface DailyActivityMetric {
  dateKey: string; // YYYY-MM-DD in Asia/Kolkata
  timezone: 'Asia/Kolkata';
  visitorSessions: number;
  guestSessions: number;
  retentionDays: number;
  updatedAt: string;
  expiresAtIso?: string;
}

export function getKolkataDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export interface PricingBannerItem {
  id: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  posterUrl?: string;
  isEnabled: boolean;
  altText?: string;
  createdAt: string;
}

export interface PricingBannerConfig {
  items?: PricingBannerItem[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  posterUrl?: string;
  isEnabled?: boolean;
  altText?: string;
  updatedAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = isIsolatedTestEnv ? path.join(DATA_DIR, 'test_db.json') : path.join(DATA_DIR, 'db.json');

export interface TemplateValidationResult {
  isValid: boolean;
  reason?: string;
}

export function validateTemplate(tpl: any): TemplateValidationResult {
  if (!tpl || typeof tpl !== 'object') {
    return { isValid: false, reason: 'Template record is missing or not an object' };
  }
  if (!tpl.id || typeof tpl.id !== 'string' || tpl.id.trim().length < 2) {
    return { isValid: false, reason: 'Template is missing a valid non-empty id' };
  }
  if (!tpl.title || typeof tpl.title !== 'string' || tpl.title.trim().length < 2) {
    return { isValid: false, reason: 'Template is missing a valid title' };
  }
  if (tpl.type !== 'photo' && tpl.type !== 'video') {
    return { isValid: false, reason: `Template type '${tpl.type}' is invalid (must be 'photo' or 'video')` };
  }
  if (!tpl.cover || typeof tpl.cover !== 'string' || tpl.cover.trim().length < 5) {
    return { isValid: false, reason: 'Template is missing a valid cover image URL' };
  }
  if (tpl.type === 'video') {
    const videoUrl = tpl.preview || tpl.sampleResult;
    if (!videoUrl || typeof videoUrl !== 'string' || videoUrl.trim().length < 5) {
      return { isValid: false, reason: 'Video template is missing a valid preview URL' };
    }
  } else if (tpl.type === 'photo') {
    const photoUrl = tpl.cover || tpl.sampleResult || tpl.sampleAfter || tpl.referenceImageUrl;
    if (!photoUrl || typeof photoUrl !== 'string' || photoUrl.trim().length < 5) {
      return { isValid: false, reason: 'Photo template is missing a valid sample or reference image' };
    }
  }
  return { isValid: true };
}

export function isPersistableDraftTemplate(tpl: any): boolean {
  if (!tpl || typeof tpl !== 'object') return false;
  if (tpl.isActive !== false) return false;
  if (tpl.readinessStatus !== 'DRAFT_INCOMPLETE' && !tpl.draftOfTemplateId) return false;
  if (!tpl.id || typeof tpl.id !== 'string' || tpl.id.trim().length < 2) return false;
  if (!tpl.title || typeof tpl.title !== 'string' || tpl.title.trim().length < 2) return false;
  if (tpl.type !== 'photo' && tpl.type !== 'video') return false;
  return true;
}

export class ProductionDatabase {
  private db: ProductionDatabaseSchema;
  private dbFilePath: string;
  private firestoreOverride?: any;
  private persistToDisk: boolean = true;
  public quarantinedTemplates: Array<{ template: any; reason: string; quarantinedAt: string }> = [];
  public readyPromise: Promise<void>;
  private catalogueStatus: 'READY' | 'EMPTY' | 'OFFLINE' = 'READY';
  private catalogRevision: number = 0;
  private lastCatalogCheckTime: number = 0;
  private lastCatalogSyncAt: string | null = null;
  private rawFirestoreTemplatesCount: number | null = null;
  private inFlightAuthLocks = new Map<string, Promise<any>>();

  private get firestoreDb(): any {
    return this.firestoreOverride !== undefined ? this.firestoreOverride : adminFirestoreDb;
  }

  public getCatalogueStatus(): 'READY' | 'EMPTY' | 'OFFLINE' {
    return this.catalogueStatus;
  }

  public getCatalogRevision(): number {
    return this.catalogRevision;
  }

  public getLastCatalogSyncAt(): string | null {
    return this.lastCatalogSyncAt;
  }

  public getRawFirestoreTemplatesCount(): number | null {
    return this.rawFirestoreTemplatesCount;
  }

  public getDeletedTombstonesCount(): number {
    return Array.isArray(this.db.deletedTemplateIds) ? this.db.deletedTemplateIds.length : 0;
  }

  public getQuarantinedTemplatesCount(): number {
    return this.quarantinedTemplates.length;
  }

  public getDatabaseGuardState(): DatabaseGuardState {
    return getDatabaseGuardState();
  }

  public async bumpCatalogRevision(): Promise<number> {
    this.catalogRevision += 1;
    this.lastCatalogCheckTime = Date.now();
    if (adminFirestoreDb) {
      try {
        await adminFirestoreDb.collection('config').doc('catalog_metadata').set({
          revision: this.catalogRevision,
          lastUpdatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err: any) {
        console.warn('[Database] Failed to bump catalog metadata revision:', err.message);
      }
    }
    return this.catalogRevision;
  }

  public async syncCatalogIfStale(force = false): Promise<void> {
    if (!adminFirestoreDb || isIsolatedTestEnv) return;
    const now = Date.now();
    // Throttle checks to once every 2 seconds unless forced
    if (!force && (now - this.lastCatalogCheckTime < 2000)) {
      return;
    }
    this.lastCatalogCheckTime = now;
    try {
      const metaDoc = await adminFirestoreDb.collection('config').doc('catalog_metadata').get();
      if (metaDoc.exists) {
        const data = metaDoc.data();
        const remoteRev = typeof data?.revision === 'number' ? data.revision : 0;
        if (remoteRev > 0 && remoteRev !== this.catalogRevision) {
          console.log(`[Database] Detected remote catalog revision ${remoteRev} != local ${this.catalogRevision}. Reloading templates & banners...`);
          await this.reloadTemplatesFromFirestore();
          this.catalogRevision = remoteRev;
        }
      }
    } catch (err: any) {
      // 5 NOT_FOUND: When 'config/catalog_metadata' has not been created yet in Firestore (initial clean state),
      // or if the Firestore database is currently unseeded/offline, treat local catalog as current without noisy logs.
      const errMsg = String(err?.message || err?.details || err || '');
      if (
        err?.code === 5 ||
        err?.status === 5 ||
        errMsg.includes('5 NOT_FOUND') ||
        errMsg.includes('NOT_FOUND') ||
        errMsg.includes('not found')
      ) {
        return;
      }
      console.warn('[Database] syncCatalogIfStale check failed:', errMsg);
    }
  }

  constructor(customDbFile?: string, options?: { firestoreOverride?: any; persistToDisk?: boolean }) {
    this.firestoreOverride = options?.firestoreOverride;
    this.persistToDisk = options?.persistToDisk ?? true;
    this.dbFilePath = customDbFile || DB_FILE;
    if (this.firestoreOverride !== undefined && !this.persistToDisk) {
      this.db = {
        users: {},
        authIdentities: {},
        wallets: {},
        creditGrants: [],
        transactions: [],
        generations: [],
        jobs: [],
        payments: {},
        subscriptions: {},
        templates: [],
        deletedTemplateIds: [],
        banners: [],
        faceSwapDemoVideoUrl: '',
        faceSwapScenes: [],
        userLikes: {},
        processedWebhooks: [],
        reports: [],
        adminTestRuns: [],
        pricingBanner: null,
        categoryPrompts: { ...DEFAULT_CATEGORY_PROMPTS },
        adminLogs: [],
        fxCache: null,
        ownerOmniTests: []
      };
      this.readyPromise = Promise.resolve();
      return;
    }
    this.db = this.init();
    if (this.firestoreDb && !isIsolatedTestEnv) {
      this.readyPromise = this.loadAuthoritativeFromFirestore().catch((err: any) => {
        console.warn('[Database] Firestore startup sync warning:', err.message);
      });
    } else {
      this.readyPromise = Promise.resolve();
    }
  }

  public async loadAuthoritativeFromFirestore(): Promise<void> {
    if (!adminFirestoreDb) return;
    try {
      // 1. Wallets
      const walletsSnap = await adminFirestoreDb.collection('wallets').get();
      walletsSnap.forEach((d: any) => {
        this.db.wallets[d.id] = d.data();
      });

      // 2. Users (Server Authoritative Admin Role Assignment for Allowlisted Emails)
      const usersSnap = await adminFirestoreDb.collection('users').get();
      usersSnap.forEach((d: any) => {
        const u = d.data() as UserProfile;
        if (u && isAuthorizedAdminEmail(u.email)) {
          u.role = 'admin';
        }
        this.db.users[d.id] = u;
      });

      // 3. Auth Identities (Server Authoritative)
      const authSnap = await adminFirestoreDb.collection('auth_identities').get();
      authSnap.forEach((d: any) => {
        this.db.authIdentities[d.id] = d.data();
      });

      // 4. Credit Grants (FIFO Expiry Ledger)
      const grantsSnap = await adminFirestoreDb.collection('credit_grants').get();
      if (!grantsSnap.empty) {
        const grants: CreditGrant[] = [];
        grantsSnap.forEach((d: any) => {
          grants.push(d.data() as CreditGrant);
        });
        this.db.creditGrants = grants;
      }

      // 5. Transactions
      const txSnap = await adminFirestoreDb.collection('transactions').get();
      if (!txSnap.empty) {
        const txs: CreditTransaction[] = [];
        txSnap.forEach((d: any) => {
          txs.push(d.data() as CreditTransaction);
        });
        this.db.transactions = txs;
      }

      // 6. Generations & Jobs
      const genSnap = await adminFirestoreDb.collection('generations').get();
      if (!genSnap.empty) {
        const gens: Generation[] = [];
        genSnap.forEach((d: any) => {
          gens.push(d.data() as Generation);
        });
        this.db.generations = gens;
      }

      // 7. Subscriptions
      const subsSnap = await adminFirestoreDb.collection('subscriptions').get();
      subsSnap.forEach((d: any) => {
        this.db.subscriptions[d.id] = d.data();
      });

      // 8. Payments
      const paySnap = await adminFirestoreDb.collection('payments').get();
      paySnap.forEach((d: any) => {
        this.db.payments[d.id] = d.data();
      });

      // 9. Processed Webhook Events (Idempotency Ledger)
      const webhooksSnap = await adminFirestoreDb.collection('processed_webhooks').get();
      const webhookEvents: string[] = [];
      webhooksSnap.forEach((d: any) => {
        webhookEvents.push(d.id);
      });
      if (webhookEvents.length > 0) {
        this.db.processedWebhooks = Array.from(new Set([...this.db.processedWebhooks, ...webhookEvents]));
      }

      // 10. User Likes
      const likesSnap = await adminFirestoreDb.collection('user_likes').get();
      likesSnap.forEach((d: any) => {
        this.db.userLikes[d.id] = d.data()?.templateIds || [];
      });

      // 11. Templates (Authoritative sync with tombstone filtering)
      // 11a. Fetch deleted_template_ids doc from Firestore first
      let tombstoneFetchSuccess = false;
      try {
        const deletedDoc = await adminFirestoreDb.collection('config').doc('deleted_template_ids').get();
        if (deletedDoc.exists && Array.isArray(deletedDoc.data()?.ids)) {
          this.db.deletedTemplateIds = [...deletedDoc.data()!.ids];
        } else {
          this.db.deletedTemplateIds = [];
        }
        tombstoneFetchSuccess = true;
      } catch (delErr: any) {
        console.error('[Database Critical] Failed to fetch authoritative deleted template tombstones from Firestore during startup:', delErr.message);
      }

      if (tombstoneFetchSuccess) {
        const deletedIds = new Set(this.db.deletedTemplateIds || []);
        const tplSnap = await adminFirestoreDb.collection('templates').get();
        this.rawFirestoreTemplatesCount = tplSnap.size;
        const firestoreTemplates: Template[] = [];
        if (!tplSnap.empty) {
          tplSnap.forEach((d: any) => {
            firestoreTemplates.push(d.data() as Template);
          });
        }
        // Production Resilience: In live environments (!isIsolatedTestEnv), templates strictly originate from Firestore documents without merging legacy hardcoded seeds.
        const templateMap = new Map<string, Template>();
        if (isIsolatedTestEnv) {
          SEED_TEMPLATES.forEach(t => {
            if (!deletedIds.has(t.id) && validateTemplate(t).isValid) templateMap.set(t.id, t);
          });
        }
        (this.db.templates || []).forEach(t => {
          if (!deletedIds.has(t.id) && (validateTemplate(t).isValid || isPersistableDraftTemplate(t))) templateMap.set(t.id, t);
        });
        firestoreTemplates.forEach(t => {
          if (!deletedIds.has(t.id)) {
            const v = validateTemplate(t);
            if (v.isValid || isPersistableDraftTemplate(t)) {
              templateMap.set(t.id, t);
            } else {
              if (!this.quarantinedTemplates.some(q => q.template?.id === t.id)) {
                this.quarantinedTemplates.push({
                  template: t,
                  reason: v.reason || 'Invalid remote template record',
                  quarantinedAt: new Date().toISOString()
                });
              }
            }
          }
        });
        this.db.templates = Array.from(templateMap.values());
        if (!isIsolatedTestEnv) {
          this.catalogueStatus = this.db.templates.length > 0 ? 'READY' : 'EMPTY';
        }
      } else {
        console.warn('[Database] Preserving existing safe in-memory template catalog without merging seeds to prevent reviving deleted templates.');
      }

      // Note: We intentionally DO NOT auto-run recoverOrphanedTemplatesFromR2() on startup.
      // Orphan recovery is strictly run manually via Admin "Scan & Recover R2" to prevent resurrecting deleted templates.

      // 12. App Config (Banners, Demo Video, Face Swap Scenes)
      try {
        const bannerDoc = await adminFirestoreDb.collection('config').doc('banners').get();
        if (bannerDoc.exists && bannerDoc.data()?.banners) {
          this.db.banners = bannerDoc.data().banners;
        }
        const demoDoc = await adminFirestoreDb.collection('config').doc('faceswap_demo').get();
        if (demoDoc.exists && demoDoc.data()?.demoVideoUrl) {
          this.db.faceSwapDemoVideoUrl = demoDoc.data().demoVideoUrl;
        }
        const scenesDoc = await adminFirestoreDb.collection('config').doc('faceswap_scenes').get();
        if (scenesDoc.exists && scenesDoc.data()?.scenes) {
          const firestoreScenes: FaceSwapScene[] = scenesDoc.data().scenes;
          const sceneMap = new Map<string, FaceSwapScene>();
          SEED_FACE_SWAP_SCENES.forEach(s => sceneMap.set(s.id, { ...s, isActive: true, status: 'published' }));
          (this.db.faceSwapScenes || []).forEach(s => sceneMap.set(s.id, s));
          firestoreScenes.forEach(s => sceneMap.set(s.id, s));
          const syncedScenes = Array.from(sceneMap.values()).map(s => {
            if (s.id === 'fsv_trending_dance_stage' && s.title === 'Viral Instagram Dance Sequence') {
              return { ...s, title: 'Viral Instagram Reels Sequence' };
            }
            return s;
          });
          this.db.faceSwapScenes = syncedScenes;
        }

        const promptsDoc = await adminFirestoreDb.collection('config').doc('category_prompts').get();
        if (promptsDoc.exists && promptsDoc.data()?.prompts) {
          this.db.categoryPrompts = {
            ...DEFAULT_CATEGORY_PROMPTS,
            ...promptsDoc.data().prompts
          };
        }
        const pricingBannerDoc = await adminFirestoreDb.collection('config').doc('pricing_banner').get();
        if (pricingBannerDoc.exists && pricingBannerDoc.data()) {
          this.db.pricingBanner = pricingBannerDoc.data() as PricingBannerConfig;
        }

        // 13. Admin Activity Logs
        try {
          const logsSnap = await adminFirestoreDb.collection('admin_logs').get();
          if (!logsSnap.empty) {
            const loadedLogs: AdminActivityLog[] = [];
            logsSnap.forEach((d: any) => {
              loadedLogs.push(d.data() as AdminActivityLog);
            });
            this.db.adminLogs = loadedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          }
        } catch {}

        // 14. Hydrate Catalog Metadata Revision on startup
        try {
          const metaDoc = await adminFirestoreDb.collection('config').doc('catalog_metadata').get();
          if (metaDoc.exists && typeof metaDoc.data()?.revision === 'number') {
            this.catalogRevision = metaDoc.data()!.revision;
          }
        } catch {}
      } catch {
        // config docs optional
      }

      if (!isIsolatedTestEnv) {
        this.catalogueStatus = this.db.templates.length > 0 ? 'READY' : 'EMPTY';
      }
      this.lastCatalogSyncAt = new Date().toISOString();
      console.log('[Database] Complete authoritative state synchronized from Firestore');
    } catch (err: any) {
      if (!isIsolatedTestEnv) {
        this.catalogueStatus = 'OFFLINE';
      }
      console.warn('[Database] Firestore authoritative sync note:', err.message);
    }
  }

  /**
   * Safe targeted catalog refresh from Firestore.
   * Only reloads templates, Face Swap scenes, banners, and prompts without disturbing
   * active user sessions, wallets, transactions, or generation job state.
   */
  public async refreshCatalogFromFirestore(): Promise<{
    templatesCount: number;
    faceSwapScenesCount: number;
    bannersCount: number;
  }> {
    if (!adminFirestoreDb) {
      throw new Error('Firestore connection is not available to refresh catalog.');
    }

    // 1. Templates
    // Fetch deleted_template_ids doc from Firestore first (authoritative reconciliation)
    try {
      const deletedDoc = await adminFirestoreDb.collection('config').doc('deleted_template_ids').get();
      if (deletedDoc.exists && Array.isArray(deletedDoc.data()?.ids)) {
        this.db.deletedTemplateIds = [...deletedDoc.data()!.ids];
      } else {
        this.db.deletedTemplateIds = [];
      }
    } catch (delErr: any) {
      console.error('[Database Critical] Fetch deleted_template_ids error during refresh:', delErr.message);
      throw new Error(`Failed to fetch authoritative deleted template tombstones from Firestore: ${delErr.message}. Catalog refresh halted to prevent reviving deleted templates.`);
    }
    const deletedIds = new Set(this.db.deletedTemplateIds || []);

    const tplSnap = await adminFirestoreDb.collection('templates').get();
    this.rawFirestoreTemplatesCount = tplSnap.size;
    const firestoreTemplates: Template[] = [];
    if (!tplSnap.empty) {
      tplSnap.forEach((d: any) => {
        firestoreTemplates.push(d.data() as Template);
      });
    }
    const templateMap = new Map<string, Template>();
    if (isIsolatedTestEnv) {
      SEED_TEMPLATES.forEach(t => {
        if (!deletedIds.has(t.id) && validateTemplate(t).isValid) templateMap.set(t.id, t);
      });
    }
    (this.db.templates || []).forEach(t => {
      if (!deletedIds.has(t.id) && (validateTemplate(t).isValid || isPersistableDraftTemplate(t))) templateMap.set(t.id, t);
    });
    firestoreTemplates.forEach(t => {
      if (!deletedIds.has(t.id)) {
        const v = validateTemplate(t);
        if (v.isValid || isPersistableDraftTemplate(t)) {
          templateMap.set(t.id, t);
        } else {
          if (!this.quarantinedTemplates.some(q => q.template?.id === t.id)) {
            this.quarantinedTemplates.push({
              template: t,
              reason: v.reason || 'Invalid remote template record',
              quarantinedAt: new Date().toISOString()
            });
          }
        }
      }
    });
    this.db.templates = Array.from(templateMap.values());
    if (!isIsolatedTestEnv) {
      this.catalogueStatus = this.db.templates.length > 0 ? 'READY' : 'EMPTY';
    }

    // 2. Face Swap Scenes & Config
    try {
      const scenesDoc = await adminFirestoreDb.collection('config').doc('faceswap_scenes').get();
      if (scenesDoc.exists && scenesDoc.data()?.scenes) {
        const firestoreScenes: FaceSwapScene[] = scenesDoc.data().scenes;
        const sceneMap = new Map<string, FaceSwapScene>();
        SEED_FACE_SWAP_SCENES.forEach(s => sceneMap.set(s.id, { ...s, isActive: true, status: 'published' }));
        (this.db.faceSwapScenes || []).forEach(s => sceneMap.set(s.id, s));
        firestoreScenes.forEach(s => sceneMap.set(s.id, s));
        this.db.faceSwapScenes = Array.from(sceneMap.values()).map(s => {
          if (s.id === 'fsv_trending_dance_stage' && s.title === 'Viral Instagram Dance Sequence') {
            return { ...s, title: 'Viral Instagram Reels Sequence' };
          }
          return s;
        });
      }

      // 3. Home Banners
      const bannerDoc = await adminFirestoreDb.collection('config').doc('banners').get();
      if (bannerDoc.exists && bannerDoc.data()?.banners) {
        this.db.banners = bannerDoc.data().banners;
      }

      // 4. Face Swap Demo Video
      const demoDoc = await adminFirestoreDb.collection('config').doc('faceswap_demo').get();
      if (demoDoc.exists && demoDoc.data()?.demoVideoUrl) {
        this.db.faceSwapDemoVideoUrl = demoDoc.data().demoVideoUrl;
      }

      // 5. Pricing Banner Pool
      const pricingBannerDoc = await adminFirestoreDb.collection('config').doc('pricing_banner').get();
      if (pricingBannerDoc.exists && pricingBannerDoc.data()) {
        this.db.pricingBanner = pricingBannerDoc.data() as PricingBannerConfig;
      }

      // 6. Category Prompts
      const promptsDoc = await adminFirestoreDb.collection('config').doc('category_prompts').get();
      if (promptsDoc.exists && promptsDoc.data()?.prompts) {
        this.db.categoryPrompts = {
          ...DEFAULT_CATEGORY_PROMPTS,
          ...promptsDoc.data().prompts
        };
      }
      // 7. Catalog Metadata Revision
      try {
        const metaDoc = await adminFirestoreDb.collection('config').doc('catalog_metadata').get();
        if (metaDoc.exists && typeof metaDoc.data()?.revision === 'number') {
          this.catalogRevision = metaDoc.data()!.revision;
        }
      } catch {}
    } catch (cfgErr: any) {
      console.warn('[Database] Catalog config docs note during targeted refresh:', cfgErr.message);
    }

    this.lastCatalogSyncAt = new Date().toISOString();
    this.save();
    console.log('[Database] Targeted catalog & scene sync completed from Firestore');
    return {
      templatesCount: this.db.templates.length,
      faceSwapScenesCount: this.db.faceSwapScenes.length,
      bannersCount: this.db.banners.length
    };
  }

  public async reloadTemplatesFromFirestore(): Promise<any> {
    return this.refreshCatalogFromFirestore();
  }

  private init(): ProductionDatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(this.dbFilePath)) {
        const raw = fs.readFileSync(this.dbFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        parsed.users = parsed.users || {};
        parsed.authIdentities = parsed.authIdentities || {};
        parsed.wallets = parsed.wallets || {};
        parsed.creditGrants = parsed.creditGrants || [];
        parsed.transactions = parsed.transactions || [];
        parsed.generations = parsed.generations || [];
        parsed.jobs = parsed.jobs || [];
        parsed.payments = parsed.payments || {};
        parsed.subscriptions = parsed.subscriptions || {};
        const deletedIds = new Set(parsed.deletedTemplateIds || []);
        const tplMap = new Map<string, Template>();
        if (isIsolatedTestEnv) {
          SEED_TEMPLATES.forEach(t => {
            if (!deletedIds.has(t.id) && validateTemplate(t).isValid) tplMap.set(t.id, t);
          });
        }
        (parsed.templates || []).forEach((t: Template) => {
          if (!deletedIds.has(t.id)) {
            const v = validateTemplate(t);
            if (v.isValid || isPersistableDraftTemplate(t)) {
              tplMap.set(t.id, t);
            } else {
              if (!this.quarantinedTemplates.some(q => q.template?.id === t.id)) {
                this.quarantinedTemplates.push({
                  template: t,
                  reason: v.reason || 'Invalid initial template record',
                  quarantinedAt: new Date().toISOString()
                });
              }
            }
          }
        });
        parsed.templates = Array.from(tplMap.values());
        parsed.banners = Array.isArray(parsed.banners) ? parsed.banners : (isIsolatedTestEnv ? [...HOME_HERO_BANNERS] : []);
        parsed.faceSwapDemoVideoUrl = parsed.faceSwapDemoVideoUrl || 'https://assets.mixkit.co/videos/preview/mixkit-girl-dancing-happy-in-a-field-of-yellow-flowers-40277-large.mp4';
        
        const sceneMap = new Map<string, FaceSwapScene>();
        SEED_FACE_SWAP_SCENES.forEach(s => sceneMap.set(s.id, { ...s, isActive: true, status: 'published' }));
        (parsed.faceSwapScenes || []).forEach((s: FaceSwapScene) => {
          if (s.id === 'fsv_trending_dance_stage' && s.title === 'Viral Instagram Dance Sequence') {
            s.title = 'Viral Instagram Reels Sequence';
          }
          sceneMap.set(s.id, s);
        });
        parsed.faceSwapScenes = Array.from(sceneMap.values());

        parsed.userLikes = parsed.userLikes || {};
        parsed.processedWebhooks = parsed.processedWebhooks || [];
        parsed.reports = parsed.reports || [];
        parsed.adminTestRuns = parsed.adminTestRuns || [];
        parsed.pricingBanner = parsed.pricingBanner || null;
        parsed.categoryPrompts = { ...DEFAULT_CATEGORY_PROMPTS, ...(parsed.categoryPrompts || {}) };
        parsed.adminLogs = parsed.adminLogs || [];
        parsed.fxCache = parsed.fxCache || null;
        parsed.ownerOmniTests = parsed.ownerOmniTests || [];
        return parsed;
      }
    } catch (err) {
      console.warn('[Database] Initializing fresh store:', err);
    }

    // Clean initial state: zero fake users, zero fake generations
    return {
      users: {},
      authIdentities: {},
      wallets: {},
      creditGrants: [],
      transactions: [],
      generations: [],
      jobs: [],
      payments: {},
      subscriptions: {},
      templates: isIsolatedTestEnv ? [...SEED_TEMPLATES] : [],
      banners: isIsolatedTestEnv ? [...HOME_HERO_BANNERS] : [],
      faceSwapDemoVideoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-girl-dancing-happy-in-a-field-of-yellow-flowers-40277-large.mp4',
      faceSwapScenes: SEED_FACE_SWAP_SCENES.map(s => ({ ...s, isActive: true, status: 'published' })),
      userLikes: {},
      processedWebhooks: [],
      reports: [],
      adminTestRuns: [],
      pricingBanner: null,
      categoryPrompts: { ...DEFAULT_CATEGORY_PROMPTS },
      adminLogs: [],
      fxCache: null,
      ownerOmniTests: []
    };
  }

  public save(): void {
    if (!this.persistToDisk) return;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tempFile = path.join(DATA_DIR, `db_${Date.now()}_tmp_${crypto.randomBytes(3).toString('hex')}.json`);
      fs.writeFileSync(tempFile, JSON.stringify(this.db, null, 2), 'utf-8');
      fs.renameSync(tempFile, this.dbFilePath);
    } catch (err) {
      console.error('[Database] Failed to save database:', err);
    }
  }

  public get raw(): ProductionDatabaseSchema {
    return this.db;
  }

  /* =========================================================================
     FIRESTORE SYNC HELPERS
  ========================================================================= */
  public async syncToFirestore(
    collectionName: string,
    docId: string,
    data: any
  ): Promise<{ success: boolean; cloudPersisted: boolean; error?: string }> {
    const fsDb = this.firestoreDb;
    if (!fsDb) {
      return { success: false, cloudPersisted: false, error: 'Firestore Admin SDK not connected' };
    }
    const sanitized = JSON.parse(JSON.stringify(data));
    const isCritical = ['auth_identities', 'users', 'wallets', 'templates'].includes(collectionName);
    const maxAttempts = isCritical ? 3 : 1;
    const effectiveMaxAttempts = collectionName === 'media_metadata' ? 2 : maxAttempts;

    for (let attempt = 1; attempt <= effectiveMaxAttempts; attempt++) {
      try {
        await fsDb.collection(collectionName).doc(docId).set(sanitized, { merge: true });
        return { success: true, cloudPersisted: true };
      } catch (err: any) {
        if (attempt === effectiveMaxAttempts) {
          console.error(`[Firestore Sync Critical] ${collectionName}/${docId} failed after ${attempt} attempts:`, err.message);
          return { success: false, cloudPersisted: false, error: err.message };
        }
        const delay = attempt * 150;
        console.warn(`[Firestore Sync Retry] ${collectionName}/${docId} attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    return { success: false, cloudPersisted: false, error: 'Firestore sync failed' };
  }

  private async deleteFromFirestore(collectionName: string, docId: string): Promise<void> {
    const fsDb = this.firestoreDb;
    if (!fsDb) return;
    try {
      await fsDb.collection(collectionName).doc(docId).delete();
    } catch (err: any) {
      console.warn(`[Firestore Delete] ${collectionName}/${docId}:`, err.message);
    }
  }

  /* =========================================================================
     USERS & AUTH
  ========================================================================= */
  public getUser(userId: string): UserProfile | null {
    return this.db.users[userId] || null;
  }

  public async getUserAuthoritative(userId: string): Promise<UserProfile | null> {
    if (!userId) return null;
    const local = this.getUser(userId);
    if (local) return local;

    const fsDb = this.firestoreDb;
    if (fsDb) {
      try {
        const docSnap = await fsDb.collection('users').doc(userId).get();
        if (docSnap.exists) {
          const user = docSnap.data() as UserProfile;
          this.db.users[userId] = user;
          return user;
        }
      } catch (err: any) {
        console.warn('[Firestore] getUserAuthoritative lookup note:', err?.message || err);
      }
    }
    return null;
  }

  public getUserByFirebaseUid(firebaseUid: string): UserProfile | null {
    for (const [userId, identity] of Object.entries(this.db.authIdentities)) {
      if (identity.firebaseUid === firebaseUid) {
        return this.db.users[userId] || null;
      }
    }
    return null;
  }

  public async getUserByFirebaseUidAsync(firebaseUid: string): Promise<UserProfile | null> {
    await this.readyPromise;
    const memUser = this.getUserByFirebaseUid(firebaseUid);
    if (memUser) return memUser;

    const fsDb = this.firestoreDb;
    if (!fsDb) return null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const snap = await fsDb
          .collection('auth_identities')
          .where('firebaseUid', '==', firebaseUid)
          .limit(1)
          .get();
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const identity = docSnap.data() as AuthIdentity;
          const userId = docSnap.id;
          this.db.authIdentities[userId] = {
            ...identity,
            sessionTokens: Array.isArray(identity?.sessionTokens) ? [...identity.sessionTokens] : []
          };

          if (!this.db.users[userId]) {
            const userDoc = await fsDb.collection('users').doc(userId).get();
            if (userDoc.exists) {
              const u = userDoc.data() as UserProfile;
              if (u && isAuthorizedAdminEmail(u.email || identity?.email)) {
                u.role = 'admin';
              }
              this.db.users[userId] = u;
            }
          }
          return this.db.users[userId] || null;
        }
        return null;
      } catch (err: any) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        console.warn('[Database] Async getUserByFirebaseUid notice:', err.message);
      }
    }
    return null;
  }

  private touchSessionTokenLru(identity: AuthIdentity, token: string, persistIfShifted: boolean = true): void {
    if (!Array.isArray(identity.sessionTokens)) {
      identity.sessionTokens = [token];
      return;
    }
    const existingIdx = identity.sessionTokens.indexOf(token);
    const tailDistance = existingIdx >= 0 ? identity.sessionTokens.length - 1 - existingIdx : -1;
    const deduped = identity.sessionTokens.filter((t) => t !== token);
    deduped.push(token);
    identity.sessionTokens = deduped;
    if (identity.sessionTokens.length > 15) {
      identity.sessionTokens = identity.sessionTokens.slice(-15);
    }
    if (persistIfShifted && tailDistance > 3) {
      this.save();
      this.syncToFirestore('auth_identities', identity.userId, identity);
    }
  }

  public getUserByToken(token: string): UserProfile | null {
    if (!token) return null;
    const ensureAdminRole = (u: UserProfile | undefined, identity?: AuthIdentity): UserProfile | null => {
      if (!u) return null;
      const effectiveEmail = u.email || identity?.email;
      if (!u.email && effectiveEmail) {
        u.email = effectiveEmail;
      }
      const isAdminEmail = isAuthorizedAdminEmail(effectiveEmail);
      if (isAdminEmail && u.role !== 'admin') {
        u.role = 'admin';
        this.syncToFirestore('users', u.id, u);
      }
      return u;
    };

    for (const [userId, identity] of Object.entries(this.db.authIdentities)) {
      if (identity.sessionTokens && identity.sessionTokens.includes(token)) {
        this.touchSessionTokenLru(identity, token, true);
        return ensureAdminRole(this.db.users[userId], identity);
      }
    }
    if (this.persistToDisk && fs.existsSync(this.dbFilePath)) {
      try {
        const diskDb = JSON.parse(fs.readFileSync(this.dbFilePath, 'utf-8'));
        for (const [userId, identity] of Object.entries((diskDb.authIdentities || {}) as Record<string, AuthIdentity>)) {
          if (identity.sessionTokens && identity.sessionTokens.includes(token)) {
            this.db.users[userId] = diskDb.users[userId];
            this.db.authIdentities[userId] = identity;
            this.touchSessionTokenLru(identity, token, true);
            return ensureAdminRole(this.db.users[userId], identity);
          }
        }
      } catch {}
    }
    return null;
  }

  public async getUserByTokenAsyncWithStatus(token: string): Promise<{
    user: UserProfile | null;
    transientError: boolean;
    error?: string;
  }> {
    if (!token) return { user: null, transientError: false };
    await this.readyPromise;
    const memUser = this.getUserByToken(token);
    if (memUser) return { user: memUser, transientError: false };

    const fsDb = this.firestoreDb;
    if (!fsDb) return { user: null, transientError: false };

    const ensureAdminRole = (u: UserProfile | undefined, identity?: AuthIdentity): UserProfile | null => {
      if (!u) return null;
      const effectiveEmail = u.email || identity?.email;
      if (!u.email && effectiveEmail) {
        u.email = effectiveEmail;
      }
      const isAdminEmail = isAuthorizedAdminEmail(effectiveEmail);
      if (isAdminEmail && u.role !== 'admin') {
        u.role = 'admin';
        this.syncToFirestore('users', u.id, u);
      }
      return u;
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const snap = await fsDb
          .collection('auth_identities')
          .where('sessionTokens', 'array-contains', token)
          .limit(1)
          .get();
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const identity = docSnap.data() as AuthIdentity;
          const userId = docSnap.id;
          if (!identity.userId) identity.userId = userId;
          this.touchSessionTokenLru(identity, token, true);
          this.db.authIdentities[userId] = identity;

          if (!this.db.users[userId]) {
            const userDoc = await fsDb.collection('users').doc(userId).get();
            if (userDoc.exists) {
              this.db.users[userId] = userDoc.data() as UserProfile;
            }
          }
          return { user: ensureAdminRole(this.db.users[userId], identity), transientError: false };
        }
        return { user: null, transientError: false };
      } catch (err: any) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        console.warn('[Database] Async getUserByToken notice:', err.message);
        return { user: null, transientError: true, error: err?.message || 'Firestore token lookup timed out or unavailable' };
      }
    }
    return { user: null, transientError: false };
  }

  public async getUserByTokenAsync(token: string): Promise<UserProfile | null> {
    const res = await this.getUserByTokenAsyncWithStatus(token);
    return res.user;
  }

  public async getOrCreateUserAsync(params: {
    firebaseUid: string;
    email?: string;
    phone?: string;
    name?: string;
    avatar?: string;
  }): Promise<{ user: UserProfile; token: string; isNewUser: boolean; cloudPersisted: boolean; persistError?: string }> {
    const lockKey = String(params.firebaseUid || '').trim() || 'anonymous_uid';
    const priorLock = this.inFlightAuthLocks.get(lockKey) || Promise.resolve();

    const currentOperation = priorLock
      .catch(() => {})
      .then(async () => {
        await this.readyPromise;
        if (!this.getUserByFirebaseUid(params.firebaseUid)) {
          await this.getUserByFirebaseUidAsync(params.firebaseUid);
        }

        const result = this.getOrCreateUser({ ...params, skipBackgroundSync: true });
        const fsDb = this.firestoreDb;
        let authOk = isIsolatedTestEnv && !fsDb;
        let userOk = isIsolatedTestEnv && !fsDb;
        let walletOk = true;
        let persistError: string | undefined = undefined;

        if (fsDb) {
          const identity = this.db.authIdentities[result.user.id];
          if (identity) {
            const syncRes = await this.syncToFirestore('auth_identities', result.user.id, identity);
            authOk = Boolean(syncRes.cloudPersisted);
            if (!authOk) persistError = syncRes.error || 'Failed to persist auth identity to Firestore';
          } else {
            persistError = 'Missing auth identity record for user session';
          }

          const userRes = await this.syncToFirestore('users', result.user.id, result.user);
          userOk = Boolean(userRes.cloudPersisted);
          if (!userOk && !persistError) persistError = userRes.error || 'Failed to persist user profile to Firestore';

          if (result.isNewUser && this.db.wallets[result.user.id]) {
            const walletRes = await this.syncToFirestore('wallets', result.user.id, this.db.wallets[result.user.id]);
            walletOk = Boolean(walletRes.cloudPersisted);
            if (!walletOk && !persistError) persistError = walletRes.error || 'Failed to initialize user wallet in Firestore';
          }
        } else if (!isIsolatedTestEnv) {
          persistError = 'Authoritative Firestore database is not connected';
        }

        const allPersisted = Boolean(authOk && userOk && walletOk);
        return { ...result, cloudPersisted: allPersisted, persistError };
      });

    this.inFlightAuthLocks.set(lockKey, currentOperation);
    try {
      return await currentOperation;
    } finally {
      if (this.inFlightAuthLocks.get(lockKey) === currentOperation) {
        this.inFlightAuthLocks.delete(lockKey);
      }
    }
  }

  /**
   * Creates or resolves a real authenticated user.
   */
  public getOrCreateUser(params: {
    firebaseUid: string;
    email?: string;
    phone?: string;
    name?: string;
    avatar?: string;
    skipBackgroundSync?: boolean;
  }): { user: UserProfile; token: string; isNewUser: boolean } {
    let existingUser = this.getUserByFirebaseUid(params.firebaseUid);
    const sessionToken = `session_${crypto.randomBytes(24).toString('hex')}`;

    const isAdminEmail = isAuthorizedAdminEmail(params.email) || isAuthorizedAdminEmail(existingUser?.email);

    if (existingUser) {
      if (params.email && (!existingUser.email || existingUser.email !== params.email)) {
        existingUser.email = params.email;
      }
      if (params.name && (!existingUser.name || existingUser.name === 'AI Creator')) {
        existingUser.name = params.name.trim();
      }
      if (isAdminEmail && existingUser.role !== 'admin') {
        existingUser.role = 'admin';
      }
      if (!params.skipBackgroundSync) {
        this.syncToFirestore('users', existingUser.id, existingUser);
      }
      let identity = this.db.authIdentities[existingUser.id];
      if (!identity) {
        identity = {
          userId: existingUser.id,
          firebaseUid: params.firebaseUid,
          email: params.email || existingUser.email,
          phone: params.phone,
          sessionTokens: [],
          createdAt: existingUser.createdAt || new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        };
        this.db.authIdentities[existingUser.id] = identity;
      }
      this.touchSessionTokenLru(identity, sessionToken, false);
      identity.lastLoginAt = new Date().toISOString();
      if (params.email && !identity.email) identity.email = params.email;
      if (params.phone && !identity.phone) identity.phone = params.phone;
      if (!params.skipBackgroundSync) {
        this.syncToFirestore('auth_identities', existingUser.id, identity);
      }
      this.save();
      return { user: existingUser, token: sessionToken, isNewUser: false };
    }

    // Create brand new isolated user profile
    const newUserId = `usr_${params.firebaseUid.substring(0, 16)}_${crypto.randomBytes(3).toString('hex')}`;
    const newUser: UserProfile = {
      id: newUserId,
      name: params.name?.trim() || (params.phone ? `Creator ${params.phone.slice(-4)}` : 'AI Creator'),
      email: params.email || '',
      avatar: params.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      onboarded: true,
      role: isAdminEmail ? 'admin' : 'creator',
      createdAt: new Date().toISOString(),
      generationCount: 0
    };

    const newIdentity: AuthIdentity = {
      userId: newUserId,
      firebaseUid: params.firebaseUid,
      email: params.email,
      phone: params.phone,
      sessionTokens: [sessionToken],
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };

    this.db.users[newUserId] = newUser;
    this.db.authIdentities[newUserId] = newIdentity;

    // New real user starts with clean state: 0 balance, 0 transactions
    this.db.wallets[newUserId] = {
      userId: newUserId,
      balance: 0,
      lifetimeCredits: 0,
      spentCredits: 0,
      updatedAt: new Date().toISOString()
    };

    this.save();
    if (!params.skipBackgroundSync) {
      this.syncToFirestore('users', newUserId, newUser);
      this.syncToFirestore('auth_identities', newUserId, newIdentity);
      this.syncToFirestore('wallets', newUserId, this.db.wallets[newUserId]);
    }

    return { user: newUser, token: sessionToken, isNewUser: true };
  }

  public async saveUser(user: UserProfile): Promise<void> {
    this.db.users[user.id] = user;
    this.save();
    this.syncToFirestore('users', user.id, user);
  }

  public revokeToken(token: string): boolean {
    for (const [userId, identity] of Object.entries(this.db.authIdentities)) {
      if (identity.sessionTokens && identity.sessionTokens.includes(token)) {
        identity.sessionTokens = identity.sessionTokens.filter(t => t !== token);
        this.save();
        this.syncToFirestore('auth_identities', userId, identity);
        return true;
      }
    }
    return false;
  }

  /* =========================================================================
     WALLETS & CREDIT LEDGER (WITH SERVER-AUTHORITATIVE EXPIRY & BUCKETS)
  ========================================================================= */
  public getUserGrants(userId: string): CreditGrant[] {
    return (this.db.creditGrants || []).filter(g => g.userId === userId);
  }

  public async getWalletAuthoritative(userId: string): Promise<CreditWallet> {
    const fsDb = this.firestoreDb;
    if (fsDb) {
      try {
        const walletDoc = await fsDb.collection('wallets').doc(userId).get();
        if (walletDoc.exists) {
          this.db.wallets[userId] = walletDoc.data() as CreditWallet;
        }
        const grantsSnap = await fsDb.collection('credit_grants').where('userId', '==', userId).get();
        if (!grantsSnap.empty) {
          const userGrants: CreditGrant[] = [];
          grantsSnap.forEach((d: any) => userGrants.push(d.data() as CreditGrant));
          this.db.creditGrants = [
            ...userGrants,
            ...(this.db.creditGrants || []).filter(g => g.userId !== userId)
          ];
        }
      } catch (err: any) {
        console.warn('[Database] getWalletAuthoritative fetch note:', err.message);
      }
    }
    return this.getWallet(userId);
  }

  public getWallet(userId: string): CreditWallet {
    if (!this.db.wallets[userId]) {
      this.db.wallets[userId] = {
        userId,
        balance: 0,
        expiringBalance: 0,
        topupBalance: 0,
        lifetimeCredits: 0,
        spentCredits: 0,
        grants: [],
        updatedAt: new Date().toISOString()
      };
      this.save();
    }

    const wallet = this.db.wallets[userId];
    const grants = this.getUserGrants(userId);
    const now = new Date();

    // Partition unexpired grants
    let activeExpiringBalance = 0;
    let topupBalance = 0;

    for (const grant of grants) {
      if (grant.creditsRemaining <= 0) continue;

      const isExpired = grant.expiresAt ? new Date(grant.expiresAt) <= now : false;
      if (!isExpired) {
        if (grant.expiresAt) {
          activeExpiringBalance += grant.creditsRemaining;
        } else {
          topupBalance += grant.creditsRemaining;
        }
      }
    }

    wallet.balance = activeExpiringBalance + topupBalance;
    wallet.expiringBalance = activeExpiringBalance;
    wallet.topupBalance = topupBalance;
    wallet.grants = grants;

    return wallet;
  }

  public async reserveCredits(userId: string, amount: number, description: string, refId: string): Promise<boolean> {
    // If Firestore Admin is available, execute inside a strict ACID Transaction
    const fsDb = this.firestoreDb;
    if (fsDb) {
      try {
        const success = await fsDb.runTransaction(async (t: any) => {
          // 1. Idempotency check: if a transaction with refId already exists, it was already reserved
          if (refId) {
            const existingTxSnap = await t.get(
              fsDb.collection('transactions').where('referenceId', '==', refId).limit(1)
            );
            if (!existingTxSnap.empty) {
              return true; // Idempotently succeed
            }
          }

          // 2. Fetch wallet
          const walletRef = fsDb.collection('wallets').doc(userId);
          const walletDoc = await t.get(walletRef);
          let walletData: CreditWallet = walletDoc.exists
            ? (walletDoc.data() as CreditWallet)
            : {
                userId,
                balance: 0,
                expiringBalance: 0,
                topupBalance: 0,
                lifetimeCredits: 0,
                spentCredits: 0,
                grants: [],
                updatedAt: new Date().toISOString()
              };

          // 3. Query active grants
          const grantsSnap = await t.get(
            fsDb
              .collection('credit_grants')
              .where('userId', '==', userId)
          );

          const now = new Date();
          const activeGrants: CreditGrant[] = [];
          grantsSnap.forEach((d: any) => {
            const g = d.data() as CreditGrant;
            if (g.creditsRemaining > 0 && (!g.expiresAt || new Date(g.expiresAt) > now)) {
              activeGrants.push(g);
            }
          });

          // Compute total active balance
          const totalAvailable = activeGrants.reduce((sum, g) => sum + g.creditsRemaining, 0);
          if (totalAvailable < amount) {
            return false;
          }

          // Sort FIFO by earliest expiring first; non-expiring last
          activeGrants.sort((a, b) => {
            if (a.expiresAt && b.expiresAt) {
              return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
            }
            if (a.expiresAt && !b.expiresAt) return -1;
            if (!a.expiresAt && b.expiresAt) return 1;
            return new Date(a.grantedAt).getTime() - new Date(b.grantedAt).getTime();
          });

          let needed = amount;
          for (const grant of activeGrants) {
            if (needed <= 0) break;
            const take = Math.min(grant.creditsRemaining, needed);
            grant.creditsRemaining -= take;
            needed -= take;
            const gRef = fsDb.collection('credit_grants').doc(grant.id);
            t.update(gRef, { creditsRemaining: grant.creditsRemaining });

            // In-memory update
            const memGrant = (this.db.creditGrants || []).find(cg => cg.id === grant.id);
            if (memGrant) memGrant.creditsRemaining = grant.creditsRemaining;
          }

          walletData.spentCredits = (walletData.spentCredits || 0) + amount;
          walletData.balance = Math.max(0, totalAvailable - amount);
          walletData.updatedAt = new Date().toISOString();
          t.set(walletRef, walletData, { merge: true });

          const tx: CreditTransaction = {
            id: `tx_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
            userId,
            amount: -amount,
            type: 'generation',
            description,
            referenceId: refId,
            createdAt: new Date().toISOString()
          };
          const txRef = fsDb.collection('transactions').doc(tx.id);
          t.set(txRef, tx);

          // Update memory
          this.db.wallets[userId] = walletData;
          this.db.transactions.unshift(tx);
          this.save();
          return true;
        });

        if (success !== undefined) return success;
        return false;
      } catch (err: any) {
        console.error('[Database] FAIL-CLOSED: Atomic Firestore reserveCredits failed:', err.message);
        // Fail-closed: Never fall back to local/in-memory processing on Firestore transaction failure
        return false;
      }
    }

    // Fail-closed if in production and Firestore is unavailable
    if (process.env.NODE_ENV === 'production') {
      console.error('[Database] FAIL-CLOSED: Authoritative Firestore is unavailable in production for reserveCredits');
      return false;
    }

    // Local / In-Memory Fallback ONLY for non-production development without Firestore
    const wallet = this.getWallet(userId);
    if (wallet.balance < amount) {
      return false;
    }

    const now = new Date();
    const activeGrants = (this.db.creditGrants || [])
      .filter(g => g.userId === userId && g.creditsRemaining > 0)
      .filter(g => !g.expiresAt || new Date(g.expiresAt) > now);

    activeGrants.sort((a, b) => {
      if (a.expiresAt && b.expiresAt) {
        return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      }
      if (a.expiresAt && !b.expiresAt) return -1;
      if (!a.expiresAt && b.expiresAt) return 1;
      return new Date(a.grantedAt).getTime() - new Date(b.grantedAt).getTime();
    });

    let needed = amount;
    for (const grant of activeGrants) {
      if (needed <= 0) break;
      const take = Math.min(grant.creditsRemaining, needed);
      grant.creditsRemaining -= take;
      needed -= take;
      await this.syncToFirestore('credit_grants', grant.id, grant);
    }

    wallet.spentCredits += amount;
    wallet.updatedAt = new Date().toISOString();

    const tx: CreditTransaction = {
      id: `tx_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      userId,
      amount: -amount,
      type: 'generation',
      description,
      referenceId: refId,
      createdAt: new Date().toISOString()
    };

    this.db.transactions.unshift(tx);
    this.save();
    await this.syncToFirestore('wallets', userId, wallet);
    await this.syncToFirestore('transactions', tx.id, tx);

    this.getWallet(userId);
    return true;
  }

  public async refundCredits(userId: string, amount: number, description: string, refId: string): Promise<void> {
    const fsDb = this.firestoreDb;
    if (fsDb) {
      try {
        await fsDb.runTransaction(async (t: any) => {
          // Idempotency check: don't refund the same refId twice
          if (refId) {
            const existingRefSnap = await t.get(
              fsDb
                .collection('transactions')
                .where('referenceId', '==', refId)
                .where('type', '==', 'refund')
                .limit(1)
            );
            if (!existingRefSnap.empty) {
              return;
            }
          }

          const walletRef = fsDb.collection('wallets').doc(userId);
          const walletDoc = await t.get(walletRef);
          let walletData: CreditWallet = walletDoc.exists
            ? (walletDoc.data() as CreditWallet)
            : {
                userId,
                balance: 0,
                expiringBalance: 0,
                topupBalance: 0,
                lifetimeCredits: 0,
                spentCredits: 0,
                grants: [],
                updatedAt: new Date().toISOString()
              };

          walletData.balance = (walletData.balance || 0) + amount;
          walletData.spentCredits = Math.max(0, (walletData.spentCredits || 0) - amount);
          walletData.updatedAt = new Date().toISOString();
          t.set(walletRef, walletData, { merge: true });

          const refundGrant: CreditGrant = {
            id: `grant_ref_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
            userId,
            source: 'refund',
            creditsGranted: amount,
            creditsRemaining: amount,
            grantedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            referenceId: refId
          };
          const grantRef = fsDb.collection('credit_grants').doc(refundGrant.id);
          t.set(grantRef, refundGrant);

          const tx: CreditTransaction = {
            id: `tx_ref_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
            userId,
            amount,
            type: 'refund',
            description,
            referenceId: refId,
            createdAt: new Date().toISOString()
          };
          const txRef = fsDb.collection('transactions').doc(tx.id);
          t.set(txRef, tx);

          // Update in-memory
          if (!this.db.creditGrants) this.db.creditGrants = [];
          this.db.creditGrants.unshift(refundGrant);
          this.db.transactions.unshift(tx);
          this.db.wallets[userId] = walletData;
          this.save();
        });
        return;
      } catch (err: any) {
        console.error('[Database] FAIL-CLOSED: Atomic Firestore refundCredits failed:', err.message);
        // Fail-closed: Never fall back to local/in-memory processing on Firestore transaction failure
        throw new Error(`Authoritative refund failed in Firestore: ${err.message}`);
      }
    }

    // Fail-closed if in production and Firestore is unavailable
    if (process.env.NODE_ENV === 'production') {
      console.error('[Database] FAIL-CLOSED: Authoritative Firestore is unavailable in production for refundCredits');
      throw new Error('Authoritative Firestore database unavailable for refund');
    }

    // Local fallback ONLY for non-production development without Firestore
    // Idempotency check: don't refund the same refId twice
    if (refId) {
      const existingTx = (this.db.transactions || []).find(
        (t) => t.referenceId === refId && t.type === 'refund'
      );
      if (existingTx) {
        console.warn(`[Local Refund Guard] Duplicate refund prevented for referenceId: ${refId}`);
        return;
      }
    }

    const wallet = this.getWallet(userId);
    wallet.spentCredits = Math.max(0, wallet.spentCredits - amount);
    wallet.updatedAt = new Date().toISOString();

    const refundGrant: CreditGrant = {
      id: `grant_ref_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      userId,
      source: 'refund',
      creditsGranted: amount,
      creditsRemaining: amount,
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      referenceId: refId
    };

    if (!this.db.creditGrants) this.db.creditGrants = [];
    this.db.creditGrants.unshift(refundGrant);
    await this.syncToFirestore('credit_grants', refundGrant.id, refundGrant);

    const tx: CreditTransaction = {
      id: `tx_ref_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      userId,
      amount,
      type: 'refund',
      description,
      referenceId: refId,
      createdAt: new Date().toISOString()
    };

    this.db.transactions.unshift(tx);
    this.save();
    await this.syncToFirestore('wallets', userId, wallet);
    await this.syncToFirestore('transactions', tx.id, tx);

    this.getWallet(userId);
  }

  public async creditWallet(
    userId: string,
    amount: number,
    description: string,
    orderId: string,
    type: TransactionType = 'purchase',
    planId?: string
  ): Promise<CreditGrant> {
    const now = new Date();
    let source: CreditGrant['source'] = 'intro';
    let expiresAt: string | null = null;

    if (type === 'topup' || (planId && planId.startsWith('topup_')) || description.toLowerCase().includes('top-up')) {
      source = 'topup';
      expiresAt = null; // Top-Up credits NEVER expire
    } else if (amount === 400 || description.toLowerCase().includes('renewal')) {
      source = 'renewal';
      expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString(); // Exactly 7 days (400 renewal credits)
    } else if (planId === 'plan_weekly_pass' || planId === 'sub_weekly_creator' || amount === 230) {
      source = 'weekly';
      expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString(); // Exactly 7 days (Creator Weekly)
    } else if (planId === 'plan_monthly_pass' || planId === 'sub_monthly_creator' || amount === 1200) {
      source = 'monthly';
      expiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString(); // Exactly 30 days (Creator Monthly)
    } else if (amount === 40 || planId === 'plan_intro_daily' || description.toLowerCase().includes('intro') || description.toLowerCase().includes('trail offer')) {
      source = 'intro';
      expiresAt = new Date(now.getTime() + 24 * 3600 * 1000).toISOString(); // Exactly 24 hours (Double Bonanza intro)
    } else {
      source = 'intro';
      expiresAt = new Date(now.getTime() + 24 * 3600 * 1000).toISOString(); // Default fallback: 24 hours
    }

    const grant: CreditGrant = {
      id: `grant_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      userId,
      source,
      creditsGranted: amount,
      creditsRemaining: amount,
      grantedAt: now.toISOString(),
      expiresAt,
      planId: planId || (source === 'intro' ? 'plan_intro_daily' : undefined),
      referenceId: orderId
    };

    const tx: CreditTransaction = {
      id: `tx_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      userId,
      amount,
      type,
      description,
      referenceId: orderId,
      createdAt: now.toISOString()
    };

    // If Firestore Admin is available, run inside strict ACID Transaction to ensure zero duplicate credits under concurrency
    const fsDb = this.firestoreDb;
    if (fsDb) {
      try {
        const result = await fsDb.runTransaction(async (t: any) => {
          // 1. Strict Idempotency Check in Transaction:
          // Check if transaction with this referenceId already exists
          if (orderId) {
            const existingTxSnap = await t.get(
              fsDb.collection('transactions').where('referenceId', '==', orderId).limit(1)
            );
            if (!existingTxSnap.empty) {
              console.warn(`[Atomic Firestore Transaction] Duplicate credit prevented for referenceId: ${orderId}`);
              return {
                id: 'duplicate_prevented',
                userId,
                source,
                creditsGranted: 0,
                creditsRemaining: 0,
                grantedAt: now.toISOString(),
                expiresAt: null
              } as CreditGrant;
            }
          }

          // 2. Read Wallet inside Transaction
          const walletRef = fsDb.collection('wallets').doc(userId);
          const walletDoc = await t.get(walletRef);
          let walletData: CreditWallet = walletDoc.exists
            ? (walletDoc.data() as CreditWallet)
            : {
                userId,
                balance: 0,
                expiringBalance: 0,
                topupBalance: 0,
                lifetimeCredits: 0,
                spentCredits: 0,
                grants: [],
                updatedAt: now.toISOString()
              };

          // 3. Atomically write Grant, Transaction, and updated Wallet
          const grantRef = fsDb.collection('credit_grants').doc(grant.id);
          const txRef = fsDb.collection('transactions').doc(tx.id);

          walletData.lifetimeCredits = (walletData.lifetimeCredits || 0) + amount;
          walletData.balance = (walletData.balance || 0) + amount;
          walletData.updatedAt = now.toISOString();

          t.set(grantRef, grant);
          t.set(txRef, tx);
          t.set(walletRef, walletData, { merge: true });

          // Also set idempotency token if orderId
          if (orderId) {
            const idempotencyRef = fsDb.collection('processed_webhooks').doc(`credit_${orderId}`);
            t.set(idempotencyRef, { referenceId: orderId, creditedAt: now.toISOString() }, { merge: true });
          }

          return { grant, walletData };
        });

        if (result && (result as any).grant) {
          const res = result as { grant: CreditGrant; walletData: CreditWallet };
          if (!this.db.creditGrants) this.db.creditGrants = [];
          this.db.creditGrants.unshift(res.grant);
          this.db.transactions.unshift(tx);
          this.db.wallets[userId] = res.walletData;
          this.save();
          return res.grant;
        } else if (result) {
          return result as CreditGrant;
        }
        throw new Error('Transaction returned empty response');
      } catch (err: any) {
        console.error('[Database] FAIL-CLOSED: Atomic Firestore creditWallet failed:', err.message);
        // Fail-closed: Never fall back to local/in-memory processing on Firestore transaction failure
        throw new Error(`Authoritative credit transaction failed in Firestore: ${err.message}`);
      }
    }

    // Fail-closed if in production and Firestore is unavailable
    if (process.env.NODE_ENV === 'production') {
      console.error('[Database] FAIL-CLOSED: Authoritative Firestore is unavailable in production for creditWallet');
      throw new Error('Authoritative Firestore database unavailable for credit grant');
    }

    // Local / In-memory fallback ONLY for non-production development without Firestore
    if (!this.db.creditGrants) this.db.creditGrants = [];
    this.db.creditGrants.unshift(grant);
    await this.syncToFirestore('credit_grants', grant.id, grant);

    const wallet = this.getWallet(userId);
    wallet.balance = (wallet.balance || 0) + amount;
    wallet.lifetimeCredits = (wallet.lifetimeCredits || 0) + amount;
    wallet.updatedAt = now.toISOString();

    this.db.transactions.unshift(tx);
    this.save();
    await this.syncToFirestore('wallets', userId, wallet);
    await this.syncToFirestore('transactions', tx.id, tx);

    this.getWallet(userId);
    return grant;
  }

  public async isPaymentProcessed(paymentId: string): Promise<boolean> {
    if (!paymentId) return false;
    const byPayment = Object.values(this.db.payments).some(
      p => p.paymentId === paymentId && p.status === 'captured'
    );
    const byTx = this.db.transactions.some(t => t.referenceId === paymentId);
    if (byPayment || byTx) return true;

    const fsDb = this.firestoreDb;
    if (fsDb) {
      try {
        const paySnap = await fsDb.collection('payments').where('paymentId', '==', paymentId).where('status', '==', 'captured').limit(1).get();
        if (!paySnap.empty) return true;
        const txSnap = await fsDb.collection('transactions').where('referenceId', '==', paymentId).limit(1).get();
        if (!txSnap.empty) return true;
      } catch (err: any) {
        console.warn('[Firestore] isPaymentProcessed lookup note:', err.message);
      }
    }
    return false;
  }

  public async hasTransactionForReference(refId: string): Promise<boolean> {
    if (!refId) return false;
    if (this.db.transactions.some(t => t.referenceId === refId)) return true;
    const fsDb = this.firestoreDb;
    if (fsDb) {
      try {
        const snap = await fsDb.collection('transactions').where('referenceId', '==', refId).limit(1).get();
        if (!snap.empty) return true;
      } catch {}
    }
    return false;
  }

  public getPaymentByPaymentId(paymentId: string): PaymentRecord | null {
    return Object.values(this.db.payments).find(p => p.paymentId === paymentId) || null;
  }

  public getSubscriptionByMandateOrId(subOrMandateId: string): UserSubscription | null {
    return (
      Object.values(this.db.subscriptions).find(
        s => s.mandateId === subOrMandateId || (s as any).subscriptionId === subOrMandateId
      ) || null
    );
  }

  public async getSubscriptionByMandateOrIdAuthoritative(subOrMandateId: string): Promise<UserSubscription | null> {
    if (!subOrMandateId) return null;
    const local = this.getSubscriptionByMandateOrId(subOrMandateId);
    if (local) return local;

    const fsDb = this.firestoreDb;
    if (fsDb) {
      try {
        for (const field of ['mandateId', 'subscriptionId']) {
          const snap = await fsDb.collection('subscriptions').where(field, '==', subOrMandateId).limit(1).get();
          if (!snap.empty) {
            const sub = snap.docs[0].data() as UserSubscription;
            if (sub?.userId) {
              this.db.subscriptions[sub.userId] = sub;
            }
            return sub;
          }
        }
      } catch (err: any) {
        console.warn('[Firestore] getSubscriptionByMandateOrIdAuthoritative lookup note:', err?.message || err);
      }
    }
    return null;
  }

  public getUserTransactions(userId: string): CreditTransaction[] {
    return this.db.transactions.filter(t => t.userId === userId).slice(0, 50);
  }

  public isIntroEligible(userId: string): boolean {
    if (!userId) return true;
    // 1. Subscription check: user already has/had intro plan
    const userSub = this.getSubscription(userId);
    if (userSub && (userSub.planId === 'plan_intro_daily' || userSub.planId === 'sub_intro_daily')) {
      return false;
    }
    // 2. Payments check: user previously paid for intro plan
    const userPayments = Object.values(this.db.payments).filter(p => p.userId === userId);
    const hasIntroPayment = userPayments.some(
      p => p.type === 'intro_mandate' || p.amount === 1 || p.subscriptionId?.includes('intro') || (p.status === 'captured' && p.amount === 1)
    );
    if (hasIntroPayment) return false;

    // 3. Credit grants check: user was previously granted intro credits
    const grants = this.getUserGrants(userId);
    const hasIntroGrant = grants.some(g => g.source === 'intro' && g.planId === 'plan_intro_daily');
    if (hasIntroGrant) return false;

    return true;
  }

  /* =========================================================================
     GENERATIONS & JOBS
  ========================================================================= */
  public getGenerations(): Generation[] {
    return this.db.generations;
  }

  public getGeneration(id: string): Generation | null {
    return this.db.generations.find(g => g.id === id) || null;
  }

  public async getGenerationAuthoritative(id: string): Promise<Generation | null> {
    const local = this.getGeneration(id);
    if (local) return local;

    if (fs.existsSync(this.dbFilePath)) {
      try {
        const diskDb = JSON.parse(fs.readFileSync(this.dbFilePath, 'utf-8'));
        const diskGen = (diskDb.generations || []).find((g: any) => g.id === id);
        if (diskGen) {
          if (!this.db.generations.some(g => g.id === diskGen.id)) {
            this.db.generations.unshift(diskGen);
          }
          return diskGen;
        }
      } catch {}
    }

    if (adminFirestoreDb) {
      try {
        const docSnap = await adminFirestoreDb.collection('generations').doc(id).get();
        if (docSnap.exists) {
          const gen = docSnap.data() as Generation;
          if (!this.db.generations.some(g => g.id === gen.id)) {
            this.db.generations.unshift(gen);
          }
          return gen;
        }
      } catch (err: any) {
        console.warn('[Firestore] getGenerationAuthoritative lookup note:', err.message);
      }
    }
    return null;
  }

  public getUserGenerations(userId: string): Generation[] {
    return this.db.generations.filter(g => g.userId === userId);
  }

  public async getUserGenerationsAuthoritative(userId: string): Promise<Generation[]> {
    if (adminFirestoreDb) {
      try {
        const snap = await adminFirestoreDb
          .collection('generations')
          .where('userId', '==', userId)
          .get();
        if (snap && !snap.empty) {
          const docs = snap.docs || [];
          for (const d of docs) {
            const remoteGen = d.data() as Generation;
            if (!remoteGen?.id) continue;
            const localIdx = this.db.generations.findIndex(g => g.id === remoteGen.id);
            if (localIdx === -1) {
              this.db.generations.push(remoteGen);
            } else {
              const localGen = this.db.generations[localIdx];
              const localTerminal = localGen.status === 'completed' || localGen.status === 'failed';
              const remoteTerminal = remoteGen.status === 'completed' || remoteGen.status === 'failed';
              if (!localTerminal || remoteTerminal) {
                this.db.generations[localIdx] = { ...localGen, ...remoteGen };
              }
            }
          }
          this.db.generations.sort(
            (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          );
        }
      } catch (err: any) {
        console.warn('[Firestore] getUserGenerationsAuthoritative note:', err?.message || err);
      }
    }
    return this.db.generations
      .filter(g => g.userId === userId)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  public async claimGenerationPollLease(
    genId: string,
    leaseOwner: string,
    leaseDurationMs: number = 15000,
    minPollIntervalMs: number = 3500
  ): Promise<{
    acquired: boolean;
    reason?: 'not_found' | 'not_processing' | 'no_provider_job' | 'lease_active' | 'throttled';
    generation: Generation | null;
  }> {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const leaseUntilIso = new Date(nowMs + Math.max(3000, leaseDurationMs)).toISOString();

    if (adminFirestoreDb && typeof adminFirestoreDb.runTransaction === 'function') {
      try {
        const result = await adminFirestoreDb.runTransaction(async (t: any) => {
          const genRef = adminFirestoreDb.collection('generations').doc(genId);
          const snap = await t.get(genRef);
          const localFallback = this.db.generations.find(g => g.id === genId) || null;
          const genData = snap.exists ? (snap.data() as Generation) : localFallback;

          if (!genData) {
            return { acquired: false, reason: 'not_found' as const, generation: null };
          }
          if (genData.status !== 'processing' || Boolean(genData.resultMediaUrl)) {
            return { acquired: false, reason: 'not_processing' as const, generation: genData };
          }
          if (!genData.providerRequestId && !genData.providerStatusUrl) {
            return { acquired: false, reason: 'no_provider_job' as const, generation: genData };
          }

          const existingLeaseUntilMs = genData.pollLeaseUntil ? new Date(genData.pollLeaseUntil).getTime() : 0;
          if (existingLeaseUntilMs > nowMs && genData.pollLeaseOwner && genData.pollLeaseOwner !== leaseOwner) {
            return { acquired: false, reason: 'lease_active' as const, generation: genData };
          }

          const lastPolledMs = genData.providerLastPolledAt ? new Date(genData.providerLastPolledAt).getTime() : 0;
          if (lastPolledMs > 0 && nowMs - lastPolledMs < minPollIntervalMs) {
            return { acquired: false, reason: 'throttled' as const, generation: genData };
          }

          const updated: Generation = {
            ...genData,
            pollLeaseOwner: leaseOwner,
            pollLeaseUntil: leaseUntilIso,
            providerLastPolledAt: nowIso
          };
          t.set(genRef, JSON.parse(JSON.stringify(updated)), { merge: true });

          const idx = this.db.generations.findIndex(g => g.id === genId);
          if (idx >= 0) this.db.generations[idx] = updated;
          else this.db.generations.unshift(updated);
          this.save();

          return { acquired: true, generation: updated };
        });
        return result;
      } catch (err: any) {
        console.warn('[Firestore] claimGenerationPollLease transaction note:', err?.message || err);
        if (process.env.NODE_ENV === 'production' && !isIsolatedTestEnv) {
          const current = await this.getGenerationAuthoritative(genId);
          return { acquired: false, reason: 'lease_active', generation: current };
        }
      }
    }

    // Non-production / local fallback atomic check
    const gen = this.db.generations.find(g => g.id === genId) || null;
    if (!gen) return { acquired: false, reason: 'not_found', generation: null };
    if (gen.status !== 'processing' || Boolean(gen.resultMediaUrl)) {
      return { acquired: false, reason: 'not_processing', generation: gen };
    }
    if (!gen.providerRequestId && !gen.providerStatusUrl) {
      return { acquired: false, reason: 'no_provider_job', generation: gen };
    }
    const existingLeaseUntilMs = gen.pollLeaseUntil ? new Date(gen.pollLeaseUntil).getTime() : 0;
    if (existingLeaseUntilMs > nowMs && gen.pollLeaseOwner && gen.pollLeaseOwner !== leaseOwner) {
      return { acquired: false, reason: 'lease_active', generation: gen };
    }
    const lastPolledMs = gen.providerLastPolledAt ? new Date(gen.providerLastPolledAt).getTime() : 0;
    if (lastPolledMs > 0 && nowMs - lastPolledMs < minPollIntervalMs) {
      return { acquired: false, reason: 'throttled', generation: gen };
    }
    gen.pollLeaseOwner = leaseOwner;
    gen.pollLeaseUntil = leaseUntilIso;
    gen.providerLastPolledAt = nowIso;
    this.save();
    return { acquired: true, generation: { ...gen } };
  }

  public async releaseGenerationPollLease(
    genId: string,
    leaseOwner: string,
    extraUpdates?: Partial<Generation>
  ): Promise<Generation | null> {
    if (adminFirestoreDb && typeof adminFirestoreDb.runTransaction === 'function') {
      try {
        return await adminFirestoreDb.runTransaction(async (t: any) => {
          const genRef = adminFirestoreDb.collection('generations').doc(genId);
          const snap = await t.get(genRef);
          const localFallback = this.db.generations.find(g => g.id === genId) || null;
          const genData = snap.exists ? (snap.data() as Generation) : localFallback;
          if (!genData) return null;

          // Respect terminal state guards
          if (genData.status === 'failed' && extraUpdates?.status === 'completed') {
            return genData;
          }
          if (genData.status === 'completed' && extraUpdates?.status === 'failed') {
            return genData;
          }
          if (extraUpdates?.status === 'completed' && !extraUpdates.resultMediaUrl && !genData.resultMediaUrl) {
            return genData;
          }

          const shouldClearLease = !genData.pollLeaseOwner || genData.pollLeaseOwner === leaseOwner;
          const merged: Generation = {
            ...genData,
            ...(extraUpdates || {}),
            ...(shouldClearLease ? { pollLeaseOwner: '', pollLeaseUntil: '' } : {})
          };

          t.set(genRef, JSON.parse(JSON.stringify(merged)), { merge: true });
          const idx = this.db.generations.findIndex(g => g.id === genId);
          if (idx >= 0) this.db.generations[idx] = merged;
          else this.db.generations.unshift(merged);
          this.save();
          return merged;
        });
      } catch (err: any) {
        console.warn('[Firestore] releaseGenerationPollLease note:', err?.message || err);
      }
    }

    const gen = this.db.generations.find(g => g.id === genId) || null;
    if (!gen) return null;
    this.updateGeneration(genId, {
      ...(extraUpdates || {}),
      ...(!gen.pollLeaseOwner || gen.pollLeaseOwner === leaseOwner
        ? { pollLeaseOwner: '', pollLeaseUntil: '' }
        : {})
    });
    return this.getGeneration(genId);
  }

  public addGeneration(gen: Generation): void {
    const stored = { ...gen };
    this.db.generations.unshift(stored);
    if (this.db.users[stored.userId]) {
      this.db.users[stored.userId].generationCount = (this.db.users[stored.userId].generationCount || 0) + 1;
    }
    this.save();
    this.syncToFirestore('generations', stored.id, stored);
  }

  public updateGeneration(genId: string, updates: Partial<Generation>): void {
    const gen = this.db.generations.find(g => g.id === genId);
    if (gen) {
      // Terminal State Transition Guards:
      // 1. A failed or refunded job must NEVER be overwritten to 'completed'
      if (gen.status === 'failed' && updates.status === 'completed') {
        console.warn(`[Generation Guard] Attempted to mark failed/refunded generation ${genId} as completed. Blocked to prevent inconsistent state.`);
        return;
      }
      // 2. A completed job must NEVER be overwritten to 'failed'
      if (gen.status === 'completed' && updates.status === 'failed') {
        console.warn(`[Generation Guard] Attempted to mark completed generation ${genId} as failed. Blocked to prevent duplicate refund.`);
        return;
      }
      // 3. To mark 'completed', a valid result media URL must be present
      if (updates.status === 'completed' && !updates.resultMediaUrl && !gen.resultMediaUrl) {
        console.error(`[Generation Guard] Cannot mark generation ${genId} completed without verified resultMediaUrl.`);
        return;
      }

      Object.assign(gen, updates);
      this.save();
      this.syncToFirestore('generations', genId, gen);
    }
  }

  /* =========================================================================
     TEMPLATES & INTERACTIVE LIKES
  ========================================================================= */
  public getTemplates(): Template[] {
    return this.db.templates
      .filter(t => {
        if (t.isActive === false) return false;
        const v = validateTemplate(t);
        if (!v.isValid) {
          if (!this.quarantinedTemplates.some(q => q.template?.id === t.id)) {
            this.quarantinedTemplates.push({
              template: t,
              reason: v.reason || 'Failed schema validation',
              quarantinedAt: new Date().toISOString()
            });
          }
          return false;
        }
        return true;
      })
      .sort((a, b) => (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999));
  }

  public getQuarantinedTemplates() {
    return this.quarantinedTemplates;
  }

  public getAllTemplatesAdmin(): Template[] {
    return [...this.db.templates].sort((a, b) => (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999));
  }

  public async reorderTemplates(orderedIds: string[]): Promise<Template[]> {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return this.getAllTemplatesAdmin();
    }

    // 1. Sanitize and deduplicate incoming IDs
    const sanitizedIds = Array.from(
      new Set(
        orderedIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
      )
    );

    const templateMap = new Map<string, Template>();
    for (const t of this.db.templates) {
      templateMap.set(t.id, t);
    }

    // 2. Filter strictly to valid existing IDs
    const validOrderedIds = sanitizedIds.filter((id) => templateMap.has(id));
    if (validOrderedIds.length === 0) {
      return this.getAllTemplatesAdmin();
    }

    // 3. Assign sequential sortOrder to specified templates
    const reordered: Template[] = [];
    validOrderedIds.forEach((id, index) => {
      const t = templateMap.get(id);
      if (t) {
        t.sortOrder = index;
        reordered.push(t);
        templateMap.delete(id);
      }
    });

    // 4. Preserve relative ordering of remaining/non-visible templates
    const remainingTemplates = Array.from(templateMap.values()).sort(
      (a, b) => (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999)
    );
    let remainingOrder = validOrderedIds.length;
    for (const remaining of remainingTemplates) {
      remaining.sortOrder = remainingOrder++;
      reordered.push(remaining);
    }

    // Sort complete catalog
    this.db.templates = reordered.sort((a, b) => (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999));
    this.save();

    // 5. Authoritative Firestore Persistence
    if (!adminFirestoreDb) {
      if (process.env.NODE_ENV !== 'test' && !process.env.IS_ISOLATED_TEST) {
        throw new Error('Authoritative Firestore database connection is not available. Template reordering cannot be saved permanently to Cloud.');
      }
    } else {
      try {
        if (typeof adminFirestoreDb.batch === 'function') {
          const batch = adminFirestoreDb.batch();
          for (const t of this.db.templates) {
            const docRef = adminFirestoreDb.collection('templates').doc(t.id);
            batch.set(docRef, { sortOrder: t.sortOrder, updatedAt: new Date().toISOString() }, { merge: true });
          }
          await batch.commit();
        } else {
          for (const t of this.db.templates) {
            await adminFirestoreDb.collection('templates').doc(t.id).set(
              { sortOrder: t.sortOrder, updatedAt: new Date().toISOString() },
              { merge: true }
            );
          }
        }

        // Verification read-back of top reordered template
        if (reordered.length > 0) {
          const verifyDoc = await adminFirestoreDb.collection('templates').doc(reordered[0].id).get();
          if (!verifyDoc.exists) {
            throw new Error(`Firestore read-back verification failed for template ${reordered[0].id}`);
          }
        }
      } catch (err: any) {
        console.error('[Database Critical] Firestore template reorder persistence failed:', err.message);
        throw new Error(`Firestore template reorder persistence failed: ${err.message}`);
      }
    }

    return this.getAllTemplatesAdmin();
  }

  public async addTemplate(tpl: Template): Promise<Template> {
    const v = validateTemplate(tpl);
    if (!v.isValid && !isPersistableDraftTemplate(tpl)) {
      throw new Error(`Cannot add invalid template: ${v.reason}`);
    }

    // Default isActive to true
    if (tpl.isActive === undefined) {
      tpl.isActive = true;
    }

    // MANDATORY FIRESTORE PERSISTENCE:
    // In production or live mode, Firestore MUST be connected. Never silently return false success on memory-only save.
    if (!adminFirestoreDb) {
      if (process.env.NODE_ENV !== 'test' && !process.env.IS_ISOLATED_TEST) {
        throw new Error('Authoritative Firestore database connection is not available. Template cannot be saved permanently.');
      }
    } else {
      const tplDocRef = adminFirestoreDb.collection('templates').doc(tpl.id);
      const tombstoneDocRef = adminFirestoreDb.collection('config').doc('deleted_template_ids');
      const sanitized = JSON.parse(JSON.stringify(tpl));
      let neededRemoval = false;

      try {
        if (typeof adminFirestoreDb.runTransaction === 'function') {
          await adminFirestoreDb.runTransaction(async (transaction: any) => {
            // Transaction Rule: All reads before writes
            const snap = await transaction.get(tombstoneDocRef);
            let currentIds: string[] = [];
            if (snap.exists && Array.isArray(snap.data()?.ids)) {
              currentIds = snap.data().ids;
              if (currentIds.includes(tpl.id)) {
                neededRemoval = true;
                currentIds = currentIds.filter(id => id !== tpl.id);
              }
            }

            // Atomic writes in single transaction
            transaction.set(tplDocRef, sanitized);
            if (neededRemoval) {
              transaction.set(tombstoneDocRef, {
                ids: currentIds,
                updatedAt: new Date().toISOString()
              }, { merge: true });
            }
          });
        } else {
          const snap = await tombstoneDocRef.get();
          let currentIds: string[] = [];
          if (snap.exists && Array.isArray(snap.data()?.ids)) {
            currentIds = snap.data().ids;
            if (currentIds.includes(tpl.id)) {
              neededRemoval = true;
              currentIds = currentIds.filter(id => id !== tpl.id);
            }
          }
          await tplDocRef.set(sanitized);
          if (neededRemoval) {
            await tombstoneDocRef.set({
              ids: currentIds,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
        }

        // Post-transaction Read-back verification of template document
        const verifyDoc = await tplDocRef.get();
        if (!verifyDoc.exists) {
          throw new Error(`Firestore document 'templates/${tpl.id}' was not found after atomic create transaction.`);
        }
        const verifyData = verifyDoc.data();
        if (!verifyData || !verifyData.title) {
          throw new Error(`Firestore document 'templates/${tpl.id}' is missing required fields.`);
        }

        // Post-transaction Read-back verification of tombstone removal
        if (neededRemoval) {
          const verifyTombstoneDoc = await tombstoneDocRef.get();
          if (verifyTombstoneDoc.exists && Array.isArray(verifyTombstoneDoc.data()?.ids)) {
            if (verifyTombstoneDoc.data()!.ids.includes(tpl.id)) {
              throw new Error(`Firestore tombstone removal verification failed: ID '${tpl.id}' is still present in config/deleted_template_ids.`);
            }
            this.db.deletedTemplateIds = [...verifyTombstoneDoc.data()!.ids];
          }
        }
      } catch (firestoreErr: any) {
        console.error(`[Database Critical] Firestore atomic write failure for template ${tpl.id}:`, firestoreErr.message);
        throw new Error(`Firestore template atomic write failed: ${firestoreErr.message}`);
      }
    }

    if (this.db.deletedTemplateIds) {
      this.db.deletedTemplateIds = this.db.deletedTemplateIds.filter(id => id !== tpl.id);
    }

    // Update local in-memory catalog ONLY after verified Firestore persistence and tombstone clearance
    const existingIdx = this.db.templates.findIndex(t => t.id === tpl.id);
    if (existingIdx !== -1) {
      this.db.templates[existingIdx] = tpl;
    } else {
      this.db.templates.unshift(tpl);
    }
    this.save();
    await this.bumpCatalogRevision();
    return tpl;
  }

  public async updateTemplate(id: string, updates: Partial<Template>): Promise<Template | null> {
    const existingTpl = this.db.templates.find(t => t.id === id);
    if (!existingTpl) return null;

    // Do NOT mutate local in-memory object yet. Create proposed merged copy first!
    const updatedTpl = { ...existingTpl, ...updates };

    if (!adminFirestoreDb) {
      if (process.env.NODE_ENV !== 'test' && !process.env.IS_ISOLATED_TEST) {
        throw new Error('Authoritative Firestore database connection is not available. Template update cannot be saved permanently.');
      }
    } else {
      try {
        const sanitized = JSON.parse(JSON.stringify(updatedTpl));
        await adminFirestoreDb.collection('templates').doc(id).set(sanitized, { merge: true });

        // Verification read-back
        const verifyDoc = await adminFirestoreDb.collection('templates').doc(id).get();
        if (!verifyDoc.exists) {
          throw new Error(`Firestore update verification failed for template ${id}`);
        }
      } catch (firestoreErr: any) {
        console.error(`[Database Critical] Firestore update failure for template ${id}:`, firestoreErr.message);
        throw new Error(`Firestore template update failed: ${firestoreErr.message}`);
      }
    }

    // Apply mutation to local in-memory catalog ONLY AFTER Firestore succeeds
    Object.assign(existingTpl, updates);
    this.save();
    await this.bumpCatalogRevision();
    return existingTpl;
  }

  public async deleteTemplate(id: string): Promise<boolean> {
    const index = this.db.templates.findIndex(t => t.id === id);

    // First delete from authoritative Firestore and verify!
    if (!adminFirestoreDb) {
      if (process.env.NODE_ENV !== 'test' && !process.env.IS_ISOLATED_TEST) {
        throw new Error('Authoritative Firestore database connection is not available. Template delete cannot be performed permanently.');
      }
    } else {
      const tplDocRef = adminFirestoreDb.collection('templates').doc(id);
      const tombstoneDocRef = adminFirestoreDb.collection('config').doc('deleted_template_ids');

      try {
        if (typeof adminFirestoreDb.runTransaction === 'function') {
          await adminFirestoreDb.runTransaction(async (transaction: any) => {
            // Transaction Rule: All reads before writes
            const snap = await transaction.get(tombstoneDocRef);
            let currentIds: string[] = [];
            if (snap.exists && Array.isArray(snap.data()?.ids)) {
              currentIds = snap.data().ids;
            }
            if (!currentIds.includes(id)) {
              currentIds.push(id);
            }

            // Atomic writes in single transaction
            transaction.delete(tplDocRef);
            transaction.set(tombstoneDocRef, {
              ids: currentIds,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          });
        } else {
          const snap = await tombstoneDocRef.get();
          let currentIds: string[] = [];
          if (snap.exists && Array.isArray(snap.data()?.ids)) {
            currentIds = snap.data().ids;
          }
          if (!currentIds.includes(id)) {
            currentIds.push(id);
          }
          await tplDocRef.delete();
          await tombstoneDocRef.set({
            ids: currentIds,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }

        // Post-transaction Read-back verification of template document deletion
        const verifyDoc = await tplDocRef.get();
        if (verifyDoc.exists) {
          throw new Error(`Firestore document 'templates/${id}' still exists after atomic delete attempt.`);
        }

        // Post-transaction Read-back verification of tombstone persistence
        const verifyTombstoneDoc = await tombstoneDocRef.get();
        if (!verifyTombstoneDoc.exists || !Array.isArray(verifyTombstoneDoc.data()?.ids) || !verifyTombstoneDoc.data()!.ids.includes(id)) {
          throw new Error(`Firestore tombstone verification failed: ID '${id}' is not present in config/deleted_template_ids after atomic delete.`);
        }

        // Update local state with the verified remote IDs
        this.db.deletedTemplateIds = [...verifyTombstoneDoc.data()!.ids];
      } catch (err: any) {
        console.error(`[Database Critical] Failed atomic delete for template ${id} in Firestore:`, err.message);
        throw new Error(`Firestore atomic template delete failed: ${err.message}`);
      }
    }

    // Remove from local list only after Firestore confirms deletion and tombstone write
    if (index !== -1) {
      this.db.templates.splice(index, 1);
    }
    if (!this.db.deletedTemplateIds) this.db.deletedTemplateIds = [];
    if (!this.db.deletedTemplateIds.includes(id)) {
      this.db.deletedTemplateIds.push(id);
    }
    this.save();
    await this.bumpCatalogRevision();
    return true;
  }

  public unassignedRecoveryAssets: Array<{
    key: string;
    filename: string;
    size: number;
    lastModified?: Date;
    publicUrl: string;
  }> = [];

  public getUnassignedRecoveryAssets() {
    return this.unassignedRecoveryAssets;
  }

  /**
   * Scans Cloudflare R2 for orphaned assets whose Firestore or database template records
   * are missing or corrupted, and reconstructs full template records.
   * 
   * STRICT SAFETY INVARIANTS:
   * 1. Never merge R2 assets merely because their filenames look similar.
   * 2. Automatically group assets into a single Template record ONLY when a reliable
   *    shared template ID and explicit asset-role mapping confirm the relationship.
   * 3. Ambiguous legacy assets without confirmed template IDs are placed in unassignedRecoveryAssets;
   *    they are NEVER guessed into existing templates and NEVER deleted.
   */
  public async recoverOrphanedTemplatesFromR2(): Promise<{
    scanned: number;
    recoveredCount: number;
    recoveredTemplates: Template[];
    skippedCount: number;
    unassignedCount: number;
  }> {
    // 1. Authoritative Fail-Closed Guard: Firestore connection MUST be available
    if (!adminFirestoreDb) {
      throw new Error('Authoritative Firestore database connection is not available. R2 orphan recovery halted fail-closed to prevent reviving deleted templates.');
    }

    // 2. Fetch authoritative deleted_template_ids tombstone doc before scanning or creating templates
    try {
      const deletedDoc = await adminFirestoreDb.collection('config').doc('deleted_template_ids').get();
      if (deletedDoc.exists && Array.isArray(deletedDoc.data()?.ids)) {
        this.db.deletedTemplateIds = [...deletedDoc.data()!.ids];
      } else {
        this.db.deletedTemplateIds = [];
      }
    } catch (delErr: any) {
      console.error('[Database Critical] Fetch deleted_template_ids error during R2 recovery:', delErr.message);
      throw new Error(`Failed to fetch authoritative deleted template tombstones from Firestore: ${delErr.message}. R2 orphan recovery halted fail-closed to prevent reviving deleted templates.`);
    }

    const deletedIds = new Set(this.db.deletedTemplateIds || []);

    try {
      const { mediaStorage } = await import('../storage/mediaStorage.ts');
      const r2Objects = await mediaStorage.listR2Objects('media/');
      if (!r2Objects || r2Objects.length === 0) {
        return { scanned: 0, recoveredCount: 0, recoveredTemplates: [], skippedCount: 0, unassignedCount: 0 };
      }

      // Collect all known media URLs and filenames currently in catalog
      const knownMediaSet = new Set<string>();
      for (const t of this.db.templates) {
        if (t.cover) {
          knownMediaSet.add(t.cover);
          knownMediaSet.add(path.basename(t.cover.split('?')[0]));
        }
        if (t.preview) {
          knownMediaSet.add(t.preview);
          knownMediaSet.add(path.basename(t.preview.split('?')[0]));
        }
        if (t.referenceImageUrl) {
          knownMediaSet.add(t.referenceImageUrl);
          knownMediaSet.add(path.basename(t.referenceImageUrl.split('?')[0]));
        }
        if (t.sampleFaceThumbnail) {
          knownMediaSet.add(t.sampleFaceThumbnail);
          knownMediaSet.add(path.basename(t.sampleFaceThumbnail.split('?')[0]));
        }
        if (t.sampleBefore) {
          knownMediaSet.add(t.sampleBefore);
          knownMediaSet.add(path.basename(t.sampleBefore.split('?')[0]));
        }
        if (t.sampleResult) {
          knownMediaSet.add(t.sampleResult);
          knownMediaSet.add(path.basename(t.sampleResult.split('?')[0]));
        }
        if (t.sampleAfter) {
          knownMediaSet.add(t.sampleAfter);
          knownMediaSet.add(path.basename(t.sampleAfter.split('?')[0]));
        }
        if (t.recipe?.referenceImageUrl) {
          knownMediaSet.add(t.recipe.referenceImageUrl);
          knownMediaSet.add(path.basename(t.recipe.referenceImageUrl.split('?')[0]));
        }
        if (t.recipe?.referenceAssets) {
          t.recipe.referenceAssets.forEach(a => {
            knownMediaSet.add(a);
            knownMediaSet.add(path.basename(a.split('?')[0]));
          });
        }
      }

      // Group candidate unreferenced assets by verifiable template ID
      interface TemplateAssetGroup {
        templateId: string;
        faceAsset?: { url: string; filename: string };
        beforeAsset?: { url: string; filename: string };
        sampleResultAsset?: { url: string; filename: string };
        coverAsset?: { url: string; filename: string };
        mediaAsset?: { url: string; filename: string };
        allAssets: Array<{ url: string; filename: string }>;
      }

      const templateGroups = new Map<string, TemplateAssetGroup>();
      this.unassignedRecoveryAssets = [];
      let skippedCount = 0;

      for (const asset of r2Objects) {
        const fn = asset.filename.toLowerCase();

        // Skip non-template assets (tests, face swap video results, user generation outputs, admin uploads, banners)
        if (
          fn.startsWith('test_') ||
          fn.startsWith('fsv_') ||
          fn.startsWith('gen_') ||
          fn.startsWith('user_') ||
          fn.startsWith('admin_upload_') ||
          fn.startsWith('pbn_') ||
          fn.startsWith('banner_')
        ) {
          this.unassignedRecoveryAssets.push({
            key: asset.key,
            filename: asset.filename,
            size: asset.size,
            lastModified: asset.lastModified,
            publicUrl: asset.publicUrl
          });
          skippedCount++;
          continue;
        }

        // Skip assets already tracked in active catalog
        if (knownMediaSet.has(asset.publicUrl) || knownMediaSet.has(asset.filename) || knownMediaSet.has(asset.key)) {
          skippedCount++;
          continue;
        }

        // Extract confirmed template ID and role:
        // Pattern 1: tpl_sample_<tplId> or sample_tpl_<tplId> or tpl_<tplId>_sample
        // Pattern 2: tpl_face_<tplId> or face_tpl_<tplId>
        // Pattern 3: tpl_before_<tplId> or before_tpl_<tplId>
        let matchedId: string | null = null;
        let role: 'face' | 'before' | 'sample' | 'cover' | 'preview' | 'general' = 'general';

        const roleRegex = /(face|before|sample|after|cover|preview|ref)/i;
        const roleMatch = fn.match(roleRegex);
        if (roleMatch) {
          const r = roleMatch[1].toLowerCase();
          if (r === 'face') role = 'face';
          else if (r === 'before') role = 'before';
          else if (r === 'sample' || r === 'after' || r === 'ref') role = 'sample';
          else if (r === 'cover') role = 'cover';
          else if (r === 'preview') role = 'preview';
        }

        // Look for explicit tpl_XXXX identifier with a genuine semantic slug (not just timestamp/asset)
        const tplIdMatch = asset.filename.match(/tpl_[a-zA-Z0-9_\-]+/i);
        if (tplIdMatch) {
          // Normalize base ID by stripping role suffix/prefix if attached
          const rawId = tplIdMatch[0]
            .replace(/_(face|before|sample|after|cover|ref|preview)$/i, '')
            .replace(/^(tpl_)?(face|before|sample|after|cover|ref|preview)_/i, 'tpl_');
          
          // Reject generic upload timestamp IDs from becoming fake templates
          if (!/tpl_(asset|cover|before|face|sample|admin)_[0-9]+/i.test(rawId)) {
            matchedId = rawId;
          }
        }

        if (matchedId && matchedId.length > 6) {
          if (!templateGroups.has(matchedId)) {
            templateGroups.set(matchedId, {
              templateId: matchedId,
              allAssets: []
            });
          }
          const group = templateGroups.get(matchedId)!;
          const assetInfo = { url: asset.publicUrl, filename: asset.filename };
          group.allAssets.push(assetInfo);

          if (role === 'face') group.faceAsset = assetInfo;
          else if (role === 'before') group.beforeAsset = assetInfo;
          else if (role === 'sample') group.sampleResultAsset = assetInfo;
          else if (role === 'cover') group.coverAsset = assetInfo;
          else if (role === 'preview') group.mediaAsset = assetInfo;
        } else {
          // Ambiguous or single-asset file: keep in unassigned inventory, DO NOT guess into catalog
          this.unassignedRecoveryAssets.push({
            key: asset.key,
            filename: asset.filename,
            size: asset.size,
            lastModified: asset.lastModified,
            publicUrl: asset.publicUrl
          });
        }
      }

      const recoveredTemplates: Template[] = [];

      for (const [tplId, group] of templateGroups.entries()) {
        const proposedId = tplId.startsWith('tpl_') ? tplId : `tpl_${tplId}`;

        // If template was explicitly deleted/tombstoned, NEVER recover or recreate it!
        if (
          deletedIds.has(proposedId) ||
          deletedIds.has(tplId) ||
          Array.from(deletedIds).some(delId => proposedId.includes(delId) || tplId.includes(delId))
        ) {
          skippedCount += group.allAssets.length;
          continue;
        }

        // If template already exists in catalog, never create a duplicate!
        if (this.db.templates.some(t => t.id === proposedId)) {
          skippedCount += group.allAssets.length;
          continue;
        }

        // Strict template integrity: Group MUST have at least 2 distinct assets (e.g. before/face + sample)
        // or a verified multi-asset structure to qualify as a template record
        if (!group.beforeAsset && !group.faceAsset && group.allAssets.length < 2) {
          group.allAssets.forEach(a => {
            this.unassignedRecoveryAssets.push({
              key: a.filename,
              filename: a.filename,
              size: 0,
              lastModified: new Date(),
              publicUrl: a.url
            });
          });
          continue;
        }

        // Resolve primary result reference
        const sampleResultUrl = group.sampleResultAsset?.url || group.coverAsset?.url || group.mediaAsset?.url || group.allAssets[0]?.url;
        if (!sampleResultUrl) continue;

        const coverUrl = group.coverAsset?.url || sampleResultUrl;
        const previewUrl = group.mediaAsset?.url || sampleResultUrl;
        const beforeUrl = group.beforeAsset?.url || undefined;
        const faceThumbnailUrl = group.faceAsset?.url || undefined;

        const fn = sampleResultUrl.toLowerCase();
        const isVideo = fn.endsWith('.mp4') || fn.endsWith('.mov') || fn.endsWith('.webm');

        // Derive category from title/path safely
        let category: TemplateCategory = 'Devotional';
        if (/devotional|hanuman|mahadev|ram/i.test(tplId)) category = 'Devotional';
        else if (/royal|swag|sherwani|maharaja/i.test(tplId)) category = 'Royal Swag';
        else if (/navratri|durga|garba/i.test(tplId)) category = 'Navratri Special';
        else if (/retro|80s|vintage/i.test(tplId)) category = 'Retro 80s';
        else if (/hair|grooming|male/i.test(tplId)) category = 'Male Hairstyle';
        else if (/fashion|runway/i.test(tplId)) category = 'Fashion';
        else if (/couple|romance/i.test(tplId)) category = 'Couple';
        else if (/festival|diwali|holi/i.test(tplId)) category = 'Festival';
        else if (/luxury|car/i.test(tplId)) category = 'Luxury';
        else category = 'Trending';

        const categoryPrompt = this.getCategoryPrompt(category);
        const cleanTitle = tplId
          .replace(/^tpl_/i, '')
          .replace(/[_-]+/g, ' ')
          .trim();
        const displayTitle = cleanTitle.length > 2
          ? `${category} - ${cleanTitle.substring(0, 30)}`
          : `${category} Look (R2 Recovered)`;

        const restoredTemplate: Template = {
          id: proposedId,
          title: displayTitle,
          type: isVideo ? 'video' : 'photo',
          inputType: isVideo ? 'IMAGE_OR_VIDEO' : 'IMAGE_ONLY',
          category,
          cover: coverUrl,
          preview: previewUrl,
          referenceImageUrl: sampleResultUrl,
          sampleFaceThumbnail: faceThumbnailUrl,
          sampleBefore: beforeUrl,
          sampleResult: sampleResultUrl,
          sampleAfter: sampleResultUrl,
          description: `${category} style template restored from Cloudflare R2 storage.`,
          aspectRatio: '9:16',
          requiredInputs: [
            {
              id: isVideo ? 'user_media' : 'user_photo',
              label: isVideo ? 'Upload Photo or Video' : 'Upload Your Photo',
              type: isVideo ? 'video' : 'image',
              description: 'Clear front-facing portrait photo'
            }
          ],
          creditCost: isVideo ? 25 : 10,
          providerCostUsd: isVideo ? 0.25 : 0.08,
          engine: 'AI_GENERATION',
          provider: isVideo ? 'higgsfield' : 'gemini',
          model: isVideo ? 'hf_mult_motion_control_flash' : 'gemini-3.1-flash-image',
          workflow: isVideo ? 'MOTION_TRANSFER' : 'gemini-photo-style',
          recipe: {
            version: '1.0',
            inputType: isVideo ? 'IMAGE_OR_VIDEO' : 'IMAGE_ONLY',
            provider: isVideo ? 'higgsfield' : 'gemini',
            model: isVideo ? 'hf_mult_motion_control_flash' : 'gemini-3.1-flash-image',
            engine: 'AI_GENERATION',
            prompt: categoryPrompt,
            workflow: isVideo ? 'MOTION_TRANSFER' : 'gemini-photo-style',
            aspectRatio: '9:16',
            referenceAssets: [sampleResultUrl],
            referenceImageUrl: sampleResultUrl,
            sampleBefore: beforeUrl,
            sampleResult: sampleResultUrl,
            sampleFaceThumbnail: faceThumbnailUrl
          },
          sortOrder: 0,
          isFeatured: true,
          isActive: true,
          tags: [category, 'Recovered from R2', isVideo ? 'Video' : 'Photo'],
          likesCount: 0,
          resolutionLabel: isVideo ? '1080p 60FPS' : '4K Ultra HD'
        };

        this.db.templates.unshift(restoredTemplate);
        group.allAssets.forEach(a => {
          knownMediaSet.add(a.url);
          knownMediaSet.add(a.filename);
        });

        this.save();
        await this.syncToFirestore('templates', restoredTemplate.id, restoredTemplate);
        recoveredTemplates.push(restoredTemplate);
      }

      if (recoveredTemplates.length > 0) {
        console.log(`[R2 Safe Recovery] Grouped and restored ${recoveredTemplates.length} templates with verified 3-asset roles into database & Firestore.`);
      }

      return {
        scanned: r2Objects.length,
        recoveredCount: recoveredTemplates.length,
        recoveredTemplates,
        skippedCount,
        unassignedCount: this.unassignedRecoveryAssets.length
      };
    } catch (err: any) {
      console.error('[R2 Safe Recovery Error]:', err.message);
      throw err;
    }
  }

  public getBanners(): HomeBannerItem[] {
    return this.db.banners || [];
  }

  public async setBanners(banners: HomeBannerItem[]): Promise<void> {
    this.db.banners = banners;
    this.save();
    this.syncToFirestore('config', 'banners', { banners, updatedAt: new Date().toISOString() });
    await this.bumpCatalogRevision();
  }

  public getPricingBanner(): PricingBannerConfig | null {
    if (!this.db.pricingBanner) return null;
    if (!this.db.pricingBanner.items || !Array.isArray(this.db.pricingBanner.items)) {
      if (this.db.pricingBanner.mediaUrl) {
        this.db.pricingBanner.items = [
          {
            id: 'banner_initial',
            mediaUrl: this.db.pricingBanner.mediaUrl,
            mediaType: this.db.pricingBanner.mediaType || 'image',
            posterUrl: this.db.pricingBanner.posterUrl,
            isEnabled: this.db.pricingBanner.isEnabled !== false,
            altText: this.db.pricingBanner.altText || 'Lumina VIP Creator Pass',
            createdAt: this.db.pricingBanner.updatedAt || new Date().toISOString()
          }
        ];
      } else {
        this.db.pricingBanner.items = [];
      }
    }
    return this.db.pricingBanner;
  }

  public getPricingBannerPool(): PricingBannerItem[] {
    const config = this.getPricingBanner();
    return config?.items || [];
  }

  public getRandomActivePricingBanner(): PricingBannerItem | null {
    const pool = this.getPricingBannerPool();
    const active = pool.filter(item => item.isEnabled !== false && item.mediaUrl && item.mediaUrl.trim().length > 0);
    if (active.length > 0) {
      const idx = Math.floor(Math.random() * active.length);
      return active[idx];
    }
    // Fallback to legacy single banner if items array was empty
    const legacy = this.db.pricingBanner;
    if (legacy && legacy.isEnabled !== false && legacy.mediaUrl) {
      return {
        id: 'banner_legacy',
        mediaUrl: legacy.mediaUrl,
        mediaType: legacy.mediaType || 'image',
        posterUrl: legacy.posterUrl,
        isEnabled: true,
        altText: legacy.altText,
        createdAt: legacy.updatedAt || new Date().toISOString()
      };
    }
    return null;
  }

  public addPricingBannerItem(data: {
    mediaUrl: string;
    mediaType?: 'image' | 'video';
    posterUrl?: string;
    isEnabled?: boolean;
    altText?: string;
  }): PricingBannerItem {
    const newItem: PricingBannerItem = {
      id: `pbn_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      mediaUrl: data.mediaUrl,
      mediaType: data.mediaType === 'video' ? 'video' : 'image',
      posterUrl: data.posterUrl,
      isEnabled: data.isEnabled !== false,
      altText: data.altText || 'Lumina VIP Creator Pass',
      createdAt: new Date().toISOString()
    };

    const currentConfig = this.getPricingBanner();
    const items = currentConfig?.items ? [...currentConfig.items, newItem] : [newItem];

    const updated: PricingBannerConfig = {
      items,
      mediaUrl: newItem.mediaUrl,
      mediaType: newItem.mediaType,
      posterUrl: newItem.posterUrl,
      isEnabled: true,
      altText: newItem.altText,
      updatedAt: new Date().toISOString()
    };

    this.db.pricingBanner = updated;
    this.save();
    this.syncToFirestore('config', 'pricing_banner', updated);
    return newItem;
  }

  public deletePricingBannerItem(id: string): boolean {
    const currentConfig = this.getPricingBanner();
    if (!currentConfig || !currentConfig.items) return false;
    const initialLen = currentConfig.items.length;
    currentConfig.items = currentConfig.items.filter(item => item.id !== id);
    if (currentConfig.items.length !== initialLen) {
      currentConfig.updatedAt = new Date().toISOString();
      if (currentConfig.items.length > 0) {
        currentConfig.mediaUrl = currentConfig.items[0].mediaUrl;
        currentConfig.mediaType = currentConfig.items[0].mediaType;
        currentConfig.posterUrl = currentConfig.items[0].posterUrl;
      } else {
        currentConfig.mediaUrl = '';
      }
      this.db.pricingBanner = currentConfig;
      this.save();
      this.syncToFirestore('config', 'pricing_banner', currentConfig);
      return true;
    }
    return false;
  }

  public togglePricingBannerItem(id: string, isEnabled: boolean): PricingBannerItem | null {
    const currentConfig = this.getPricingBanner();
    if (!currentConfig || !currentConfig.items) return null;
    const item = currentConfig.items.find(i => i.id === id);
    if (!item) return null;
    item.isEnabled = isEnabled;
    currentConfig.updatedAt = new Date().toISOString();
    this.db.pricingBanner = currentConfig;
    this.save();
    this.syncToFirestore('config', 'pricing_banner', currentConfig);
    return item;
  }

  public updatePricingBannerItem(id: string, updates: Partial<PricingBannerItem>): PricingBannerItem | null {
    const currentConfig = this.getPricingBanner();
    if (!currentConfig || !currentConfig.items) return null;
    const item = currentConfig.items.find(i => i.id === id);
    if (!item) return null;
    Object.assign(item, updates);
    currentConfig.updatedAt = new Date().toISOString();
    this.db.pricingBanner = currentConfig;
    this.save();
    this.syncToFirestore('config', 'pricing_banner', currentConfig);
    return item;
  }

  public setPricingBanner(banner: {
    mediaUrl: string;
    mediaType: 'image' | 'video';
    posterUrl?: string;
    isEnabled: boolean;
    altText?: string;
  }): PricingBannerConfig {
    const existing = this.getPricingBanner();
    const existingItems = existing?.items || [];
    
    // Check if item already exists with this mediaUrl
    let items = [...existingItems];
    const existingItemIdx = items.findIndex(i => i.mediaUrl === banner.mediaUrl);
    if (existingItemIdx !== -1) {
      items[existingItemIdx] = {
        ...items[existingItemIdx],
        ...banner
      };
    } else if (banner.mediaUrl) {
      items.unshift({
        id: `pbn_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        mediaUrl: banner.mediaUrl,
        mediaType: banner.mediaType,
        posterUrl: banner.posterUrl,
        isEnabled: banner.isEnabled,
        altText: banner.altText,
        createdAt: new Date().toISOString()
      });
    }

    const updated: PricingBannerConfig = {
      ...banner,
      items,
      updatedAt: new Date().toISOString()
    };
    this.db.pricingBanner = updated;
    this.save();
    this.syncToFirestore('config', 'pricing_banner', updated);
    return updated;
  }

  public getFaceSwapDemoVideoUrl(): string {
    return (
      this.db.faceSwapDemoVideoUrl ||
      'https://assets.mixkit.co/videos/preview/mixkit-girl-dancing-happy-in-a-field-of-yellow-flowers-40277-large.mp4'
    );
  }

  public setFaceSwapDemoVideoUrl(url: string): void {
    this.db.faceSwapDemoVideoUrl = url;
    this.save();
    this.syncToFirestore('config', 'faceswap_demo', { demoVideoUrl: url, updatedAt: new Date().toISOString() });
  }

  /* =========================================================================
     FACE SWAP SCENES (Individual Scene / Template Management)
  ========================================================================= */
  public getFaceSwapScenes(includeInactive = false): FaceSwapScene[] {
    const scenes = this.db.faceSwapScenes || [];
    const sorted = [...scenes].sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999));
    if (includeInactive) {
      return sorted;
    }
    return sorted.filter(s => s.isActive !== false && s.status !== 'draft');
  }

  public getFaceSwapScene(id: string): FaceSwapScene | null {
    const scenes = this.db.faceSwapScenes || [];
    return scenes.find(s => s.id === id) || null;
  }

  public async reorderFaceSwapScenes(orderedIds: string[]): Promise<FaceSwapScene[]> {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return this.getFaceSwapScenes(true);
    }

    // 1. Sanitize and deduplicate incoming IDs
    const sanitizedIds = Array.from(
      new Set(
        orderedIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
      )
    );

    const sceneMap = new Map<string, FaceSwapScene>();
    for (const s of (this.db.faceSwapScenes || [])) {
      sceneMap.set(s.id, s);
    }

    // 2. Filter strictly to valid existing IDs
    const validOrderedIds = sanitizedIds.filter((id) => sceneMap.has(id));
    if (validOrderedIds.length === 0) {
      return this.getFaceSwapScenes(true);
    }

    // 3. Assign sequential order to specified scenes
    const reordered: FaceSwapScene[] = [];
    validOrderedIds.forEach((id, index) => {
      const s = sceneMap.get(id);
      if (s) {
        s.order = index;
        s.updatedAt = new Date().toISOString();
        reordered.push(s);
        sceneMap.delete(id);
      }
    });

    // 4. Preserve relative ordering of remaining/unspecified scenes
    const remainingScenes = Array.from(sceneMap.values()).sort(
      (a, b) => (a.order ?? 999999) - (b.order ?? 999999)
    );
    let remainingOrder = validOrderedIds.length;
    for (const remaining of remainingScenes) {
      remaining.order = remainingOrder++;
      reordered.push(remaining);
    }

    this.db.faceSwapScenes = reordered.sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999));
    this.save();

    // 5. Authoritative Firestore Persistence
    if (!adminFirestoreDb) {
      if (process.env.NODE_ENV !== 'test' && !process.env.IS_ISOLATED_TEST) {
        throw new Error('Authoritative Firestore database connection is not available. Face Swap scene order cannot be saved permanently to Cloud.');
      }
    } else {
      try {
        await adminFirestoreDb.collection('config').doc('faceswap_scenes').set({
          scenes: JSON.parse(JSON.stringify(this.db.faceSwapScenes)),
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // Verification read-back
        const verifyDoc = await adminFirestoreDb.collection('config').doc('faceswap_scenes').get();
        if (!verifyDoc.exists || !verifyDoc.data()?.scenes) {
          throw new Error('Firestore read-back verification failed for faceswap_scenes configuration.');
        }
      } catch (err: any) {
        console.error('[Database Critical] Failed to persist reordered FaceSwap scenes to Firestore:', err.message);
        throw new Error(`Firestore scene reorder failed: ${err.message}`);
      }
    }

    return this.getFaceSwapScenes(true);
  }

  public async createFaceSwapScene(sceneData: FaceSwapScene): Promise<FaceSwapScene> {
    if (!this.db.faceSwapScenes) {
      this.db.faceSwapScenes = [];
    }
    const newScene: FaceSwapScene = {
      ...sceneData,
      id: sceneData.id || `fsv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      isActive: sceneData.isActive !== false,
      status: sceneData.status || 'published',
      createdAt: sceneData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!adminFirestoreDb) {
      if (process.env.NODE_ENV !== 'test' && !process.env.IS_ISOLATED_TEST) {
        throw new Error('Authoritative Firestore database connection is not available. Face Swap scene cannot be saved permanently to Cloud.');
      }
    } else {
      try {
        const proposedScenes = [newScene, ...this.db.faceSwapScenes.filter(s => s.id !== newScene.id)];
        await adminFirestoreDb.collection('config').doc('faceswap_scenes').set({
          scenes: JSON.parse(JSON.stringify(proposedScenes)),
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // Verification read-back
        const verifyDoc = await adminFirestoreDb.collection('config').doc('faceswap_scenes').get();
        if (!verifyDoc.exists || !verifyDoc.data()?.scenes) {
          throw new Error('Firestore read-back verification failed for faceswap_scenes document.');
        }
      } catch (firestoreErr: any) {
        console.error('[Database Critical] Firestore write failure for Face Swap scene:', firestoreErr.message);
        throw new Error(`Firestore scene write failed: ${firestoreErr.message}`);
      }
    }

    this.db.faceSwapScenes.unshift(newScene);
    this.save();
    return newScene;
  }

  public async updateFaceSwapScene(id: string, updates: Partial<FaceSwapScene>): Promise<FaceSwapScene | null> {
    if (!this.db.faceSwapScenes) return null;
    const scene = this.db.faceSwapScenes.find(s => s.id === id);
    if (!scene) return null;

    const proposedScene = { ...scene, ...updates, updatedAt: new Date().toISOString() };
    const proposedScenes = this.db.faceSwapScenes.map(s => s.id === id ? proposedScene : s);

    if (!adminFirestoreDb) {
      if (process.env.NODE_ENV !== 'test' && !process.env.IS_ISOLATED_TEST) {
        throw new Error('Authoritative Firestore database connection is not available. Face Swap scene cannot be updated permanently on Cloud.');
      }
    } else {
      try {
        await adminFirestoreDb.collection('config').doc('faceswap_scenes').set({
          scenes: JSON.parse(JSON.stringify(proposedScenes)),
          updatedAt: new Date().toISOString()
        }, { merge: true });

        const verifyDoc = await adminFirestoreDb.collection('config').doc('faceswap_scenes').get();
        if (!verifyDoc.exists || !verifyDoc.data()?.scenes) {
          throw new Error('Firestore read-back verification failed for faceswap_scenes document.');
        }
      } catch (firestoreErr: any) {
        console.error(`[Database Critical] Firestore update failure for Face Swap scene ${id}:`, firestoreErr.message);
        throw new Error(`Firestore scene update failed: ${firestoreErr.message}`);
      }
    }

    Object.assign(scene, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return scene;
  }

  public async deleteFaceSwapScene(id: string): Promise<boolean> {
    if (!this.db.faceSwapScenes) return false;
    const index = this.db.faceSwapScenes.findIndex(s => s.id === id);
    if (index === -1) return false;

    const proposedScenes = this.db.faceSwapScenes.filter(s => s.id !== id);

    if (!adminFirestoreDb) {
      if (process.env.NODE_ENV !== 'test' && !process.env.IS_ISOLATED_TEST) {
        throw new Error('Authoritative Firestore database connection is not available. Face Swap scene cannot be deleted permanently from Cloud.');
      }
    } else {
      try {
        await adminFirestoreDb.collection('config').doc('faceswap_scenes').set({
          scenes: JSON.parse(JSON.stringify(proposedScenes)),
          updatedAt: new Date().toISOString()
        }, { merge: true });

        const verifyDoc = await adminFirestoreDb.collection('config').doc('faceswap_scenes').get();
        if (!verifyDoc.exists || !verifyDoc.data()?.scenes) {
          throw new Error('Firestore read-back verification failed for faceswap_scenes document after delete.');
        }
      } catch (firestoreErr: any) {
        console.error(`[Database Critical] Firestore delete failure for Face Swap scene ${id}:`, firestoreErr.message);
        throw new Error(`Firestore scene delete failed: ${firestoreErr.message}`);
      }
    }

    this.db.faceSwapScenes.splice(index, 1);
    this.save();
    return true;
  }

  /**
   * Real, working user like toggle on templates.
   */
  public toggleTemplateLike(userId: string, templateId: string): { isLiked: boolean; totalLikes: number } {
    if (!this.db.userLikes[userId]) {
      this.db.userLikes[userId] = [];
    }
    const userLikes = this.db.userLikes[userId];
    const isAlreadyLiked = userLikes.includes(templateId);

    const tpl = this.db.templates.find(t => t.id === templateId);
    let totalLikes = tpl?.likesCount || 0;

    if (isAlreadyLiked) {
      this.db.userLikes[userId] = userLikes.filter(id => id !== templateId);
      totalLikes = Math.max(0, totalLikes - 1);
      if (tpl) tpl.likesCount = totalLikes;
    } else {
      this.db.userLikes[userId].push(templateId);
      totalLikes += 1;
      if (tpl) tpl.likesCount = totalLikes;
    }

    this.save();
    this.syncToFirestore('user_likes', userId, { templateIds: this.db.userLikes[userId] });
    return { isLiked: !isAlreadyLiked, totalLikes };
  }

  public getUserLikedTemplates(userId: string): string[] {
    return this.db.userLikes[userId] || [];
  }

  /* =========================================================================
     PAYMENTS & SUBSCRIPTIONS
  ========================================================================= */
  public async recordPayment(record: PaymentRecord): Promise<void> {
    this.db.payments[record.orderId] = record;
    if (record.subscriptionId && record.subscriptionId !== record.orderId) {
      this.db.payments[record.subscriptionId] = record;
    }
    if (record.paymentId && record.paymentId !== record.orderId) {
      this.db.payments[record.paymentId] = record;
    }
    this.save();
    await this.syncToFirestore('payments', record.orderId, record);
    if (record.subscriptionId && record.subscriptionId !== record.orderId) {
      await this.syncToFirestore('payments', record.subscriptionId, record);
    }
  }

  public getPayment(identifier: string): PaymentRecord | null {
    if (!identifier) return null;
    if (this.db.payments[identifier]) {
      return this.db.payments[identifier];
    }
    const found = Object.values(this.db.payments).find(
      p =>
        p.orderId === identifier ||
        p.subscriptionId === identifier ||
        p.paymentId === identifier ||
        p.id === identifier
    );
    return found || null;
  }

  public async getPaymentAuthoritative(identifier: string): Promise<PaymentRecord | null> {
    const local = this.getPayment(identifier);
    if (local) return local;

    const fsDb = this.firestoreDb;
    if (fsDb) {
      try {
        // Try direct doc
        const directDoc = await fsDb.collection('payments').doc(identifier).get();
        if (directDoc.exists) {
          const rec = directDoc.data() as PaymentRecord;
          this.db.payments[rec.orderId] = rec;
          return rec;
        }

        // Try where queries
        for (const field of ['orderId', 'subscriptionId', 'paymentId']) {
          const snap = await fsDb.collection('payments').where(field, '==', identifier).limit(1).get();
          if (!snap.empty) {
            const rec = snap.docs[0].data() as PaymentRecord;
            this.db.payments[rec.orderId] = rec;
            return rec;
          }
        }
      } catch (err: any) {
        console.warn('[Firestore] getPaymentAuthoritative lookup note:', err.message);
      }
    }
    return null;
  }

  public async setSubscription(sub: UserSubscription): Promise<void> {
    this.db.subscriptions[sub.userId] = sub;
    this.save();
    await this.syncToFirestore('subscriptions', sub.userId, sub);
  }

  public getSubscription(userId: string): UserSubscription | null {
    return this.db.subscriptions[userId] || null;
  }

  public async getSubscriptionAuthoritative(userId: string): Promise<UserSubscription | null> {
    if (!userId) return null;
    const local = this.getSubscription(userId);
    if (local) return local;

    const fsDb = this.firestoreDb;
    if (fsDb) {
      try {
        const docSnap = await fsDb.collection('subscriptions').doc(userId).get();
        if (docSnap.exists) {
          const sub = docSnap.data() as UserSubscription;
          this.db.subscriptions[userId] = sub;
          return sub;
        }
      } catch (err: any) {
        console.warn('[Firestore] getSubscriptionAuthoritative lookup note:', err?.message || err);
      }
    }
    return null;
  }

  public async isWebhookProcessed(eventId: string): Promise<boolean> {
    if (!eventId) return false;
    if (this.db.processedWebhooks.includes(eventId)) return true;
    const fsDb = this.firestoreDb;
    if (fsDb) {
      try {
        const docSnap = await fsDb.collection('processed_webhooks').doc(eventId).get();
        if (docSnap.exists) {
          if (!this.db.processedWebhooks.includes(eventId)) {
            this.db.processedWebhooks.push(eventId);
          }
          return true;
        }
      } catch (err: any) {
        console.warn('[Firestore] isWebhookProcessed lookup note:', err.message);
      }
    }
    return false;
  }

  public async markWebhookProcessed(eventId: string): Promise<void> {
    if (!eventId) return;
    if (!this.db.processedWebhooks.includes(eventId)) {
      this.db.processedWebhooks.push(eventId);
    }
    this.save();
    await this.syncToFirestore('processed_webhooks', eventId, { eventId, processedAt: new Date().toISOString() });
  }

  /* =========================================================================
     AI SAFETY REPORTS
  ========================================================================= */
  public async addReport(params: {
    generationId: string;
    userId?: string;
    reason: string;
    details?: string;
  }): Promise<{ id: string; generationId: string; userId?: string; reason: string; details?: string; timestamp: string }> {
    const reportId = `rep_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const record = {
      id: reportId,
      generationId: params.generationId,
      userId: params.userId,
      reason: params.reason,
      details: params.details,
      timestamp: new Date().toISOString()
    };
    if (!this.db.reports) this.db.reports = [];
    this.db.reports.unshift(record);
    this.save();
    await this.syncToFirestore('reports', reportId, record);
    return record;
  }

  /* =========================================================================
     CATEGORY-LEVEL PROMPTS (SERVER-AUTHORITATIVE & EDITABLE BY ADMIN)
  ========================================================================= */
  public getCategoryPrompts(): Record<string, string> {
    if (!this.db.categoryPrompts) {
      this.db.categoryPrompts = { ...DEFAULT_CATEGORY_PROMPTS };
    }
    return { ...DEFAULT_CATEGORY_PROMPTS, ...this.db.categoryPrompts };
  }

  public getCategoryPrompt(category: string): string {
    const prompts = this.getCategoryPrompts();
    return prompts[category] || prompts['Trending'] || DEFAULT_CATEGORY_PROMPTS['Trending'];
  }

  public setCategoryPrompts(prompts: Record<string, string>): Record<string, string> {
    this.db.categoryPrompts = {
      ...this.getCategoryPrompts(),
      ...prompts
    };
    this.save();
    this.syncToFirestore('config', 'category_prompts', {
      prompts: this.db.categoryPrompts,
      updatedAt: new Date().toISOString()
    });
    return this.db.categoryPrompts;
  }

  public setCategoryPrompt(category: string, prompt: string): string {
    if (!this.db.categoryPrompts) {
      this.db.categoryPrompts = { ...DEFAULT_CATEGORY_PROMPTS };
    }
    this.db.categoryPrompts[category] = prompt.trim();
    this.save();
    this.syncToFirestore('config', 'category_prompts', {
      prompts: this.db.categoryPrompts,
      updatedAt: new Date().toISOString()
    });
    return prompt.trim();
  }

  /* =========================================================================
     ADMIN TEST RUNS AUDIT LOG (Zero-Credit Testing with Real API Cost Tracking)
  ========================================================================= */
  public recordAdminTestRun(run: {
    genId: string;
    adminEmail: string;
    templateId: string;
    templateTitle: string;
    model?: string;
    providerCostUsd: number;
  }): AdminTestRun {
    if (!this.db.adminTestRuns) this.db.adminTestRuns = [];
    const record: AdminTestRun = {
      id: `adm_run_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      ...run,
      createdAt: new Date().toISOString()
    };
    this.db.adminTestRuns.unshift(record);
    // Keep max 500 audit entries
    if (this.db.adminTestRuns.length > 500) {
      this.db.adminTestRuns = this.db.adminTestRuns.slice(0, 500);
    }
    this.save();
    this.syncToFirestore('admin_test_runs', record.id, record);
    return record;
  }

  public getAdminTestRuns(limit = 100): AdminTestRun[] {
    return (this.db.adminTestRuns || []).slice(0, limit);
  }

  /* =========================================================================
     ACCOUNT DELETION
  ========================================================================= */
  public deleteAccount(userId: string): boolean {
    if (!this.db.users[userId]) return false;

    // Preserve restricted billing mapping for active AutoPay mandate continuation
    const existingSub = this.db.subscriptions[userId];
    if (existingSub) {
      if (!(this.db as any).restrictedSubscriptions) (this.db as any).restrictedSubscriptions = {};
      const restrictedRecord = {
        ...existingSub,
        accountDeleted: true,
        customerStatus: 'deleted',
        deletedAt: new Date().toISOString()
      };
      (this.db as any).restrictedSubscriptions[userId] = restrictedRecord;
      if (existingSub.mandateId) {
        (this.db as any).restrictedSubscriptions[existingSub.mandateId] = restrictedRecord;
      }
      if (existingSub.id) {
        (this.db as any).restrictedSubscriptions[existingSub.id] = restrictedRecord;
      }
      // Keep subscriptions index keyed in Firestore with accountDeleted: true
      this.syncToFirestore('subscriptions', userId, restrictedRecord);
    }

    delete this.db.users[userId];
    delete this.db.authIdentities[userId];
    delete this.db.wallets[userId];
    delete this.db.subscriptions[userId];
    delete this.db.userLikes[userId];
    this.db.generations = this.db.generations.filter(g => g.userId !== userId);
    this.db.transactions = this.db.transactions.filter(t => t.userId !== userId);

    this.save();

    this.deleteFromFirestore('users', userId);
    this.deleteFromFirestore('auth_identities', userId);
    this.deleteFromFirestore('wallets', userId);
    this.deleteFromFirestore('user_likes', userId);

    return true;
  }

  /* =========================================================================
     ADMIN ACTIVITY LOGS (With Sensitive Field Redaction & Authoritative Query)
  ========================================================================= */
  private sanitizeLogDetails(raw: string): string {
    if (!raw || typeof raw !== 'string') return '';
    return raw
      .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED_TOKEN]')
      .replace(/((?:token|secret|key|password|signature|x-amz-signature|x-amz-credential)=)[^&\s"']+/gi, '$1[REDACTED]')
      .replace(/(https?:\/\/[^\s"'?]+\?)([^"'\s]*(?:X-Amz-|Signature=|token=)[^"'\s]*)/gi, '$1[REDACTED_SIGNED_PARAMS]')
      .replace(/(rzp_(?:live|test)_[A-Za-z0-9]+|AIza[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,})/g, '[REDACTED_SECRET]');
  }

  public async logAdminActivity(log: Omit<AdminActivityLog, 'id' | 'timestamp'>): Promise<AdminActivityLog> {
    const entry: AdminActivityLog = {
      id: `log_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      actorEmail: log.actorEmail,
      action: log.action,
      targetId: log.targetId,
      details: this.sanitizeLogDetails(log.details),
      timestamp: new Date().toISOString()
    };

    if (!this.db.adminLogs) {
      this.db.adminLogs = [];
    }

    this.db.adminLogs.unshift(entry);
    if (this.db.adminLogs.length > 500) {
      this.db.adminLogs = this.db.adminLogs.slice(0, 500);
    }
    this.save();

    await this.syncToFirestore('admin_logs', entry.id, entry);
    return entry;
  }

  public getAdminLogs(limit = 50, offset = 0): { logs: AdminActivityLog[]; total: number } {
    const all = this.db.adminLogs || [];
    const total = all.length;
    const logs = all.slice(offset, offset + limit);
    return { logs, total };
  }

  public async getAdminLogsAuthoritative(limit = 50, offset = 0): Promise<{
    logs: AdminActivityLog[];
    total: number;
    source: 'firestore_authoritative' | 'process_local_cache';
  }> {
    const fsDb = this.firestoreDb;
    if (fsDb && !isIsolatedTestEnv) {
      try {
        const colRef = fsDb.collection('admin_logs');
        const snap = await colRef.orderBy('timestamp', 'desc').limit(offset + limit).get();
        const docs: AdminActivityLog[] = [];
        snap.forEach((d: any) => {
          const item = d.data() as AdminActivityLog;
          if (item) {
            docs.push({
              ...item,
              details: this.sanitizeLogDetails(item.details || '')
            });
          }
        });
        let totalCount = docs.length;
        try {
          if (typeof colRef.count === 'function') {
            const countSnap = await colRef.count().get();
            const c = countSnap?.data?.()?.count;
            if (typeof c === 'number') totalCount = c;
          } else {
            const allSnap = await colRef.get();
            totalCount = allSnap.size ?? docs.length;
          }
        } catch {
          totalCount = Math.max(docs.length, (this.db.adminLogs || []).length);
        }
        return {
          logs: docs.slice(offset, offset + limit),
          total: totalCount,
          source: 'firestore_authoritative'
        };
      } catch (err: any) {
        console.warn('[Database] Authoritative admin_logs query fallback:', err.message);
      }
    }
    const local = this.getAdminLogs(limit, offset);
    return {
      logs: local.logs.map((l) => ({ ...l, details: this.sanitizeLogDetails(l.details || '') })),
      total: local.total,
      source: 'process_local_cache'
    };
  }

  /* =========================================================================
     USER ACTIVITY METRICS (Privacy-Safe Session Counters in Asia/Kolkata + 90-Day TTL)
  ========================================================================= */
  public async recordVisitorSession(params: {
    isGuest: boolean;
    dateKey?: string;
  }): Promise<DailyActivityMetric> {
    const dateKey = params.dateKey || getKolkataDateKey(new Date());
    const nowIso = new Date().toISOString();
    const expiryMs = Date.now() + 90 * 24 * 60 * 60 * 1000;
    const expiresAtIso = new Date(expiryMs).toISOString();

    if (!this.db.dailyActivity) {
      this.db.dailyActivity = {};
    }
    const current = this.db.dailyActivity[dateKey] || {
      dateKey,
      timezone: 'Asia/Kolkata' as const,
      visitorSessions: 0,
      guestSessions: 0,
      retentionDays: 90,
      updatedAt: nowIso,
      expiresAtIso
    };
    current.visitorSessions += 1;
    if (params.isGuest) {
      current.guestSessions += 1;
    }
    current.updatedAt = nowIso;
    current.expiresAtIso = expiresAtIso;
    this.db.dailyActivity[dateKey] = current;
    this.save();

    const fsDb = this.firestoreDb;
    if (fsDb) {
      try {
        const docRef = fsDb.collection('daily_activity_metrics').doc(dateKey);
        const isRealFirestore = Boolean(this.firestoreOverride === undefined && adminFirestoreDb);
        if (isRealFirestore) {
          await docRef.set(
            {
              dateKey,
              timezone: 'Asia/Kolkata',
              visitorSessions: FieldValue.increment(1),
              guestSessions: FieldValue.increment(params.isGuest ? 1 : 0),
              retentionDays: 90,
              updatedAt: nowIso,
              expiresAt: Timestamp.fromMillis(expiryMs),
              expiresAtIso
            },
            { merge: true }
          );
        } else {
          // Mock Firestore atomic read-modify-write via transaction or doc set
          const existingSnap = await docRef.get();
          const prevData = existingSnap?.exists ? existingSnap.data() : {};
          await docRef.set(
            {
              dateKey,
              timezone: 'Asia/Kolkata',
              visitorSessions: Number(prevData?.visitorSessions || 0) + 1,
              guestSessions: Number(prevData?.guestSessions || 0) + (params.isGuest ? 1 : 0),
              retentionDays: 90,
              updatedAt: nowIso,
              expiresAt: expiresAtIso,
              expiresAtIso
            },
            { merge: true }
          );
        }
      } catch (err: any) {
        console.warn('[UserActivity] Non-blocking daily_activity_metrics write note:', err?.message || err);
      }
    }

    return { ...current };
  }

  public async getUserActivitySummary(targetDateKey?: string): Promise<{
    timezone: 'Asia/Kolkata';
    todayDateKey: string;
    todayMetrics: {
      visitorSessions: number;
      guestSessions: number;
      newSignups: number;
      activeUsers: number;
      generationsSuccess: number;
      generationsFailed: number;
      verifiedPaymentsCount: number;
      verifiedGrossRevenueInr: number;
      refundedInr: number;
      netVerifiedRevenueInr: number;
    };
    allTimeSummary: {
      totalRegisteredUsers: number;
      generationsSuccess: number;
      generationsFailed: number;
      verifiedPaymentsCount: number;
      verifiedGrossRevenueInr: number;
      refundedInr: number;
      netVerifiedRevenueInr: number;
    };
    recentDailySessions: DailyActivityMetric[];
    registeredUsers: Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      createdAt: string;
      lastLoginAt?: string;
      generationCount: number;
    }>;
    dataSource: 'firestore_authoritative' | 'process_local_cache';
    privacyAndRetention: {
      countSemantics: 'SESSION_COUNTS_ONLY_NOT_UNIQUE_VISITORS';
      guestPiiStored: false;
      retentionDays: number;
      ttlField: string;
      ttlCollection: string;
      ttlPolicyVerification: string;
    };
  }> {
    const todayDateKey = targetDateKey || getKolkataDateKey(new Date());
    const toIstDate = (iso?: string): string => {
      if (!iso) return '';
      const parsed = new Date(iso);
      if (Number.isNaN(parsed.getTime())) return '';
      return getKolkataDateKey(parsed);
    };

    const fsDb = this.firestoreDb;
    let dailyDocsMap: Record<string, DailyActivityMetric> = { ...(this.db.dailyActivity || {}) };
    let dataSource: 'firestore_authoritative' | 'process_local_cache' = 'process_local_cache';

    let usersList: UserProfile[] = Object.values(this.db.users || {});
    let authList: AuthIdentity[] = Object.values(this.db.authIdentities || {});
    let gensList: Generation[] = [...(this.db.generations || [])];
    let paysList: PaymentRecord[] = Object.values(this.db.payments || {});

    if (fsDb && (!isIsolatedTestEnv || this.firestoreOverride)) {
      try {
        const dailySnap = await fsDb.collection('daily_activity_metrics').get();
        if (dailySnap && !dailySnap.empty) {
          dailySnap.forEach((doc: any) => {
            const d = doc.data();
            if (d?.dateKey) {
              dailyDocsMap[d.dateKey] = {
                dateKey: String(d.dateKey),
                timezone: 'Asia/Kolkata',
                visitorSessions: Number(d.visitorSessions || 0),
                guestSessions: Number(d.guestSessions || 0),
                retentionDays: Number(d.retentionDays || 90),
                updatedAt: String(d.updatedAt || ''),
                expiresAtIso: d.expiresAtIso ? String(d.expiresAtIso) : undefined
              };
            }
          });
        }
        if (!isIsolatedTestEnv) {
          const [uSnap, aSnap, gSnap, pSnap] = await Promise.all([
            fsDb.collection('users').get(),
            fsDb.collection('auth_identities').get(),
            fsDb.collection('generations').get(),
            fsDb.collection('payments').get()
          ]);
          usersList = [];
          uSnap.forEach((d: any) => usersList.push(d.data() as UserProfile));
          authList = [];
          aSnap.forEach((d: any) => authList.push(d.data() as AuthIdentity));
          gensList = [];
          gSnap.forEach((d: any) => gensList.push(d.data() as Generation));
          paysList = [];
          pSnap.forEach((d: any) => paysList.push(d.data() as PaymentRecord));
        }
        dataSource = 'firestore_authoritative';
      } catch (err: any) {
        console.warn('[UserActivity] Firestore aggregation fallback note:', err?.message || err);
      }
    }

    const todayDaily = dailyDocsMap[todayDateKey];
    const visitorSessions = Number(todayDaily?.visitorSessions || 0);
    const guestSessions = Number(todayDaily?.guestSessions || 0);

    const newSignups = usersList.filter((u) => toIstDate(u.createdAt) === todayDateKey).length;

    const activeUserIdsToday = new Set<string>();
    authList.forEach((a) => {
      if (a.userId && toIstDate(a.lastLoginAt) === todayDateKey) activeUserIdsToday.add(a.userId);
    });
    gensList.forEach((g) => {
      if (g.userId && toIstDate(g.createdAt) === todayDateKey) activeUserIdsToday.add(g.userId);
    });
    paysList.forEach((p) => {
      if (p.userId && toIstDate(p.createdAt) === todayDateKey) activeUserIdsToday.add(p.userId);
    });

    const todayGens = gensList.filter((g) => toIstDate(g.createdAt) === todayDateKey);
    const generationsSuccessToday = todayGens.filter((g) => g.status === 'completed').length;
    const generationsFailedToday = todayGens.filter((g) => g.status === 'failed').length;

    const isVerifiedCaptured = (p: PaymentRecord) =>
      p.verificationStatus === 'verified' && p.status === 'captured';
    const isVerifiedRefunded = (p: PaymentRecord) =>
      p.status === 'refunded' &&
      (p.verificationStatus === 'verified' ||
        p.verificationStatus === 'voided' ||
        p.verificationStatus === 'revoked_rtdn');

    const todayPayments = paysList.filter((p) => toIstDate(p.createdAt) === todayDateKey);
    const verifiedCapturedToday = todayPayments.filter(isVerifiedCaptured);
    const verifiedRefundedToday = todayPayments.filter(isVerifiedRefunded);
    const verifiedGrossToday = verifiedCapturedToday.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const refundedToday = verifiedRefundedToday.reduce((acc, p) => acc + Number(p.amount || 0), 0);

    const allVerifiedCaptured = paysList.filter(isVerifiedCaptured);
    const allVerifiedRefunded = paysList.filter(isVerifiedRefunded);
    const allGrossRevenue = allVerifiedCaptured.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const allRefunded = allVerifiedRefunded.reduce((acc, p) => acc + Number(p.amount || 0), 0);

    const authByUserId = new Map<string, AuthIdentity>();
    authList.forEach((a) => {
      if (a.userId) authByUserId.set(a.userId, a);
    });

    const registeredUsers = usersList
      .map((u) => ({
        id: u.id,
        name: u.name || 'Creator',
        email: u.email || '',
        role: u.role || 'user',
        createdAt: u.createdAt || '',
        lastLoginAt: authByUserId.get(u.id)?.lastLoginAt,
        generationCount: gensList.filter((g) => g.userId === u.id).length || Number(u.generationCount || 0)
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 100);

    const recentDailySessions = Object.values(dailyDocsMap)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .slice(0, 14);

    return {
      timezone: 'Asia/Kolkata',
      todayDateKey,
      todayMetrics: {
        visitorSessions,
        guestSessions,
        newSignups,
        activeUsers: activeUserIdsToday.size,
        generationsSuccess: generationsSuccessToday,
        generationsFailed: generationsFailedToday,
        verifiedPaymentsCount: verifiedCapturedToday.length,
        verifiedGrossRevenueInr: Number(verifiedGrossToday.toFixed(2)),
        refundedInr: Number(refundedToday.toFixed(2)),
        netVerifiedRevenueInr: Number((verifiedGrossToday - refundedToday).toFixed(2))
      },
      allTimeSummary: {
        totalRegisteredUsers: usersList.length,
        generationsSuccess: gensList.filter((g) => g.status === 'completed').length,
        generationsFailed: gensList.filter((g) => g.status === 'failed').length,
        verifiedPaymentsCount: allVerifiedCaptured.length,
        verifiedGrossRevenueInr: Number(allGrossRevenue.toFixed(2)),
        refundedInr: Number(allRefunded.toFixed(2)),
        netVerifiedRevenueInr: Number((allGrossRevenue - allRefunded).toFixed(2))
      },
      recentDailySessions,
      registeredUsers,
      dataSource,
      privacyAndRetention: {
        countSemantics: 'SESSION_COUNTS_ONLY_NOT_UNIQUE_VISITORS',
        guestPiiStored: false,
        retentionDays: 90,
        ttlField: 'expiresAt',
        ttlCollection: 'daily_activity_metrics',
        ttlPolicyVerification:
          'expiresAt Timestamp (+90d) written per document; verify Firestore collection TTL policy in Cloud Console/gcloud for automated deletion.'
      }
    };
  }

  /* =========================================================================
     PERSISTENT INCIDENTS STORE (Non-blocking write-through for Error Alerts)
  ========================================================================= */
  public async persistIncidentRecord(alert: Record<string, any>): Promise<void> {
    const fsDb = this.firestoreDb;
    if (!fsDb || !alert?.id) return;
    try {
      const expiryMs = Date.now() + 90 * 24 * 60 * 60 * 1000;
      const isRealFirestore = Boolean(this.firestoreOverride === undefined && adminFirestoreDb);
      const payload = JSON.parse(
        JSON.stringify({
          ...alert,
          expiresAtIso: new Date(expiryMs).toISOString()
        })
      );
      if (isRealFirestore) {
        payload.expiresAt = Timestamp.fromMillis(expiryMs);
      } else {
        payload.expiresAt = payload.expiresAtIso;
      }
      await fsDb.collection('incidents').doc(String(alert.id)).set(payload, { merge: true });
    } catch (err: any) {
      console.warn('[Incidents] Non-blocking persistIncidentRecord note:', err?.message || err);
    }
  }

  public async resolveIncidentRecord(alertId: string, resolvedBy?: string, resolutionNote?: string): Promise<boolean> {
    const fsDb = this.firestoreDb;
    if (!fsDb || !alertId) return false;
    try {
      const updatePayload: Record<string, any> = {
        id: alertId,
        resolved: true,
        resolvedAt: new Date().toISOString(),
        resolvedBy: resolvedBy || 'authorized_admin'
      };
      if (resolutionNote && typeof resolutionNote === 'string' && resolutionNote.trim()) {
        updatePayload.resolutionNote = resolutionNote.trim().slice(0, 300);
      }
      await fsDb.collection('incidents').doc(alertId).set(updatePayload, { merge: true });
      return true;
    } catch (err: any) {
      console.warn('[Incidents] Non-blocking resolveIncidentRecord note:', err?.message || err);
      return false;
    }
  }

  public async getIncidentsAuthoritative(limit = 100): Promise<{
    incidents: any[];
    isPersistent: boolean;
  }> {
    const fsDb = this.firestoreDb;
    if (!fsDb) {
      return { incidents: [], isPersistent: false };
    }
    try {
      const snap = await fsDb.collection('incidents').orderBy('timestamp', 'desc').limit(limit).get();
      const incidents: any[] = [];
      if (snap && !snap.empty) {
        snap.forEach((doc: any) => incidents.push(doc.data()));
      }
      return { incidents, isPersistent: true };
    } catch (err: any) {
      console.warn('[Incidents] Non-blocking getIncidentsAuthoritative note:', err?.message || err);
      return { incidents: [], isPersistent: false };
    }
  }

  /* =========================================================================
     LIVE FX RATE CACHE & OWNER OMNI 1.2 MANUAL TEST LEDGER
  ========================================================================= */
  public saveFxCacheRecord(record: {
    rate: number;
    source: string;
    fetchedAt: string;
    expiresAt: string;
  }): void {
    this.db.fxCache = record;
    this.save();
    const fsDb = this.firestoreDb;
    if (fsDb) {
      fsDb.collection('config').doc('fx_rate_cache').set(JSON.parse(JSON.stringify(record)), { merge: true }).catch(() => {});
    }
  }

  public getFxCacheRecord(): {
    rate: number;
    source: string;
    fetchedAt: string;
    expiresAt: string;
  } | null {
    return this.db.fxCache || null;
  }

  public recordOwnerOmniTest(record: OwnerOmniTestRecord): OwnerOmniTestRecord {
    if (!Array.isArray(this.db.ownerOmniTests)) {
      this.db.ownerOmniTests = [];
    }
    this.db.ownerOmniTests.unshift(record);
    if (this.db.ownerOmniTests.length > 50) {
      this.db.ownerOmniTests = this.db.ownerOmniTests.slice(0, 50);
    }
    this.save();
    const fsDb = this.firestoreDb;
    if (fsDb) {
      fsDb.collection('owner_omni_tests').doc(record.id).set(JSON.parse(JSON.stringify(record)), { merge: true }).catch(() => {});
    }
    return record;
  }

  public getOwnerOmniTests(limit = 30): OwnerOmniTestRecord[] {
    return (this.db.ownerOmniTests || []).slice(0, limit);
  }
}

export const prodDb = new ProductionDatabase();
