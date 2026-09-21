import React, { useState, useEffect } from 'react';
import { NegotiationResult } from '../types';
import { Handshake, Copy, Check, ShieldAlert, Sparkles, Quote, HelpCircle, ArrowRight } from 'lucide-react';

interface NegotiateTabProps {
  clauses: string[];
  docText: string;
  initialClauseText?: string;
  onOpenDocPrompt: () => void;
  result?: NegotiationResult | null;
  onResultChange?: (result: NegotiationResult | null) => void;
}

export const NegotiateTab: React.FC<NegotiateTabProps> = ({
  clauses,
  docText,
  initialClauseText,
  onOpenDocPrompt,
  result: externalResult,
  onResultChange,
}) => {
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [customClause, setCustomClause] = useState<string>('');
  const [useCustom, setUseCustom] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [internalResult, setInternalResult] = useState<NegotiationResult | null>(null);
  const result = externalResult !== undefined ? externalResult : internalResult;

  const setResult = (val: NegotiationResult | null) => {
    setInternalResult(val);
    onResultChange?.(val);
  };
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (initialClauseText) {
      setCustomClause(initialClauseText);
      setUseCustom(true);
    }
  }, [initialClauseText]);

  const activeClauseText = useCustom ? customClause : clauses[selectedIdx] || '';

  const handleNegotiate = async () => {
    if (!activeClauseText.trim()) {
      if (!docText) {
        onOpenDocPrompt();
        return;
      }
      setError('Please select or paste a clause to generate negotiation wording.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/negotiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clause_text: activeClauseText }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to draft negotiation point');
      }

      const data: NegotiationResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred during negotiation drafting.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result?.proposed_clause) return;
    navigator.clipboard.writeText(result.proposed_clause);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <h2 className="text-xl font-bold text-stone-900 font-serif-heading flex items-center gap-2">
            <Handshake className="w-5 h-5 text-amber-700" />
            Negotiation Counter-Clause Assistant
          </h2>
          <p className="text-xs text-stone-600 mt-0.5">
            Drafts balanced, neutral counter-wording for high-risk clauses to discuss with the other party or your lawyer.
          </p>
        </div>

        <button
          type="button"
          onClick={handleNegotiate}
          disabled={loading || !activeClauseText}
          className="px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          {loading ? (
            <span className="inline-block animate-spin">⏳</span>
          ) : (
            <span>🤝 Draft Counter-Clause</span>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Input Selection Box */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wider text-stone-600">
            Original Clause to Rebalance
          </span>
          <button
            type="button"
            onClick={() => setUseCustom(!useCustom)}
            className="text-amber-800 hover:text-amber-900 font-medium underline"
          >
            {useCustom ? '← Pick from document clauses' : '✏️ Paste custom clause'}
          </button>
        </div>

        {useCustom ? (
          <div>
            <textarea
              rows={4}
              value={customClause}
              onChange={(e) => setCustomClause(e.target.value)}
              placeholder="Paste any high-risk clause here (e.g. indemnity, termination, or late fee) to draft counter-wording..."
              className="w-full text-xs text-stone-800 border border-stone-300 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-amber-600 font-sans leading-relaxed"
            />
          </div>
        ) : clauses.length > 0 ? (
          <div className="space-y-2">
            <select
              value={selectedIdx}
              onChange={(e) => setSelectedIdx(Number(e.target.value))}
              className="w-full text-xs text-stone-800 border border-stone-300 rounded-xl p-2.5 bg-stone-50/50 focus:outline-none focus:ring-1 focus:ring-amber-600 font-medium truncate"
            >
              {clauses.map((c, i) => (
                <option key={i} value={i}>
                  Clause {i + 1}: {c.replace(/\s+/g, ' ').slice(0, 90)}...
                </option>
              ))}
            </select>
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 text-xs text-stone-700 italic font-serif leading-relaxed">
              "{activeClauseText}"
            </div>
          </div>
        ) : (
          <p className="text-xs text-stone-500 italic">
            No document loaded. Click "Paste custom clause" above or load the sample agreement from the sidebar.
          </p>
        )}
      </div>

      {/* Negotiation Output */}
      {result && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
          {/* Goal & Why */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs space-y-1">
              <span className="font-bold text-amber-900 uppercase tracking-wider text-[10px] block">
                Negotiation Objective
              </span>
              <p className="text-sm font-semibold text-stone-800 font-sans">
                {result.negotiation_goal}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-1">
              <span className="font-bold text-stone-600 uppercase tracking-wider text-[10px] block">
                Commercial Rationale
              </span>
              <p className="text-xs text-stone-700 font-sans leading-relaxed">
                {result.why_negotiate}
              </p>
            </div>
          </div>

          {/* Proposed Counter-Clause Card */}
          <div className="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200/90 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-700" />
                Proposed Counter-Clause Wording
              </span>
              <button
                onClick={handleCopy}
                className="px-2.5 py-1 rounded bg-white hover:bg-stone-100 border border-emerald-300 text-emerald-900 text-xs font-medium flex items-center gap-1 shadow-2xs transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-emerald-700" />}
                <span>{copied ? 'Copied Wording' : 'Copy Proposed Wording'}</span>
              </button>
            </div>

            <div className="p-4 rounded-xl bg-white border border-emerald-100 text-sm text-stone-900 font-serif leading-relaxed shadow-xs">
              "{result.proposed_clause}"
            </div>

            <p className="text-[11px] text-emerald-800 italic">
              Note: This is a collaborative drafting starting point designed to balance risk, not formal legal drafting.
            </p>
          </div>

          {/* Tradeoff / Question for Lawyer */}
          {result.tradeoff && (
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-1">
              <span className="font-bold text-stone-700 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
                Tradeoff or Question to Discuss with Your Lawyer
              </span>
              <p className="text-stone-600 leading-normal">
                {result.tradeoff}
              </p>
            </div>
          )}

          {/* Source Quote */}
          {result.source_span && (
            <div className="pt-2 border-t border-stone-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1 mb-1">
                <Quote className="w-3 h-3" />
                Original Clause Text
              </span>
              <blockquote className="text-xs text-stone-600 bg-stone-50 p-2.5 rounded border-l-2 border-stone-300 italic font-serif">
                "{result.source_span}"
              </blockquote>
            </div>
          )}
        </div>
      )}

      {!result && !loading && (
        <div className="p-8 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200">
          <Handshake className="w-8 h-8 text-stone-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-stone-700">No counter-clause drafted yet.</p>
          <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
            Select a high-risk clause above and click <strong>🤝 Draft Counter-Clause</strong> to generate a commercial starting point.
          </p>
        </div>
      )}
    </div>
  );
};
