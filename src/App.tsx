import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppProvider, useApp } from './context/AppContext';
import { HomeView } from './views/HomeView';
import { TemplatesView } from './views/TemplatesView';
import { CreationsView } from './views/CreationsView';
import { ProfileView } from './views/ProfileView';
import { BottomNav } from './components/BottomNav';
import { Drawer } from './components/Drawer';
import { TemplateDetailModal } from './components/TemplateDetailModal';
import { InsufficientCreditsModal } from './components/InsufficientCreditsModal';
import { GenerationViewerModal } from './components/GenerationViewerModal';
import { PlansModal } from './components/PlansModal';
import { TransactionLedgerModal } from './components/TransactionLedgerModal';
import { SupportModal } from './components/SupportModal';
import { LegalModal } from './components/LegalModal';
import { ReportModal } from './components/ReportModal';
import { OnboardingModal } from './components/OnboardingModal';
import { FaceSwapModal } from './components/FaceSwapModal';

const AppContent: React.FC = () => {
  const { activeTab } = useApp();

  return (
    <div className="relative min-h-screen bg-[#08080a] text-stone-100 flex flex-col font-sans selection:bg-[#d4af37]/30 selection:text-amber-200">
      {/* Active Tab Screen with Smooth Transition */}
      <main className="flex-1 w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <HomeView />
            </motion.div>
          )}

          {activeTab === 'templates' && (
            <motion.div
              key="templates"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <TemplatesView />
            </motion.div>
          )}

          {activeTab === 'creations' && (
            <motion.div
              key="creations"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CreationsView />
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ProfileView />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Bottom Navigation Bar */}
      <BottomNav />

      {/* Side Navigation Drawer */}
      <Drawer />

      {/* Overlay Modals & Bottom Sheets */}
      <TemplateDetailModal />
      <InsufficientCreditsModal />
      <GenerationViewerModal />
      <PlansModal />
      <TransactionLedgerModal />
      <SupportModal />
      <LegalModal />
      <ReportModal />
      <OnboardingModal />
      <FaceSwapModal />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
