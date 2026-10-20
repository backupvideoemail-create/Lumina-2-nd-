import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, ArrowUpRight, ArrowDownLeft, RotateCcw, Gift, Shield, CreditCard, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const TransactionLedgerModal: React.FC = () => {
  const {
    transactionsModalOpen,
    setTransactionsModalOpen,
    transactions,
    wallet,
    activeSubscription,
    cancelSubscription
  } = useApp();

  const [isCancelling, setIsCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleCancelSub = async () => {
    setIsCancelling(true);
    setFeedback(null);
    try {
      const ok = await cancelSubscription();
      if (ok) {
        setFeedback({ text: 'AutoPay renewal cancelled successfully.', type: 'success' });
        setConfirmingCancel(false);
      } else {
        setFeedback({ text: 'Failed to cancel AutoPay renewal. Please try again.', type: 'error' });
      }
    } catch (err: any) {
      setFeedback({ text: err.message || 'Error cancelling subscription', type: 'error' });
    } finally {
      setIsCancelling(false);
    }
  };

  if (!transactionsModalOpen) return null;

  const hasSub = Boolean(
    activeSubscription &&
    (activeSubscription.status === 'active' ||
      activeSubscription.status === 'trial' ||
      activeSubscription.status === 'cancelled' ||
      activeSubscription.mandateId)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="absolute inset-0" onClick={() => setTransactionsModalOpen(false)} />
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative w-full max-w-lg bg-[#111116] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl z-10 max-h-[85vh] flex flex-col justify-between"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold font-display text-white">Account & Wallet</h3>
            <p className="text-xs text-stone-400">Membership, AutoPay & Credit Ledger</p>
          </div>
          <button
            onClick={() => setTransactionsModalOpen(false)}
            className="p-2 text-stone-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Balance Quick Bar */}
        <div className="py-3 px-4 my-2.5 rounded-2xl bg-stone-900 border border-white/5 flex items-center justify-between">
          <span className="text-xs font-semibold text-stone-400">Available Wallet Balance</span>
          <span className="text-lg font-bold text-[#f5d77f] flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 fill-[#d4af37]" />
            {wallet?.balance || 0} Credits
          </span>
        </div>

        {/* ACTIVE MEMBERSHIP & CANCEL SUBSCRIPTION SECTION */}
        {hasSub && (
          <div className="p-3.5 my-1.5 rounded-2xl bg-gradient-to-r from-stone-900 to-[#18151b] border border-amber-500/25 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">
                    {activeSubscription?.planName || 'Active Membership'}
                  </h4>
                  <span className="text-[10px] text-stone-400 block">
                    Status:{' '}
                    <span
                      className={`font-semibold capitalize ${
                        activeSubscription?.status === 'cancelled' ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {activeSubscription?.status === 'cancelled' ? 'Cancelled (No further renewal)' : 'Active AutoPay'}
                    </span>
                  </span>
                </div>
              </div>

              {activeSubscription?.status !== 'cancelled' && (
                <div>
                  {!confirmingCancel ? (
                    <button
                      onClick={() => setConfirmingCancel(true)}
                      className="px-2.5 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-[11px] font-bold transition-all cursor-pointer"
                    >
                      Cancel AutoPay
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleCancelSub}
                        disabled={isCancelling}
                        className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isCancelling ? 'Cancelling...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmingCancel(false)}
                        disabled={isCancelling}
                        className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-stone-300 text-[10px] font-medium transition-all cursor-pointer"
                      >
                        Keep
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {feedback && (
              <div
                className={`p-2 rounded-xl text-[11px] font-medium flex items-center gap-2 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/15 border border-red-500/30 text-red-300'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{feedback.text}</span>
              </div>
            )}

            {activeSubscription?.status === 'cancelled' && (
              <p className="text-[10px] text-stone-400 leading-tight">
                Your AutoPay mandate has been cancelled. You will not be charged again. Your remaining credits remain available in your wallet.
              </p>
            )}
          </div>
        )}

        {/* Transaction History List */}
        <div className="flex-1 overflow-y-auto no-scrollbar space-y-2.5 my-2 pr-1">
          {transactions.length === 0 ? (
            <div className="py-12 text-center text-xs text-stone-500">
              No transactions recorded yet.
            </div>
          ) : (
            transactions.map((tx) => {
              const isPositive = tx.amount > 0;
              return (
                <div
                  key={tx.id}
                  className="p-3 rounded-xl bg-stone-900/60 border border-white/5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        tx.type === 'generation'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : tx.type === 'refund'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : tx.type === 'promo'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : 'bg-[#d4af37]/10 text-[#d4af37] border border-[#d4af37]/20'
                      }`}
                    >
                      {tx.type === 'generation' ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : tx.type === 'refund' ? (
                        <RotateCcw className="w-4 h-4" />
                      ) : tx.type === 'promo' ? (
                        <Gift className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <h5 className="text-xs font-semibold text-white leading-tight">
                        {tx.description}
                      </h5>
                      <div className="flex items-center gap-2 text-[10px] text-stone-500 mt-0.5">
                        <span className="capitalize">{tx.type}</span>
                        <span aria-hidden="true">·</span>
                        <span>{new Date(tx.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>

                  <div className={`text-sm font-bold ${isPositive ? 'text-emerald-400' : 'text-stone-300'}`}>
                    {isPositive ? `+${tx.amount}` : tx.amount} ✦
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="pt-3 border-t border-white/10 text-center">
          <p className="text-[11px] text-stone-500">
            All credit mutations are cryptographically validated server-side.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
