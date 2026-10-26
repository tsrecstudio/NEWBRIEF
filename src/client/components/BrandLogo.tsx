import React from 'react';

export const BrandLogo: React.FC<{
  variant?: 'dark' | 'light';
  companyName?: string;
  subtitle?: string;
  compact?: boolean;
}> = ({
  variant = 'dark',
  companyName = 'МСДИС',
  subtitle = 'Архитектура и заказная разработка',
  compact = false,
}) => {
  const isLight = variant === 'light';
  return (
    <div className="inline-flex items-center gap-3 select-none">
      <svg
        width={compact ? 34 : 40}
        height={compact ? 34 : 40}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-xs"
      >
        <defs>
          <linearGradient id="mcdisHexGrad" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--brand-primary)" />
            <stop offset="100%" stopColor="var(--brand-navy)" />
          </linearGradient>
        </defs>
        <polygon
          points="32,3 59,18.5 59,45.5 32,61 5,45.5 5,18.5"
          fill="url(#mcdisHexGrad)"
        />
        <polygon
          points="32,12 50,22.5 32,33 14,22.5"
          fill="#FFFFFF"
          fillOpacity="0.95"
        />
        <polygon
          points="14,22.5 32,33 32,52 14,41.5"
          fill="#93C5FD"
          fillOpacity="0.88"
        />
        <polygon
          points="50,22.5 32,33 32,52 50,41.5"
          fill="#DBEAFE"
          fillOpacity="0.52"
        />
      </svg>
      <div className="leading-tight">
        <div
          className={`font-extrabold tracking-tight ${
            compact ? 'text-lg' : 'text-xl'
          } ${isLight ? 'text-white' : 'text-slate-950'}`}
        >
          {companyName}
        </div>
        {!compact && subtitle && (
          <div
            className={`text-[11px] font-medium ${
              isLight ? 'text-blue-100/85' : 'text-slate-500'
            }`}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};
