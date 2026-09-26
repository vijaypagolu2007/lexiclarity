import React, { useState } from 'react';
import { CompareResult, LoadedDocument } from '../types';
import { computeLineDiff, DiffBlock } from '../utils/diff';
import {
  GitCompare,
  ShieldAlert,
  Filter,
  Eye,
  Columns,
  ArrowLeftRight,
  FolderOpen,
  Plus,
  FileText,
} from 'lucide-react';
import { DocumentPdfPreview } from './DocumentPdfPreview';
import { requireLegalDocument } from '../utils/guardrail';
import { readApiJson } from '../utils/api';

interface CompareTabProps {
  docsLibrary: LoadedDocument[];
  compareDocAId: string;
  compareDocBId: string;
  onSelectDocA: (id: string) => void;
  onSelectDocB: (id: string) => void;
  onLoadComparePair: () => void;
  onUploadDocs: (files: File[]) => void;
  result?: CompareResult | null;
  onResultChange?: (result: CompareResult | null) => void;
}

export const CompareTab: React.FC<CompareTabProps> = ({
  docsLibrary,
  compareDocAId,
  compareDocBId,
  onSelectDocA,
  onSelectDocB,
  onLoadComparePair,
  onUploadDocs,
  result: externalResult,
  onResultChange,
}) => {
  const docAObj = docsLibrary.find((d) => d.id === compareDocAId) || docsLibrary[0];
  const docBObj = docsLibrary.find((d) => d.id === compareDocBId) || docsLibrary[1] || docsLibrary[0];

  const docA = docAObj?.text || '';
  const docB = docBObj?.text || '';

  const [loading, setLoading] = useState<boolean>(false);
  const [internalResult, setInternalResult] = useState<CompareResult | null>(null);
  const result = externalResult !== undefined ? externalResult : internalResult;

  const setResult = (val: CompareResult | null) => {
    setInternalResult(val);
    onResultChange?.(val);
  };

  const [error, setError] = useState<string | null>(null);
  const [materialFilter, setMaterialFilter] = useState<'all' | 'material' | 'minor'>('all');
  const [viewMode, setViewMode] = useState<'structured' | 'redline'>('structured');
  const [redlineStyle, setRedlineStyle] = useState<'inline' | 'split'>('split');

  // PDF Preview citation modal state
  const [previewCitation, setPreviewCitation] = useState<{ text: string; title: string } | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSwap = () => {
    if (docAObj && docBObj) {
      onSelectDocA(docBObj.id);
      onSelectDocB(docAObj.id);
    }
  };

  const handleCompare = async () => {
    if (!docA.trim() || !docB.trim()) {
      setError('Please select two distinct documents from the library to compare.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await requireLegalDocument(docA);
      await requireLegalDocument(docB);
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_a: docA,
          document_b: docB,
        }),
      });

      const data = await readApiJson<CompareResult>(res);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred during comparison.');
    } finally {
      setLoading(false);
    }
  };

  const filteredChanges =
    result?.changes?.filter((c) => {
      if (materialFilter === 'all') return true;
      return c.materiality === materialFilter;
    }) || [];

  const diffBlocks: DiffBlock[] = docA && docB ? computeLineDiff(docA, docB) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <h2 className="text-xl font-bold text-stone-900 font-serif-heading flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-amber-700" />
            Contract Comparison & Visual Redline
          </h2>
          <p className="text-xs text-stone-600 mt-0.5">
            Select two files from your application library to compare side-by-side with clause-level impact redlines.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onLoadComparePair}
            className="px-3.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-medium transition-colors"
          >
            Load Sample Pair
          </button>

          <button
            type="button"
            onClick={handleCompare}
            disabled={loading || !docA.trim() || !docB.trim()}
            className="px-4 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block animate-spin">⏳</span>
            ) : (
              <span>⚖️ Compare Selected Pair</span>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2.5">
          <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Centralized Document Selection Toolbar for Comparison */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-stone-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <span className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
            <FolderOpen className="w-4 h-4 text-amber-700" />
            Select Two Documents To Compare
          </span>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.doc,.docx,.pdf,.json"
            onChange={(e) => e.target.files && onUploadDocs(Array.from(e.target.files))}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-amber-800 hover:text-amber-900 font-semibold flex items-center gap-1 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Document to Library
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-4 items-center">
          {/* Document 1 Selector */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-amber-950 uppercase tracking-wider">
              Document 1 (Version A / Baseline)
            </label>
            <select
              value={docAObj?.id || ''}
              onChange={(e) => onSelectDocA(e.target.value)}
              className="w-full text-xs font-medium rounded-xl border border-stone-300 bg-amber-50/30 px-3 py-2.5 text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-600"
            >
              {docsLibrary.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  📄 {doc.name} ({doc.wordCount.toLocaleString()} words)
                </option>
              ))}
            </select>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center pt-2 md:pt-4">
            <button
              type="button"
              onClick={handleSwap}
              className="p-2.5 rounded-xl bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-900 border border-stone-200 transition-all shadow-2xs"
              title="Swap Document A and Document B"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          {/* Document 2 Selector */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-blue-950 uppercase tracking-wider">
              Document 2 (Version B / Counter-Proposal)
            </label>
            <select
              value={docBObj?.id || ''}
              onChange={(e) => onSelectDocB(e.target.value)}
              className="w-full text-xs font-medium rounded-xl border border-stone-300 bg-blue-50/30 px-3 py-2.5 text-stone-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {docsLibrary.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  📄 {doc.name} ({doc.wordCount.toLocaleString()} words)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Side-by-Side Read-Only Preview of Selected Texts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/20 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-amber-950 truncate max-w-[200px]">
              {docAObj?.name || 'Document 1'}
            </span>
            <span className="text-stone-500 font-mono text-[11px]">{docA.length.toLocaleString()} chars</span>
          </div>
          <div className="w-full text-xs text-stone-800 font-mono leading-relaxed border border-stone-200 rounded-xl p-3 bg-white max-h-36 overflow-y-auto">
            {docA || <span className="text-stone-400 italic">No document selected</span>}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/20 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-blue-950 truncate max-w-[200px]">
              {docBObj?.name || 'Document 2'}
            </span>
            <span className="text-stone-500 font-mono text-[11px]">{docB.length.toLocaleString()} chars</span>
          </div>
          <div className="w-full text-xs text-stone-800 font-mono leading-relaxed border border-stone-200 rounded-xl p-3 bg-white max-h-36 overflow-y-auto">
            {docB || <span className="text-stone-400 italic">No document selected</span>}
          </div>
        </div>
      </div>

      {/* Comparison Results */}
      {result && (
        <div className="space-y-6">
          {/* Overall Assessment Banner */}
          <div className="p-5 sm:p-6 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-950 uppercase tracking-wider text-[11px]">
                Overall Comparative Assessment
              </span>
            </div>
            <p className="text-sm text-stone-800 leading-relaxed font-sans">
              {result.overall_assessment}
            </p>
          </div>

          {/* View Mode Toggle Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-stone-200 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium text-stone-500">Display View:</span>
              <div className="flex items-center rounded-lg bg-stone-100 p-0.5 border border-stone-200">
                <button
                  type="button"
                  onClick={() => setViewMode('structured')}
                  className={`px-3.5 py-1.5 rounded-md transition-all font-medium ${
                    viewMode === 'structured'
                      ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Structured Impact Cards
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('redline')}
                  className={`px-3.5 py-1.5 rounded-md transition-all font-medium ${
                    viewMode === 'redline'
                      ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Visual Redline Diff
                </button>
              </div>
            </div>

            {viewMode === 'structured' ? (
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-stone-400" />
                <span className="text-stone-500">Filter Materiality:</span>
                <select
                  value={materialFilter}
                  onChange={(e) => setMaterialFilter(e.target.value as any)}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 font-medium text-stone-700 focus:outline-none text-xs"
                >
                  <option value="all">All Changes ({result.changes?.length || 0})</option>
                  <option value="material">Material Only</option>
                  <option value="minor">Minor Only</option>
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRedlineStyle('split')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 ${
                    redlineStyle === 'split'
                      ? 'bg-amber-100 text-amber-900 border-amber-300 font-semibold'
                      : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <Columns className="w-3.5 h-3.5" /> Side-by-Side
                </button>
                <button
                  type="button"
                  onClick={() => setRedlineStyle('inline')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 ${
                    redlineStyle === 'inline'
                      ? 'bg-amber-100 text-amber-900 border-amber-300 font-semibold'
                      : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" /> Unified Redline
                </button>
              </div>
            )}
          </div>

          {/* Structured Cards View */}
          {viewMode === 'structured' && (
            <div className="grid grid-cols-1 gap-4">
              {filteredChanges.map((change, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5">
                      <h4 className="text-base font-bold text-stone-900 font-serif-heading">
                        {change.topic}
                      </h4>
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                          change.materiality === 'material'
                            ? 'bg-red-100 text-red-800 border-red-200'
                            : 'bg-stone-100 text-stone-700 border-stone-200'
                        }`}
                      >
                        {change.materiality}
                      </span>
                    </div>

                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-md font-semibold uppercase ${
                        change.change_type === 'added'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : change.change_type === 'deleted'
                          ? 'bg-red-100 text-red-800 border border-red-200'
                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {change.change_type}
                    </span>
                  </div>

                  <p className="text-sm text-stone-700 leading-relaxed font-sans">
                    {change.summary}
                  </p>

                  <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-stone-900 leading-relaxed">
                    <strong className="text-amber-900 font-semibold">What changed for you: </strong>
                    <span>{change.user_impact}</span>
                  </div>

                  {/* PDF Preview Trigger Buttons for Citations */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 text-xs">
                    {change.source_span_a && (
                      <div className="bg-red-50/40 p-4 rounded-xl border border-red-100 text-stone-700 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-red-800 text-[11px] uppercase tracking-wider">
                            Doc 1 ({docAObj?.name})
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewCitation({
                                text: change.source_span_a!,
                                title: docAObj?.name || 'Document 1',
                              })
                            }
                            className="text-[11px] bg-yellow-200 hover:bg-yellow-300 text-stone-950 px-2 py-0.5 rounded font-bold flex items-center gap-1 border border-amber-400"
                          >
                            <Eye className="w-3 h-3 text-amber-900" />
                            PDF Preview 📄
                          </button>
                        </div>
                        <p className="italic font-serif leading-relaxed text-stone-800 text-xs">
                          "{change.source_span_a}"
                        </p>
                      </div>
                    )}

                    {change.source_span_b && (
                      <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-100 text-stone-700 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-emerald-800 text-[11px] uppercase tracking-wider">
                            Doc 2 ({docBObj?.name})
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewCitation({
                                text: change.source_span_b!,
                                title: docBObj?.name || 'Document 2',
                              })
                            }
                            className="text-[11px] bg-yellow-200 hover:bg-yellow-300 text-stone-950 px-2 py-0.5 rounded font-bold flex items-center gap-1 border border-amber-400"
                          >
                            <Eye className="w-3 h-3 text-amber-900" />
                            PDF Preview 📄
                          </button>
                        </div>
                        <p className="italic font-serif leading-relaxed text-stone-800 text-xs">
                          "{change.source_span_b}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Visual Redline Diff View */}
          {viewMode === 'redline' && (
            <div className="bg-stone-900 text-stone-200 rounded-2xl p-5 sm:p-6 font-mono text-xs overflow-x-auto shadow-inner">
              {redlineStyle === 'split' ? (
                <div className="grid grid-cols-2 gap-6 divide-x divide-stone-800 min-w-[640px]">
                  <div className="space-y-1.5 pr-4">
                    <div className="text-[11px] uppercase tracking-wider text-stone-400 pb-2.5 mb-2 border-b border-stone-800 font-semibold">
                      {docAObj?.name || 'Document 1'}
                    </div>
                    {diffBlocks.map((b, i) => (
                      <div
                        key={i}
                        className={`px-2.5 py-1.5 rounded leading-relaxed ${
                          b.type === 'delete' || b.type === 'replace'
                            ? 'bg-red-950/80 text-red-300 border-l-2 border-red-500'
                            : 'text-stone-400'
                        }`}
                      >
                        {b.textA || '\u00A0'}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5 pl-6">
                    <div className="text-[11px] uppercase tracking-wider text-stone-400 pb-2.5 mb-2 border-b border-stone-800 font-semibold">
                      {docBObj?.name || 'Document 2'}
                    </div>
                    {diffBlocks.map((b, i) => (
                      <div
                        key={i}
                        className={`px-2.5 py-1.5 rounded leading-relaxed ${
                          b.type === 'insert' || b.type === 'replace'
                            ? 'bg-emerald-950/80 text-emerald-300 border-l-2 border-emerald-500'
                            : 'text-stone-400'
                        }`}
                      >
                        {b.textB || '\u00A0'}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {diffBlocks.map((b, i) => (
                    <div key={i}>
                      {(b.type === 'delete' || b.type === 'replace') && b.textA && (
                        <div className="px-3 py-1.5 rounded bg-red-950/70 text-red-300 flex gap-2.5 leading-relaxed">
                          <span className="text-red-500 font-bold select-none">-</span>
                          <span>{b.textA}</span>
                        </div>
                      )}
                      {(b.type === 'insert' || b.type === 'replace') && b.textB && (
                        <div className="px-3 py-1.5 rounded bg-emerald-950/70 text-emerald-300 flex gap-2.5 leading-relaxed">
                          <span className="text-emerald-500 font-bold select-none">+</span>
                          <span>{b.textB}</span>
                        </div>
                      )}
                      {b.type === 'equal' && (
                        <div className="px-3 py-1.5 text-stone-400 flex gap-2.5 leading-relaxed">
                          <span className="text-stone-600 select-none"> </span>
                          <span>{b.textA}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PDF Highlighted Citation Preview Modal */}
      {previewCitation && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md p-4 sm:p-6 flex items-center justify-center">
          <div className="w-full max-w-4xl h-[85vh]">
            <DocumentPdfPreview
              docText={previewCitation.title === docBObj?.name ? docB : docA}
              docTitle={previewCitation.title}
              sourceUrl={previewCitation.title === docBObj?.name ? docBObj?.sourceUrl : docAObj?.sourceUrl}
              highlightText={previewCitation.text}
              onClose={() => setPreviewCitation(null)}
              isModal={true}
            />
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="p-10 sm:p-14 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200">
          <GitCompare className="w-8 h-8 text-stone-400 mx-auto mb-2.5" />
          <p className="text-sm font-semibold text-stone-700">No comparison generated yet.</p>
          <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto leading-relaxed">
            Select two files from your application document library above and click <strong>⚖️ Compare Selected Pair</strong>.
          </p>
        </div>
      )}
    </div>
  );
};
