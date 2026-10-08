import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert } from 'lucide-react';
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
import { TopUpModal } from './components/TopUpModal';
import { TransactionLedgerModal } from './components/TransactionLedgerModal';
import { SupportModal } from './components/SupportModal';
import { LegalModal } from './components/LegalModal';
import { ReportModal } from './components/ReportModal';
import { AuthModal } from './components/AuthModal';
import { FaceSwapModal } from './components/FaceSwapModal';
import { TemplateManagerModal } from './components/TemplateManagerModal';
import { DiagnosticsModal } from './components/DiagnosticsModal';

const AppContent: React.FC = () => {
  const { activeTab, templateManagerOpen, setTemplateManagerOpen, diagnosticsModalOpen, setDiagnosticsModalOpen, selectedTemplate } = useApp();
  const [screenshotWarning, setScreenshotWarning] = useState(false);
  const [isWindowBlurred, setIsWindowBlurred] = useState(false);

  // COMPREHENSIVE ANTI-SCREENSHOT & CONTENT PROTECTION
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Detect PrintScreen, Ctrl+P (Print), Ctrl+S (Save), or Mac screenshot shortcuts
      const isPrintScreen = e.key === 'PrintScreen' || e.code === 'PrintScreen';
      const isPrintShortcut = (e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P');
      const isSaveShortcut = (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S');
      const isMacScreenshot = (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5'));
      const isInspectShortcut = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'C' || e.key === 'c');

      if (isPrintScreen || isPrintShortcut || isSaveShortcut || isMacScreenshot || isInspectShortcut) {
        e.preventDefault();
        e.stopPropagation();
        setScreenshotWarning(true);
        setTimeout(() => setScreenshotWarning(false), 3000);
      }
    };

    // When snipping tool or screen capture is invoked, browser window blurs
    const handleBlur = () => {
      if (selectedTemplate) {
        setIsWindowBlurred(true);
      }
    };

    const handleFocus = () => {
      setIsWindowBlurred(false);
    };

    // Global right-click & drag prevention
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('dragstart', handleDragStart);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('dragstart', handleDragStart);
    };
  }, [selectedTemplate]);

  return (
    <div className={`relative min-h-screen bg-[#08080a] text-stone-100 flex flex-col font-sans selection:bg-[#d4af37]/30 selection:text-amber-200 ${isWindowBlurred ? 'filter blur-md select-none' : ''}`}>
      {/* Screenshot Warning Banner */}
      <AnimatePresence>
        {screenshotWarning && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="fixed top-4 inset-x-4 z-50 max-w-md mx-auto p-3.5 rounded-2xl bg-amber-500 text-black font-extrabold text-xs shadow-2xl flex items-center justify-center gap-2 border border-amber-300"
          >
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>Protected Content: Screenshots and screen recording are restricted in AI Prime Studio.</span>
          </motion.div>
        )}
      </AnimatePresence>
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
      <TopUpModal />
      <TransactionLedgerModal />
      <SupportModal />
      <LegalModal />
      <ReportModal />
      <AuthModal />
      <FaceSwapModal />
      <TemplateManagerModal isOpen={templateManagerOpen} onClose={() => setTemplateManagerOpen(false)} />
      <DiagnosticsModal isOpen={diagnosticsModalOpen} onClose={() => setDiagnosticsModalOpen(false)} />
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
