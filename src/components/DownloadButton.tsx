import React, { useState, useRef, useEffect } from 'react';
import { Download, File, FileText, ChevronDown } from 'lucide-react';

interface DownloadButtonProps {
  onDownload: (format: 'pdf' | 'txt') => void;
  activeTabLabel?: string;
  variant?: 'header' | 'workspace';
  className?: string;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({
  onDownload,
  activeTabLabel,
  variant = 'header',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (format: 'pdf' | 'txt') => {
    setIsOpen(false);
    onDownload(format);
  };

  const isHeader = variant === 'header';

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <div className="inline-flex rounded-xl shadow-xs overflow-hidden border border-amber-800/30">
        {/* Primary Download Button (triggers PDF directly) */}
        <button
          type="button"
          onClick={() => handleSelect('pdf')}
          className={`flex items-center gap-1.5 font-semibold transition-all select-none ${
            isHeader
              ? 'px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs'
              : 'px-3 py-1.5 bg-white hover:bg-stone-50 text-stone-800 text-xs border-r border-stone-200'
          }`}
          title={`Download ${activeTabLabel || 'Active Content'} as PDF`}
        >
          <Download className={`w-3.5 h-3.5 ${isHeader ? 'text-amber-200' : 'text-amber-700'}`} />
          <span>
            Download {activeTabLabel ? `${activeTabLabel}` : ''}
          </span>
          <span className={`text-[10px] px-1 py-0.2 rounded font-mono ${isHeader ? 'bg-amber-800/80 text-amber-200' : 'bg-stone-100 text-stone-600'}`}>
            PDF
          </span>
        </button>

        {/* Dropdown toggle for Plain Text / Options */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center justify-center px-2 transition-colors ${
            isHeader
              ? 'bg-amber-800 hover:bg-amber-900 text-amber-100'
              : 'bg-stone-50 hover:bg-stone-100 text-stone-600'
          }`}
          aria-haspopup="true"
          aria-expanded={isOpen}
          aria-label="Export format options"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-white border border-stone-200 shadow-xl py-1.5 z-50 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-500 border-b border-stone-100">
            Download Active Tab ({activeTabLabel || 'Workspace'})
          </div>

          <button
            type="button"
            onClick={() => handleSelect('pdf')}
            className="w-full text-left px-3 py-2.5 hover:bg-amber-50 text-stone-800 hover:text-amber-900 flex items-center gap-2.5 transition-colors"
          >
            <div className="w-7 h-7 rounded-lg bg-red-50 text-red-700 flex items-center justify-center flex-shrink-0">
              <File className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-stone-900">PDF Document (.pdf)</div>
              <div className="text-[10px] text-stone-500">Formatted with headers & legal disclaimers</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSelect('txt')}
            className="w-full text-left px-3 py-2.5 hover:bg-amber-50 text-stone-800 hover:text-amber-900 flex items-center gap-2.5 transition-colors"
          >
            <div className="w-7 h-7 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-stone-900">Plain Text (.txt)</div>
              <div className="text-[10px] text-stone-500">Structured ASCII plain-text format</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
