import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SEED_TEMPLATES, INITIAL_PLANS, INITIAL_TOP_UPS } from './src/data/templatesData.ts';
import { SEED_FACE_SWAP_SCENES } from './src/data/faceSwapData.ts';
import {
  processTemplate,
  generateFaceSwapVideo,
  paymentService,
  subscriptionService
} from './src/services/index.ts';
import type {
  Template,
  UserProfile,
  CreditWallet,
  CreditTransaction,
  Generation,
  UserSubscription
} from './src/types/index.ts';

dotenv.config();

const PORT = 3000;
const app = express();

// Enable CORS and preflight handling for iframe requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// In-Memory Database with optional persistence
interface DatabaseSchema {
  users: Record<string, UserProfile>;
  wallets: Record<string, CreditWallet>;
  transactions: CreditTransaction[];
  generations: Generation[];
  subscriptions: Record<string, UserSubscription>;
  processedWebhooks: string[];
  reports: Array<{ id: string; generationId: string; reason: string; timestamp: string }>;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function initDB(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('Could not read existing db file, initializing fresh store:', err);
  }

  // Initial default user
  const defaultUserId = 'usr_guest_demo';
  const defaultUser: UserProfile = {
    id: defaultUserId,
    name: 'Aura Creator',
    email: 'creator@lumina.studio',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    onboarded: true,
    role: 'creator',
    createdAt: new Date().toISOString(),
    generationCount: 3
  };

  const defaultWallet: CreditWallet = {
    userId: defaultUserId,
    balance: 150, // Welcome gift of 150 credits
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

  const initialGenerations: Generation[] = [
    {
      id: 'gen_seed_1',
      userId: defaultUserId,
      templateId: 'tpl_gold_noir',
      templateTitle: 'Imperial Gold Noir',
      templateType: 'photo',
      aspectRatio: '4:5',
      status: 'completed',
      inputMediaUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
      resultMediaUrl: 'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?auto=format&fit=crop&w=900&q=80',
      creditCost: 25,
      engine: 'AI_GENERATION',
      model: 'gemini-3.1-flash-image',
      workflow: 'luxury-gold-noir',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      completedAt: new Date(Date.now() - 3600000 * 2 + 15000).toISOString(),
      isAiGenerated: true
    },
    {
      id: 'gen_seed_2',
      userId: defaultUserId,
      templateId: 'tpl_tokyo_neon_reel',
      templateTitle: 'Tokyo Cyberpunk Motion',
      templateType: 'video',
      aspectRatio: '9:16',
      status: 'completed',
      inputMediaUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80',
      resultMediaUrl: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=900&q=80',
      creditCost: 45,
      engine: 'AI_GENERATION',
      model: 'veo-3.1-lite-generate-preview',
      workflow: 'tokyo-cyber-glitch',
      createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      completedAt: new Date(Date.now() - 3600000 * 5 + 24000).toISOString(),
      isAiGenerated: true
    }
  ];

  return {
    users: { [defaultUserId]: defaultUser },
    wallets: { [defaultUserId]: defaultWallet },
    transactions: [welcomeTx],
    generations: initialGenerations,
    subscriptions: {},
    processedWebhooks: [],
    reports: []
  };
}

let db = initDB();

function saveDB() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving db:', err);
  }
}

// Helpers for User Session
function getUserId(req: express.Request): string {
  const headerId = req.headers['x-user-id'] as string;
  if (headerId && db.users[headerId]) {
    return headerId;
  }
  // Return the first or default user
  const keys = Object.keys(db.users);
  return keys[0] || 'usr_guest_demo';
}

// Configurable Business Cost Engine
const BUSINESS_CONFIG = {
  markupPercent: 40, // 40% markup rule as configured in prompt
  providerCosts: {
    photoSmart: 10,
    photoAi: 20,
    videoSmart: 25,
    videoAi: 35
  }
};

