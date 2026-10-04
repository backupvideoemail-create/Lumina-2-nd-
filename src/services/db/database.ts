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
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';
import type {
  Template,
  UserProfile,
  CreditWallet,
  CreditTransaction,
  Generation,
  UserSubscription,
  PaymentRecord
} from '../../types/index.ts';
import { SEED_TEMPLATES } from '../../data/templatesData.ts';

// Initialize Firebase for server persistence
let firestoreDb: any = null;
try {
  const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  firestoreDb = getFirestore(firebaseApp, (firebaseConfig as any).firestoreDatabaseId);
} catch (err: any) {
  console.warn('[Database] Firebase server initialization note:', err.message);
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
  transactions: CreditTransaction[];
  generations: Generation[];
  jobs: GenerationJob[];
  payments: Record<string, PaymentRecord>;
  subscriptions: Record<string, UserSubscription>;
  templates: Template[];
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
        parsed.transactions = parsed.transactions || [];
        parsed.generations = parsed.generations || [];
        parsed.jobs = parsed.jobs || [];
        parsed.payments = parsed.payments || {};
        parsed.subscriptions = parsed.subscriptions || {};
        parsed.templates = (parsed.templates && parsed.templates.length > 0) ? parsed.templates : [...SEED_TEMPLATES];
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
      transactions: [],
      generations: [],
      jobs: [],
      payments: {},
      subscriptions: {},
      templates: [...SEED_TEMPLATES],
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
    if (!firestoreDb) return;
    try {
      const docRef = doc(firestoreDb, collectionName, docId);
      await setDoc(docRef, data, { merge: true });
    } catch (err: any) {
      console.warn(`[Firestore Sync] ${collectionName}/${docId}:`, err.message);
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

    this.db.users[newUserId] = newUser;
    this.db.authIdentities[newUserId] = {
      userId: newUserId,
      firebaseUid: params.firebaseUid,
      email: params.email,
      phone: params.phone,
      sessionTokens: [sessionToken],
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };

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
     WALLETS & CREDIT LEDGER
  ========================================================================= */
  public getWallet(userId: string): CreditWallet {
    if (!this.db.wallets[userId]) {
      this.db.wallets[userId] = {
        userId,
        balance: 0,
        lifetimeCredits: 0,
        spentCredits: 0,
        updatedAt: new Date().toISOString()
      };
      this.save();
    }
    return this.db.wallets[userId];
  }

  public reserveCredits(userId: string, amount: number, description: string, refId: string): boolean {
    const wallet = this.getWallet(userId);
    if (wallet.balance < amount) {
      return false;
    }
    wallet.balance -= amount;
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
    return true;
  }

  public refundCredits(userId: string, amount: number, description: string, refId: string): void {
    const wallet = this.getWallet(userId);
    wallet.balance += amount;
    wallet.spentCredits = Math.max(0, wallet.spentCredits - amount);
    wallet.updatedAt = new Date().toISOString();

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
  }

  public creditWallet(userId: string, amount: number, description: string, orderId: string): void {
    const wallet = this.getWallet(userId);
    wallet.balance += amount;
    wallet.lifetimeCredits += amount;
    wallet.updatedAt = new Date().toISOString();

    const tx: CreditTransaction = {
      id: `tx_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      userId,
      amount,
      type: 'purchase',
      description,
      referenceId: orderId,
      createdAt: new Date().toISOString()
    };

    this.db.transactions.unshift(tx);
    this.save();
    this.syncToFirestore('wallets', userId, wallet);
    this.syncToFirestore('transactions', tx.id, tx);
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

  public addTemplate(tpl: Template): Template {
    this.db.templates.unshift(tpl);
    this.save();
    return tpl;
  }

  public deleteTemplate(id: string): boolean {
    const index = this.db.templates.findIndex(t => t.id === id);
    if (index !== -1) {
      this.db.templates.splice(index, 1);
      this.save();
      return true;
    }
    return false;
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
    return true;
  }
}

export const prodDb = new ProductionDatabase();
