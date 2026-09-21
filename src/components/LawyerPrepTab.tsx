import React, { useState } from 'react';
import { LawyerPrepResult } from '../types';
import { exportAsPdf, exportAsTxt } from '../utils/export';
import { ExportDropdown } from './ExportDropdown';
import { Briefcase, ShieldAlert, CheckSquare, Calendar, DollarSign, Users, HelpCircle, FileText } from 'lucide-react';

interface LawyerPrepTabProps {
  docText: string;
  onOpenDocPrompt: () => void;
  result?: LawyerPrepResult | null;
  onResultChange?: (result: LawyerPrepResult | null) => void;
}

export const LawyerPrepTab: React.FC<LawyerPrepTabProps> = ({
  docText,
  onOpenDocPrompt,
  result: externalResult,
  onResultChange,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [internalResult, setInternalResult] = useState<LawyerPrepResult | null>(null);
  const result = externalResult !== undefined ? externalResult : internalResult;

  const setResult = (val: LawyerPrepResult | null) => {
    setInternalResult(val);
    onResultChange?.(val);
  };
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!docText) {
      onOpenDocPrompt();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/lawyer-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_text: docText }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate lawyer preparation pack');
      }

      const data: LawyerPrepResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred while generating the pack.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = () => {
    if (!result) return;
    exportAsPdf({
      title: 'LexiClarity — Lawyer Consultation Pack',
      subtitle: 'Structured briefing pack for consultation with legal counsel',
      filename: 'lexiclarity_lawyer_consultation_pack.pdf',
      metadata: {
        'Document Focus': 'Legal Consultation Preparation',
        'Parties Count': `${result.parties?.length || 0}`,
        'Risk Items': `${result.top_risks?.length || 0}`,
        'Prepared By': 'LexiClarity Legal Assistant',
      },
      sections: [
        {
          heading: '1. Executive Case Summary',
          body: result.case_summary,
        },
        ...(result.parties?.length
          ? [
              {
                heading: '2. Identified Parties & Roles',
                body: result.parties
                  .map((p) => `• ${p.name} (${p.role}): ${p.responsibilities}`)
                  .join('\n\n'),
              },
            ]
          : []),
        ...(result.important_dates?.length
          ? [
              {
                heading: '3. Critical Dates & Deadlines',
                body: result.important_dates
                  .map((d) => `• ${d.date_or_trigger}: ${d.what_happens}`)
                  .join('\n\n'),
              },
            ]
          : []),
        ...(result.financial_obligations?.length
          ? [
              {
                heading: '4. Financial Obligations & Triggers',
                body: result.financial_obligations
                  .map((f) => `• ${f.item} — Amount: ${f.amount} (Due: ${f.due})\n  Source: "${f.source_span}"`)
                  .join('\n\n'),
              },
            ]
          : []),
        ...(result.top_risks?.length
          ? [
              {
                heading: '5. Key Risks to Review With Counsel',
                body: result.top_risks
                  .map((r) => `• ${r.risk}:\n  ${r.why}\n  Source: "${r.source_span}"`)
                  .join('\n\n'),
              },
            ]
          : []),
        ...(result.missing_or_ambiguous?.length
          ? [
              {
                heading: '6. Missing or Ambiguous Terms',
                body: result.missing_or_ambiguous.map((m) => `• ${m}`).join('\n\n'),
              },
            ]
          : []),
        ...(result.questions_for_lawyer?.length
          ? [
              {
                heading: '7. Specific Questions to Ask Your Lawyer',
                body: result.questions_for_lawyer
                  .map((q, i) => `${i + 1}. ${q}`)
                  .join('\n\n'),
              },
            ]
          : []),
        ...(result.documents_to_bring?.length
          ? [
              {
                heading: '8. Evidence & Documents Checklist',
                body: result.documents_to_bring.map((d) => `[  ] ${d}`).join('\n'),
              },
            ]
          : []),
      ],
    });
  };

  const handleExportTxt = () => {
    if (!result) return;
    let txt = `====================================================\n`;
    txt += `LEXICLARITY — 1-PAGE LAWYER CONSULTATION PACK\n`;
    txt += `====================================================\n\n`;

    txt += `1. EXECUTIVE CASE SUMMARY:\n${result.case_summary}\n\n`;

    if (result.parties?.length) {
      txt += `----------------------------------------------------\n`;
      txt += `2. PARTIES & ROLES:\n`;
      result.parties.forEach((p) => {
        txt += `  * ${p.name} (${p.role}): ${p.responsibilities}\n`;
      });
      txt += `\n`;
    }

    if (result.important_dates?.length) {
      txt += `----------------------------------------------------\n`;
      txt += `3. CRITICAL DATES & TRIGGERS:\n`;
      result.important_dates.forEach((d) => {
        txt += `  * ${d.date_or_trigger}: ${d.what_happens}\n`;
      });
      txt += `\n`;
    }

    if (result.financial_obligations?.length) {
      txt += `----------------------------------------------------\n`;
      txt += `4. FINANCIAL OBLIGATIONS:\n`;
      result.financial_obligations.forEach((f) => {
        txt += `  * ${f.item}: ${f.amount} (Due: ${f.due})\n    Quote: "${f.source_span}"\n`;
      });
      txt += `\n`;
    }

    if (result.top_risks?.length) {
      txt += `----------------------------------------------------\n`;
      txt += `5. TOP RISKS TO DISCUSS:\n`;
      result.top_risks.forEach((r, idx) => {
        txt += `  [Risk ${idx + 1}] ${r.risk}\n`;
        txt += `    Why: ${r.why}\n`;
        txt += `    Source Quote: "${r.source_span}"\n\n`;
      });
    }

    if (result.missing_or_ambiguous?.length) {
      txt += `----------------------------------------------------\n`;
      txt += `6. MISSING OR AMBIGUOUS TERMS:\n`;
      result.missing_or_ambiguous.forEach((m) => {
        txt += `  * ${m}\n`;
      });
      txt += `\n`;
    }

    if (result.questions_for_lawyer?.length) {
      txt += `----------------------------------------------------\n`;
      txt += `7. SPECIFIC QUESTIONS FOR YOUR LAWYER:\n`;
      result.questions_for_lawyer.forEach((q, i) => {
        txt += `  ${i + 1}. ${q}\n`;
      });
      txt += `\n`;
    }

    if (result.documents_to_bring?.length) {
      txt += `----------------------------------------------------\n`;
      txt += `8. DOCUMENTS TO BRING CHECKLIST:\n`;
      result.documents_to_bring.forEach((doc) => {
        txt += `  [ ] ${doc}\n`;
      });
      txt += `\n`;
    }

    txt += `====================================================\n`;
    txt += `DISCLAIMER: Generated by LexiClarity AI. Informational aid for attorney consultation. Not legal advice.\n`;
    txt += `====================================================\n`;

    exportAsTxt('lexiclarity_lawyer_consultation_pack.txt', txt);
  };

  const handleDownload = () => {
    if (!result) return;
    let md = `# LexiClarity — Legal Consultation Preparation Pack\n\n`;
    md += `## Case Summary\n${result.case_summary}\n\n`;

    md += `## Parties & Roles\n`;
    result.parties?.forEach((p) => {
      md += `- **${p.name}** (${p.role}): ${p.responsibilities}\n`;
    });
    md += `\n`;

    md += `## Important Dates & Triggers\n`;
    result.important_dates?.forEach((d) => {
      md += `- **${d.date_or_trigger}:** ${d.what_happens}\n`;
    });
    md += `\n`;

    md += `## Financial Obligations\n`;
    result.financial_obligations?.forEach((f) => {
      md += `- **${f.item}:** ${f.amount} (Due: ${f.due}) — Quote: "${f.source_span}"\n`;
    });
    md += `\n`;

    md += `## Top Risks\n`;
    result.top_risks?.forEach((r) => {
      md += `### ${r.risk}\n${r.why}\nQuote: "${r.source_span}"\n\n`;
    });

    md += `## Missing or Ambiguous Clauses\n`;
    result.missing_or_ambiguous?.forEach((m) => {
      md += `- ${m}\n`;
    });
    md += `\n`;

    md += `## Specific Questions for Your Lawyer\n`;
    result.questions_for_lawyer?.forEach((q, i) => {
      md += `${i + 1}. ${q}\n`;
    });
    md += `\n`;

    md += `## Documents to Bring\n`;
    result.documents_to_bring?.forEach((doc) => {
      md += `- [ ] ${doc}\n`;
    });
    md += `\n`;

    md += `## Contract Timeline\n`;
    result.timeline?.forEach((t) => {
      md += `- **${t.when}:** ${t.event}\n`;
    });
    md += `\n---\n*Disclaimer: Generated by LexiClarity AI. Informational aid for attorney consultation. Not legal advice.*`;

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lexiclarity_lawyer_consultation_pack.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <h2 className="text-xl font-bold text-stone-900 font-serif-heading flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-amber-700" />
            1-Page Lawyer Consultation Pack
          </h2>
          <p className="text-xs text-stone-600 mt-0.5">
            Organizes key facts, risks, financial triggers, and targeted questions before speaking with legal counsel.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          {loading ? (
            <span className="inline-block animate-spin">⏳</span>
          ) : (
            <span>📋 Generate Consultation Pack</span>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <ExportDropdown
              onExportPdf={handleExportPdf}
              onExportTxt={handleExportTxt}
              onExportMd={handleDownload}
              label="Export Consultation Pack"
            />
          </div>

          {/* Case Summary */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-amber-700" />
              Executive Case Summary
            </h3>
            <p className="text-sm text-stone-800 leading-relaxed font-sans">
              {result.case_summary}
            </p>
          </div>

          {/* Parties & Dates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Parties */}
            <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600" />
                Identified Parties & Responsibilities
              </h3>
              <div className="space-y-2.5 text-xs">
                {result.parties?.map((p, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                    <div className="font-bold text-stone-900">{p.name} <span className="text-stone-500 font-normal">({p.role})</span></div>
                    <p className="text-stone-600 mt-1">{p.responsibilities}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Dates & Triggers */}
            <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-600" />
                Important Dates & Deadlines
              </h3>
              <div className="space-y-2 text-xs">
                {result.important_dates?.map((d, idx) => (
                  <div key={idx} className="flex items-start justify-between p-2 rounded-lg bg-stone-50 border border-stone-100">
                    <span className="font-semibold text-stone-900 w-1/3">{d.date_or_trigger}</span>
                    <span className="text-stone-600 w-2/3 text-right">{d.what_happens}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Financial Obligations Table */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-700" />
              Financial Obligations & Penalties
            </h3>
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500 text-[10px] uppercase">
                    <th className="py-2">Item</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Due Date / Trigger</th>
                    <th className="py-2">Verbatim Quote</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {result.financial_obligations?.map((f, idx) => (
                    <tr key={idx} className="hover:bg-stone-50">
                      <td className="py-2 font-semibold text-stone-900">{f.item}</td>
                      <td className="py-2 text-stone-800">{f.amount}</td>
                      <td className="py-2 text-stone-600">{f.due}</td>
                      <td className="py-2 italic font-serif text-stone-500 max-w-xs truncate">"{f.source_span}"</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Questions for Lawyer & Missing Clauses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-amber-700" />
                Targeted Questions to Ask Your Lawyer
              </h3>
              <ol className="list-decimal list-inside text-xs text-stone-800 space-y-2">
                {result.questions_for_lawyer?.map((q, idx) => (
                  <li key={idx} className="leading-normal">{q}</li>
                ))}
              </ol>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-stone-500" />
                Missing or Ambiguous Terms in Agreement
              </h3>
              <ul className="list-disc list-inside text-xs text-stone-600 space-y-2">
                {result.missing_or_ambiguous?.map((m, idx) => (
                  <li key={idx} className="leading-normal">{m}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Checklist of Documents to Bring */}
          <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4 text-emerald-600" />
              Documents to Bring to Consultation
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {result.documents_to_bring?.map((doc, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded bg-stone-50 text-stone-800">
                  <input type="checkbox" className="rounded text-amber-600 focus:ring-amber-500" />
                  <span>{doc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="p-8 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200">
          <Briefcase className="w-8 h-8 text-stone-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-stone-700">No consultation pack generated yet.</p>
          <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
            Click <strong>📋 Generate Consultation Pack</strong> to produce a structured one-page briefing with questions, deadlines, and missing terms.
          </p>
        </div>
      )}
    </div>
  );
};