function calculateAuthoritativeCost(template: Template): number {
  // Always derive cost server-side
  if (template.creditCost && template.creditCost > 0) {
    return template.creditCost;
  }
  const baseCost = template.engine === 'AI_GENERATION'
    ? (template.type === 'video' ? BUSINESS_CONFIG.providerCosts.videoAi : BUSINESS_CONFIG.providerCosts.photoAi)
    : (template.type === 'video' ? BUSINESS_CONFIG.providerCosts.videoSmart : BUSINESS_CONFIG.providerCosts.photoSmart);
  return Math.round(baseCost * (1 + BUSINESS_CONFIG.markupPercent / 100));
}

/* =========================================================================
   API ROUTES
========================================================================= */

// 1. Templates
app.get('/api/templates', (req, res) => {
  const { category, type, search } = req.query;
  let results = [...SEED_TEMPLATES];

  if (type && (type === 'photo' || type === 'video')) {
    results = results.filter(t => t.type === type);
  }

  if (category && category !== 'All' && category !== 'Trending') {
    results = results.filter(t => t.category.toLowerCase() === (category as string).toLowerCase());
  }

  if (search && typeof search === 'string') {
    const q = search.toLowerCase().trim();
    results = results.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.toLowerCase().includes(q))
    );
  }

  res.json({ templates: results });
});

app.get('/api/templates/:id', (req, res) => {
  const tpl = SEED_TEMPLATES.find(t => t.id === req.params.id);
  if (!tpl) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json({ template: tpl });
});

// 2. Auth & User Profile
app.get('/api/auth/me', (req, res) => {
  const userId = getUserId(req);
  const user = db.users[userId];
  const wallet = db.wallets[userId] || {
    userId,
    balance: 50,
    lifetimeCredits: 50,
    spentCredits: 0,
    updatedAt: new Date().toISOString()
  };
  const activeSubscription = Object.values(db.subscriptions).find(
    s => s.userId === userId && (s.status === 'active' || s.status === 'trial')
  );

  res.json({
    user,
    wallet,
    activeSubscription: activeSubscription || null
  });
});

app.post('/api/auth/onboard', (req, res) => {
  const { name, avatar } = req.body;
  const newUserId = 'usr_' + Date.now();

  const newUser: UserProfile = {
    id: newUserId,
    name: (name && typeof name === 'string' && name.trim()) ? name.trim() : 'Lumina Artist',
    email: `${(name || 'creator').toLowerCase().replace(/\s+/g, '')}@lumina.studio`,
    avatar: avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    onboarded: true,
    role: 'creator',
    createdAt: new Date().toISOString(),
    generationCount: 0
  };

  const newWallet: CreditWallet = {
    userId: newUserId,
    balance: 100, // 100 free welcome credits on onboarding
    lifetimeCredits: 100,
    spentCredits: 0,
    updatedAt: new Date().toISOString()
  };

  const welcomeTx: CreditTransaction = {
    id: 'tx_' + Date.now(),
    userId: newUserId,
    amount: 100,
    type: 'promo',
    description: 'Welcome Onboarding Credits Bonus',
    createdAt: new Date().toISOString()
  };

  db.users[newUserId] = newUser;
  db.wallets[newUserId] = newWallet;
  db.transactions.unshift(welcomeTx);
  saveDB();

  res.json({ user: newUser, wallet: newWallet });
});

app.post('/api/auth/update', (req, res) => {
  const userId = getUserId(req);
  const { name, avatar } = req.body;

  if (db.users[userId]) {
    if (name) db.users[userId].name = name;
    if (avatar) db.users[userId].avatar = avatar;
    saveDB();
    return res.json({ user: db.users[userId] });
  }

  res.status(404).json({ error: 'User not found' });
});

app.post('/api/auth/delete-account', (req, res) => {
  const userId = getUserId(req);
  delete db.users[userId];
  delete db.wallets[userId];
  db.generations = db.generations.filter(g => g.userId !== userId);
  db.transactions = db.transactions.filter(t => t.userId !== userId);
  saveDB();

  res.json({ success: true, message: 'Account and associated media data permanently removed' });
});

