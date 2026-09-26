import React, { useRef } from 'react';
import { Upload, FileText, CheckCircle2, Lock, FileCode, ArrowRight, FolderOpen, Trash2, Check } from 'lucide-react';
import { LoadedDocument } from '../types';

interface SidebarProps {
  docsLibrary: LoadedDocument[];
  activeDocId: string;
  onSelectActiveDoc: (id: string) => void;
  onUploadDocs: (files: File[]) => void;
  onLoadSample: () => void;
  onLoadComparePair: () => void;
  onRemoveDoc: (id: string) => void;
  onClearDocs: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  docsLibrary,
  activeDocId,
  onSelectActiveDoc,
  onUploadDocs,
  onLoadSample,
  onLoadComparePair,
  onRemoveDoc,
  onClearDocs,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadDocs(Array.from(e.target.files));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const activeDoc = docsLibrary.find((d) => d.id === activeDocId) || docsLibrary[0];

  return (
    <aside className="w-full md:w-80 flex-shrink-0 flex flex-col gap-5 p-4 sm:p-5 bg-white border-r border-stone-200">
      {/* Central Application Upload Box */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-2">
          Upload Contracts / Documents
        </label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-stone-300 hover:border-amber-600/70 rounded-xl p-4 text-center cursor-pointer transition-colors bg-stone-50/50 hover:bg-stone-50 group"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.pdf,.docx,.doc,.json"
            onChange={handleFileChange}
            className="hidden"
          />
          <Upload className="w-6 h-6 text-stone-600 group-hover:text-amber-700 mx-auto mb-1.5 transition-colors" />
          <p className="text-xs font-medium text-stone-700 group-hover:text-stone-900">
            Click or drag documents here
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5">
            TXT, PDF, DOCX (Upload 1 or multiple)
          </p>
        </div>
      </div>

      {/* Document Library (Selection for Simplify / Explorer / Chat) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5 text-amber-700" />
            Document Library ({docsLibrary.length})
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-stone-400 font-mono">Select 1 for analysis</span>
            {docsLibrary.length > 0 && (
              <button
                type="button"
                onClick={onClearDocs}
                className="text-[10px] font-semibold text-red-700 hover:text-red-900 underline underline-offset-2"
                aria-label="Remove all documents from library"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {docsLibrary.length === 0 ? (
          <div className="p-3 bg-stone-50 rounded-xl border border-dashed border-stone-200 text-center text-xs text-stone-500">
            No documents loaded yet.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
            {docsLibrary.map((doc) => {
              const isActive = doc.id === activeDocId;
              return (
                <div
                  key={doc.id}
                  onClick={() => onSelectActiveDoc(doc.id)}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border cursor-pointer transition-all ${
                    isActive
                      ? 'bg-amber-50 border-amber-300 text-amber-950 shadow-xs'
                      : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate min-w-0 pr-1">
                    <FileText className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-amber-700' : 'text-stone-400'}`} />
                    <div className="truncate min-w-0">
                      <p className="truncate font-medium leading-tight">{doc.name}</p>
                      <p className="text-[10px] text-stone-500 font-mono">
                        {doc.wordCount.toLocaleString()} words
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isActive ? (
                      <span className="text-[10px] bg-amber-200/80 text-amber-900 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                        Active
                      </span>
                    ) : (
                      <Check className="w-3.5 h-3.5 text-stone-300 group-hover:text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                    {docsLibrary.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveDoc(doc.id);
                        }}
                        className="p-1 text-stone-400 hover:text-red-600 rounded transition-colors"
                        title="Remove document"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Demos & Sample Actions */}
      <div className="space-y-2 pt-2 border-t border-stone-100">
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700">
          Sample Demos
        </label>

        <button
          type="button"
          onClick={onLoadSample}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 transition-all text-left"
        >
          <div className="flex items-center space-x-2 truncate">
            <FileText className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
            <span className="truncate">Sample Rental Agreement</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-stone-400 flex-shrink-0 ml-1" />
        </button>

        <button
          type="button"
          onClick={onLoadComparePair}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 transition-all text-left"
        >
          <div className="flex items-center space-x-2 truncate">
            <FileCode className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
            <span className="truncate">Load Sample Pair (A vs B)</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-stone-400 flex-shrink-0 ml-1" />
        </button>
      </div>

      {/* Active Document Details Card */}
      {activeDoc ? (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 text-xs space-y-2">
          <div className="flex items-center justify-between font-medium text-stone-900">
            <span className="truncate flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-stone-500" />
              {activeDoc.name}
            </span>
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
              Selected
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-200/60 text-stone-600 text-[11px]">
            <div>
              <span className="text-stone-700 font-semibold block text-sm">
                {activeDoc.wordCount.toLocaleString()}
              </span>
              Words
            </div>
            <div>
              <span className="text-stone-700 font-semibold block text-sm">
                {activeDoc.clauseCount}
              </span>
              Est. Clauses
            </div>
          </div>
        </div>
      ) : null}

      {/* Privacy Box */}
      <div className="mt-auto pt-4 border-t border-stone-100 flex items-start space-x-2 text-[11px] text-stone-500">
        <Lock className="w-3.5 h-3.5 text-stone-400 flex-shrink-0 mt-0.5" />
        <span>
          <strong>In-Memory Privacy:</strong> Document text is processed purely in ephemeral memory and never persisted.
        </span>
      </div>
    </aside>
  );
};
