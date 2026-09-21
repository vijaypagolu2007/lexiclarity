import React, { useState } from 'react';
import { CompareChange, CompareResult } from '../types';
import { computeLineDiff, DiffBlock } from '../utils/diff';
import { GitCompare, ShieldAlert, Download, Filter, Eye, Columns } from 'lucide-react';

interface CompareTabProps {
  initialDocA: string;
  initialDocB: string;
  onLoadComparePair: () => void;
  result?: CompareResult | null;
  onResultChange?: (result: CompareResult | null) => void;
}

export const CompareTab: React.FC<CompareTabProps> = ({
  initialDocA,
  initialDocB,
  onLoadComparePair,
  result: externalResult,
  onResultChange,
}) => {
  const [docA, setDocA] = useState<string>(initialDocA);
  const [docB, setDocB] = useState<string>(initialDocB);
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

  // Update internal states if props change
  React.useEffect(() => {
    if (initialDocA) setDocA(initialDocA);
  }, [initialDocA]);

  React.useEffect(() => {
    if (initialDocB) setDocB(initialDocB);
  }, [initialDocB]);

  const handleCompare = async () => {
    if (!docA.trim() || !docB.trim()) {
      setError('Both Version A and Version B must be provided to run comparison.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_a: docA,
          document_b: docB,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to compare documents');
      }

      const data: CompareResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred during comparison.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lexiclarity_comparison.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredChanges = result?.changes?.filter((c) => {
    if (materialFilter === 'all') return true;
    return c.materiality === materialFilter;
  }) || [];

  const diffBlocks: DiffBlock[] = (docA && docB) ? computeLineDiff(docA, docB) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <h2 className="text-xl font-bold text-stone-900 font-serif-heading flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-amber-700" />
            Contract Comparison & Visual Redline
          </h2>
          <p className="text-xs text-stone-600 mt-0.5">
            Clause-by-clause diffing, materiality triage, and plain-English user impact analysis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onLoadComparePair}
            className="px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 text-xs font-medium transition-colors"
          >
            Load Sample Pair (A vs B)
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
              <span>⚖️ Compare Versions</span>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Input Editors (Collapsible or Side-by-Side) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-stone-700 uppercase tracking-wider">
              Version A (Original / Previous)
            </span>
            <span className="text-stone-600">{docA ? docA.length.toLocaleString() : 0} chars</span>
          </div>
          <textarea
            rows={5}
            value={docA}
            onChange={(e) => setDocA(e.target.value)}
            placeholder="Paste original contract text here..."
            className="w-full text-xs text-stone-800 font-mono border border-stone-300 rounded-xl p-3 bg-stone-50/50 focus:outline-none focus:ring-1 focus:ring-amber-600"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-stone-700 uppercase tracking-wider">
              Version B (Revised / Counter-Proposal)
            </span>
            <span className="text-stone-600">{docB ? docB.length.toLocaleString() : 0} chars</span>
          </div>
          <textarea
            rows={5}
            value={docB}
            onChange={(e) => setDocB(e.target.value)}
            placeholder="Paste revised contract text here..."
            className="w-full text-xs text-stone-800 font-mono border border-stone-300 rounded-xl p-3 bg-stone-50/50 focus:outline-none focus:ring-1 focus:ring-amber-600"
          />
        </div>
      </div>

      {/* Comparison Results */}
      {result && (
        <div className="space-y-6">
          {/* Overall Assessment Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-900 uppercase tracking-wider text-[11px]">
                Overall Comparative Assessment
              </span>
              <button
                onClick={handleExportJson}
                className="px-2.5 py-1 rounded bg-white hover:bg-stone-100 border border-amber-300 text-amber-900 text-xs font-medium flex items-center gap-1 shadow-2xs"
              >
                <Download className="w-3 h-3 text-amber-700" />
                Export Comparison (.json)
              </button>
            </div>
            <p className="text-sm text-stone-800 leading-relaxed font-sans">
              {result.overall_assessment}
            </p>
          </div>

          {/* View Mode Toggle Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-stone-200 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium text-stone-500">Display View:</span>
              <div className="flex items-center rounded-lg bg-stone-100 p-0.5 border border-stone-200">
                <button
                  onClick={() => setViewMode('structured')}
                  className={`px-3 py-1 rounded-md transition-all font-medium ${
                    viewMode === 'structured'
                      ? 'bg-white text-stone-900 shadow-2xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Structured Impact Cards
                </button>
                <button
                  onClick={() => setViewMode('redline')}
                  className={`px-3 py-1 rounded-md transition-all font-medium ${
                    viewMode === 'redline'
                      ? 'bg-white text-stone-900 shadow-2xs'
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
                  className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 font-medium text-stone-700 focus:outline-none"
                >
                  <option value="all">All Changes ({result.changes?.length || 0})</option>
                  <option value="material">Material Only</option>
                  <option value="minor">Minor Only</option>
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setRedlineStyle('split')}
                  className={`px-2.5 py-1 rounded border text-xs font-medium flex items-center gap-1 ${
                    redlineStyle === 'split' ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-white text-stone-600 border-stone-200'
                  }`}
                >
                  <Columns className="w-3 h-3" /> Side-by-Side
                </button>
                <button
                  onClick={() => setRedlineStyle('inline')}
                  className={`px-2.5 py-1 rounded border text-xs font-medium flex items-center gap-1 ${
                    redlineStyle === 'inline' ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-white text-stone-600 border-stone-200'
                  }`}
                >
                  <Eye className="w-3 h-3" /> Unified Redline
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
                  className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-stone-900 font-serif-heading">
                        {change.topic}
                      </h4>
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          change.materiality === 'material'
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : 'bg-stone-100 text-stone-700 border border-stone-200'
                        }`}
                      >
                        {change.materiality}
                      </span>
                    </div>

                    <span
                      className={`text-xs px-2 py-0.5 rounded-md font-medium uppercase ${
                        change.change_type === 'added'
                          ? 'bg-emerald-100 text-emerald-800'
                          : change.change_type === 'deleted'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {change.change_type}
                    </span>
                  </div>

                  <p className="text-xs text-stone-700 leading-normal font-sans">
                    {change.summary}
                  </p>

                  {/* Plain-Language User Impact Line */}
                  <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs font-medium text-stone-900">
                    <strong className="text-amber-800">What changed for you: </strong>
                    {change.user_impact}
                  </div>

                  {/* Before / After source spans */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                    {change.source_span_a && (
                      <div className="bg-red-50/50 p-2.5 rounded-lg border border-red-100 text-stone-600">
                        <span className="font-semibold text-red-800 block text-[10px] uppercase mb-1">
                          Original (Version A)
                        </span>
                        <p className="italic font-serif">"{change.source_span_a}"</p>
                      </div>
                    )}
                    {change.source_span_b && (
                      <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 text-stone-600">
                        <span className="font-semibold text-emerald-800 block text-[10px] uppercase mb-1">
                          Revised (Version B)
                        </span>
                        <p className="italic font-serif">"{change.source_span_b}"</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Visual Redline Diff View */}
          {viewMode === 'redline' && (
            <div className="bg-stone-900 text-stone-200 rounded-2xl p-4 font-mono text-xs overflow-x-auto shadow-inner">
              {redlineStyle === 'split' ? (
                <div className="grid grid-cols-2 gap-4 divide-x divide-stone-800 min-w-[600px]">
                  <div className="space-y-1 pr-2">
                    <div className="text-[10px] uppercase tracking-wider text-stone-400 pb-2 border-b border-stone-800 font-semibold">
                      Original Text
                    </div>
                    {diffBlocks.map((b, i) => (
                      <div
                        key={i}
                        className={`p-1 rounded ${
                          b.type === 'delete' || b.type === 'replace'
                            ? 'bg-red-950/80 text-red-300 border-l-2 border-red-500'
                            : 'text-stone-400'
                        }`}
                      >
                        {b.textA || '\u00A0'}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1 pl-4">
                    <div className="text-[10px] uppercase tracking-wider text-stone-400 pb-2 border-b border-stone-800 font-semibold">
                      Revised Text
                    </div>
                    {diffBlocks.map((b, i) => (
                      <div
                        key={i}
                        className={`p-1 rounded ${
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
                <div className="space-y-1">
                  {diffBlocks.map((b, i) => (
                    <div key={i}>
                      {(b.type === 'delete' || b.type === 'replace') && b.textA && (
                        <div className="p-1 rounded bg-red-950/70 text-red-300 flex gap-2">
                          <span className="text-red-500 font-bold select-none">-</span>
                          <span>{b.textA}</span>
                        </div>
                      )}
                      {(b.type === 'insert' || b.type === 'replace') && b.textB && (
                        <div className="p-1 rounded bg-emerald-950/70 text-emerald-300 flex gap-2">
                          <span className="text-emerald-500 font-bold select-none">+</span>
                          <span>{b.textB}</span>
                        </div>
                      )}
                      {b.type === 'equal' && (
                        <div className="p-1 text-stone-400 flex gap-2">
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

      {!result && !loading && (
        <div className="p-8 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200">
          <GitCompare className="w-8 h-8 text-stone-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-stone-700">No comparison generated yet.</p>
          <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
            Click <strong>Load Sample Pair (A vs B)</strong> or paste two versions of a contract above, then click <strong>⚖️ Compare Versions</strong>.
          </p>
        </div>
      )}
    </div>
  );
};