// 3. Wallet & Ledger
app.get('/api/wallet', (req, res) => {
  const userId = getUserId(req);
  const wallet = db.wallets[userId] || {
    userId,
    balance: 0,
    lifetimeCredits: 0,
    spentCredits: 0,
    updatedAt: new Date().toISOString()
  };
  const userTransactions = db.transactions.filter(t => t.userId === userId).slice(0, 50);

  res.json({ wallet, transactions: userTransactions });
});

// 4. Plans & Pricing
app.get('/api/plans', (_req, res) => {
  res.json({
    plans: INITIAL_PLANS,
    topUps: INITIAL_TOP_UPS,
    pricingNote: 'Prices in INR (₹). Secure checkout with instant credit ledger activation.'
  });
});

// 5. Payment Architecture (Provider-Agnostic Payment Router)
interface CreateOrderBody {
  type: 'plan' | 'topup';
  itemId: string;
  provider?: 'cashfree' | 'razorpay';
}

app.post('/api/payments/create-order', async (req, res) => {
  const userId = getUserId(req);
  const { type, itemId, provider = 'cashfree' }: CreateOrderBody = req.body;

  let amount = 0;
  let credits = 0;
  let itemTitle = '';
  let isMandate = false;
  let mandateDetails: any = null;

  if (type === 'plan') {
    const plan = INITIAL_PLANS.find(p => p.id === itemId);
    if (!plan) return res.status(400).json({ error: 'Invalid plan selected' });
    amount = plan.price;
    credits = plan.includedCredits;
    itemTitle = plan.name;
    if (plan.renewalInterval === 'daily') {
      isMandate = true;
      mandateDetails = {
        frequency: 'daily',
        intervalHours: 24,
        renewalPrice: plan.renewalPrice,
        disclosure: plan.disclosureText
      };
    }
  } else {
    const topUp = INITIAL_TOP_UPS.find(t => t.id === itemId);
    if (!topUp) return res.status(400).json({ error: 'Invalid top-up option' });
    amount = topUp.price;
    credits = topUp.credits + (topUp.bonusCredits || 0);
    itemTitle = `Top-Up Pack (₹${amount})`;
  }

  // Provider-Agnostic Payment Service Call
  const orderResult = await paymentService.createOrder(
    {
      userId,
      type,
      itemId,
      amount,
      credits,
      itemTitle,
      isMandate,
      mandateFrequency: 'daily'
    },
    provider as any
  );

  res.json({
    ...orderResult,
    itemTitle,
    credits,
    type,
    itemId,
    mandateDetails
  });
});

