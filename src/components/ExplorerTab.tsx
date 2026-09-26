import React, { useEffect, useState } from 'react';
import { ClauseItem, ClauseMapResult, HealthScore } from '../types';
import { checkItems } from '../utils/grounding';
import { CATEGORIES, scoreClauses } from '../utils/scoring';
import { ExportDropdown } from './ExportDropdown';
import { Compass, ShieldAlert, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { DocumentPdfPreview } from './DocumentPdfPreview';
import { requireLegalDocument } from '../utils/guardrail';
import { readApiJson } from '../utils/api';
import { keepTabFocusInside } from '../utils/accessibility';

interface ExplorerTabProps {
  docText: string;
  sourceUrl?: string;
  onOpenDocPrompt: () => void;
  data?: { clauses: ClauseItem[]; health: HealthScore } | null;
  onResultChange?: (data: { clauses: ClauseItem[]; health: HealthScore } | null) => void;
}

export const ExplorerTab: React.FC<ExplorerTabProps> = ({
  docText,
  sourceUrl,
  onOpenDocPrompt,
  data: externalData,
  onResultChange,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [internalClauses, setInternalClauses] = useState<ClauseItem[] | null>(null);
  const [internalHealth, setInternalHealth] = useState<HealthScore | null>(null);

  const clauses = externalData?.clauses || internalClauses;
  const health = externalData?.health || internalHealth;

  useEffect(() => {
    if (externalData === null) {
      setInternalClauses(null);
      setInternalHealth(null);
      setExpandedSources({});
      setPreviewCitation(null);
    }
  }, [externalData]);

  const setClausesAndHealth = (newClauses: ClauseItem[] | null, newHealth: HealthScore | null) => {
    setInternalClauses(newClauses);
    setInternalHealth(newHealth);
    if (newClauses && newHealth) {
      onResultChange?.({ clauses: newClauses, health: newHealth });
    } else {
      onResultChange?.(null);
    }
  };
  const [error, setError] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [previewCitation, setPreviewCitation] = useState<string | null>(null);

  const handleBuildMap = async () => {
    if (!docText) {
      onOpenDocPrompt();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await requireLegalDocument(docText);
      const res = await fetch('/api/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_text: docText }),
      });

      const data = await readApiJson<ClauseMapResult>(res);
      const verifiedClauses = checkItems(data.clauses || [], docText);
      const computedHealth = scoreClauses(verifiedClauses);

      setClausesAndHealth(verifiedClauses, computedHealth);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred while building the clause map.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = (id: string) => {
    setExpandedSources((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const radarData = CATEGORIES.map((cat) => ({
    category: cat,
    score: health ? health.category_scores[cat] : 50,
  }));

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'High':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Medium':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
  };

  const handleExportPdf = async () => {
    if (!clauses || !health) return;
    const healthSummary =
      health.overall >= 75
        ? 'Balanced agreement with ordinary legal terms'
        : health.overall >= 50
        ? 'Moderate exposure — several watchouts deserve attention'
        : 'High exposure — significant risk or one-sided obligations found';

    const { exportAsPdf } = await import('../utils/export');
    exportAsPdf({
      title: 'LexiClarity — Contract Risk Assessment Report',
      subtitle: `Overall Health Score: ${health.overall}/100 (${healthSummary})`,
      filename: `lexiclarity_clause_risk_assessment.pdf`,
      metadata: {
        'Contract Health': `${health.overall}/100`,
        'Total Clauses': `${clauses.length}`,
        'High Risk Clauses': `${health.high_risk_count}`,
        'Grounding Rate': `${Math.round(health.grounded_rate * 100)}%`,
      },
      sections: clauses.map((c, i) => ({
        heading: `${i + 1}. ${c.heading} [${c.risk_category}]`,
        body: `Summary: ${c.summary}\nRisk Rationale: ${c.risk_reason || 'Standard commercial provision.'}`,
        note: c.source_span,
        badge: `${c.risk_level} Risk`,
      })),
    });
  };

  const handleExportTxt = async () => {
    if (!clauses || !health) return;
    const healthSummary =
      health.overall >= 75
        ? 'Balanced agreement with ordinary legal terms'
        : health.overall >= 50
        ? 'Moderate exposure — several watchouts deserve attention'
        : 'High exposure — significant risk or one-sided obligations found';

    const txtContent =
      `====================================================\n` +
      `LEXICLARITY — CONTRACT RISK ASSESSMENT & CLAUSE MAP\n` +
      `====================================================\n\n` +
      `Overall Contract Health Score: ${health.overall}/100\n` +
      `Assessment: ${healthSummary}\n` +
      `Total Clauses Analyzed: ${clauses.length}\n` +
      `High-Risk Flags: ${health.high_risk_count}\n` +
      `Source Grounding Rate: ${Math.round(health.grounded_rate * 100)}%\n\n` +
      `CATEGORY BREAKDOWN:\n` +
      Object.entries(health.category_scores)
        .map(([cat, score]) => `  - ${cat}: ${score}/100`)
        .join('\n') +
      `\n\n====================================================\n` +
      `CLAUSE-BY-CLAUSE RISK BREAKDOWN\n` +
      `====================================================\n\n` +
      clauses
        .map(
          (c, idx) =>
            `[${idx + 1}] ${c.heading.toUpperCase()} (${c.risk_category})\n` +
            `Risk Level: ${c.risk_level}\n` +
            `Summary: ${c.summary}\n` +
            (c.risk_reason ? `Risk Rationale: ${c.risk_reason}\n` : '') +
            (c.source_span ? `Verbatim Source Quote: "${c.source_span}"\n` : '')
        )
        .join('\n----------------------------------------------------\n\n') +
      `\n====================================================\n` +
      `DISCLAIMER: Informational GenAI output. Not legal advice.\n` +
      `====================================================\n`;

    const { exportAsTxt } = await import('../utils/export');
    exportAsTxt('lexiclarity_clause_risk_assessment.txt', txtContent);
  };

  const handleExportMd = () => {
    if (!clauses || !health) return;
    const healthSummary =
      health.overall >= 75
        ? 'Balanced agreement with ordinary legal terms'
        : health.overall >= 50
        ? 'Moderate exposure — several watchouts deserve attention'
        : 'High exposure — significant risk or one-sided obligations found';

    const mdContent =
      `# LexiClarity — Contract Risk Assessment Report\n\n` +
      `**Overall Health Score:** ${health.overall}/100 (${healthSummary})\n` +
      `**Total Clauses:** ${clauses.length} | **High Risk:** ${health.high_risk_count}\n\n` +
      `## Category Health Breakdown\n` +
      Object.entries(health.category_scores).map(([cat, val]) => `- **${cat}:** ${val}/100`).join('\n') +
      `\n\n## Clause Risk Map\n\n` +
      clauses.map((c, i) =>
        `### ${i + 1}. ${c.heading} (${c.risk_category})\n` +
        `**Risk Level:** \`${c.risk_level}\`\n\n` +
        `${c.summary}\n\n` +
        (c.risk_reason ? `**Risk Reason:** ${c.risk_reason}\n\n` : '') +
        (c.source_span ? `> Source Quote: "${c.source_span}"\n\n` : '')
      ).join('\n---\n\n') +
      `\n\n---\n*Disclaimer: Informational GenAI output only. Not legal advice.*`;

    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lexiclarity_clause_risk_assessment.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
        <div>
          <h2 className="text-xl font-bold text-stone-900 font-serif-heading flex items-center gap-2">
            <Compass className="w-5 h-5 text-amber-700" />
            Clause Explorer & Risk Map
          </h2>
          <p className="text-xs text-stone-600 mt-0.5">
            Grounded clause navigation, risk categorization, and contract health scoring.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {clauses && health && (
            <ExportDropdown
              onExportPdf={handleExportPdf}
              onExportTxt={handleExportTxt}
              onExportMd={handleExportMd}
              label="Export Report"
            />
          )}

          <button
            type="button"
            onClick={handleBuildMap}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-medium text-xs shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block animate-spin">⏳</span>
            ) : (
              <span>🧭 Build Clause Map</span>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {clauses && health && (
        <div className="space-y-6">
          {/* Health Score and Radar Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 bg-white border border-stone-200 rounded-2xl p-5 shadow-xs">
            <div className="space-y-4 md:border-r md:border-stone-200 md:pr-5">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Contract Health Score
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-4xl font-extrabold text-stone-900 font-serif-heading">
                    {health.overall}
                  </span>
                  <span className="text-sm text-stone-500 font-medium">/ 100</span>
                </div>
                <p className="text-xs text-stone-600 mt-1">
                  {health.overall >= 75
                    ? '🟢 Balanced agreement with ordinary legal terms.'
                    : health.overall >= 50
                    ? '🟡 Moderate exposure. Several watchouts deserve attention.'
                    : '🔴 High exposure. Dealbreakers or one-sided obligations found.'}
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-stone-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-600">High-Risk Clauses:</span>
                  <span className="font-bold text-red-600">{health.high_risk_count}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-600">Source Grounding:</span>
                  <span className="font-bold text-emerald-700">
                    {Math.round(health.grounded_rate * 100)}% Verified
                  </span>
                </div>
              </div>

              {/* Progress bars for categories */}
              <div className="space-y-2 pt-2 border-t border-stone-100 text-xs">
                {CATEGORIES.map((cat) => (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between text-[11px] text-stone-600">
                      <span>{cat}</span>
                      <span className="font-semibold">{health.category_scores[cat]}/100</span>
                    </div>
                    <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          health.category_scores[cat] >= 70
                            ? 'bg-emerald-500'
                            : health.category_scores[cat] >= 40
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${health.category_scores[cat]}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Radar Chart */}
            <div className="md:col-span-2 flex flex-col justify-center items-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
                Risk Profile Radar
              </span>
              <div className="w-full h-56 max-w-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#e7e5e4" />
                    <PolarAngleAxis dataKey="category" tick={{ fill: '#57534e', fontSize: 11 }} />
                    <Radar
                      name="Score"
                      dataKey="score"
                      stroke="#b45309"
                      fill="#d97706"
                      fillOpacity={0.4}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Signing Today Triage Cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-800">
              Signing Today? Read This First
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* The Good */}
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4">
                <div className="flex items-center gap-1.5 font-bold text-emerald-900 text-xs mb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>🟢 The Good (Low Risk)</span>
                </div>
                <div className="space-y-2">
                  {clauses.filter((c) => c.risk_level === 'Low').slice(0, 3).map((c, i) => (
                    <div key={i} className="text-xs text-emerald-950">
                      <strong>{c.heading}:</strong> <span className="text-stone-700">{c.summary.slice(0, 90)}...</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* The Watchouts */}
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4">
                <div className="flex items-center gap-1.5 font-bold text-amber-900 text-xs mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>🟡 The Watchouts (Medium)</span>
                </div>
                <div className="space-y-2">
                  {clauses.filter((c) => c.risk_level === 'Medium').slice(0, 3).map((c, i) => (
                    <div key={i} className="text-xs text-amber-950">
                      <strong>{c.heading}:</strong> <span className="text-stone-700">{c.summary.slice(0, 90)}...</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* The Dealbreakers */}
              <div className="bg-red-50/70 border border-red-200/80 rounded-xl p-4">
                <div className="flex items-center gap-1.5 font-bold text-red-900 text-xs mb-2">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  <span>🔴 The Dealbreakers (High)</span>
                </div>
                <div className="space-y-2">
                  {clauses.filter((c) => c.risk_level === 'High').slice(0, 3).map((c, i) => (
                    <div key={i} className="text-xs text-red-950">
                      <strong>{c.heading}:</strong> <span className="text-stone-700">{c.summary.slice(0, 90)}...</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Clause Map List */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-800">
              Complete Clause Breakdown ({clauses.length} Clauses)
            </h3>

            <div className="grid grid-cols-1 gap-3.5">
              {clauses.map((clause, idx) => {
                const isExpanded = expandedSources[clause.section_id || idx];
                return (
                  <div
                    key={clause.section_id || idx}
                    className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-stone-900 font-serif-heading">
                          {clause.heading}
                        </h4>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${getRiskBadge(
                            clause.risk_level
                          )}`}
                        >
                          {clause.risk_level} Risk
                        </span>
                      </div>
                      <span className="text-[11px] font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
                        {clause.risk_category}
                      </span>
                    </div>

                    <p className="text-sm text-stone-700 leading-relaxed font-sans">
                      {clause.summary}
                    </p>

                    <div className="text-xs text-stone-600 bg-stone-50 p-2.5 rounded-lg border border-stone-100">
                      <strong>Why: </strong>
                      {clause.risk_reason || 'Standard contract clause.'}
                    </div>

                    {/* Source span toggle */}
                    {clause.source_span && (
                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? 'Hide' : 'Show'} source quote for ${clause.heading}`}
                          onClick={() => toggleSource(clause.section_id || String(idx))}
                          className="text-xs text-stone-600 hover:text-stone-900 font-medium flex items-center gap-1"
                        >
                          <span>{clause.grounded ? '✅ Grounded citation' : '⚠️ Source citation'}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => setPreviewCitation(clause.source_span)}
                          className="text-[11px] bg-yellow-200 hover:bg-yellow-300 text-stone-950 px-2.5 py-1 rounded-md font-bold flex items-center gap-1 border border-amber-400 transition-colors shadow-2xs"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-900" />
                          View in PDF Preview 📄
                        </button>
                      </div>
                    )}

                    {isExpanded && clause.source_span && (
                      <blockquote className="text-xs italic text-stone-600 bg-stone-50 p-3 rounded-lg border-l-2 border-amber-600 font-serif leading-relaxed">
                        "{clause.source_span}"
                      </blockquote>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* PDF Highlighted Citation Preview Modal */}
      {previewCitation && (
        <div role="dialog" aria-modal="true" aria-label="Source citation preview" onKeyDown={(event) => { if (event.key === 'Escape') setPreviewCitation(null); keepTabFocusInside(event); }} className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md p-4 sm:p-6 flex items-center justify-center">
          <div className="w-full max-w-4xl h-[85vh]">
            <DocumentPdfPreview
              docText={docText}
              docTitle="Contract Clause Source Citation"
              sourceUrl={sourceUrl}
              highlightText={previewCitation}
              onClose={() => setPreviewCitation(null)}
              isModal={true}
            />
          </div>
        </div>
      )}

      {!clauses && !loading && (
        <div className="p-8 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200">
          <Compass className="w-8 h-8 text-stone-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-stone-700">Clause map not generated yet.</p>
          <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
            Click <strong>🧭 Build Clause Map</strong> above to compute the contract health score, risk distribution radar, and grounded clause list.
          </p>
        </div>
      )}
    </div>
  );
};
