import React from 'react';
import { DownloadButton } from './DownloadButton';
import { Scale, Sparkles, ShieldCheck, Zap } from 'lucide-react';

interface HeaderProps {
  hasApiKey: boolean;
  isShowcase: boolean;
  activeTabLabel: string;
  onDownload: (format: 'pdf' | 'txt') => void;
}

export const Header: React.FC<HeaderProps> = ({
  hasApiKey,
  isShowcase,
  activeTabLabel,
  onDownload,
}) => {
  return (
    <header className="border-b border-stone-200 bg-white/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-700 text-white flex items-center justify-center shadow-sm">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold tracking-tight text-stone-900 font-serif-heading">
                LexiClarity
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 border border-amber-200">
                AI for Legal Access
              </span>
            </div>
            <p className="text-xs text-stone-700 hidden sm:block">
              Plain-language legal comprehension, risk mapping & lawyer preparation
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Header Download Button */}
          <DownloadButton
            onDownload={onDownload}
            activeTabLabel={activeTabLabel}
            variant="header"
          />

          {isShowcase ? (
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium">
              <Zap className="w-3.5 h-3.5 text-emerald-700" />
              <span>Showcase Mode</span>
            </div>
          ) : hasApiKey ? (
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5 text-blue-700" />
              <span>Gemini Connected</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-stone-100 text-stone-800 border border-stone-300 text-xs font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-stone-600" />
              <span>Offline Data</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