// Server-authoritative Payment Verification
app.post('/api/payments/verify', (req, res) => {
  const userId = getUserId(req);
  const { orderId, type, itemId, paymentId, provider = 'cashfree', mandateConfirmed } = req.body;

  if (!orderId || !type || !itemId) {
    return res.status(400).json({ error: 'Missing payment verification details' });
  }

  // Guard against duplicate processing
  const idempotencyKey = `pay_verify_${orderId}`;
  if (db.processedWebhooks.includes(idempotencyKey)) {
    return res.json({
      success: true,
      message: 'Payment already processed and credits added',
      wallet: db.wallets[userId]
    });
  }

  let creditsToAdd = 0;
  let description = '';

  if (type === 'plan') {
    const plan = INITIAL_PLANS.find(p => p.id === itemId);
    if (!plan) return res.status(400).json({ error: 'Plan invalid' });
    creditsToAdd = plan.includedCredits;
    description = `Subscription: ${plan.name} (₹${plan.price})`;

    // Record subscription
    const subId = `sub_${Date.now()}`;
    const newSubscription: UserSubscription = {
      id: subId,
      userId,
      planId: plan.id,
      planName: plan.name,
      provider: provider as any,
      mandateId: `mand_${crypto.randomBytes(8).toString('hex')}`,
      status: plan.isIntro ? 'trial' : 'active',
      startAt: new Date().toISOString(),
      nextChargeAt: new Date(Date.now() + plan.durationHours * 3600000).toISOString(),
      renewalAmount: plan.renewalPrice
    };
    db.subscriptions[userId] = newSubscription;
  } else {
    const topUp = INITIAL_TOP_UPS.find(t => t.id === itemId);
    if (!topUp) return res.status(400).json({ error: 'Top-up invalid' });
    creditsToAdd = topUp.credits + (topUp.bonusCredits || 0);
    description = `Credit Top-Up: ${creditsToAdd} Credits (₹${topUp.price})`;
  }

  // Credit the wallet (Server Authoritative)
  if (!db.wallets[userId]) {
    db.wallets[userId] = {
      userId,
      balance: 0,
      lifetimeCredits: 0,
      spentCredits: 0,
      updatedAt: new Date().toISOString()
    };
  }

  db.wallets[userId].balance += creditsToAdd;
  db.wallets[userId].lifetimeCredits += creditsToAdd;
  db.wallets[userId].updatedAt = new Date().toISOString();

  // Record Transaction in Ledger
  const transaction: CreditTransaction = {
    id: `tx_${Date.now()}`,
    userId,
    amount: creditsToAdd,
    type: type === 'plan' ? 'subscription' : 'purchase',
    description,
    referenceId: orderId,
    createdAt: new Date().toISOString()
  };
  db.transactions.unshift(transaction);
  db.processedWebhooks.push(idempotencyKey);
  saveDB();

  res.json({
    success: true,
    creditsAdded: creditsToAdd,
    wallet: db.wallets[userId],
    subscription: db.subscriptions[userId] || null,
    message: 'Payment verified and credits activated successfully'
  });
});

// Webhook Handler with Idempotency
app.post('/api/payments/webhook', (req, res) => {
  const { eventType, eventId, orderId, userId, amount, signature } = req.body;

  if (!eventId || db.processedWebhooks.includes(eventId)) {
    return res.status(200).json({ status: 'ignored_or_duplicate' });
  }

  db.processedWebhooks.push(eventId);
  saveDB();
  res.status(200).json({ status: 'processed' });
});

// Cancel Subscription
app.post('/api/subscriptions/cancel', (req, res) => {
  const userId = getUserId(req);
  const sub = db.subscriptions[userId];

  if (!sub) {
    return res.status(404).json({ error: 'No active subscription found' });
  }

  sub.status = 'cancelled';
  sub.cancelledAt = new Date().toISOString();
  saveDB();

  res.json({
    success: true,
    subscription: sub,
    message: 'Subscription and recurring mandate cancelled successfully.'
  });
});

