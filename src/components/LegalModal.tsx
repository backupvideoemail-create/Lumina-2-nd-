import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, ShieldAlert, CheckCircle2, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const LegalModal: React.FC = () => {
  const { legalModal, setLegalModal, deleteAccount } = useApp();
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!legalModal) return null;

  const handleDelete = async () => {
    if (confirmText.toLowerCase() !== 'delete') return;
    setIsDeleting(true);
    await deleteAccount();
    setIsDeleting(false);
  };

  const titles = {
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    refund: 'Refund & Credit Policy',
    delete: 'Account & Media Deletion'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="absolute inset-0" onClick={() => setLegalModal(null)} />

      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        className="relative w-full max-w-lg bg-[#111116] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl z-10 max-h-[85vh] flex flex-col justify-between"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h3 className="text-lg font-bold font-display text-white">
            {titles[legalModal]}
          </h3>
          <button
            onClick={() => setLegalModal(null)}
            className="p-2 text-stone-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar py-4 space-y-4 text-xs text-stone-300 leading-relaxed pr-1">
          {legalModal === 'privacy' && (
            <>
              <p>
                <strong>1. Customer Media Privacy:</strong> Photos and videos uploaded to AI Prime STUDIO are processed strictly for generating your requested template output. Your personal media files are never sold, published publicly, or used to train foundation models without your explicit prior consent.
              </p>
              <p>
                <strong>2. Data Encryption:</strong> All uploads and server communications are transmitted over 256-bit TLS/SSL encryption. Media records can be permanently deleted at any time by deleting individual creations or requesting full account deletion.
              </p>
              <p>
                <strong>3. Server Security:</strong> Authentication credentials and payment references are protected using industry-standard server architecture and zero-exposure environment secrets.
              </p>
            </>
          )}

          {legalModal === 'terms' && (
            <>
              <p>
                <strong>1. Acceptable Use:</strong> You agree not to upload copyrighted images without authorization, sexually explicit material, hate speech, or defamatory depictions of real persons.
              </p>
              <p>
                <strong>2. Pro Pass & Autopay Mandates:</strong> Subscribing to the ₹1 Introductory Pro Pass authorizes an initial introductory payment of ₹1, followed by recurring daily subscription renewal charges of ₹499 commencing from the next calendar day until cancelled. Subscriptions may be cancelled at any time in 1-click via the User Profile screen or by contacting customer support at ai.prime.studio.pro@gmail.com.
              </p>
              <p>
                <strong>3. AI Disclosure:</strong> Media synthesized by our neural models is labelled as AI-generated in compliance with transparency standards.
              </p>
            </>
          )}

          {legalModal === 'refund' && (
            <>
              <p>
                <strong>1. Automatic Generation Failure Refund:</strong> If a generation fails, times out, or encounters a server error, 100% of the reserved credits are automatically restored to your wallet ledger immediately.
              </p>
              <p>
                <strong>2. Subscription Cancellation:</strong> Cancelling your daily or weekly plan stops all future recurring charges immediately. You retain full access to any unspent credits in your account.
              </p>
              <p>
                <strong>3. Support Disputes:</strong> If you experience any billing discrepancies or accidental double-charges, contact our customer support desk at <span className="text-[#d4af37]">ai.prime.studio.pro@gmail.com</span> for prompt resolution within 24 hours.
              </p>
            </>
          )}

          {legalModal === 'delete' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800/60 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs text-red-200">
                  <p className="font-bold">Permanent Deletion Warning</p>
                  <p className="mt-1 text-red-300/80">
                    Deleting your account will immediately wipe your uploaded media, generation history, credit wallet balance, and active subscription mandates. This action cannot be reversed.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-stone-300 block">
                  Type <span className="text-red-400 font-mono font-bold">DELETE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-4 py-2.5 bg-stone-900 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-red-500 font-mono"
                />
              </div>

              <button
                onClick={handleDelete}
                disabled={confirmText.toLowerCase() !== 'delete' || isDeleting}
                className="w-full py-3 px-4 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Deleting...' : 'Permanently Delete Account & Media'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {legalModal !== 'delete' && (
          <div className="pt-3 border-t border-white/10 text-right">
            <button
              onClick={() => setLegalModal(null)}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
