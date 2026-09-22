import React, { useState } from 'react';
import { SimplifyResult } from '../types';
import { checkItems, groundedRate } from '../utils/grounding';
import { speakText, stopSpeaking } from '../utils/speech';
import { exportAsPdf, exportAsTxt } from '../utils/export';
import { ExportDropdown } from './ExportDropdown';
import { BookOpen, Volume2, VolumeX, Copy, Check, ShieldAlert, CheckCircle2, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { DocumentPdfPreview } from './DocumentPdfPreview';

interface SimplifyTabProps {
  docText: string;
  onOpenDocPrompt: () => void;
  result?: SimplifyResult | null;
  onResultChange?: (result: SimplifyResult | null) => void;
}

export const SimplifyTab: React.FC<SimplifyTabProps> = ({
  docText,
  onOpenDocPrompt,
  result: externalResult,
  onResultChange,
}) => {
  const [readingLevel, setReadingLevel] = useState<'simple' | 'simpler' | 'summary'>('summary');
  const [language, setLanguage] = useState<string>('English');
  const [loading, setLoading] = useState<boolean>(false);
  const [internalResult, setInternalResult] = useState<SimplifyResult | null>(null);
  const result = externalResult !== undefined ? externalResult : internalResult;

  const setResult = (val: SimplifyResult | null) => {
    setInternalResult(val);
    onResultChange?.(val);
  };

  const [error, setError] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [previewCitation, setPreviewCitation] = useState<string | null>(null);

  const handleSimplify = async () => {
    if (!docText) {
      onOpenDocPrompt();
      return;
    }

    setLoading(true);
    setError(null);
    stopSpeaking();
    setIsPlayingAudio(false);

    try {
      const res = await fetch('/api/simplify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_text: docText,
          reading_level: readingLevel,
          target_language: language,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to simplify document');
      }

      const data: SimplifyResult = await res.json();
      // Run client-side source-grounding verification
      const verifiedSections = checkItems(data.sections || [], docText);
      setResult({
        ...data,
        sections: verifiedSections,
      });
    } catch (err: any) {
      setError(err.message || 'An error occurred during simplification.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = (id: string) => {
    setExpandedSources((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const [activeSpeechLang, setActiveSpeechLang] = useState<string | null>(null);

  const handleAudioToggle = () => {
    if (isPlayingAudio) {
      stopSpeaking();
      setIsPlayingAudio(false);
      setActiveSpeechLang(null);
    } else if (result?.sections) {
      const fullSpeechText = result.sections.map((s) => `${s.original_heading}. ${s.plain_text}`).join(' ');
      setIsPlayingAudio(true);
      const speechLang = result.language || language || 'English';
      const stopFn = speakText(
        fullSpeechText,
        speechLang,
        () => {
          setIsPlayingAudio(false);
          setActiveSpeechLang(null);
        },
        () => {
          setIsPlayingAudio(false);
          setActiveSpeechLang(null);
        }
      );
      if (stopFn.detectedLanguage) {
        setActiveSpeechLang(stopFn.detectedLanguage.langName);
      }
    }
  };

  const handleCopy = () => {
    if (!result) return;
    const text = result.sections
      .map((s) => `## ${s.original_heading}\n${s.plain_text}`)
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPdf = () => {
    if (!result) return;
    exportAsPdf({
      title: 'LexiClarity — Plain-Language Document Summary',
      subtitle: `Reading Level: ${result.reading_level.toUpperCase()} | Language: ${result.language}`,
      filename: `lexiclarity_${(result.document_type || 'contract').toLowerCase().replace(/\s+/g, '_')}_simplified.pdf`,
      metadata: {
        'Document Type': result.document_type || 'Contract',
        'Reading Level': result.reading_level,
        'Language': result.language,
        'Grounding Score': `${Math.round(rate * 100)}% Verified`,
      },
      sections: [
        ...result.sections.map((s) => ({
          heading: s.original_heading,
          body: s.plain_text,
          note: s.source_span,
          badge: s.grounded ? 'Grounded' : 'Needs Review',
        })),
        ...(result.key_terms?.length
          ? [
              {
                heading: 'Key Terms Defined',
                body: result.key_terms.map((t) => `• ${t.term}: ${t.meaning}`).join('\n\n'),
              },
            ]
          : []),
      ],
    });
  };

  const handleDownloadTxt = () => {
    if (!result) return;
    const txtContent =
      `====================================================\n` +
      `LEXICLARITY — PLAIN-LANGUAGE LEGAL SUMMARY\n` +
      `====================================================\n\n` +
      `Document Type: ${result.document_type || 'Contract'}\n` +
      `Reading Level: ${result.reading_level}\n` +
      `Language: ${result.language}\n` +
      `Grounding Verification: ${Math.round(rate * 100)}%\n\n` +
      `----------------------------------------------------\n\n` +
      result.sections
        .map(
          (s, idx) =>
            `[${idx + 1}] ${s.original_heading.toUpperCase()}\n` +
            `${s.plain_text}\n\n` +
            (s.source_span ? `Verbatim Citation:\n"${s.source_span}"\n\n` : '')
        )
        .join('----------------------------------------------------\n\n') +
      (result.key_terms?.length
        ? `\n====================================================\nKEY LEGAL TERMS DEFINED\n====================================================\n\n` +
          result.key_terms.map((t) => `* ${t.term}:\n  ${t.meaning}\n`).join('\n')
        : '') +
      `\n====================================================\n` +
      `DISCLAIMER: Informational GenAI output. Not legal advice.\n` +
      `====================================================\n`;

    exportAsTxt(
      `lexiclarity_${(result.document_type || 'contract').toLowerCase().replace(/\s+/g, '_')}_simplified.txt`,
      txtContent
    );
  };

  const handleDownloadMarkdown = () => {
    if (!result) return;
    const content = `# LexiClarity Simplified Document\n\n**Reading Level:** ${result.reading_level}\n**Language:** ${result.language}\n**Document Type:** ${result.document_type}\n\n` +
      result.sections.map((s) => `## ${s.original_heading}\n${s.plain_text}\n\n> Source Quote: "${s.source_span}"`).join('\n\n') +
      (result.key_terms?.length ? `\n\n## Key Terms\n` + result.key_terms.map((t) => `- **${t.term}:** ${t.meaning}`).join('\n') : '') +
      `\n\n---\n*Disclaimer: Informational GenAI output only. Not legal advice.*`;

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lexiclarity_simplified.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const rate = result?.sections ? groundedRate(result.sections) : 1.0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <h2 className="text-xl font-bold text-stone-900 font-serif-heading flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-700" />
            Plain-Language Contract Simplifier
          </h2>
          <p className="text-xs text-stone-600 mt-0.5">
            Rewrites legalese into clear, understandable language with verbatim source citations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Reading Level Selector */}
          <div className="flex items-center rounded-lg bg-stone-100 p-0.5 border border-stone-200 text-xs font-medium text-stone-700">
            {(['simple', 'simpler', 'summary'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setReadingLevel(lvl)}
                className={`px-3 py-1.5 rounded-md capitalize transition-all ${
                  readingLevel === lvl
                    ? 'bg-white text-stone-900 shadow-xs font-semibold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Language Selector */}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="text-xs rounded-lg border border-stone-200 bg-white px-3 py-1.5 font-medium text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-600"
          >
            {[
              'English',
              'Hindi',
              'Spanish',
              'Tamil',
              'Telugu',
              'Kannada',
              'Malayalam',
              'Bengali',
              'Gujarati',
              'Marathi',
              'Punjabi',
              'French',
              'German',
              'Italian',
              'Portuguese',
              'Russian',
              'Japanese',
              'Korean',
              'Chinese (Mandarin)',
              'Arabic',
              'Dutch',
              'Polish',
              'Turkish',
              'Vietnamese',
            ].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleSimplify}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block animate-spin">⏳</span>
            ) : (
              <span>✨ Simplify</span>
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

      {result && (
        <div className="space-y-6">
          {/* Top Results Metrics Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-stone-50 border border-stone-200 rounded-xl text-xs">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <span className="text-stone-500">Document Type: </span>
                <span className="font-semibold text-stone-800">{result.document_type || 'Contract'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-stone-500">Source Grounding: </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${
                    rate >= 0.8
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {Math.round(rate * 100)}% Grounded
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAudioToggle}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  isPlayingAudio
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs animate-pulse'
                    : 'bg-white border-stone-200 hover:bg-stone-100 text-stone-700'
                }`}
                title="Auto-detect text language and speak with corresponding voice"
              >
                {isPlayingAudio ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-amber-700" />}
                {isPlayingAudio
                  ? `Stop Reading (${activeSpeechLang || 'Auto-Voice'})`
                  : 'Read Aloud 🔊'}
              </button>

              <button
                onClick={handleCopy}
                className="px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 text-xs font-medium flex items-center gap-1 transition-colors"
                title="Copy plain text"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>

              <ExportDropdown
                onExportPdf={handleDownloadPdf}
                onExportTxt={handleDownloadTxt}
                onExportMd={handleDownloadMarkdown}
                label="Export Document"
              />
            </div>
          </div>

          {/* Section Cards */}
          <div className="grid grid-cols-1 gap-4">
            {result.sections.map((section, idx) => {
              const isSourceExpanded = expandedSources[section.section_id || idx];
              return (
                <div
                  key={section.section_id || idx}
                  className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-stone-900 font-serif-heading">
                      {section.original_heading || `Section ${idx + 1}`}
                    </h3>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        section.grounded
                          ? 'bg-stone-100 text-stone-700'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {section.grounded ? '✅ Grounded citation' : '⚠️ Citation needs review'}
                    </span>
                  </div>

                  <p className="text-sm text-stone-700 leading-relaxed font-sans">
                    {section.plain_text}
                  </p>

                  {/* Verbatim Source Quote Dropdown */}
                  {section.source_span && (
                    <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => toggleSource(section.section_id || String(idx))}
                        className="text-xs text-stone-600 hover:text-stone-900 font-medium flex items-center gap-1"
                      >
                        <span>Original contract clause citation</span>
                        {isSourceExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setPreviewCitation(section.source_span)}
                        className="text-[11px] bg-yellow-200 hover:bg-yellow-300 text-stone-950 px-2.5 py-1 rounded-md font-bold flex items-center gap-1 border border-amber-400 transition-colors shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-amber-900" />
                        View in PDF Preview 📄
                      </button>
                    </div>
                  )}

                  {isSourceExpanded && section.source_span && (
                    <blockquote className="mt-2 text-xs italic text-stone-600 bg-stone-50 p-3 rounded-lg border-l-2 border-amber-600 font-serif leading-relaxed">
                      "{section.source_span}"
                    </blockquote>
                  )}
                </div>
              );
            })}
          </div>

          {/* Key Terms Glossary */}
          {result.key_terms && result.key_terms.length > 0 && (
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-stone-800">
                Key Legal Terms Explained
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.key_terms.map((term, i) => (
                  <div key={i} className="bg-white p-3.5 rounded-lg border border-stone-200/80 shadow-xs">
                    <span className="font-bold text-stone-900 text-xs block mb-1 text-amber-900">
                      {term.term}
                    </span>
                    <p className="text-xs text-stone-600 leading-normal">
                      {term.meaning}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!result && !loading && (
        <div className="p-8 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200">
          <BookOpen className="w-8 h-8 text-stone-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-stone-700">No simplified text generated yet.</p>
          <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
            Choose a reading level and language above, then click <strong>✨ Simplify</strong> to translate this contract into clear English or regional languages.
          </p>
        </div>
      )}

      {/* PDF Highlighted Citation Preview Modal */}
      {previewCitation && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md p-4 sm:p-6 flex items-center justify-center">
          <div className="w-full max-w-4xl h-[85vh]">
            <DocumentPdfPreview
              docText={docText}
              docTitle="Simplified Clause Source Citation"
              highlightText={previewCitation}
              onClose={() => setPreviewCitation(null)}
              isModal={true}
            />
          </div>
        </div>
      )}
    </div>
  );
};