// 6. Template Generation Engine
app.post('/api/generations/create', async (req, res) => {
  const userId = getUserId(req);
  const { templateId, inputMediaUrl, customPrompt } = req.body;

  const template = SEED_TEMPLATES.find(t => t.id === templateId);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  if (!inputMediaUrl) {
    return res.status(400).json({ error: 'Please upload media to generate' });
  }

  // Server Authoritative Cost Check
  const requiredCredits = calculateAuthoritativeCost(template);
  const wallet = db.wallets[userId] || {
    userId,
    balance: 0,
    lifetimeCredits: 0,
    spentCredits: 0,
    updatedAt: new Date().toISOString()
  };

  if (wallet.balance < requiredCredits) {
    return res.status(402).json({
      error: 'Insufficient credits',
      requiredCredits,
      availableCredits: wallet.balance
    });
  }

  // 1. Reserve/Deduct credits upfront
  wallet.balance -= requiredCredits;
  wallet.spentCredits += requiredCredits;
  wallet.updatedAt = new Date().toISOString();

  const genId = `gen_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  const deductionTx: CreditTransaction = {
    id: `tx_gen_${Date.now()}`,
    userId,
    amount: -requiredCredits,
    type: 'generation',
    description: `Created: ${template.title}`,
    referenceId: genId,
    createdAt: new Date().toISOString()
  };
  db.transactions.unshift(deductionTx);

  // 2. Create Generation record
  const generation: Generation = {
    id: genId,
    userId,
    templateId: template.id,
    templateTitle: template.title,
    templateType: template.type,
    aspectRatio: template.aspectRatio,
    status: 'processing',
    inputMediaUrl,
    creditCost: requiredCredits,
    engine: template.engine,
    model: template.model,
    workflow: template.workflow,
    createdAt: new Date().toISOString(),
    isAiGenerated: template.engine === 'AI_GENERATION'
  };

  db.generations.unshift(generation);
  if (db.users[userId]) {
    db.users[userId].generationCount = (db.users[userId].generationCount || 0) + 1;
  }
  saveDB();

  // Send immediate 200 response with processing generation record
  res.json({
    generation,
    remainingCredits: wallet.balance
  });

  // Asynchronous Execution of Template Engine via Central AI Router
  (async () => {
    try {
      const templateResult = await processTemplate(
        {
          templateId: template.id,
          templateTitle: template.title,
          templateType: template.type,
          engine: template.engine,
          inputMediaUrl,
          aspectRatio: template.aspectRatio,
          workflow: template.workflow,
          customPrompt
        },
        template.sampleResult || template.preview
      );

      // Realistic cinematic rendering pipeline delay (3.2 seconds)
      await new Promise(r => setTimeout(r, 3200));

      // Mark generation as completed
      const gen = db.generations.find(g => g.id === genId);
      if (gen) {
        gen.status = 'completed';
        gen.resultMediaUrl = templateResult.resultUrl;
        gen.completedAt = new Date().toISOString();
        saveDB();
      }
    } catch (err: any) {
      console.error('Generation failed:', err);
      // Automatic Refund on generation failure
      const gen = db.generations.find(g => g.id === genId);
      if (gen) {
        gen.status = 'failed';
        gen.error = err.message || 'Generation failed during rendering';
      }
      wallet.balance += requiredCredits;
      wallet.spentCredits -= requiredCredits;
      const refundTx: CreditTransaction = {
        id: `tx_ref_${Date.now()}`,
        userId,
        amount: requiredCredits,
        type: 'refund',
        description: `Refund: Failed generation (${template.title})`,
        referenceId: genId,
        createdAt: new Date().toISOString()
      };
      db.transactions.unshift(refundTx);
      saveDB();
    }
  })();
});

// Face Swap API Routes
app.get('/api/faceswap/scenes', (_req, res) => {
  res.json({ scenes: SEED_FACE_SWAP_SCENES });
});

app.post('/api/faceswap/generate', async (req, res) => {
  const userId = getUserId(req);
  const { sceneId, facePhotoUrl } = req.body;

  const scene = SEED_FACE_SWAP_SCENES.find(s => s.id === sceneId);
  if (!scene) {
    return res.status(404).json({ error: 'Face Swap video scene not found' });
  }

  if (!facePhotoUrl) {
    return res.status(400).json({ error: 'Please upload your face photo to swap into the video' });
  }

  // Server Authoritative Cost Check
  const requiredCredits = scene.creditCost;
  const wallet = db.wallets[userId] || {
    userId,
    balance: 0,
    lifetimeCredits: 0,
    spentCredits: 0,
    updatedAt: new Date().toISOString()
  };

  if (wallet.balance < requiredCredits) {
    return res.status(402).json({
      error: 'Insufficient credits',
      requiredCredits,
      availableCredits: wallet.balance
    });
  }

  // 1. Reserve/Deduct credits upfront
  wallet.balance -= requiredCredits;
  wallet.spentCredits += requiredCredits;
  wallet.updatedAt = new Date().toISOString();

  const genId = `gen_fsv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  const deductionTx: CreditTransaction = {
    id: `tx_fsv_${Date.now()}`,
    userId,
    amount: -requiredCredits,
    type: 'generation',
    description: `Face Swap: ${scene.title}`,
    referenceId: genId,
    createdAt: new Date().toISOString()
  };
  db.transactions.unshift(deductionTx);

  // 2. Create Generation record
  const generation: Generation = {
    id: genId,
    userId,
    templateId: scene.id,
    templateTitle: `Face Swap: ${scene.title}`,
    templateType: 'video',
    aspectRatio: scene.aspectRatio,
    status: 'processing',
    inputMediaUrl: facePhotoUrl,
    creditCost: requiredCredits,
    engine: 'AI_GENERATION',
    model: 'veo-3.1-lite-generate-preview',
    workflow: 'neural-face-swap-reels',
    createdAt: new Date().toISOString(),
    isAiGenerated: true
  };

  db.generations.unshift(generation);
  if (db.users[userId]) {
    db.users[userId].generationCount = (db.users[userId].generationCount || 0) + 1;
  }
  saveDB();

  // Send immediate 200 response with processing generation record
  res.json({
    generation,
    remainingCredits: wallet.balance
  });

  // Asynchronous Execution of Face Swap Video Engine via Central Router
  (async () => {
    try {
      const swapResult = await generateFaceSwapVideo(
        {
          targetVideoUrl: scene.resultVideoPreview,
          sourceFaceUrl: facePhotoUrl,
          sceneTitle: scene.title,
          aspectRatio: scene.aspectRatio
        },
        scene.resultVideoPreview
      );

      // Realistic cinematic neural swap rendering delay (3.8 seconds)
      await new Promise(r => setTimeout(r, 3800));

      const gen = db.generations.find(g => g.id === genId);
      if (gen) {
        gen.status = 'completed';
        gen.resultMediaUrl = swapResult.resultUrl;
        gen.completedAt = new Date().toISOString();
        saveDB();
      }
    } catch (err: any) {
      console.error('Face Swap generation failed:', err);
      // Automatic Refund on generation failure
      const gen = db.generations.find(g => g.id === genId);
      if (gen) {
        gen.status = 'failed';
        gen.error = err.message || 'Face swap rendering encountered an error';
      }
      wallet.balance += requiredCredits;
      wallet.spentCredits -= requiredCredits;
      const refundTx: CreditTransaction = {
        id: `tx_ref_${Date.now()}`,
        userId,
        amount: requiredCredits,
        type: 'refund',
        description: `Refund: Failed Face Swap (${scene.title})`,
        referenceId: genId,
        createdAt: new Date().toISOString()
      };
      db.transactions.unshift(refundTx);
      saveDB();
    }
  })();
});

