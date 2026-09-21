import React, { useState, useEffect } from 'react';
import { ClarifyResult, RiskLevel } from '../types';
import { speakText, stopSpeaking } from '../utils/speech';
import { Zap, Volume2, VolumeX, ShieldAlert, Sparkles, AlertCircle, Quote } from 'lucide-react';

interface ClarifyTabProps {
  clauses: string[];
  docText: string;
  initialClauseText?: string;
  onOpenDocPrompt: () => void;
  result?: ClarifyResult | null;
  onResultChange?: (result: ClarifyResult | null) => void;
}

export const ClarifyTab: React.FC<ClarifyTabProps> = ({
  clauses,
  docText,
  initialClauseText,
  onOpenDocPrompt,
  result: externalResult,
  onResultChange,
}) => {
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [customText, setCustomText] = useState<string>('');
  const [useCustom, setUseCustom] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [internalResult, setInternalResult] = useState<ClarifyResult | null>(null);
  const result = externalResult !== undefined ? externalResult : internalResult;

  const setResult = (val: ClarifyResult | null) => {
    setInternalResult(val);
    onResultChange?.(val);
  };
  const [error, setError] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);

  useEffect(() => {
    if (initialClauseText) {
      setCustomText(initialClauseText);
      setUseCustom(true);
    }
  }, [initialClauseText]);

  const activeClauseText = useCustom
    ? customText
    : clauses[selectedIdx] || '';

  const handleClarify = async () => {
    if (!activeClauseText.trim()) {
      if (!docText) {
        onOpenDocPrompt();
        return;
      }
      setError('Please select or paste a clause to clarify.');
      return;
    }

    setLoading(true);
    setError(null);
    stopSpeaking();
    setIsPlayingAudio(false);

    try {
      const res = await fetch('/api/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clause_text: activeClauseText,
          document_text: docText,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to clarify clause');
      }

      const data: ClarifyResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred during clarification.');
    } finally {
      setLoading(false);
    }
  };

  const handleAudioToggle = () => {
    if (isPlayingAudio) {
      stopSpeaking();
      setIsPlayingAudio(false);
    } else if (result?.plain_explanation) {
      setIsPlayingAudio(true);
      speakText(
        result.plain_explanation,
        'English',
        () => setIsPlayingAudio(false),
        () => setIsPlayingAudio(false)
      );
    }
  };

  const getRiskColor = (level?: RiskLevel) => {
    switch (level) {
      case 'High':
        return 'bg-red-500 text-white';
      case 'Medium':
        return 'bg-amber-500 text-white';
      default:
        return 'bg-emerald-500 text-white';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <h2 className="text-xl font-bold text-stone-900 font-serif-heading flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-700" />
            Instant Clause Clarifier
          </h2>
          <p className="text-xs text-stone-600 mt-0.5">
            Break down individual contract clauses into plain English with risk flags and watchouts.
          </p>
        </div>

        <button
          type="button"
          onClick={handleClarify}
          disabled={loading || !activeClauseText}
          className="px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          {loading ? (
            <span className="inline-block animate-spin">⏳</span>
          ) : (
            <span>⚡ Clarify Clause</span>
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
            Source Clause to Analyze
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
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Paste any legal clause here to clarify its meaning and risk..."
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

      {/* Analysis Result Card */}
      {result && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2.5">
              <span className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider ${getRiskColor(result.risk_level)}`}>
                {result.risk_level} Risk
              </span>
              {result.evidence_type && (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200 font-medium">
                  Evidence: {result.evidence_type.replace('_', ' ')}
                </span>
              )}
              {result.confidence && (
                <span className="text-[11px] text-stone-500 font-medium">
                  Confidence: {result.confidence}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleAudioToggle}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                isPlayingAudio
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white border-stone-200 hover:bg-stone-100 text-stone-700'
              }`}
            >
              {isPlayingAudio ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              {isPlayingAudio ? 'Stop Reading' : 'Listen Aloud'}
            </button>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">
              Plain-English Explanation
            </h3>
            <p className="text-sm text-stone-800 leading-relaxed font-sans">
              {result.plain_explanation}
            </p>
          </div>

          {/* Why Risky and Watchout Boxes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-xs space-y-1">
              <span className="font-bold text-amber-900 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                Why This Deserves Attention
              </span>
              <p className="text-stone-700 leading-normal">
                {result.why_risky}
              </p>
            </div>

            {result.watch_out && (
              <div className="p-4 rounded-xl bg-red-50/80 border border-red-200 text-xs space-y-1">
                <span className="font-bold text-red-900 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-700" />
                  Key Watchout
                </span>
                <p className="text-stone-700 leading-normal">
                  {result.watch_out}
                </p>
              </div>
            )}
          </div>

          {/* Source Grounding Quote */}
          {result.source_span && (
            <div className="pt-3 border-t border-stone-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1 mb-1.5">
                <Quote className="w-3 h-3 text-stone-400" />
                Verbatim Source Span
              </span>
              <blockquote className="text-xs text-stone-600 bg-stone-50 p-3 rounded-lg border-l-2 border-amber-600 font-serif leading-relaxed italic">
                "{result.source_span}"
              </blockquote>
            </div>
          )}
        </div>
      )}

      {/* Accessible reference table */}
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-xs space-y-2">
        <h4 className="font-bold text-stone-800 uppercase tracking-wider text-[11px]">
          General Legal Risk Benchmark
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-stone-700">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500 text-[10px] uppercase">
                <th className="py-1.5">Risk Level</th>
                <th className="py-1.5">Typical Triggers</th>
                <th className="py-1.5">Signing Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200/60">
              <tr>
                <td className="py-1.5 font-semibold text-emerald-700">Low</td>
                <td className="py-1.5">Standard definitions, notice addresses, governing law</td>
                <td className="py-1.5">Safe to accept if accurate</td>
              </tr>
              <tr>
                <td className="py-1.5 font-semibold text-amber-700">Medium</td>
                <td className="py-1.5">Repair caps, security deposit deduction windows, inspection rules</td>
                <td className="py-1.5">Note deadlines and financial obligations</td>
              </tr>
              <tr>
                <td className="py-1.5 font-semibold text-red-700">High</td>
                <td className="py-1.5">Uncapped indemnity, unilateral termination, compound late fees</td>
                <td className="py-1.5">Propose counter-clause or consult a lawyer</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
