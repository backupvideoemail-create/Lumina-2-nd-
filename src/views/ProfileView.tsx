import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  CreditCard,
  History,
  Shield,
  FileText,
  HelpCircle,
  RotateCcw,
  Trash2,
  ChevronRight,
  LogOut,
  Edit2,
  Check,
  AlertTriangle,
  Zap,
  Lock,
  Mail
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SUPPORT_CONFIG } from '../config/subscriptionConfig.ts';

export const ProfileView: React.FC = () => {
  const {
    user,
    wallet,
    activeSubscription,
    cancelSubscription,
    setPlansModalOpen,
    setTransactionsModalOpen,
    setSupportModalOpen,
    setLegalModal,
    setAuthModalOpen,
    setTopUpModalOpen,
    hasActivePlan,
    updateProfile
  } = useApp();

  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name || '');
  const [cancellingSub, setCancellingSub] = useState(false);

  const handleSaveProfile = async () => {
    if (nameInput.trim()) {
      await updateProfile(nameInput.trim(), user?.avatar || '');
    }
    setIsEditing(false);
  };

  const handleCancelSubscription = async () => {
    if (confirm('Are you sure you want to cancel your daily Pro Pass renewal (₹499/day)? You will retain all your current credits.')) {
      setCancellingSub(true);
      await cancelSubscription();
      setCancellingSub(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08080a] pb-32 text-stone-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#08080a]/85 backdrop-blur-xl border-b border-white/5 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <h2 className="text-xl font-bold font-display text-white">Profile & Account</h2>
          {hasActivePlan ? (
            <button
              onClick={() => setTopUpModalOpen(true)}
              className="px-3 py-1.5 rounded-full gold-button text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-black" />
              <span>Buy More Credits</span>
            </button>
          ) : (
            <button
              onClick={() => setPlansModalOpen(true)}
              className="px-3 py-1.5 rounded-full gold-button text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Unlock Pro (₹1)</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 pt-6 space-y-6">
        {/* 1. Profile Card Header (Overlapping UI concept with Avatar) */}
        <div className="relative rounded-3xl bg-gradient-to-b from-[#14141a] to-[#0e0e13] border border-white/10 p-6 shadow-2xl">
          {/* Subtle gold gradient header backdrop */}
          <div className="absolute top-0 inset-x-0 h-20 rounded-t-3xl bg-gradient-to-r from-[#d4af37]/20 via-[#d4af37]/5 to-transparent pointer-events-none" />

          <div className="relative z-10 flex items-start gap-4">
            {/* Avatar */}
            <div className="relative">
              <img
                src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'}
                alt={user?.name || 'Creator'}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-[#d4af37]/60 shadow-[0_0_16px_rgba(212,175,55,0.25)]"
              />
              <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-[#d4af37] text-stone-950 text-[9px] font-extrabold uppercase">
                {user?.role || 'Creator'}
              </div>
            </div>

            {/* User Meta */}
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="px-2.5 py-1 bg-stone-900 border border-white/20 rounded-lg text-sm text-white focus:outline-none focus:border-[#d4af37]"
                  />
                  <button
                    onClick={handleSaveProfile}
                    className="p-1.5 rounded-lg bg-[#d4af37] text-black hover:bg-amber-400"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold font-display text-white truncate">
                    {user?.name || 'Guest Creator'}
                  </h3>
                  <button
                    onClick={() => {
                      setNameInput(user?.name || '');
                      setIsEditing(true);
                    }}
                    className="p-1 text-stone-400 hover:text-white"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-xs text-stone-400 mt-0.5 truncate">
                {user?.email || 'creator@aiprime.studio'}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-stone-400">
                <span>{user?.generationCount || 0} Total Creations</span>
                <span aria-hidden="true" className="text-stone-600">·</span>
                <span className="text-[#d4af37]">Active Member</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Server-Authoritative Credit Wallet Card */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-[#16151b] via-[#101015] to-[#0c0c10] border border-[#d4af37]/30 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Credit Ledger Balance
            </span>
            <button
              onClick={() => setTransactionsModalOpen(true)}
              className="text-xs font-semibold text-[#d4af37] hover:underline flex items-center gap-1"
            >
              <History className="w-3.5 h-3.5" />
              <span>Transaction History</span>
            </button>
          </div>

          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <span className="text-3xl sm:text-4xl font-extrabold font-display text-white">
                {wallet?.balance ?? 0}
              </span>
              <span className="text-base font-bold text-[#f5d77f]">✦ Credits</span>
            </div>

            {hasActivePlan ? (
              <button
                onClick={() => setTopUpModalOpen(true)}
                className="py-2 px-4 gold-button rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 fill-black" />
                <span>+ Buy More Credits</span>
              </button>
            ) : (
              <button
                onClick={() => setPlansModalOpen(true)}
                className="py-2 px-4 gold-button rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <span>Activate Plan (₹1)</span>
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-white/5 grid grid-cols-2 gap-3 text-xs text-stone-400">
            <div>
              <span className="text-stone-500 block text-[11px]">Lifetime Credited:</span>
              <span className="text-stone-200 font-semibold">{wallet?.lifetimeCredits || 0} Credits</span>
            </div>
            <div>
              <span className="text-stone-500 block text-[11px]">Total Spent:</span>
              <span className="text-stone-200 font-semibold">{wallet?.spentCredits || 0} Credits</span>
            </div>
          </div>
        </div>

        {/* 3. Subscription & Plan Status Card */}
        <div className="p-5 rounded-3xl bg-stone-900/80 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#d4af37]" />
              <h4 className="text-sm font-bold text-white">Subscription & Mandate</h4>
            </div>

            {activeSubscription && (
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  activeSubscription.status === 'trial'
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                    : activeSubscription.status === 'active'
                    ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                    : 'bg-stone-800 text-stone-400'
                }`}
              >
                {activeSubscription.status}
              </span>
            )}
          </div>

          {activeSubscription && activeSubscription.status !== 'cancelled' ? (
            <div className="space-y-3 pt-1">
              <div className="p-3 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-bold text-white">{activeSubscription.planName}</h5>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    Next renewal: ₹{activeSubscription.renewalAmount} on{' '}
                    {new Date(activeSubscription.nextChargeAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div className="text-[11px] text-stone-500 font-mono">
                  {activeSubscription.mandateId.slice(0, 12)}
                </div>
              </div>

              {/* Manage / Cancel Subscription Button */}
              <button
                onClick={handleCancelSubscription}
                disabled={cancellingSub}
                className="w-full py-2.5 px-3 rounded-xl border border-red-500/30 bg-red-950/20 hover:bg-red-950/40 text-red-300 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <span>{cancellingSub ? 'Cancelling...' : 'Cancel Subscription (No Fees)'}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-xs text-stone-300 font-medium">Free Tier</p>
                <p className="text-[11px] text-stone-400">Unlock Pro Pass for ₹1 intro payment (then ₹499/day from next calendar day)</p>
              </div>
              <button
                onClick={() => setPlansModalOpen(true)}
                className="px-3 py-1.5 rounded-xl gold-button text-xs font-semibold"
              >
                Unlock Pro (₹1)
              </button>
            </div>
          )}
        </div>

        {/* 4. Support & Direct Assistance */}
        <div className="p-4 rounded-3xl bg-stone-900/60 border border-white/5 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400 px-1">
            Support & Help Desk
          </h4>

          <div className="space-y-1">
            <button
              onClick={() => setSupportModalOpen(true)}
              className="w-full p-3 rounded-2xl hover:bg-white/5 flex items-center justify-between text-xs text-stone-200 transition-colors"
            >
              <div className="flex items-center gap-3">
                <HelpCircle className="w-4 h-4 text-stone-400" />
                <span>Help Desk & FAQs</span>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-500" />
            </button>

            <button
              onClick={() => window.location.href = `mailto:${SUPPORT_CONFIG.email}?subject=AI%20Prime%20Studio%20Support`}
              className="w-full p-3 rounded-2xl hover:bg-white/5 flex items-center justify-between text-xs text-stone-200 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-[#d4af37]" />
                <div className="text-left">
                  <span className="block text-white font-medium">Email Support</span>
                  <span className="block text-[10px] text-stone-400 font-mono">{SUPPORT_CONFIG.email}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-500" />
            </button>

            <button
              onClick={() => setLegalModal('refund')}
              className="w-full p-3 rounded-2xl hover:bg-white/5 flex items-center justify-between text-xs text-stone-200 transition-colors"
            >
              <div className="flex items-center gap-3">
                <RotateCcw className="w-4 h-4 text-stone-400" />
                <span>Refund Policy & Guarantees</span>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-500" />
            </button>
          </div>
        </div>

        {/* 5. Legal, Privacy & Account Deletion */}
        <div className="p-4 rounded-3xl bg-stone-900/60 border border-white/5 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400 px-1">
            Policies & Account Management
          </h4>

          <div className="space-y-1">
            <button
              onClick={() => setLegalModal('privacy')}
              className="w-full p-3 rounded-2xl hover:bg-white/5 flex items-center justify-between text-xs text-stone-200 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Shield className="w-4 h-4 text-stone-400" />
                <span>Privacy Policy</span>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-500" />
            </button>

            <button
              onClick={() => setLegalModal('terms')}
              className="w-full p-3 rounded-2xl hover:bg-white/5 flex items-center justify-between text-xs text-stone-200 transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-stone-400" />
                <span>Terms & Conditions</span>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-500" />
            </button>

            <button
              onClick={() => setLegalModal('delete')}
              className="w-full p-3 rounded-2xl hover:bg-red-950/20 flex items-center justify-between text-xs text-red-400 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-4 h-4 text-red-400" />
                <span>Permanent Account & Media Deletion</span>
              </div>
              <ChevronRight className="w-4 h-4 text-red-500/60" />
            </button>

            <button
              onClick={() => setAuthModalOpen(true)}
              className="w-full p-3 rounded-2xl hover:bg-white/5 flex items-center justify-between text-xs text-stone-400 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-3">
                <LogOut className="w-4 h-4 text-stone-500" />
                <span>Switch / Setup Profile</span>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-500" />
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-stone-600 pt-2 pb-6">
          AI Prime STUDIO v2.4 · 256-Bit SSL Protected
        </div>
      </div>
    </div>
  );
};
