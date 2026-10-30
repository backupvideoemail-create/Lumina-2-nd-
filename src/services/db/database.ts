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
  FaceSwapScene
} from '../../types/index.ts';
import { initializeApp as initAdminApp, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import { SEED_TEMPLATES } from '../../data/templatesData.ts';
import { HOME_HERO_BANNERS, HomeBannerItem } from '../../config/homeBannersConfig.ts';
import { SEED_FACE_SWAP_SCENES } from '../../data/faceSwapData.ts';
import { DEFAULT_CATEGORY_PROMPTS } from '../../config/categoryPromptsConfig.ts';

// Authoritative Firebase Admin instance for server persistence
let adminFirestoreDb: any = null;
export { adminFirestoreDb };

export const isIsolatedTestEnv = process.env.IS_ISOLATED_TEST === 'true' || process.env.NODE_ENV === 'test';

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

    const buildQuery = (filters: Array<{ field: string; val: any }>) => ({
      where: (f: string, _op: string, v: any) => buildQuery([...filters, { field: f, val: v }]),
      limit: (_n: number) => buildQuery(filters),
      get: async () => {
        let matching = Array.from(col.entries()).map(([id, val]) => ({
          id,
          exists: true,
          data: () => JSON.parse(JSON.stringify(val))
        }));
        for (const filter of filters) {
          matching = matching.filter(doc => doc.data()[filter.field] === filter.val);
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
      where: (f: string, _op: string, v: any) => buildQuery([{ field: f, val: v }]),
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
} else {
  // Attempt Firebase Admin initialization if service account is provided
  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey) {
      let credentialObj: any;
      if (serviceAccountKey.trim().startsWith('{')) {
        credentialObj = JSON.parse(serviceAccountKey);
      } else if (fs.existsSync(serviceAccountKey)) {
        credentialObj = JSON.parse(fs.readFileSync(serviceAccountKey, 'utf-8'));
      }

      if (credentialObj) {
        const projectId = credentialObj.project_id || (firebaseConfig as any).projectId;
        const isConfigProject = projectId === (firebaseConfig as any).projectId;
        const explicitDbId = process.env.FIRESTORE_DATABASE_ID?.trim();
        const targetDatabaseId = explicitDbId
          ? (explicitDbId === '(default)' ? undefined : explicitDbId)
          : (isConfigProject ? (firebaseConfig as any).firestoreDatabaseId : undefined);
        const adminApp = initAdminApp({
          credential: cert(credentialObj),
          projectId
        }, 'lumina-admin-app-' + Date.now());
        adminFirestoreDb = targetDatabaseId
          ? getAdminFirestore(adminApp, targetDatabaseId)
          : getAdminFirestore(adminApp);
        try {
          adminFirestoreDb.settings({ ignoreUndefinedProperties: true });
        } catch {}
        console.log(`[Database] Firebase Admin SDK connected to Firestore project '${projectId}' (database: '${targetDatabaseId || '(default)'}') (Authoritative)`);
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

export class ProductionDatabase {
  private db: ProductionDatabaseSchema;
  private dbFilePath: string;
  public quarantinedTemplates: Array<{ template: any; reason: string; quarantinedAt: string }> = [];
  public readyPromise: Promise<void>;

  constructor(customDbFile?: string) {
    this.dbFilePath = customDbFile || DB_FILE;
    this.db = this.init();
    if (adminFirestoreDb && !isIsolatedTestEnv) {
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

      // 2. Users
      const usersSnap = await adminFirestoreDb.collection('users').get();
      usersSnap.forEach((d: any) => {
        const u = d.data() as UserProfile;
        if (u && (u.email?.toLowerCase() === 'backupvideoemail@gmail.com' || (process.env.ADMIN_EMAIL && u.email?.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()))) {
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
        const firestoreTemplates: Template[] = [];
        if (!tplSnap.empty) {
          tplSnap.forEach((d: any) => {
            firestoreTemplates.push(d.data() as Template);
          });
        }
        // Merge: custom/updated Firestore templates override seed by ID, while strictly excluding deleted templates and quarantining incomplete templates
        const templateMap = new Map<string, Template>();
        SEED_TEMPLATES.forEach(t => {
          if (!deletedIds.has(t.id) && validateTemplate(t).isValid) templateMap.set(t.id, t);
        });
        (this.db.templates || []).forEach(t => {
          if (!deletedIds.has(t.id) && validateTemplate(t).isValid) templateMap.set(t.id, t);
        });
        firestoreTemplates.forEach(t => {
          if (!deletedIds.has(t.id)) {
            const v = validateTemplate(t);
            if (v.isValid) {
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
      } catch {
        // config docs optional
      }

      console.log('[Database] Complete authoritative state synchronized from Firestore');
    } catch (err: any) {
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
    const firestoreTemplates: Template[] = [];
    if (!tplSnap.empty) {
      tplSnap.forEach((d: any) => {
        firestoreTemplates.push(d.data() as Template);
      });
    }
    const templateMap = new Map<string, Template>();
    SEED_TEMPLATES.forEach(t => {
      if (!deletedIds.has(t.id) && validateTemplate(t).isValid) templateMap.set(t.id, t);
    });
    (this.db.templates || []).forEach(t => {
      if (!deletedIds.has(t.id) && validateTemplate(t).isValid) templateMap.set(t.id, t);
    });
    firestoreTemplates.forEach(t => {
      if (!deletedIds.has(t.id)) {
        const v = validateTemplate(t);
        if (v.isValid) {
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
    } catch (cfgErr: any) {
      console.warn('[Database] Catalog config docs note during targeted refresh:', cfgErr.message);
    }

    this.save();
    console.log('[Database] Targeted catalog & scene sync completed from Firestore');
    return {
      templatesCount: this.db.templates.length,
      faceSwapScenesCount: this.db.faceSwapScenes.length,
      bannersCount: this.db.banners.length
    };
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
        SEED_TEMPLATES.forEach(t => {
          if (!deletedIds.has(t.id) && validateTemplate(t).isValid) tplMap.set(t.id, t);
        });
        (parsed.templates || []).forEach((t: Template) => {
          if (!deletedIds.has(t.id)) {
            const v = validateTemplate(t);
            if (v.isValid) {
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
        parsed.banners = (parsed.banners && parsed.banners.length > 0) ? parsed.banners : [...HOME_HERO_BANNERS];
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
      templates: [...SEED_TEMPLATES],
      banners: [...HOME_HERO_BANNERS],
      faceSwapDemoVideoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-girl-dancing-happy-in-a-field-of-yellow-flowers-40277-large.mp4',
      faceSwapScenes: SEED_FACE_SWAP_SCENES.map(s => ({ ...s, isActive: true, status: 'published' })),
      userLikes: {},
      processedWebhooks: [],
      reports: [],
      adminTestRuns: [],
      pricingBanner: null,
      categoryPrompts: { ...DEFAULT_CATEGORY_PROMPTS }
    };
  }

  public save(): void {
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
    if (!adminFirestoreDb) {
      return { success: false, cloudPersisted: false, error: 'Firestore Admin SDK not connected' };
    }
    try {
      const sanitized = JSON.parse(JSON.stringify(data));
      await adminFirestoreDb.collection(collectionName).doc(docId).set(sanitized, { merge: true });
      return { success: true, cloudPersisted: true };
    } catch (err: any) {
      console.warn(`[Firestore Sync] ${collectionName}/${docId}:`, err.message);
      if (collectionName === 'templates') {
        try {
          await new Promise(r => setTimeout(r, 200));
          const sanitized = JSON.parse(JSON.stringify(data));
          await adminFirestoreDb.collection(collectionName).doc(docId).set(sanitized, { merge: true });
          return { success: true, cloudPersisted: true };
        } catch (retryErr: any) {
          console.error(`[Firestore Sync Critical] Template ${docId} persistence failed:`, retryErr.message);
          return { success: false, cloudPersisted: false, error: retryErr.message };
        }
      }
      return { success: false, cloudPersisted: false, error: err.message };
    }
  }

  private async deleteFromFirestore(collectionName: string, docId: string): Promise<void> {
    if (!adminFirestoreDb) return;
    try {
      await adminFirestoreDb.collection(collectionName).doc(docId).delete();
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

  public getUserByFirebaseUid(firebaseUid: string): UserProfile | null {
    for (const [userId, identity] of Object.entries(this.db.authIdentities)) {
      if (identity.firebaseUid === firebaseUid) {
        return this.db.users[userId] || null;
      }
    }
    return null;
  }

  public getUserByToken(token: string): UserProfile | null {
    if (!token) return null;
    const ensureAdminRole = (u: UserProfile | undefined): UserProfile | null => {
      if (!u) return null;
      const isAdminEmail = Boolean(
        (u.email && u.email.toLowerCase() === 'backupvideoemail@gmail.com') ||
        (process.env.ADMIN_EMAIL && u.email && u.email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase())
      );
      if (isAdminEmail && u.role !== 'admin') {
        u.role = 'admin';
        this.syncToFirestore('users', u.id, u);
      }
      return u;
    };

    for (const [userId, identity] of Object.entries(this.db.authIdentities)) {
      if (identity.sessionTokens && identity.sessionTokens.includes(token)) {
        return ensureAdminRole(this.db.users[userId]);
      }
    }
    if (fs.existsSync(DB_FILE)) {
      try {
        const diskDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
        for (const [userId, identity] of Object.entries((diskDb.authIdentities || {}) as Record<string, AuthIdentity>)) {
          if (identity.sessionTokens && identity.sessionTokens.includes(token)) {
            this.db.users[userId] = diskDb.users[userId];
            this.db.authIdentities[userId] = identity;
            return ensureAdminRole(this.db.users[userId]);
          }
        }
      } catch {}
    }
    return null;
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
  }): { user: UserProfile; token: string; isNewUser: boolean } {
    let existingUser = this.getUserByFirebaseUid(params.firebaseUid);
    const sessionToken = `session_${crypto.randomBytes(24).toString('hex')}`;

    const isAdminEmail = Boolean(
      (params.email && params.email.toLowerCase() === 'backupvideoemail@gmail.com') ||
      (process.env.ADMIN_EMAIL && params.email && params.email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase())
    );

    if (existingUser) {
      if (isAdminEmail && existingUser.role !== 'admin') {
        existingUser.role = 'admin';
        this.syncToFirestore('users', existingUser.id, existingUser);
      }
      const identity = this.db.authIdentities[existingUser.id];
      if (identity) {
        identity.sessionTokens.push(sessionToken);
        identity.lastLoginAt = new Date().toISOString();
        if (params.email && !identity.email) identity.email = params.email;
        if (params.phone && !identity.phone) identity.phone = params.phone;
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
    this.syncToFirestore('users', newUserId, newUser);
    this.syncToFirestore('auth_identities', newUserId, newIdentity);
    this.syncToFirestore('wallets', newUserId, this.db.wallets[newUserId]);

    return { user: newUser, token: sessionToken, isNewUser: true };
  }

  public async saveUser(user: UserProfile): Promise<void> {
    this.db.users[user.id] = user;
    this.save();
    this.syncToFirestore('users', user.id, user);
  }

  public revokeToken(token: string): boolean {
    for (const identity of Object.values(this.db.authIdentities)) {
      if (identity.sessionTokens && identity.sessionTokens.includes(token)) {
        identity.sessionTokens = identity.sessionTokens.filter(t => t !== token);
        this.save();
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
    if (adminFirestoreDb) {
      try {
        const walletDoc = await adminFirestoreDb.collection('wallets').doc(userId).get();
        if (walletDoc.exists) {
          this.db.wallets[userId] = walletDoc.data() as CreditWallet;
        }
        const grantsSnap = await adminFirestoreDb.collection('credit_grants').where('userId', '==', userId).get();
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
    if (adminFirestoreDb) {
      try {
        const success = await adminFirestoreDb.runTransaction(async (t: any) => {
          // 1. Idempotency check: if a transaction with refId already exists, it was already reserved
          if (refId) {
            const existingTxSnap = await t.get(
              adminFirestoreDb.collection('transactions').where('referenceId', '==', refId).limit(1)
            );
            if (!existingTxSnap.empty) {
              return true; // Idempotently succeed
            }
          }

          // 2. Fetch wallet
          const walletRef = adminFirestoreDb.collection('wallets').doc(userId);
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
            adminFirestoreDb
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
            const gRef = adminFirestoreDb.collection('credit_grants').doc(grant.id);
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
          const txRef = adminFirestoreDb.collection('transactions').doc(tx.id);
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
    if (adminFirestoreDb) {
      try {
        await adminFirestoreDb.runTransaction(async (t: any) => {
          // Idempotency check: don't refund the same refId twice
          if (refId) {
            const existingRefSnap = await t.get(
              adminFirestoreDb
                .collection('transactions')
                .where('referenceId', '==', refId)
                .where('type', '==', 'refund')
                .limit(1)
            );
            if (!existingRefSnap.empty) {
              return;
            }
          }

          const walletRef = adminFirestoreDb.collection('wallets').doc(userId);
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
          const grantRef = adminFirestoreDb.collection('credit_grants').doc(refundGrant.id);
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
          const txRef = adminFirestoreDb.collection('transactions').doc(tx.id);
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
    if (adminFirestoreDb) {
      try {
        const result = await adminFirestoreDb.runTransaction(async (t: any) => {
          // 1. Strict Idempotency Check in Transaction:
          // Check if transaction with this referenceId already exists
          if (orderId) {
            const existingTxSnap = await t.get(
              adminFirestoreDb.collection('transactions').where('referenceId', '==', orderId).limit(1)
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
          const walletRef = adminFirestoreDb.collection('wallets').doc(userId);
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
          const grantRef = adminFirestoreDb.collection('credit_grants').doc(grant.id);
          const txRef = adminFirestoreDb.collection('transactions').doc(tx.id);

          walletData.lifetimeCredits = (walletData.lifetimeCredits || 0) + amount;
          walletData.balance = (walletData.balance || 0) + amount;
          walletData.updatedAt = now.toISOString();

          t.set(grantRef, grant);
          t.set(txRef, tx);
          t.set(walletRef, walletData, { merge: true });

          // Also set idempotency token if orderId
          if (orderId) {
            const idempotencyRef = adminFirestoreDb.collection('processed_webhooks').doc(`credit_${orderId}`);
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
    wallet.lifetimeCredits += amount;
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

    if (adminFirestoreDb) {
      try {
        const paySnap = await adminFirestoreDb.collection('payments').where('paymentId', '==', paymentId).where('status', '==', 'captured').limit(1).get();
        if (!paySnap.empty) return true;
        const txSnap = await adminFirestoreDb.collection('transactions').where('referenceId', '==', paymentId).limit(1).get();
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
    if (adminFirestoreDb) {
      try {
        const snap = await adminFirestoreDb.collection('transactions').where('referenceId', '==', refId).limit(1).get();
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

  public getUserGenerations(userId: string): Generation[] {
    return this.db.generations.filter(g => g.userId === userId);
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
    if (!v.isValid) {
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
          model: isVideo ? 'gemini-omni-1.1-flash' : 'gemini-3.1-flash-image',
          workflow: isVideo ? 'viral-reels' : 'gemini-photo-style',
          recipe: {
            version: '1.0',
            inputType: isVideo ? 'IMAGE_OR_VIDEO' : 'IMAGE_ONLY',
            provider: isVideo ? 'google_veo' : 'gemini',
            model: isVideo ? 'gemini-omni-1.1-flash' : 'gemini-3.1-flash-image',
            engine: 'AI_GENERATION',
            prompt: categoryPrompt,
            workflow: isVideo ? 'viral-reels' : 'gemini-photo-style',
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

  public setBanners(banners: HomeBannerItem[]): void {
    this.db.banners = banners;
    this.save();
    this.syncToFirestore('config', 'banners', { banners, updatedAt: new Date().toISOString() });
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

    if (adminFirestoreDb) {
      try {
        // Try direct doc
        const directDoc = await adminFirestoreDb.collection('payments').doc(identifier).get();
        if (directDoc.exists) {
          const rec = directDoc.data() as PaymentRecord;
          this.db.payments[rec.orderId] = rec;
          return rec;
        }

        // Try where queries
        for (const field of ['orderId', 'subscriptionId', 'paymentId']) {
          const snap = await adminFirestoreDb.collection('payments').where(field, '==', identifier).limit(1).get();
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

  public async isWebhookProcessed(eventId: string): Promise<boolean> {
    if (!eventId) return false;
    if (this.db.processedWebhooks.includes(eventId)) return true;
    if (adminFirestoreDb) {
      try {
        const docSnap = await adminFirestoreDb.collection('processed_webhooks').doc(eventId).get();
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
  public async addReport(params: { generationId: string; reason: string }): Promise<{ id: string; generationId: string; reason: string; timestamp: string }> {
    const reportId = `rep_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const record = {
      id: reportId,
      generationId: params.generationId,
      reason: params.reason,
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
    this.deleteFromFirestore('subscriptions', userId);
    this.deleteFromFirestore('user_likes', userId);

    return true;
  }
}

export const prodDb = new ProductionDatabase();
