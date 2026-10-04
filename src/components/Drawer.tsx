import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  Grid,
  Clapperboard,
  User,
  CreditCard,
  HelpCircle,
  Shield,
  FileText,
  RotateCcw,
  Trash2,
  ChevronRight,
  ExternalLink,
  Cpu,
  UploadCloud
} from 'lucide-react';
import { Logo } from './Logo';
import { useApp } from '../context/AppContext';

export const Drawer: React.FC = () => {
  const {
    drawerOpen,
    setDrawerOpen,
    user,
    wallet,
    activeTab,
    setActiveTab,
    setPlansModalOpen,
    setSupportModalOpen,
    setLegalModal,
    setOnboardingOpen,
    setTemplateManagerOpen,
    setDiagnosticsModalOpen
  } = useApp();

  const handleNav = (tab: 'home' | 'templates' | 'creations' | 'profile') => {
    setActiveTab(tab);
    setDrawerOpen(false);
  };

  return (
    <AnimatePresence>
      {drawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop Dimming */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          />

          {/* Drawer Content */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="relative w-full max-w-xs h-full bg-[#0d0d12] border-r border-white/10 shadow-2xl flex flex-col justify-between overflow-y-auto no-scrollbar"
          >
            <div>
              {/* Header */}
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <Logo size="sm" />
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-2 text-stone-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Quick Profile Card */}
              <div className="p-4 m-4 rounded-2xl bg-gradient-to-br from-stone-900/90 to-stone-950/80 border border-white/10">
                {user ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="w-12 h-12 rounded-xl object-cover border border-[#d4af37]/40 shadow-md"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-white truncate">{user.name}</h4>
                      <div className="flex items-center gap-1.5 text-xs text-[#d4af37]">
                        <Sparkles className="w-3.5 h-3.5 fill-[#d4af37]" />
                        <span className="font-semibold">{wallet?.balance || 0} Credits</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Guest Creator</h4>
                      <p className="text-xs text-stone-400">Sign up for 100 free credits</p>
                    </div>
                    <button
                      onClick={() => {
                        setDrawerOpen(false);
                        setOnboardingOpen(true);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#d4af37] text-black"
                    >
                      Join
                    </button>
                  </div>
                )}

                {/* Upgrade Button */}
                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    setPlansModalOpen(true);
                  }}
                  className="mt-3 w-full py-2.5 px-3 rounded-xl gold-button text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Get Credits · Pro Pass (₹1)</span>
                </button>
              </div>

              {/* Primary Links */}
              <div className="px-3 py-2 space-y-1">
                <button
                  onClick={() => handleNav('home')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    activeTab === 'home'
                      ? 'bg-white/10 text-white'
                      : 'text-stone-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Sparkles className={`w-4 h-4 ${activeTab === 'home' ? 'text-[#d4af37]' : 'text-stone-400'}`} />
                    <span>Home</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-600" />
                </button>

                <button
                  onClick={() => handleNav('templates')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    activeTab === 'templates'
                      ? 'bg-white/10 text-white'
                      : 'text-stone-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Grid className={`w-4 h-4 ${activeTab === 'templates' ? 'text-[#d4af37]' : 'text-stone-400'}`} />
                    <span>Explore Templates</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-600" />
                </button>

                <button
                  onClick={() => handleNav('creations')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    activeTab === 'creations'
                      ? 'bg-white/10 text-white'
                      : 'text-stone-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Clapperboard className={`w-4 h-4 ${activeTab === 'creations' ? 'text-[#d4af37]' : 'text-stone-400'}`} />
                    <span>My Creations</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-600" />
                </button>

                <button
                  onClick={() => handleNav('profile')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    activeTab === 'profile'
                      ? 'bg-white/10 text-white'
                      : 'text-stone-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <User className={`w-4 h-4 ${activeTab === 'profile' ? 'text-[#d4af37]' : 'text-stone-400'}`} />
                    <span>User Profile & Wallet</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-600" />
                </button>

                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    setPlansModalOpen(true);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium text-stone-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-4 h-4 text-[#d4af37]" />
                    <span>Credits & Plans</span>
                  </div>
                  <span className="text-[11px] font-semibold text-[#d4af37] px-2 py-0.5 rounded bg-[#d4af37]/10">
                    From ₹1
                  </span>
                </button>

                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    setSupportModalOpen(true);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium text-stone-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <HelpCircle className="w-4 h-4 text-stone-400" />
                    <span>Support & FAQs</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-600" />
                </button>

                {/* Studio Tools & Admin */}
                <div className="pt-2 border-t border-white/5 space-y-1">
                  <button
                    onClick={() => {
                      setDrawerOpen(false);
                      setTemplateManagerOpen(true);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium text-[#ff9f00] hover:bg-[#ff9f00]/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <UploadCloud className="w-4 h-4 text-[#ff9f00]" />
                      <span>Template Manager (Gallery)</span>
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#ff9f00]/20 text-[#ff9f00]">
                      Admin
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setDrawerOpen(false);
                      setDiagnosticsModalOpen(true);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-300 hover:bg-emerald-500/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Cpu className="w-4 h-4 text-emerald-400" />
                      <span>System Diagnostics</span>
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                      Live
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Legal & Safety Links */}
            <div className="p-4 border-t border-white/10 space-y-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-stone-500">
                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    setLegalModal('privacy');
                  }}
                  className="hover:text-stone-300 transition-colors"
                >
                  Privacy
                </button>
                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    setLegalModal('terms');
                  }}
                  className="hover:text-stone-300 transition-colors"
                >
                  Terms
                </button>
                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    setLegalModal('refund');
                  }}
                  className="hover:text-stone-300 transition-colors"
                >
                  Refund Policy
                </button>
                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    setLegalModal('delete');
                  }}
                  className="hover:text-red-400 transition-colors"
                >
                  Delete Account
                </button>
              </div>

              <p className="text-[11px] text-stone-600 pt-1">
                AI Prime STUDIO © 2026. All rights reserved.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
