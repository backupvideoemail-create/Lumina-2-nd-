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
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20'
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-2xl',
    xl: 'text-3xl'
  };

  const subTextSizes = {
    sm: 'text-[7.5px] tracking-[0.28em]',
    md: 'text-[9px] tracking-[0.32em]',
    lg: 'text-[12px] tracking-[0.34em]',
    xl: 'text-[15px] tracking-[0.38em]'
  };

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Dimensional Layered AI + Camera/Photo + Video Play App Icon with Laser Glow */}
      <div
        className={`relative ${iconSizes[size]} flex items-center justify-center rounded-[24%] p-1 overflow-hidden transition-transform duration-300 hover:scale-105 active:scale-95 laser-glow-box shrink-0`}
        style={{
          background:
            theme === 'dark'
              ? 'linear-gradient(145deg, #1f1d18 0%, #111116 55%, #08080a 100%)'
              : 'linear-gradient(145deg, #ffffff 0%, #f4ede0 50%, #dfd4bf 100%)'
        }}
      >
        {/* Subtle Rotating Laser Light Border Beam */}
        <div
          className="absolute -inset-[150%] pointer-events-none opacity-70 laser-spin"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, rgba(212,175,55,0.7) 40deg, rgba(255,255,255,0.95) 60deg, rgba(245,215,127,0.8) 80deg, transparent 120deg, transparent 360deg)'
          }}
        />

        {/* Inner Glass Core Background to keep content crisp */}
        <div
          className="absolute inset-[1.5px] rounded-[22%] pointer-events-none"
          style={{
            background:
              theme === 'dark'
                ? 'linear-gradient(145deg, #18171d 0%, #0d0d12 60%, #09090c 100%)'
                : '#ffffff',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.25), inset 0 -1px 2px rgba(0,0,0,0.6)'
          }}
        />

        {/* Ambient Top Light Reflection */}
        <div className="absolute top-0 inset-x-0 h-[45%] bg-gradient-to-b from-white/20 to-transparent rounded-t-[22%] pointer-events-none z-10" />

        {/* SVG Artwork: Camera Viewfinder (Photo) + Cinematic Video Play (Video) + AI Neural Star (AI) */}
        <svg
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full relative z-20 drop-shadow-[0_2px_8px_rgba(212,175,55,0.55)]"
        >
          <defs>
            {/* Primary Metallic Gold Gradient */}
            <linearGradient id="aiPrimeGold" x1="4" y1="4" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#fff8e7" />
              <stop offset="30%" stopColor="#f5d77f" />
              <stop offset="65%" stopColor="#d4af37" />
              <stop offset="100%" stopColor="#966d0c" />
            </linearGradient>

            {/* Aperture Frame Gradient */}
            <linearGradient id="lensRingGrad" x1="10" y1="10" x2="34" y2="34" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="50%" stopColor="#d4af37" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#1a1813" stopOpacity="0.95" />
            </linearGradient>

            {/* Core Cinematic Video Play Gradient */}
            <radialGradient id="videoPlayCore" cx="45%" cy="45%" r="55%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="35%" stopColor="#fae29c" />
              <stop offset="70%" stopColor="#dfb743" />
              <stop offset="100%" stopColor="#a3760e" />
            </radialGradient>

            {/* AI Neural Beam Glow */}
            <radialGradient id="aiSparkGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="50%" stopColor="#f7d070" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 1. Camera Viewfinder Brackets (Photo Studio Aspect) */}
          <path
            d="M8 15V11C8 9.34315 9.34315 8 11 8H15"
            stroke="url(#aiPrimeGold)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M29 8H33C34.6569 8 36 9.34315 36 11V15"
            stroke="url(#aiPrimeGold)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M36 29V33C36 34.6569 34.6569 36 33 36H29"
            stroke="url(#aiPrimeGold)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M15 36H11C9.34315 36 8 34.6569 8 33V29"
            stroke="url(#aiPrimeGold)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />

          {/* 2. Concentric Precision Optical Lens Aperture Ring */}
          <circle
            cx="22"
            cy="22"
            r="11.5"
            stroke="url(#lensRingGrad)"
            strokeWidth="1.2"
            strokeDasharray="2 2.5"
            opacity="0.9"
          />

          {/* 3. Golden Cinematic Video Play Prism (Video Studio Aspect) */}
          <path
            d="M18.5 16.5C18.5 15.65 19.45 15.15 20.15 15.62L27.4 20.45C28.05 20.88 28.05 21.85 27.4 22.28L20.15 27.11C19.45 27.58 18.5 27.08 18.5 26.23V16.5Z"
            fill="url(#videoPlayCore)"
            style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' }}
          />

          {/* 4. AI Neural Brilliance Star (Centered Sparkle) */}
          <path
            d="M33 5.5L34.3 9.8L38.6 11.1L34.3 12.4L33 16.7L31.7 12.4L27.4 11.1L31.7 9.8L33 5.5Z"
            fill="#ffffff"
            style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.95))' }}
          />
          <circle cx="33" cy="11.1" r="1.3" fill="#f5d77f" />

          {/* 5. Micro AI Synthesis Spark (Lower-left balance) */}
          <circle cx="12" cy="32" r="1.1" fill="#fff5d6" opacity="0.95" />
          <path
            d="M12 30V34M10 32H14"
            stroke="#f5d77f"
            strokeWidth="0.8"
            strokeLinecap="round"
            opacity="0.85"
          />
        </svg>
      </div>

      {/* Brand Typography: "Lumina" & "AI STUDIO" */}
      {showText && (
        <div className="flex flex-col justify-center leading-none">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-black tracking-wide font-display gold-gradient-text drop-shadow-[0_2px_10px_rgba(212,175,55,0.35)] ${textSizes[size]}`}
            >
              Lumina
            </span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#f5d77f] shadow-[0_0_8px_#f5d77f] animate-pulse" />
          </div>

          <span
            className={`font-bold uppercase text-amber-200/80 font-sans mt-0.5 flex items-center gap-1.5 ${subTextSizes[size]}`}
          >
            <span className="text-[7px] text-[#d4af37] opacity-75">✦</span>
            <span>AI STUDIO</span>
            <span className="text-[7px] text-[#d4af37] opacity-75">✦</span>
          </span>
        </div>
      )}
    </div>
  );
};
