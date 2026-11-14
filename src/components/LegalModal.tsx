import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, ShieldAlert, CheckCircle2, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const LegalModal: React.FC = () => {
  const { user, legalModal, setLegalModal, setAuthModalOpen, deleteAccount } = useApp();
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!legalModal) return null;

  const closeLegalModal = () => {
    if (isDeleting) return;
    setLegalModal(null);
    const normalized = window.location.pathname.toLowerCase().replace(/\/+$/, '');
    if (['/privacy', '/privacy-policy', '/terms', '/terms-of-service', '/refund', '/refund-policy', '/delete-account'].includes(normalized)) {
      window.history.replaceState({}, '', '/');
    }
  };

  const handleDelete = async () => {
    if (confirmText.toLowerCase() !== 'delete') return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const ok = await deleteAccount();
      if (!ok) {
        setDeleteError('Account deletion failed. Please check your network connection and retry.');
        setIsDeleting(false);
      } else {
        closeLegalModal();
      }
    } catch (err: any) {
      setDeleteError(err.message || 'An unexpected error occurred during account deletion.');
      setIsDeleting(false);
    }
  };

  const titles = {
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    refund: 'Refund & Credit Policy',
    delete: 'Account & Media Deletion'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="absolute inset-0" onClick={closeLegalModal} />

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
            onClick={closeLegalModal}
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
                <strong>1. Customer Media Privacy:</strong> Photos and videos uploaded to AI Prime Studio are processed strictly for generating your requested template output. Your personal media files are never sold, published publicly, or used to train foundation models without your explicit prior consent.
              </p>
              <p>
                <strong>2. Data Encryption & Retention:</strong> All uploads and server communications are transmitted over 256-bit TLS/SSL encryption. Media records and profile history can be deleted at any time from your Creations gallery or via our <span className="text-[#d4af37]">/delete-account</span> deletion workflow. Payment and billing ledger identifiers may be retained only as required for tax, fraud-prevention, and statutory compliance.
              </p>
              <p>
                <strong>3. Server Security & Contact:</strong> Authentication credentials and payment references are protected using industry-standard server architecture and zero-exposure environment secrets. Contact: <span className="text-[#d4af37]">ai.prime.studio.pro@gmail.com</span>.
              </p>
            </>
          )}

          {legalModal === 'terms' && (
            <>
              <p>
                <strong>1. Acceptable Use:</strong> You agree not to upload copyrighted images without authorization, sexually explicit material, hate speech, or defamatory depictions of real persons.
              </p>
              <p>
                <strong>2. Pro Pass & Autopay Mandates:</strong> Subscribing to the Double Bonanza plan authorizes an initial introductory payment of ₹1 for 24-hour trial access, followed by recurring weekly subscription renewal charges of ₹499 for 400 credits commencing after the trial period until cancelled. Subscriptions may be cancelled at any time in 1-click via the User Profile screen or by contacting customer support at ai.prime.studio.pro@gmail.com.
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
                <strong>2. Subscription Cancellation:</strong> Cancelling your recurring plan stops all future recurring charges immediately. You retain full access to any unspent credits in your account.
              </p>
              <p>
                <strong>3. Support Disputes:</strong> If you experience any billing discrepancies or accidental double-charges, contact our customer support desk at <span className="text-[#d4af37]">ai.prime.studio.pro@gmail.com</span> for prompt resolution within 24 hours.
              </p>
              <p>
                <strong>4. Account Deletion & AutoPay:</strong> Deleting your user profile deletes personal data, creations, and login access, but does not cancel active Google Play, bank, or UPI AutoPay mandates. Existing recurring subscriptions must be separately cancelled in Google Play Subscriptions or your UPI application/bank.
              </p>
            </>
          )}

          {legalModal === 'delete' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800/60 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs text-red-200">
                  <p className="font-bold">AI Prime Studio Account &amp; Data Deletion</p>
                  <p className="mt-1 text-red-300/80">
                    Account deletion permanently deletes your user profile, login identity, wallet metadata, and uploaded/generated media files. Minimum payment transaction IDs required for statutory tax/fraud compliance may be retained without profile PII. However, <strong>active UPI AutoPay subscriptions will continue billing</strong> and active Google Play subscriptions must be cancelled separately via Google Play or your UPI/bank app.
                  </p>
                </div>
              </div>

              {user ? (
                <>
                  {deleteError && (
                    <div className="p-3 rounded-xl bg-red-900/40 border border-red-500/50 text-red-300 text-xs">
                      {deleteError}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-stone-300 block">
                      Type <span className="text-red-400 font-mono font-bold">DELETE</span> to confirm permanent deletion for <span className="text-white">{user.email || user.phone || user.id}</span>:
                    </label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="DELETE"
                      disabled={isDeleting}
                      className="w-full px-4 py-2.5 bg-stone-900 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-red-500 font-mono disabled:opacity-50"
                    />
                  </div>

                  <button
                    onClick={handleDelete}
                    disabled={confirmText.toLowerCase() !== 'delete' || isDeleting}
                    className="w-full py-3 px-4 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{isDeleting ? 'Wiping Profile & Media...' : 'Permanently Delete Account & Media'}</span>
                  </button>
                </>
              ) : (
                <div className="space-y-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                  <p className="font-semibold text-white">How to delete your account:</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-stone-300">
                    <li>Sign in to the account you want to delete and confirm permanent deletion here immediately.</li>
                    <li>Or email <a href="mailto:ai.prime.studio.pro@gmail.com?subject=Account%20Deletion%20Request" className="text-[#d4af37] underline">ai.prime.studio.pro@gmail.com</a> from your registered email address with the subject <strong>Account Deletion Request</strong> (processed within 7 days).</li>
                  </ol>
                  <button
                    type="button"
                    onClick={() => {
                      closeLegalModal();
                      setAuthModalOpen(true);
                    }}
                    className="w-full py-2.5 px-4 gold-button rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Sign In to Delete Account Now
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/10 text-right">
          <button
            onClick={closeLegalModal}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};
