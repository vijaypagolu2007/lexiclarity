import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  X,
  ChevronUp,
  ChevronDown,
  Download,
  Eye,
  CheckCircle2,
} from 'lucide-react';

interface DocumentPdfPreviewProps {
  docText: string;
  docTitle?: string;
  highlightText?: string | null;
  onClose?: () => void;
  isModal?: boolean;
}

export const DocumentPdfPreview: React.FC<DocumentPdfPreviewProps> = ({
  docText,
  docTitle = 'Contract Document',
  highlightText,
  onClose,
  isModal = false,
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(isModal);
  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLElement>(null);

  const activeHighlight = searchQuery.trim() || highlightText?.trim() || '';

  // Auto-scroll to highlighted element when mounted or changed
  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeHighlight, zoom]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 15, 160));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 15, 75));

  // Render text with highlighted matches
  const renderHighlightedDoc = () => {
    if (!docText) return <p className="text-stone-400 italic">No document text available.</p>;

    if (!activeHighlight) {
      return (
        <div className="whitespace-pre-wrap font-serif text-stone-800 leading-relaxed text-sm">
          {docText}
        </div>
      );
    }

    // Escape regex characters
    const escaped = activeHighlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = docText.split(regex);

    let matchCounter = 0;

    return (
      <div className="whitespace-pre-wrap font-serif text-stone-900 leading-relaxed text-sm select-text">
        {parts.map((part, idx) => {
          if (part.toLowerCase() === activeHighlight.toLowerCase()) {
            const isCurrentMatch = matchCounter === activeMatchIndex;
            matchCounter++;
            return (
              <mark
                key={idx}
                ref={isCurrentMatch ? highlightRef : null}
                className={`transition-all duration-300 rounded px-1 py-0.5 font-semibold text-stone-950 ${
                  isCurrentMatch
                    ? 'bg-yellow-300 ring-2 ring-amber-500 ring-offset-1 shadow-md border-b-2 border-amber-600 animate-pulse'
                    : 'bg-yellow-200/90 hover:bg-yellow-300 border-b border-amber-400'
                }`}
              >
                {part}
              </mark>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </div>
    );
  };

  const totalMatches = activeHighlight
    ? (docText.match(new RegExp(activeHighlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
    : 0;

  const content = (
    <div className={`flex flex-col bg-stone-900 border border-stone-700 shadow-2xl rounded-2xl overflow-hidden ${isFullscreen ? 'fixed inset-4 z-50 my-auto' : 'w-full h-full min-h-[460px]'}`}>
      {/* PDF Reader Toolbar */}
      <div className="bg-stone-900 border-b border-stone-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-stone-200 text-xs select-none">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-stone-100 truncate block text-xs">
              {docTitle}
            </span>
            <span className="text-[10px] text-stone-400 font-mono">
              PDF Preview • {docText.length.toLocaleString()} characters
            </span>
          </div>
        </div>

        {/* Search & Highlights Counter */}
        <div className="flex items-center gap-2 bg-stone-800/90 px-3 py-1.5 rounded-xl border border-stone-700/80">
          <Search className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setActiveMatchIndex(0);
            }}
            placeholder={highlightText ? 'Highlighting citation...' : 'Search in PDF...'}
            className="bg-transparent text-xs text-stone-100 focus:outline-none placeholder:text-stone-500 w-32 sm:w-44 font-sans"
          />
          {totalMatches > 0 && (
            <div className="flex items-center gap-1 text-[11px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-700/50">
              <span>
                {activeMatchIndex + 1}/{totalMatches}
              </span>
              <button
                type="button"
                onClick={() => setActiveMatchIndex((prev) => (prev > 0 ? prev - 1 : totalMatches - 1))}
                className="hover:text-amber-200"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setActiveMatchIndex((prev) => (prev < totalMatches - 1 ? prev + 1 : 0))}
                className="hover:text-amber-200"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Controls: Zoom, Fullscreen & Close */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-stone-800 rounded-lg p-0.5 border border-stone-700">
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1 hover:text-white rounded hover:bg-stone-700"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono px-2 text-stone-300">{zoom}%</span>
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1 hover:text-white rounded hover:bg-stone-700"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {!isModal && (
            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 hover:bg-stone-800 rounded-lg text-stone-400 hover:text-white border border-stone-700"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Reader'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-stone-800 rounded-lg text-stone-400 hover:text-red-400 border border-stone-700"
              title="Close Preview"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Active Highlight Banner */}
      {activeHighlight && (
        <div className="bg-amber-950/90 border-b border-amber-800/70 px-4 py-2 text-xs text-amber-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 truncate">
            <span className="px-2 py-0.5 rounded bg-amber-500 text-stone-950 font-bold uppercase text-[10px] tracking-wider">
              Highlighted Citation
            </span>
            <span className="truncate italic font-serif text-amber-100">"{activeHighlight}"</span>
          </div>
          <span className="text-[11px] font-mono text-amber-400 flex-shrink-0">
            {totalMatches} match{totalMatches === 1 ? '' : 'es'} in document
          </span>
        </div>
      )}

      {/* Realistic PDF Paper Stage */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 sm:p-8 bg-stone-950/90 flex justify-center scrollbar-thin scrollbar-thumb-stone-700"
      >
        <div
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          className="w-full max-w-3xl bg-white text-stone-900 rounded-sm shadow-2xl p-8 sm:p-12 border border-stone-300 min-h-[680px] transition-transform duration-200 relative"
        >
          {/* Simulated PDF Header / Watermark */}
          <div className="border-b border-stone-200 pb-4 mb-6 flex items-center justify-between text-stone-400 text-[10px] font-mono uppercase tracking-widest select-none">
            <span>OFFICIAL LEGAL AGREEMENT • PAGE 1</span>
            <span className="flex items-center gap-1 text-emerald-700 font-sans font-bold">
              <CheckCircle2 className="w-3 h-3" /> VERIFIED ORIGINAL
            </span>
          </div>

          {/* Document Content */}
          {renderHighlightedDoc()}

          {/* Page Footer */}
          <div className="mt-12 pt-4 border-t border-stone-200 flex justify-between items-center text-[10px] text-stone-400 font-mono">
            <span>LexiClarity Interactive PDF Preview</span>
            <span>Confidential & Proprietary</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (isFullscreen && !isModal) {
    return (
      <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md p-4 sm:p-6 flex items-center justify-center">
        {content}
      </div>
    );
  }

  return content;
};
