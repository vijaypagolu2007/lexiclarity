import React, { useRef } from 'react';
import { Upload, FileText, CheckCircle2, Lock, FileCode, ArrowRight } from 'lucide-react';

interface SidebarProps {
  fileName: string;
  docText: string;
  onTextLoaded: (name: string, text: string) => void;
  onLoadSample: () => void;
  onLoadComparePair: () => void;
  isSampleActive: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  fileName,
  docText,
  onTextLoaded,
  onLoadSample,
  onLoadComparePair,
  isSampleActive,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        onTextLoaded(file.name, text);
      }
    };
    reader.readAsText(file);
  };

  const wordCount = docText ? docText.trim().split(/\s+/).length : 0;
  const clauseCount = docText ? docText.split('\n\n').filter((c) => c.trim().length > 30).length : 0;

  return (
    <aside className="w-full md:w-80 flex-shrink-0 flex flex-col gap-5 p-4 sm:p-5 bg-white border-r border-stone-200">
      {/* Upload Box */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-2">
          Upload Legal Document
        </label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-stone-300 hover:border-amber-600/70 rounded-xl p-4 text-center cursor-pointer transition-colors bg-stone-50/50 hover:bg-stone-50 group"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf,.docx"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Upload className="w-6 h-6 text-stone-600 group-hover:text-amber-700 mx-auto mb-1.5 transition-colors" />
          <p className="text-xs font-medium text-stone-700 group-hover:text-stone-900">
            Click to upload contract
          </p>
          <p className="text-[11px] text-stone-600 mt-0.5">
            TXT, PDF, DOCX up to 10MB
          </p>
        </div>
      </div>

      {/* Quick Load Buttons */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700">
          Instant Demos & Samples
        </label>

        <button
          type="button"
          onClick={onLoadSample}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium border transition-all text-left ${
            isSampleActive
              ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-xs'
              : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
          }`}
        >
          <div className="flex items-center space-x-2 truncate">
            <FileText className="w-4 h-4 text-amber-700 flex-shrink-0" />
            <span className="truncate">Sample Rental Agreement</span>
          </div>
          {isSampleActive ? (
            <CheckCircle2 className="w-4 h-4 text-amber-600 flex-shrink-0 ml-1" />
          ) : (
            <ArrowRight className="w-3.5 h-3.5 text-stone-400 flex-shrink-0 ml-1" />
          )}
        </button>

        <button
          type="button"
          onClick={onLoadComparePair}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 transition-all text-left"
        >
          <div className="flex items-center space-x-2 truncate">
            <FileCode className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span className="truncate">Load Compare Pair (A vs B)</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-stone-400 flex-shrink-0 ml-1" />
        </button>
      </div>

      {/* Active Document Status Card */}
      {docText ? (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 text-xs space-y-2">
          <div className="flex items-center justify-between font-medium text-stone-900">
            <span className="truncate flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-stone-500" />
              {fileName || 'Active Contract'}
            </span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-200 text-stone-700">
              Loaded
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-200/60 text-stone-600 text-[11px]">
            <div>
              <span className="text-stone-700 font-semibold block text-sm">{wordCount.toLocaleString()}</span>
              Words
            </div>
            <div>
              <span className="text-stone-700 font-semibold block text-sm">{clauseCount}</span>
              Estimated Clauses
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 bg-stone-50 rounded-xl border border-dashed border-stone-200 text-center text-xs text-stone-700">
          No document loaded yet. Click sample agreement to begin.
        </div>
      )}

      {/* Privacy Box */}
      <div className="mt-auto pt-4 border-t border-stone-100 flex items-start space-x-2 text-[11px] text-stone-700">
        <Lock className="w-3.5 h-3.5 text-stone-600 flex-shrink-0 mt-0.5" />
        <span>
          <strong>In-Memory Privacy:</strong> Extracted document text is processed purely in ephemeral memory and never persisted.
        </span>
      </div>
    </aside>
  );
};