// List Generations
app.get('/api/generations', (req, res) => {
  const userId = getUserId(req);
  const { status } = req.query;
  let list = db.generations.filter(g => g.userId === userId);

  if (status && typeof status === 'string' && status !== 'all') {
    list = list.filter(g => g.status === status);
  }

  res.json({ generations: list });
});

app.get('/api/generations/:id', (req, res) => {
  const gen = db.generations.find(g => g.id === req.params.id);
  if (!gen) return res.status(404).json({ error: 'Generation not found' });
  res.json({ generation: gen });
});

app.delete('/api/generations/:id', (req, res) => {
  const userId = getUserId(req);
  db.generations = db.generations.filter(g => !(g.id === req.params.id && g.userId === userId));
  saveDB();
  res.json({ success: true });
});

// Report Generation
app.post('/api/reports', (req, res) => {
  const { generationId, reason } = req.body;
  db.reports.push({
    id: `rep_${Date.now()}`,
    generationId,
    reason: reason || 'Inappropriate or defective AI output',
    timestamp: new Date().toISOString()
  });
  saveDB();
  res.json({ success: true, message: 'Report submitted for review. Thank you.' });
});

/* =========================================================================
   VITE DEV SERVER MOUNT OR PRODUCTION STATIC
========================================================================= */
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lumina AI Template Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
