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
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import type {
  Template,
  UserProfile,
  CreditWallet,
  CreditGrant,
  CreditTransaction,
  TransactionType,
  Generation,
  UserSubscription,
  PaymentRecord
} from '../../types/index.ts';
import { initializeApp as initAdminApp, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { SEED_TEMPLATES } from '../../data/templatesData.ts';
import { HOME_HERO_BANNERS, HomeBannerItem } from '../../config/homeBannersConfig.ts';

// Initialize Firebase client / admin for server persistence
let firestoreDb: any = null;
let adminFirestoreDb: any = null;
export { firestoreDb, adminFirestoreDb };

try {
  const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  firestoreDb = getFirestore(firebaseApp, (firebaseConfig as any).firestoreDatabaseId);
} catch (err: any) {
  console.warn('[Database] Firebase client initialization note:', err.message);
}

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
      const adminApp = initAdminApp({
        credential: cert(credentialObj),
        projectId
      }, 'lumina-admin-app-' + Date.now());
      adminFirestoreDb = getAdminFirestore(adminApp);
      try {
        adminFirestoreDb.settings({ ignoreUndefinedProperties: true });
      } catch {}
      console.log(`[Database] Firebase Admin SDK connected to Firestore project '${projectId}' (Authoritative)`);
    }
  }
} catch (err: any) {
  console.warn('[Database] Firebase Admin initialization note:', err.message);
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
  userLikes: Record<string, string[]>; // userId -> templateId[]
  processedWebhooks: string[];
  reports: Array<{ id: string; generationId: string; reason: string; timestamp: string }>;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

class ProductionDatabase {
  private db: ProductionDatabaseSchema;

  constructor() {
    this.db = this.init();
    if (adminFirestoreDb) {
      this.loadAuthoritativeFromFirestore().catch(() => {});
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
        this.db.users[d.id] = d.data();
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

      // 11. Templates
      const tplSnap = await adminFirestoreDb.collection('templates').get();
      if (!tplSnap.empty) {
        const loaded: Template[] = [];
        tplSnap.forEach((d: any) => {
          loaded.push(d.data() as Template);
        });
        if (loaded.length > 0) {
          this.db.templates = loaded;
        }
      }

      // 12. App Config (Banners & Demo Video)
      try {
        const bannerDoc = await adminFirestoreDb.collection('config').doc('banners').get();
        if (bannerDoc.exists && bannerDoc.data()?.banners) {
          this.db.banners = bannerDoc.data().banners;
        }
        const demoDoc = await adminFirestoreDb.collection('config').doc('faceswap_demo').get();
        if (demoDoc.exists && demoDoc.data()?.demoVideoUrl) {
          this.db.faceSwapDemoVideoUrl = demoDoc.data().demoVideoUrl;
        }
      } catch {
        // config docs optional
      }

      console.log('[Database] Complete authoritative state synchronized from Firestore');
    } catch (err: any) {
      console.warn('[Database] Firestore authoritative sync note:', err.message);
    }
  }

  private init(): ProductionDatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
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
        parsed.templates = (parsed.templates && parsed.templates.length > 0) ? parsed.templates : [...SEED_TEMPLATES];
        parsed.banners = (parsed.banners && parsed.banners.length > 0) ? parsed.banners : [...HOME_HERO_BANNERS];
        parsed.faceSwapDemoVideoUrl = parsed.faceSwapDemoVideoUrl || 'https://assets.mixkit.co/videos/preview/mixkit-girl-dancing-happy-in-a-field-of-yellow-flowers-40277-large.mp4';
        parsed.userLikes = parsed.userLikes || {};
        parsed.processedWebhooks = parsed.processedWebhooks || [];
        parsed.reports = parsed.reports || [];
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
      userLikes: {},
      processedWebhooks: [],
      reports: []
    };
  }

  public save(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tempFile = path.join(DATA_DIR, `db_${Date.now()}_tmp.json`);
      fs.writeFileSync(tempFile, JSON.stringify(this.db, null, 2), 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
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
  public async syncToFirestore(collectionName: string, docId: string, data: any): Promise<void> {
    try {
      const sanitized = JSON.parse(JSON.stringify(data));
      if (adminFirestoreDb) {
        await adminFirestoreDb.collection(collectionName).doc(docId).set(sanitized, { merge: true });
        return;
      }
      if (firestoreDb) {
        const docRef = doc(firestoreDb, collectionName, docId);
        await setDoc(docRef, sanitized, { merge: true });
      }
    } catch (err: any) {
      console.warn(`[Firestore Sync] ${collectionName}/${docId}:`, err.message);
    }
  }

  private async deleteFromFirestore(collectionName: string, docId: string) {
    try {
      if (adminFirestoreDb) {
        await adminFirestoreDb.collection(collectionName).doc(docId).delete();
        return;
      }
      if (firestoreDb) {
        const docRef = doc(firestoreDb, collectionName, docId);
        await deleteDoc(docRef);
      }
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
    for (const [userId, identity] of Object.entries(this.db.authIdentities)) {
      if (identity.sessionTokens && identity.sessionTokens.includes(token)) {
        return this.db.users[userId] || null;
      }
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

    if (existingUser) {
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
      role: 'creator',
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
      } catch (err: any) {
        console.error('[Database] Atomic Firestore reserveCredits error:', err.message);
      }
    }

    // Local / In-Memory Fallback
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
        console.error('[Database] Atomic Firestore refundCredits error:', err.message);
      }
    }

    // Local fallback
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

    if (type === 'topup' || description.toLowerCase().includes('top-up') || (planId && planId.startsWith('topup_'))) {
      source = 'topup';
      expiresAt = null; // Top-Up credits NEVER expire
    } else if (planId === 'plan_weekly_pass' || description.toLowerCase().includes('weekly')) {
      source = 'weekly';
      expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString(); // 7 days
    } else if (planId === 'plan_monthly_pass' || description.toLowerCase().includes('monthly')) {
      source = 'monthly';
      expiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString(); // 30 days
    } else if (type === 'subscription' || description.toLowerCase().includes('renewal') || amount === 400) {
      source = 'renewal';
      expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString(); // 7 days cycle
    } else {
      source = 'intro';
      expiresAt = new Date(now.getTime() + 24 * 3600 * 1000).toISOString(); // 24 hours
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
      } catch (err: any) {
        console.error('[Database] Atomic Firestore creditWallet error:', err.message);
      }
    }

    // Local / In-memory fallback
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

  /* =========================================================================
     GENERATIONS & JOBS
  ========================================================================= */
  public getUserGenerations(userId: string): Generation[] {
    return this.db.generations.filter(g => g.userId === userId);
  }

  public addGeneration(gen: Generation): void {
    this.db.generations.unshift(gen);
    if (this.db.users[gen.userId]) {
      this.db.users[gen.userId].generationCount = (this.db.users[gen.userId].generationCount || 0) + 1;
    }
    this.save();
    this.syncToFirestore('generations', gen.id, gen);
  }

  public updateGeneration(genId: string, updates: Partial<Generation>): void {
    const gen = this.db.generations.find(g => g.id === genId);
    if (gen) {
      Object.assign(gen, updates);
      this.save();
      this.syncToFirestore('generations', genId, gen);
    }
  }

  /* =========================================================================
     TEMPLATES & INTERACTIVE LIKES
  ========================================================================= */
  public getTemplates(): Template[] {
    return this.db.templates.filter(t => t.isActive !== false);
  }

  public getAllTemplatesAdmin(): Template[] {
    return this.db.templates;
  }

  public addTemplate(tpl: Template): Template {
    this.db.templates.unshift(tpl);
    this.save();
    this.syncToFirestore('templates', tpl.id, tpl);
    return tpl;
  }

  public updateTemplate(id: string, updates: Partial<Template>): Template | null {
    const tpl = this.db.templates.find(t => t.id === id);
    if (!tpl) return null;
    Object.assign(tpl, updates);
    this.save();
    this.syncToFirestore('templates', id, tpl);
    return tpl;
  }

  public deleteTemplate(id: string): boolean {
    const index = this.db.templates.findIndex(t => t.id === id);
    if (index !== -1) {
      this.db.templates.splice(index, 1);
      this.save();
      this.deleteFromFirestore('templates', id);
      return true;
    }
    return false;
  }

  public getBanners(): HomeBannerItem[] {
    return this.db.banners || [];
  }

  public setBanners(banners: HomeBannerItem[]): void {
    this.db.banners = banners;
    this.save();
    this.syncToFirestore('config', 'banners', { banners, updatedAt: new Date().toISOString() });
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
    this.save();
    await this.syncToFirestore('payments', record.orderId, record);
  }

  public getPayment(orderId: string): PaymentRecord | null {
    return this.db.payments[orderId] || null;
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
