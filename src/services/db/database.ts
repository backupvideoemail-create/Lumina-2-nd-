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
    const { initializeApp: initAdminApp, cert } = require('firebase-admin/app');
    const { getFirestore: getAdminFirestore } = require('firebase-admin/firestore');
    
    let credentialObj;
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
  private async syncToFirestore(collectionName: string, docId: string, data: any) {
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

  public reserveCredits(userId: string, amount: number, description: string, refId: string): boolean {
    const wallet = this.getWallet(userId);
    if (wallet.balance < amount) {
      return false;
    }

    const now = new Date();
    // Retrieve all active unexpired grants with remaining credits
    const activeGrants = (this.db.creditGrants || [])
      .filter(g => g.userId === userId && g.creditsRemaining > 0)
      .filter(g => !g.expiresAt || new Date(g.expiresAt) > now);

    // Business rule: Generation must consume the earliest-expiring eligible plan credits first (FIFO)
    // Non-expiring (e.g. topup) credits are consumed LAST
    activeGrants.sort((a, b) => {
      if (a.expiresAt && b.expiresAt) {
        return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      }
      if (a.expiresAt && !b.expiresAt) return -1; // expiring first
      if (!a.expiresAt && b.expiresAt) return 1;  // non-expiring last
      return new Date(a.grantedAt).getTime() - new Date(b.grantedAt).getTime();
    });

    let needed = amount;
    for (const grant of activeGrants) {
      if (needed <= 0) break;
      const take = Math.min(grant.creditsRemaining, needed);
      grant.creditsRemaining -= take;
      needed -= take;
      this.syncToFirestore('credit_grants', grant.id, grant);
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
    this.syncToFirestore('wallets', userId, wallet);
    this.syncToFirestore('transactions', tx.id, tx);

    // Refresh wallet computed balance
    this.getWallet(userId);
    return true;
  }

  public refundCredits(userId: string, amount: number, description: string, refId: string): void {
    const wallet = this.getWallet(userId);
    wallet.spentCredits = Math.max(0, wallet.spentCredits - amount);
    wallet.updatedAt = new Date().toISOString();

    // Refunded credits are restored into an active grant valid for 24 hours
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
    this.syncToFirestore('credit_grants', refundGrant.id, refundGrant);

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
    this.syncToFirestore('wallets', userId, wallet);
    this.syncToFirestore('transactions', tx.id, tx);

    this.getWallet(userId);
  }

  public creditWallet(
    userId: string,
    amount: number,
    description: string,
    orderId: string,
    type: TransactionType = 'purchase',
    planId?: string
  ): CreditGrant {
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
      expiresAt = new Date(now.getTime() + 24 * 3600 * 1000).toISOString(); // 24 hours
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

    if (!this.db.creditGrants) this.db.creditGrants = [];
    this.db.creditGrants.unshift(grant);
    this.syncToFirestore('credit_grants', grant.id, grant);

    const wallet = this.getWallet(userId);
    wallet.lifetimeCredits += amount;
    wallet.updatedAt = now.toISOString();

    const tx: CreditTransaction = {
      id: `tx_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      userId,
      amount,
      type,
      description,
      referenceId: orderId,
      createdAt: now.toISOString()
    };

    this.db.transactions.unshift(tx);
    this.save();
    this.syncToFirestore('wallets', userId, wallet);
    this.syncToFirestore('transactions', tx.id, tx);

    this.getWallet(userId);
    return grant;
  }

  public isPaymentProcessed(paymentId: string): boolean {
    if (!paymentId) return false;
    const byPayment = Object.values(this.db.payments).some(
      p => p.paymentId === paymentId && p.status === 'captured'
    );
    const byTx = this.db.transactions.some(t => t.referenceId === paymentId);
    return byPayment || byTx;
  }

  public hasTransactionForReference(refId: string): boolean {
    if (!refId) return false;
    return this.db.transactions.some(t => t.referenceId === refId);
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
  public recordPayment(record: PaymentRecord): void {
    this.db.payments[record.orderId] = record;
    this.save();
    this.syncToFirestore('payments', record.orderId, record);
  }

  public getPayment(orderId: string): PaymentRecord | null {
    return this.db.payments[orderId] || null;
  }

  public setSubscription(sub: UserSubscription): void {
    this.db.subscriptions[sub.userId] = sub;
    this.save();
    this.syncToFirestore('subscriptions', sub.userId, sub);
  }

  public getSubscription(userId: string): UserSubscription | null {
    return this.db.subscriptions[userId] || null;
  }

  public isWebhookProcessed(eventId: string): boolean {
    return this.db.processedWebhooks.includes(eventId);
  }

  public markWebhookProcessed(eventId: string): void {
    if (!this.db.processedWebhooks.includes(eventId)) {
      this.db.processedWebhooks.push(eventId);
      this.save();
      this.syncToFirestore('processed_webhooks', eventId, { eventId, processedAt: new Date().toISOString() });
    }
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
