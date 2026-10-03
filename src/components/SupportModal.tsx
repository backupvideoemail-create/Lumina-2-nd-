import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  X,
  MessageCircle,
  Mail,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const FAQS = [
  {
    q: 'How does Lumina AI Studio work?',
    a: 'Choose any cinematic template, upload your portrait, selfie, or video clip, and our neural engines analyze lighting, face geometry, and styling to synthesize an ultra-high-definition output with professional grading.'
  },
  {
    q: 'What is the ₹1 Pro Pass Daily Autopay?',
    a: 'Our Pro Pass gives you instant access to 500 premium credits for just ₹1 for the first 24 hours. Afterwards, it renews at ₹199 every 24 hours. You can cancel with 1-click anytime in your Profile with zero cancellation fees.'
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
    a: 'Simply open the Profile tab, locate your Active Subscription card, and tap "Cancel Subscription". It will instantly cancel future recurring renewals while allowing you to keep any unused credits.'
  }
];

export const SupportModal: React.FC = () => {
  const { supportModalOpen, setSupportModalOpen, setLegalModal } = useApp();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  if (!supportModalOpen) return null;

  const handleWhatsApp = () => {
    window.open('https://wa.me/919876543210?text=Hi%20Lumina%20Support%2C%20I%20need%20help%20with%20my%20account', '_blank');
  };

  const handleEmail = () => {
    window.location.href = 'mailto:support@lumina.studio?subject=Lumina%20Template%20Studio%20Support';
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
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <HelpCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-display text-white">Help & Support</h3>
              <p className="text-xs text-stone-400">24/7 dedicated creator care</p>
            </div>
          </div>
          <button
            onClick={() => setSupportModalOpen(false)}
            className="p-2 text-stone-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instant Contact Channels */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleWhatsApp}
            className="p-4 rounded-2xl bg-emerald-950/40 hover:bg-emerald-950/60 border border-emerald-700/50 flex flex-col items-center text-center gap-2 transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">WhatsApp Care</span>
              <span className="text-[10px] text-emerald-300">Fast 5-min response</span>
            </div>
          </button>

          <button
            type="button"
            onClick={handleEmail}
            className="p-4 rounded-2xl bg-stone-900/60 hover:bg-stone-900 border border-white/10 flex flex-col items-center text-center gap-2 transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
              <Mail className="w-5 h-5 text-stone-300" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">Email Desk</span>
              <span className="text-[10px] text-stone-400">support@lumina.studio</span>
            </div>
          </button>
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
