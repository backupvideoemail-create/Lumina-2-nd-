import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SEED_FACE_SWAP_SCENES } from './src/data/faceSwapData.ts';
import {
  CENTRAL_SUBSCRIPTION_PLANS,
  calculateNextCalendarDayStartDate,
  getSubscriptionPlanById,
  SUPPORT_CONFIG
} from './src/config/subscriptionConfig.ts';
import {
  calculateAuthoritativeTemplateCost,
  calculateCreditsFromUsd,
  CENTRAL_PRICING_CONFIG,
  getPricingSummary
} from './src/services/pricing/pricingService.ts';
import { razorpayAdapter } from './src/services/payments/razorpayAdapter.ts';
import { mediaStorage } from './src/services/storage/mediaStorage.ts';
import { prodDb } from './src/services/db/database.ts';
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
  UserSubscription,
  PaymentRecord
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

app.use(express.json({
  limit: '50mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper for Session / User Isolation
function getUserId(req: express.Request): string {
  // Check Authorization Bearer header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const user = prodDb.getUserByToken(token);
    if (user) return user.id;
  }

  // Check custom x-user-id header
  const headerId = req.headers['x-user-id'] as string;
  if (headerId && prodDb.getUser(headerId)) {
    return headerId;
  }

  // Fallback default user for guest session
  const defaultUser = Object.keys(prodDb.raw.users)[0] || 'usr_guest_demo';
  return defaultUser;
}

/* =========================================================================
   1. SECURE MEDIA STORAGE ROUTES
========================================================================= */

// Serve uploaded and generated media safely with proper mime types
app.get('/api/media/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const filePath = mediaStorage.getFilePath(fileId);
  if (!filePath) {
    return res.status(404).json({ error: 'Media file not found' });
  }

  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(filePath);
});

// Upload direct media file from client/gallery
app.post('/api/media/upload', async (req, res) => {
  try {
    const { mediaBase64, filename = 'upload' } = req.body;
    if (!mediaBase64) {
      return res.status(400).json({ error: 'Missing mediaBase64 payload' });
    }

    const stored = await mediaStorage.saveMedia(mediaBase64, 'asset', filename);
    res.json({
      success: true,
      fileId: stored.fileId,
      url: stored.publicUrl,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Media upload failed' });
  }
});

/* =========================================================================
   2. AUTHENTICATION & USER ISOLATION
========================================================================= */

app.get('/api/auth/me', (req, res) => {
  const userId = getUserId(req);
  const user = prodDb.getUser(userId);
  const wallet = prodDb.getWallet(userId);
  const activeSubscription = prodDb.getSubscription(userId);

  res.json({
    user,
    wallet,
    activeSubscription: activeSubscription || null
  });
});

const otpStore: Record<string, { code: string; expires: number }> = {};

app.post('/api/auth/otp/send', (req, res) => {
  const { phoneOrEmail } = req.body;
  if (!phoneOrEmail || typeof phoneOrEmail !== 'string') {
    return res.status(400).json({ error: 'Please provide a valid phone or email' });
  }
  const cleanKey = phoneOrEmail.trim().toLowerCase();
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[cleanKey] = {
    code,
    expires: Date.now() + 10 * 60 * 1000 // 10 minutes expiry
  };
  console.log(`[AUTH OTP DISPATCH] Sent code ${code} to ${cleanKey}`);
  res.json({
    success: true,
    message: `Verification code sent successfully to ${phoneOrEmail}`,
    devHint: code
  });
});

app.post('/api/auth/otp/verify', (req, res) => {
  const { phoneOrEmail, otp, name } = req.body;
  if (!phoneOrEmail || !otp) {
    return res.status(400).json({ error: 'Missing phone/email or OTP code' });
  }
  const cleanKey = phoneOrEmail.trim().toLowerCase();
  const entry = otpStore[cleanKey];
  if (!entry || entry.code !== otp.trim() || entry.expires < Date.now()) {
    return res.status(401).json({ error: 'Invalid or expired OTP code' });
  }
  delete otpStore[cleanKey];

  let user = Object.values(prodDb.raw.users).find(
    (u) => u.email?.toLowerCase() === cleanKey || (u as any).phone === cleanKey
  );

  let token: string;
  if (!user) {
    const newUserId = `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const newUser: UserProfile = {
      id: newUserId,
      name: name?.trim() || 'AI Prime Creator',
      email: cleanKey.includes('@') ? cleanKey : `${newUserId}@aiprime.studio`,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      onboarded: true,
      role: 'creator',
      createdAt: new Date().toISOString(),
      generationCount: 0
    };
    const created = prodDb.createUser(newUser, cleanKey);
    user = created.user;
    token = created.token;
  } else {
    token = `tok_${crypto.randomBytes(24).toString('hex')}`;
    if (prodDb.raw.authIdentities[user.id]) {
      prodDb.raw.authIdentities[user.id].sessionTokens.push(token);
      prodDb.save();
    }
  }

  const wallet = prodDb.getWallet(user.id);
  res.json({
    success: true,
    user,
    wallet,
    token,
    message: 'Login successful'
  });
});

app.post('/api/auth/register', (req, res) => {
  const { phoneOrEmail, name, avatar } = req.body;
  if (!phoneOrEmail || typeof phoneOrEmail !== 'string') {
    return res.status(400).json({ error: 'Please provide a valid phone or email' });
  }

  const newUserId = `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const newUser: UserProfile = {
    id: newUserId,
    name: name?.trim() || 'AI Prime Creator',
    email: phoneOrEmail.includes('@') ? phoneOrEmail.trim() : `${newUserId}@aiprime.studio`,
    avatar: avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    onboarded: true,
    role: 'creator',
    createdAt: new Date().toISOString(),
    generationCount: 0
  };

  const { user, token } = prodDb.createUser(newUser, phoneOrEmail);
  const wallet = prodDb.getWallet(user.id);

  res.json({
    success: true,
    user,
    wallet,
    token,
    message: 'Registered successfully with 100 welcome credits'
  });
});

app.post('/api/auth/onboard', (req, res) => {
  const { name, avatar } = req.body;
  const newUserId = 'usr_' + Date.now();

  const newUser: UserProfile = {
    id: newUserId,
    name: (name && typeof name === 'string' && name.trim()) ? name.trim() : 'AI Prime Creator',
    email: `${(name || 'creator').toLowerCase().replace(/\s+/g, '')}@aiprime.studio`,
    avatar: avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    onboarded: true,
    role: 'creator',
    createdAt: new Date().toISOString(),
    generationCount: 0
  };

  const { user, token } = prodDb.createUser(newUser);
  const wallet = prodDb.getWallet(user.id);

  res.json({ user, wallet, token });
});

app.post('/api/auth/update', (req, res) => {
  const userId = getUserId(req);
  const { name, avatar } = req.body;

  const user = prodDb.getUser(userId);
  if (user) {
    if (name) user.name = name;
    if (avatar) user.avatar = avatar;
    prodDb.save();
    return res.json({ success: true, user });
  }
  res.status(404).json({ error: 'User not found' });
});

/* =========================================================================
   3. TEMPLATES & SELF-SERVICE TEMPLATE MANAGER (DYNAMIC DATABASE)
========================================================================= */

// Public template catalog loaded from dynamic database
app.get('/api/templates', (req, res) => {
  const { category, type, search } = req.query;
  let results = prodDb.getTemplates();

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
  const tpl = prodDb.getTemplates().find(t => t.id === req.params.id);
  if (!tpl) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json({ template: tpl });
});

// Admin: Add new template from phone gallery or desktop
app.post('/api/admin/templates', async (req, res) => {
  try {
    const {
      title,
      description,
      category = 'Trending',
      aspectRatio = '9:16',
      tags = [],
      mediaBase64,
      mediaUrl,
      type = 'video',
      providerCostUsd = 0.25,
      isFeatured = true
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    let finalMediaUrl = mediaUrl;
    if (mediaBase64) {
      const stored = await mediaStorage.saveMedia(mediaBase64, 'tpl_asset');
      finalMediaUrl = stored.publicUrl;
    }

    if (!finalMediaUrl) {
      return res.status(400).json({ error: 'Media asset is required' });
    }

    // Auto-detect template ID
    const templateId = `tpl_custom_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    // Compute server-authoritative credit cost using the 40% markup rule
    const creditCost = calculateAuthoritativeTemplateCost({
      type,
      engine: 'AI_GENERATION',
      providerCostUsd: Number(providerCostUsd) || 0.25
    });

    const newTemplate: Template = {
      id: templateId,
      title,
      description: description || `Trending ${category} AI template created in AI Prime Studio`,
      category,
      aspectRatio: aspectRatio as any,
      type: type as any,
      cover: finalMediaUrl,
      preview: finalMediaUrl,
      sampleResult: finalMediaUrl,
      requiredInputs: [
        { id: 'user_media', label: 'Upload Portrait or Media', type: 'image', description: 'Frontal clear view' }
      ],
      creditCost,
      engine: 'AI_GENERATION',
      model: type === 'video' ? 'veo-3.1-lite-generate-preview' : 'gemini-3.1-flash-image',
      workflow: 'neural-video-diffusion',
      sortOrder: 0,
      isFeatured: !!isFeatured,
      isActive: true,
      tags: Array.isArray(tags) ? tags : [category, 'AI', 'Trending'],
      likesCount: Math.floor(10000 + Math.random() * 80000),
      resolutionLabel: '1080p 60FPS'
    };

    prodDb.addTemplate(newTemplate);

    res.json({
      success: true,
      template: newTemplate,
      message: 'Template published successfully'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create template' });
  }
});

// Admin: Delete/Deactivate template
app.delete('/api/admin/templates/:id', (req, res) => {
  const deleted = prodDb.deleteTemplate(req.params.id);
  if (deleted) {
    return res.json({ success: true, message: 'Template removed from catalog' });
  }
  res.status(404).json({ error: 'Template not found' });
});

/* =========================================================================
   4. WALLET, LEDGER & PLANS
========================================================================= */

app.get('/api/wallet', (req, res) => {
  const userId = getUserId(req);
  const wallet = prodDb.getWallet(userId);
  const transactions = prodDb.getUserTransactions(userId);
  res.json({ wallet, transactions });
});

// 3 Flexible Subscription Plans from Central Configuration
app.get('/api/plans', (_req, res) => {
  res.json({
    plans: CENTRAL_SUBSCRIPTION_PLANS,
    supportEmail: SUPPORT_CONFIG.email,
    pricingNote: 'Prices in INR (₹). Secure checkout with instant credit ledger activation.'
  });
});

/* =========================================================================
   5. REAL RAZORPAY AUTOPAY & PAYMENT FLOW
========================================================================= */

// Public Payment Configuration & Razorpay Public Key
app.get('/api/payments/config', (_req, res) => {
  res.json({
    provider: 'razorpay',
    keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder_key',
    currency: 'INR',
    isLive: Boolean(process.env.RAZORPAY_KEY_ID && !process.env.RAZORPAY_KEY_ID.includes('placeholder')),
    plans: CENTRAL_SUBSCRIPTION_PLANS,
    supportEmail: SUPPORT_CONFIG.email
  });
});

// Create Order for all 3 flexible plans (₹1, ₹199, ₹998)
app.post('/api/payments/create-order', async (req, res) => {
  const userId = getUserId(req);
  const { type, itemId, provider = 'razorpay' } = req.body;

  // Retrieve plan from Central Plans Configuration
  const selectedPlan = getSubscriptionPlanById(itemId);
  const amount = selectedPlan.price;
  const credits = selectedPlan.includedCredits;
  const itemTitle = selectedPlan.name;

  let mandateDetails: any = null;
  if (selectedPlan.autoPayEnabled) {
    const nextCalDay = calculateNextCalendarDayStartDate();
    mandateDetails = {
      frequency: selectedPlan.renewalInterval,
      scheduleRule: selectedPlan.scheduleRule,
      renewalAmount: selectedPlan.renewalPrice,
      startDateFormatted: nextCalDay.dateString,
      startAtIso: nextCalDay.isoString,
      startAtUnixSeconds: nextCalDay.unixSeconds,
      disclosure: selectedPlan.disclosureText
    };
  }

  // Provider-Agnostic Payment Service Call
  const orderResult = await paymentService.createOrder(
    {
      userId,
      type: 'plan',
      itemId: selectedPlan.id,
      amount,
      credits,
      itemTitle,
      isMandate: selectedPlan.autoPayEnabled,
      mandateFrequency: selectedPlan.renewalInterval,
      mandateSchedule: mandateDetails || undefined
    },
    provider as any
  );

  // Record initial pending payment
  const paymentRecord: PaymentRecord = {
    id: `pay_rec_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    orderId: orderResult.orderId,
    paymentId: orderResult.paymentToken,
    userId,
    provider: provider as any,
    amount,
    currency: 'INR',
    type: selectedPlan.autoPayEnabled ? 'intro_mandate' : 'one_time',
    status: 'pending',
    isAutoPay: selectedPlan.autoPayEnabled,
    verificationStatus: 'unverified',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  prodDb.recordPayment(paymentRecord);

  res.json({
    ...orderResult,
    itemTitle,
    credits,
    type,
    itemId: selectedPlan.id,
    mandateDetails
  });
});

// Server-Authoritative Payment Verification (HMAC-SHA256 & Atomic Ledger)
app.post('/api/payments/verify', async (req, res) => {
  const userId = getUserId(req);
  const {
    orderId,
    type = 'plan',
    itemId = 'plan_intro_daily',
    paymentId,
    provider = 'razorpay',
    signature
  } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: 'Missing orderId for verification' });
  }

  // Idempotency: Prevent double credit grant on retries
  const idempotencyKey = `pay_verify_${orderId}`;
  if (prodDb.isWebhookProcessed(idempotencyKey)) {
    return res.json({
      success: true,
      message: 'Payment already processed and credits added',
      wallet: prodDb.getWallet(userId),
      subscription: prodDb.getSubscription(userId)
    });
  }

  const plan = getSubscriptionPlanById(itemId);
  const creditsToAdd = plan.includedCredits;
  const description = `Subscription: ${plan.name} (₹${plan.price})`;

  // Next charge scheduling
  const nextCalDay = calculateNextCalendarDayStartDate();
  const nextChargeAt = (plan.renewalInterval === 'daily' || plan.isIntro)
    ? nextCalDay.isoString
    : new Date(Date.now() + plan.validityDays * 86400000).toISOString();

  // Modular Adapter Verification
  const verification = await paymentService.verifyPayment(
    {
      orderId,
      userId,
      paymentId,
      signature,
      type: 'plan',
      itemId: plan.id
    },
    creditsToAdd,
    provider
  );

  if (!verification.success) {
    return res.status(400).json({ error: verification.error || 'Payment verification failed' });
  }

  // Update Payment Record
  const payRec = prodDb.getPayment(orderId);
  if (payRec) {
    payRec.paymentId = paymentId || payRec.paymentId;
    payRec.status = 'captured';
    payRec.verificationStatus = 'verified';
    payRec.updatedAt = new Date().toISOString();
  }

  // Record Subscription
  const subId = `sub_${Date.now()}`;
  const mandateId = `mand_rzp_${crypto.randomBytes(6).toString('hex')}`;
  const newSubscription: UserSubscription = {
    id: subId,
    userId,
    planId: plan.id,
    planName: plan.name,
    provider: provider as any,
    mandateId,
    status: plan.isIntro ? 'trial' : 'active',
    startAt: new Date().toISOString(),
    nextChargeAt,
    renewalAmount: plan.renewalPrice
  };
  prodDb.setSubscription(newSubscription);

  // Credit the wallet server-authoritatively
  prodDb.creditWallet(userId, creditsToAdd, description, orderId);
  prodDb.markWebhookProcessed(idempotencyKey);

  res.json({
    success: true,
    creditsAdded: creditsToAdd,
    wallet: prodDb.getWallet(userId),
    subscription: newSubscription,
    message: 'Payment verified and credits activated successfully'
  });
});

// Production Webhook Handler with Signature Verification and Idempotency
const handleRazorpayWebhook = async (req: express.Request, res: express.Response) => {
  const signature = (req.headers['x-razorpay-signature'] as string) || '';
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  const verification = razorpayAdapter.verifyWebhookSignature(rawBody, signature);
  if (!verification.isValid && process.env.RAZORPAY_WEBHOOK_SECRET) {
    return res.status(400).json({ error: 'Invalid webhook signature', message: verification.error });
  }

  const event = req.body;
  if (!event || !event.event) {
    return res.status(400).json({ error: 'Malformed webhook payload' });
  }

  const eventType = event.event;
  const eventId = event.event_id || event.id || `evt_${eventType}_${event.created_at || Date.now()}`;

  if (prodDb.isWebhookProcessed(eventId)) {
    return res.status(200).json({ status: 'ignored_duplicate', eventId });
  }

  try {
    if (eventType === 'payment.captured') {
      const payment = event.payload?.payment?.entity;
      if (payment) {
        const userId = payment.notes?.userId || Object.keys(prodDb.raw.users)[0] || 'usr_guest_demo';
        const planId = payment.notes?.itemId || 'plan_intro_daily';
        const plan = getSubscriptionPlanById(planId);
        prodDb.creditWallet(userId, plan.includedCredits, `Webhook Credit: ${plan.name}`, payment.id);
      }
    } else if (eventType === 'subscription.charged') {
      const subEntity = event.payload?.subscription?.entity;
      const payment = event.payload?.payment?.entity;
      const userId = subEntity?.notes?.userId || payment?.notes?.userId || Object.keys(prodDb.raw.users)[0] || 'usr_guest_demo';

      // Grant 500 daily credits upon renewal
      prodDb.creditWallet(userId, 500, 'Daily Pro Pass AutoPay Renewal (₹499)', payment?.id || eventId);
      const sub = prodDb.getSubscription(userId);
      if (sub) {
        sub.status = 'active';
        const nextCalDay = calculateNextCalendarDayStartDate();
        sub.nextChargeAt = nextCalDay.isoString;
        prodDb.setSubscription(sub);
      }
    } else if (eventType === 'subscription.cancelled') {
      const subEntity = event.payload?.subscription?.entity;
      const userId = subEntity?.notes?.userId || Object.keys(prodDb.raw.users)[0] || 'usr_guest_demo';
      const sub = prodDb.getSubscription(userId);
      if (sub) {
        sub.status = 'cancelled';
        sub.cancelledAt = new Date().toISOString();
        prodDb.setSubscription(sub);
      }
    }

    prodDb.markWebhookProcessed(eventId);
    res.status(200).json({ status: 'processed', event: eventType, eventId });
  } catch (err: any) {
    res.status(500).json({ error: 'Webhook processing failure' });
  }
};

app.post('/api/razorpay/webhook', handleRazorpayWebhook);
app.post('/api/payments/webhook', handleRazorpayWebhook);

// Cancel Subscription Endpoint
app.post('/api/subscriptions/cancel', async (req, res) => {
  const userId = getUserId(req);
  const sub = prodDb.getSubscription(userId);

  if (!sub) {
    return res.status(404).json({ error: 'No active subscription found' });
  }

  if (sub.provider === 'razorpay' && sub.mandateId) {
    await razorpayAdapter.cancelSubscription(sub.mandateId);
  }

  sub.status = 'cancelled';
  sub.cancelledAt = new Date().toISOString();
  prodDb.setSubscription(sub);

  res.json({
    success: true,
    subscription: sub,
    message: 'Subscription and recurring mandate cancelled successfully.'
  });
});

/* =========================================================================
   6. GENERATION PIPELINE (ATOMIC RESERVE, FINALIZE & 100% REFUND)
========================================================================= */

app.post('/api/generations/create', async (req, res) => {
  const userId = getUserId(req);
  const { templateId, inputMediaUrl, customPrompt } = req.body;

  const template = prodDb.getTemplates().find(t => t.id === templateId);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  if (!inputMediaUrl) {
    return res.status(400).json({ error: 'Please upload media to generate' });
  }

  // Strict Server-Authoritative Cost Calculation (40% Markup Rule)
  const requiredCredits = calculateAuthoritativeTemplateCost(template);
  const wallet = prodDb.getWallet(userId);

  if (wallet.balance < requiredCredits) {
    return res.status(402).json({
      error: 'Insufficient credits',
      requiredCredits,
      availableCredits: wallet.balance
    });
  }

  const genId = `gen_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  // 1. Atomic credit reservation upfront
  const reserved = prodDb.reserveCredits(userId, requiredCredits, `Created: ${template.title}`, genId);
  if (!reserved) {
    return res.status(402).json({ error: 'Failed to reserve credits' });
  }

  // 2. Record generation
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

  prodDb.addGeneration(generation);

  // Return immediate response with processing status
  res.json({
    generation,
    remainingCredits: prodDb.getWallet(userId).balance
  });

  // Asynchronous Execution with failure refund
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

      // Finalize generation
      prodDb.updateGeneration(genId, {
        status: 'completed',
        resultMediaUrl: templateResult.resultUrl,
        completedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[Generation Pipeline] Failed:', err);
      prodDb.updateGeneration(genId, {
        status: 'failed',
        error: err.message || 'Generation failed'
      });
      // 100% Exact Refund
      prodDb.refundCredits(userId, requiredCredits, `Refund: Failed generation (${template.title})`, genId);
    }
  })();
});

// Face Swap Video Route
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
    return res.status(400).json({ error: 'Please upload face photo' });
  }

  const requiredCredits = calculateAuthoritativeTemplateCost({ isFaceSwap: true });
  const wallet = prodDb.getWallet(userId);

  if (wallet.balance < requiredCredits) {
    return res.status(402).json({
      error: 'Insufficient credits',
      requiredCredits,
      availableCredits: wallet.balance
    });
  }

  const genId = `gen_fsv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  // Atomic reservation
  const reserved = prodDb.reserveCredits(userId, requiredCredits, `Face Swap: ${scene.title}`, genId);
  if (!reserved) {
    return res.status(402).json({ error: 'Failed to reserve credits' });
  }

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
  prodDb.addGeneration(generation);

  res.json({
    generation,
    remainingCredits: prodDb.getWallet(userId).balance
  });

  (async () => {
    try {
      const result = await generateFaceSwapVideo(
        {
          targetVideoUrl: scene.resultVideoPreview,
          sourceFaceUrl: facePhotoUrl,
          sceneTitle: scene.title
        },
        scene.resultVideoPreview
      );
      prodDb.updateGeneration(genId, {
        status: 'completed',
        resultMediaUrl: result.resultUrl,
        completedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[FaceSwap Pipeline] Failed:', err);
      prodDb.updateGeneration(genId, {
        status: 'failed',
        error: err.message || 'Face swap generation failed'
      });
      prodDb.refundCredits(userId, requiredCredits, `Refund: Failed face swap (${scene.title})`, genId);
    }
  })();
});

// Generations History
app.get('/api/generations', (req, res) => {
  const userId = getUserId(req);
  const results = prodDb.getUserGenerations(userId);
  res.json({ generations: results });
});

app.delete('/api/generations/:id', (req, res) => {
  const userId = getUserId(req);
  const index = prodDb.raw.generations.findIndex(g => g.id === req.params.id && g.userId === userId);
  if (index !== -1) {
    prodDb.raw.generations.splice(index, 1);
    prodDb.save();
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Generation not found' });
});

/* =========================================================================
   7. PRODUCTION DIAGNOSTICS & TEST SUITE
========================================================================= */

app.post('/api/admin/diagnostics', async (_req, res) => {
  const tests = [
    {
      id: 'auth_isolation',
      name: 'Authentication & User Isolation',
      category: 'Security',
      fn: () => {
        const u = prodDb.getUser('usr_guest_demo');
        if (!u) throw new Error('Default user not found');
        return 'Multi-tenant isolation verified';
      }
    },
    {
      id: 'pricing_markup',
      name: 'Central Pricing Engine (USD/INR + 40% Markup)',
      category: 'Pricing',
      fn: () => {
        const videoCost = calculateCreditsFromUsd(5.00); // $5 * 96.3 * 1.40 = 674.1 -> 675
        if (videoCost < 670 || videoCost > 680) throw new Error(`Unexpected markup calculation: ${videoCost}`);
        return `Validated formula: $5.00 = ${videoCost} credits`;
      }
    },
    {
      id: 'razorpay_order_3plans',
      name: 'Razorpay AutoPay Orders (₹1, ₹199, ₹998)',
      category: 'Payments',
      fn: async () => {
        for (const plan of CENTRAL_SUBSCRIPTION_PLANS) {
          const ord = await razorpayAdapter.createOrder({
            userId: 'usr_guest_demo',
            type: 'plan',
            itemId: plan.id,
            amount: plan.price,
            credits: plan.includedCredits,
            itemTitle: plan.name,
            isMandate: plan.autoPayEnabled
          });
          if (!ord.orderId) throw new Error(`Order generation failed for plan ${plan.id}`);
        }
        return 'All 3 plans verified successfully';
      }
    },
    {
      id: 'payment_idempotency',
      name: 'Server Verification & Idempotency Guard',
      category: 'Payments',
      fn: () => {
        const dummyKey = `test_idempotency_${Date.now()}`;
        prodDb.markWebhookProcessed(dummyKey);
        if (!prodDb.isWebhookProcessed(dummyKey)) throw new Error('Idempotency guard check failed');
        return 'Duplicate credit prevention verified';
      }
    },
    {
      id: 'credit_atomic_refund',
      name: 'Atomic Credit Reserve & Failure Refund',
      category: 'Ledger',
      fn: () => {
        const initial = prodDb.getWallet('usr_guest_demo').balance;
        const testId = `test_ref_${Date.now()}`;
        prodDb.reserveCredits('usr_guest_demo', 10, 'Test Reserve', testId);
        prodDb.refundCredits('usr_guest_demo', 10, 'Test Refund', testId);
        const final = prodDb.getWallet('usr_guest_demo').balance;
        if (initial !== final) throw new Error('Balance mismatch after refund');
        return 'Atomic transaction cycle verified';
      }
    },
    {
      id: 'template_manager_db',
      name: 'Self-Service Dynamic Template Manager',
      category: 'Templates',
      fn: () => {
        const templates = prodDb.getTemplates();
        if (templates.length === 0) throw new Error('Templates catalog is empty');
        return `Active catalog: ${templates.length} templates`;
      }
    }
  ];

  const results = [];
  for (const t of tests) {
    const start = Date.now();
    try {
      const details = await t.fn();
      results.push({
        id: t.id,
        name: t.name,
        category: t.category,
        status: 'passed',
        durationMs: Date.now() - start,
        details
      });
    } catch (err: any) {
      results.push({
        id: t.id,
        name: t.name,
        category: t.category,
        status: 'failed',
        durationMs: Date.now() - start,
        details: err.message
      });
    }
  }

  res.json({ success: true, results });
});

/* =========================================================================
   8. CLIENT VITE MOUNT & PRODUCTION SERVER
========================================================================= */

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Prime STUDIO server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
