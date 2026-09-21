import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileCode, File, ChevronDown } from 'lucide-react';

interface ExportDropdownProps {
  onExportPdf: () => void;
  onExportTxt: () => void;
  onExportMd?: () => void;
  label?: string;
  className?: string;
}

export const ExportDropdown: React.FC<ExportDropdownProps> = ({
  onExportPdf,
  onExportTxt,
  onExportMd,
  label = 'Export',
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

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Download className="w-3.5 h-3.5 text-stone-600" />
        <span>{label}</span>
        <ChevronDown className="w-3 h-3 text-stone-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-52 rounded-xl bg-white border border-stone-200 shadow-lg py-1.5 z-50 text-xs animate-in fade-in slide-in-from-top-1 duration-100">
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-600 border-b border-stone-100">
            Export Format
          </div>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportPdf();
            }}
            className="w-full text-left px-3 py-2 hover:bg-amber-50 text-stone-800 hover:text-amber-900 flex items-center gap-2 transition-colors"
          >
            <File className="w-3.5 h-3.5 text-red-600" />
            <div>
              <div className="font-semibold">PDF Document (.pdf)</div>
              <div className="text-[10px] text-stone-600">Styled document with headers</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportTxt();
            }}
            className="w-full text-left px-3 py-2 hover:bg-amber-50 text-stone-800 hover:text-amber-900 flex items-center gap-2 transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-stone-700" />
            <div>
              <div className="font-semibold">Plain Text (.txt)</div>
              <div className="text-[10px] text-stone-600">Universal raw text file</div>
            </div>
          </button>

          {onExportMd && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onExportMd();
              }}
              className="w-full text-left px-3 py-2 hover:bg-amber-50 text-stone-800 hover:text-amber-900 flex items-center gap-2 transition-colors"
            >
              <FileCode className="w-3.5 h-3.5 text-blue-600" />
              <div>
                <div className="font-semibold">Markdown (.md)</div>
                <div className="text-[10px] text-stone-600">Structured markdown file</div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
