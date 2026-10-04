import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Grid, Clapperboard, User } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, user, triggerHighIntentAction } = useApp();
  const [scrollingDown, setScrollingDown] = useState(false);
  const lastScrollY = useRef(0);

  // Dynamic navigation behavior:
  // Scroll down -> subtly condenses into sleek compact pill
  // Scroll up -> expands smoothly
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          if (currentScrollY > 70 && currentScrollY > lastScrollY.current + 8) {
            setScrollingDown(true);
          } else if (currentScrollY < lastScrollY.current - 8 || currentScrollY <= 40) {
            setScrollingDown(false);
          }
          lastScrollY.current = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    {
      id: 'home' as const,
      label: 'Home',
      icon: Sparkles
    },
    {
      id: 'templates' as const,
      label: 'Templates',
      icon: Grid
    },
    {
      id: 'creations' as const,
      label: 'Creations',
      icon: Clapperboard
    },
    {
      id: 'profile' as const,
      label: 'Profile',
      icon: User
    }
  ];

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 pointer-events-none pb-safe">
      <div className="max-w-md mx-auto px-4 pb-3 sm:pb-4 pt-1 flex justify-center">
        {/* Liquid-Glass Floating Tab Bar with Dynamic Scroll State */}
        <motion.nav
          initial={false}
          animate={{
            scale: scrollingDown ? 0.94 : 1,
            y: scrollingDown ? 4 : 0,
            paddingTop: scrollingDown ? '6px' : '7px',
            paddingBottom: scrollingDown ? '6px' : '7px'
          }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          className="pointer-events-auto relative flex items-center justify-between w-full max-w-[340px] px-2.5 rounded-full bg-[#121217]/75 backdrop-blur-2xl border border-white/15 shadow-[0_16px_36px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.18)]"
          aria-label="iPhone Liquid Glass Floating Tab Bar"
        >
          {/* Subtle top edge liquid glass reflection highlight */}
          <div className="absolute top-0 inset-x-6 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;

            return (
              <motion.button
                key={item.id}
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  if ((item.id === 'creations' || item.id === 'profile') && !user) {
                    triggerHighIntentAction({
                      type: item.id === 'creations' ? 'navigate_creations' : 'navigate_profile'
                    });
                    return;
                  }
                  setActiveTab(item.id);
                }}
                className="relative flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-full transition-all focus:outline-none cursor-pointer"
              >
                {/* Active Soft Gold Background Capsule */}
                {isActive && (
                  <motion.div
                    layoutId="activeBottomNavPill"
                    transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-[#d4af37]/25 via-[#d4af37]/18 to-[#d4af37]/25 border border-[#d4af37]/45 shadow-[0_0_18px_rgba(212,175,55,0.3)]"
                  />
                )}

                <div className="relative z-10 flex flex-col items-center gap-0.5">
                  <Icon
                    className={`w-[18px] h-[18px] sm:w-5 sm:h-5 transition-transform duration-200 ${
                      isActive
                        ? 'text-[#f5d77f] scale-110 drop-shadow-[0_0_10px_rgba(245,215,127,0.7)]'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  />
                  {!scrollingDown && (
                    <motion.span
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className={`text-[9.5px] tracking-wide font-medium transition-colors ${
                        isActive ? 'text-[#f5d77f] font-semibold' : 'text-stone-400'
                      }`}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </motion.nav>
      </div>
    </div>
  );
};
