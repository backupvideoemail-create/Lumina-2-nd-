import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  X,
  Mail,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SUPPORT_CONFIG } from '../config/subscriptionConfig.ts';

const FAQS = [
  {
    q: 'How does AI Prime STUDIO work?',
    a: 'Choose any cinematic template, upload your portrait, selfie, or video clip, and our neural engines analyze lighting, face geometry, and styling to synthesize an ultra-high-definition output with professional grading.'
  },
  {
    q: 'What is the ₹1 Pro Pass Daily Autopay?',
    a: 'Our Pro Pass gives you instant access to 500 premium credits for an introductory payment of ₹1. The recurring daily subscription renewal of ₹499 begins from the next calendar day until cancelled. You can cancel with 1-click anytime in your Profile with zero cancellation fees.'
  },
  {
    q: 'What happens if a generation fails or times out?',
    a: 'Our server credit ledger automatically detects failed or timed-out rendering processes and immediately refunds 100% of the reserved credits back into your available balance.'
  },
  {
    q: 'How do I download or share my creations without watermarks?',
    a: 'All generations completed under active credits or Pro Pass come completely watermark-free and can be downloaded in native 1080p or 4K resolution.'
  },
  {
    q: 'How do I cancel my active daily mandate or subscription?',
    a: `Simply open the Profile tab, locate your Active Subscription card, and tap "Cancel Subscription" (or email us directly at ${SUPPORT_CONFIG.email}). It will instantly cancel all future recurring renewals while allowing you to keep any unused credits.`
  }
];

export const SupportModal: React.FC = () => {
  const { supportModalOpen, setSupportModalOpen, setLegalModal } = useApp();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  if (!supportModalOpen) return null;

  const handleEmail = () => {
    window.location.href = `mailto:${SUPPORT_CONFIG.email}?subject=AI%20Prime%20Studio%20Support`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md">
      <div className="absolute inset-0" onClick={() => setSupportModalOpen(false)} />

      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="relative w-full max-w-lg bg-[#111116] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl z-10 max-h-[88vh] overflow-y-auto no-scrollbar space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <HelpCircle className="w-4 h-4 text-[#f5d77f]" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-display text-white">Help & Support</h3>
              <p className="text-xs text-stone-400">Dedicated creator support desk</p>
            </div>
          </div>
          <button
            onClick={() => setSupportModalOpen(false)}
            className="p-2 text-stone-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customer Support Desk Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-stone-900/90 via-[#151419] to-stone-900/90 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#d4af37]" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Email Support Desk</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              Active Desk
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div>
              <span className="text-sm font-semibold text-stone-200 block select-all">
                {SUPPORT_CONFIG.email}
              </span>
              <span className="text-[11px] text-stone-400">
                Guaranteed response within 24 hours for billing, credits, or account inquiries.
              </span>
            </div>

            <button
              type="button"
              onClick={handleEmail}
              className="py-2.5 px-4 rounded-xl gold-button text-xs font-bold shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Contact Support</span>
            </button>
          </div>
        </div>

        {/* FAQs Accordion */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-300">
            Frequently Asked Questions
          </h4>
          <div className="space-y-2">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="rounded-xl bg-stone-900/70 border border-white/5 overflow-hidden transition-colors"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full p-3.5 text-left flex items-center justify-between text-xs font-semibold text-stone-200 hover:text-white"
                  >
                    <span>{faq.q}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-[#d4af37] shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-stone-500 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-3.5 pb-3.5 text-xs text-stone-400 leading-relaxed border-t border-white/5 pt-2">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Policy Direct Links */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-around text-xs text-stone-400">
          <button
            onClick={() => {
              setSupportModalOpen(false);
              setLegalModal('refund');
            }}
            className="hover:text-stone-200 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#d4af37]" />
            <span>Refund Policy</span>
          </button>
          <button
            onClick={() => {
              setSupportModalOpen(false);
              setLegalModal('terms');
            }}
            className="hover:text-stone-200 transition-colors"
          >
            Terms of Service
          </button>
          <button
            onClick={() => {
              setSupportModalOpen(false);
              setLegalModal('privacy');
            }}
            className="hover:text-stone-200 transition-colors"
          >
            Privacy
          </button>
        </div>
      </motion.div>
    </div>
  );
};
