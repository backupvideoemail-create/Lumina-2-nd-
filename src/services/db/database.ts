/**
 * Production-Grade Database & State Layer with Durable JSON Persistence.
 * 
 * Manages:
 * - Users & Authentication Identities (with user isolation)
 * - Wallets & Immutable Credit Ledger Transactions
 * - Generation Records & Asynchronous Job Pipeline
 * - Payment Records & Subscriptions Lifecycle
 * - Dynamic Self-Service Template Catalog (Editable at runtime)
 * - Processed Webhooks Idempotency Store
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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

export interface AuthIdentity {
  userId: string;
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
        // Ensure all collections exist
        parsed.users = parsed.users || {};
        parsed.authIdentities = parsed.authIdentities || {};
        parsed.wallets = parsed.wallets || {};
        parsed.transactions = parsed.transactions || [];
        parsed.generations = parsed.generations || [];
        parsed.jobs = parsed.jobs || [];
        parsed.payments = parsed.payments || {};
        parsed.subscriptions = parsed.subscriptions || {};
        parsed.templates = (parsed.templates && parsed.templates.length > 0) ? parsed.templates : [...SEED_TEMPLATES];

        // Merge any newly introduced seed templates
        const existingIds = new Set(parsed.templates.map((t: Template) => t.id));
        for (const seedTpl of SEED_TEMPLATES) {
          if (!existingIds.has(seedTpl.id)) {
            parsed.templates.push(seedTpl);
          }
        }

        parsed.processedWebhooks = parsed.processedWebhooks || [];
        parsed.reports = parsed.reports || [];
        return parsed;
      }
    } catch (err) {
      console.warn('[Database] Initializing fresh store:', err);
    }

    const defaultUserId = 'usr_guest_demo';
    const defaultUser: UserProfile = {
      id: defaultUserId,
      name: 'Aura Creator',
      email: 'creator@aiprime.studio',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      onboarded: true,
      role: 'creator',
      createdAt: new Date().toISOString(),
      generationCount: 2
    };

    const defaultWallet: CreditWallet = {
      userId: defaultUserId,
      balance: 150,
      lifetimeCredits: 150,
      spentCredits: 0,
      updatedAt: new Date().toISOString()
    };

    const welcomeTx: CreditTransaction = {
      id: 'tx_welcome_' + Date.now(),
      userId: defaultUserId,
      amount: 150,
      type: 'promo',
      description: 'Welcome Creator Bonus credits',
      createdAt: new Date().toISOString()
    };

    return {
      users: { [defaultUserId]: defaultUser },
      authIdentities: {
        [defaultUserId]: {
          userId: defaultUserId,
          email: 'creator@aiprime.studio',
          sessionTokens: ['tok_demo_default'],
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        }
      },
      wallets: { [defaultUserId]: defaultWallet },
      transactions: [welcomeTx],
      generations: [],
      jobs: [],
      payments: {},
      subscriptions: {},
      templates: [...SEED_TEMPLATES],
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

  // Raw schema access
  public get raw(): ProductionDatabaseSchema {
    return this.db;
  }

  /* =========================================================================
     USERS & AUTH
  ========================================================================= */
  public getUser(userId: string): UserProfile | null {
    return this.db.users[userId] || null;
  }

  public createUser(user: UserProfile, phoneOrEmail?: string): { user: UserProfile; token: string } {
    this.db.users[user.id] = user;
    const sessionToken = `session_${crypto.randomBytes(16).toString('hex')}`;
    this.db.authIdentities[user.id] = {
      userId: user.id,
      email: user.email,
      phone: phoneOrEmail?.includes('@') ? undefined : phoneOrEmail,
      sessionTokens: [sessionToken],
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };
    // Initialize wallet
    this.db.wallets[user.id] = {
      userId: user.id,
      balance: 100, // 100 free welcome credits
      lifetimeCredits: 100,
      spentCredits: 0,
      updatedAt: new Date().toISOString()
    };
    this.db.transactions.unshift({
      id: `tx_${Date.now()}`,
      userId: user.id,
      amount: 100,
      type: 'promo',
      description: 'Welcome Onboarding Credits',
      createdAt: new Date().toISOString()
    });
    this.save();
    return { user, token: sessionToken };
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

  /* =========================================================================
     WALLET & CREDIT LEDGER (ATOMIC & ISOLATED)
  ========================================================================= */
  public getWallet(userId: string): CreditWallet {
    if (!this.db.wallets[userId]) {
      this.db.wallets[userId] = {
        userId,
        balance: 50,
        lifetimeCredits: 50,
        spentCredits: 0,
        updatedAt: new Date().toISOString()
      };
      this.save();
    }
    return this.db.wallets[userId];
  }

  /**
   * Atomic Credit Reservation for Generation
   */
  public reserveCredits(userId: string, amount: number, description: string, refId: string): boolean {
    const wallet = this.getWallet(userId);
    if (wallet.balance < amount) {
      return false;
    }
    wallet.balance -= amount;
    wallet.spentCredits += amount;
    wallet.updatedAt = new Date().toISOString();

    this.db.transactions.unshift({
      id: `tx_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      userId,
      amount: -amount,
      type: 'generation',
      description,
      referenceId: refId,
      createdAt: new Date().toISOString()
    });
    this.save();
    return true;
  }

  /**
   * Atomic Credit Refund on Generation Failure
   */
  public refundCredits(userId: string, amount: number, description: string, refId: string): void {
    const wallet = this.getWallet(userId);
    wallet.balance += amount;
    wallet.spentCredits = Math.max(0, wallet.spentCredits - amount);
    wallet.updatedAt = new Date().toISOString();

    this.db.transactions.unshift({
      id: `tx_ref_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      userId,
      amount,
      type: 'refund',
      description,
      referenceId: refId,
      createdAt: new Date().toISOString()
    });
    this.save();
  }

  /**
   * Add Credits from Verified Payment
   */
  public creditWallet(userId: string, amount: number, description: string, orderId: string): void {
    const wallet = this.getWallet(userId);
    wallet.balance += amount;
    wallet.lifetimeCredits += amount;
    wallet.updatedAt = new Date().toISOString();

    this.db.transactions.unshift({
      id: `tx_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      userId,
      amount,
      type: 'purchase',
      description,
      referenceId: orderId,
      createdAt: new Date().toISOString()
    });
    this.save();
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
  }

  public updateGeneration(genId: string, updates: Partial<Generation>): void {
    const gen = this.db.generations.find(g => g.id === genId);
    if (gen) {
      Object.assign(gen, updates);
      this.save();
    }
  }

  /* =========================================================================
     TEMPLATES (SELF-SERVICE DYNAMIC CATALOG)
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
    return tpl;
  }

  public updateTemplate(id: string, updates: Partial<Template>): Template | null {
    const tpl = this.db.templates.find(t => t.id === id);
    if (!tpl) return null;
    Object.assign(tpl, updates);
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

  /* =========================================================================
     PAYMENTS & SUBSCRIPTIONS
  ========================================================================= */
  public recordPayment(record: PaymentRecord): void {
    this.db.payments[record.orderId] = record;
    this.save();
  }

  public getPayment(orderId: string): PaymentRecord | null {
    return this.db.payments[orderId] || null;
  }

  public setSubscription(sub: UserSubscription): void {
    this.db.subscriptions[sub.userId] = sub;
    this.save();
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
     SESSION LOGOUT, AUDIT & ACCOUNT DELETION
  ========================================================================= */
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

  public deleteAccount(userId: string): boolean {
    if (!this.db.users[userId]) return false;

    // 1. Delete associated media files on disk
    const userGenerations = this.db.generations.filter(g => g.userId === userId);
    for (const gen of userGenerations) {
      if (gen.resultMediaUrl && gen.resultMediaUrl.startsWith('/api/media/')) {
        const fileId = gen.resultMediaUrl.replace('/api/media/', '');
        try {
          const safeName = path.basename(fileId);
          const p = path.join(DATA_DIR, 'uploads', safeName);
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {}
      }
    }

    // 2. Wipe user records from database
    delete this.db.users[userId];
    delete this.db.authIdentities[userId];
    delete this.db.wallets[userId];
    delete this.db.subscriptions[userId];
    this.db.generations = this.db.generations.filter(g => g.userId !== userId);
    this.db.transactions = this.db.transactions.filter(t => t.userId !== userId);

    this.save();
    return true;
  }
}

export const prodDb = new ProductionDatabase();
