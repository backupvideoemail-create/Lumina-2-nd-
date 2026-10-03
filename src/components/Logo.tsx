import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  theme?: 'dark' | 'light';
}

export const Logo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
  theme = 'dark'
}) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
    xl: 'text-2xl'
  };

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Dimensional Layered AI + Camera/Frame + Play/Spark App Icon */}
      <div
        className={`relative ${iconSizes[size]} flex items-center justify-center rounded-[22%] p-1 overflow-hidden transition-transform duration-300 hover:scale-105 active:scale-95`}
        style={{
          background:
            theme === 'dark'
              ? 'linear-gradient(145deg, #24221d 0%, #151419 50%, #0d0c10 100%)'
              : 'linear-gradient(145deg, #ffffff 0%, #f4ede0 50%, #dfd4bf 100%)',
          boxShadow:
            '0 4px 16px -2px rgba(0,0,0,0.6), 0 1px 2px rgba(212,175,55,0.25), inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -1px 2px rgba(0,0,0,0.5)'
        }}
      >
        {/* Precision Glass Chamfer Border */}
        <div
          className="absolute inset-0 rounded-[22%] pointer-events-none"
          style={{
            border: '1px solid rgba(245, 215, 127, 0.4)',
            boxShadow: 'inset 0 0 10px rgba(212, 175, 55, 0.2)'
          }}
        />

        {/* Ambient Top Light Reflection (Liquid-Glass style) */}
        <div className="absolute -top-3 inset-x-0 h-6 bg-gradient-to-b from-white/25 to-transparent rounded-t-full pointer-events-none" />

        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-[0_2px_8px_rgba(212,175,55,0.5)]"
        >
          <defs>
            {/* Primary Metallic Gold Gradient */}
            <linearGradient id="iconGoldPrimary" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#fff8e7" />
              <stop offset="35%" stopColor="#f3cf7a" />
              <stop offset="70%" stopColor="#d4af37" />
              <stop offset="100%" stopColor="#8d650c" />
            </linearGradient>

            {/* Aperture Frame Gradient */}
            <linearGradient id="apertureFrameGrad" x1="8" y1="8" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#d4af37" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#1a1813" stopOpacity="0.9" />
            </linearGradient>

            {/* Inner Play Shadow */}
            <radialGradient id="playCoreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff5d6" />
              <stop offset="60%" stopColor="#e5bf4c" />
              <stop offset="100%" stopColor="#a3760e" />
            </radialGradient>
          </defs>

          {/* 1. Camera Viewfinder Precision Frame with Corner Guides */}
          <path
            d="M8 14V11C8 9.34315 9.34315 8 11 8H14"
            stroke="url(#iconGoldPrimary)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M26 8H29C30.6569 8 32 9.34315 32 11V14"
            stroke="url(#iconGoldPrimary)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M32 26V29C32 30.6569 30.6569 32 29 32H26"
            stroke="url(#iconGoldPrimary)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M14 32H11C9.34315 32 8 30.6569 8 29V26"
            stroke="url(#iconGoldPrimary)"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* 2. Concentric Aperture Glass Ring */}
          <circle
            cx="20"
            cy="20"
            r="10.5"
            stroke="url(#apertureFrameGrad)"
            strokeWidth="1.2"
            strokeDasharray="1.5 2.5"
            opacity="0.85"
          />

          {/* 3. Golden Beveled Video Play Core Wedge */}
          <path
            d="M17 15.2C17 14.394 17.896 13.91 18.57 14.35L25.35 18.77C25.96 19.17 25.96 20.07 25.35 20.47L18.57 24.89C17.896 25.33 17 24.84 17 24.04V15.2Z"
            fill="url(#playCoreGlow)"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
          />

          {/* 4. AI North Star Diamond Spark (Dimensional top right) */}
          <path
            d="M29 5L30.2 9L34.2 10.2L30.2 11.4L29 15.4L27.8 11.4L23.8 10.2L27.8 9L29 5Z"
            fill="#ffffff"
            style={{ filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.9))' }}
          />
          <circle cx="29" cy="10.2" r="1.2" fill="#d4af37" />

          {/* 5. Subordinate Micro Spark (Lower left) */}
          <circle cx="11.5" cy="28.5" r="1" fill="#fff8e7" opacity="0.9" />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <span
            className={`font-bold tracking-wider uppercase font-display gold-gradient-text leading-tight ${textSizes[size]}`}
          >
            LUMINA
          </span>
          <span className="text-[9px] tracking-[0.22em] uppercase text-stone-400 font-semibold">
            AI STUDIO
          </span>
        </div>
      )}
    </div>
  );
};
