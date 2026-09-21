import { jsPDF } from 'jspdf';

export interface PdfExportSection {
  heading: string;
  body: string;
  note?: string;
  badge?: string;
}

export interface TabExportData {
  title: string;
  subtitle?: string;
  filename: string;
  metadata?: Record<string, string>;
  sections: PdfExportSection[];
  rawText?: string;
}

export interface ActiveTabExportState {
  activeTab: 'simplify' | 'explorer' | 'clarify' | 'compare' | 'chat' | 'lawyer-prep' | 'negotiate';
  fileName: string;
  docText: string;
  docBText?: string;
  simplifyResult?: any;
  explorerResult?: any;
  clarifyResult?: any;
  compareResult?: any;
  chatMessages?: any[];
  lawyerPrepResult?: any;
  negotiateResult?: any;
}

export function getActiveTabExportPayload(state: ActiveTabExportState): TabExportData {
  const {
    activeTab,
    fileName,
    docText,
    docBText,
    simplifyResult,
    explorerResult,
    clarifyResult,
    compareResult,
    chatMessages,
    lawyerPrepResult,
    negotiateResult,
  } = state;

  const baseFileName = (fileName || 'document').replace(/\.[^/.]+$/, '');

  switch (activeTab) {
    case 'simplify': {
      if (simplifyResult) {
        return {
          title: 'LexiClarity — Plain-Language Legal Summary',
          subtitle: `Reading Level: ${String(simplifyResult.reading_level || 'Simple').toUpperCase()} | Language: ${simplifyResult.language || 'English'}`,
          filename: `lexiclarity_${(simplifyResult.document_type || 'contract').toLowerCase().replace(/\s+/g, '_')}_simplified.pdf`,
          metadata: {
            'Document Type': simplifyResult.document_type || 'Contract',
            'Reading Level': simplifyResult.reading_level || 'Simple',
            'Language': simplifyResult.language || 'English',
            'Source File': fileName || 'Agreement',
          },
          sections: [
            ...((simplifyResult.sections || []).map((s: any) => ({
              heading: s.original_heading,
              body: s.plain_text,
              note: s.source_span,
              badge: s.grounded ? 'Verified Grounded' : 'Needs Review',
            }))),
            ...(simplifyResult.key_terms?.length
              ? [
                  {
                    heading: 'Key Terms Defined',
                    body: simplifyResult.key_terms.map((t: any) => `• ${t.term}: ${t.meaning}`).join('\n\n'),
                  },
                ]
              : []),
          ],
        };
      }
      return {
        title: 'LexiClarity — Original Document Text',
        subtitle: `File: ${fileName || 'Active Document'}`,
        filename: `${baseFileName}_plain_text.pdf`,
        metadata: { 'Source File': fileName || 'Active Document' },
        sections: [{ heading: 'Document Text', body: docText || 'No document text currently loaded.' }],
      };
    }

    case 'explorer': {
      if (explorerResult && explorerResult.clauses && explorerResult.health) {
        const { clauses, health } = explorerResult;
        const healthSummary =
          health.overall >= 75
            ? 'Balanced agreement with standard commercial terms'
            : health.overall >= 50
            ? 'Moderate exposure — several watchouts deserve attention'
            : 'High exposure — significant risk or one-sided obligations found';

        return {
          title: 'LexiClarity — Contract Risk Assessment Report',
          subtitle: `Overall Health Score: ${health.overall}/100 (${healthSummary})`,
          filename: `lexiclarity_${baseFileName}_risk_assessment.pdf`,
          metadata: {
            'Contract Health': `${health.overall}/100`,
            'Total Clauses': `${clauses.length}`,
            'High-Risk Flags': `${health.high_risk_count}`,
            'Grounding Rate': `${Math.round((health.grounded_rate || 1) * 100)}%`,
          },
          sections: [
            {
              heading: '1. Health & Category Breakdown',
              body: Object.entries(health.category_scores || {})
                .map(([cat, score]) => `• ${cat}: ${score}/100`)
                .join('\n'),
            },
            ...clauses.map((c: any, i: number) => ({
              heading: `${i + 2}. ${c.heading} [${c.risk_category || 'General'}]`,
              body: `Summary: ${c.summary}\nRisk Rationale: ${c.risk_reason || 'Standard commercial provision.'}`,
              note: c.source_span,
              badge: `${c.risk_level} Risk`,
            })),
          ],
        };
      }
      return {
        title: 'LexiClarity — Clause Explorer Overview',
        subtitle: `File: ${fileName || 'Active Document'}`,
        filename: `lexiclarity_${baseFileName}_overview.pdf`,
        sections: [{ heading: 'Document Text', body: docText || 'No document text loaded.' }],
      };
    }

    case 'clarify': {
      if (clarifyResult) {
        return {
          title: 'LexiClarity — Clause Clarification Report',
          subtitle: `Risk Level: ${(clarifyResult.risk_level || 'Low').toUpperCase()}`,
          filename: `lexiclarity_${baseFileName}_clause_clarification.pdf`,
          metadata: {
            'Risk Level': clarifyResult.risk_level || 'Low',
            'Grounding Status': clarifyResult.grounded ? 'Verified Grounded' : 'Needs Review',
          },
          sections: [
            {
              heading: '1. Plain-English Explanation',
              body: clarifyResult.plain_explanation,
              badge: `${clarifyResult.risk_level} Risk`,
            },
            ...(clarifyResult.watch_out
              ? [
                  {
                    heading: '2. What to Watch Out For',
                    body: clarifyResult.watch_out,
                  },
                ]
              : []),
            ...(clarifyResult.source_span
              ? [
                  {
                    heading: '3. Verbatim Source Clause',
                    body: `"${clarifyResult.source_span}"`,
                    note: clarifyResult.source_span,
                  },
                ]
              : []),
          ],
        };
      }
      return {
        title: 'LexiClarity — Clause Clarification',
        subtitle: `File: ${fileName || 'Active Document'}`,
        filename: `lexiclarity_${baseFileName}_clarification.pdf`,
        sections: [{ heading: 'Document Sample', body: docText.slice(0, 1500) || 'No text loaded.' }],
      };
    }

    case 'compare': {
      if (compareResult) {
        return {
          title: 'LexiClarity — Contract Version Comparison & Redlines',
          subtitle: `Overall Impact: ${compareResult.summary || 'Version comparison report'}`,
          filename: `lexiclarity_${baseFileName}_version_comparison.pdf`,
          metadata: {
            'Material Changes': `${(compareResult.changes || []).filter((c: any) => c.materiality === 'material').length}`,
            'Minor Changes': `${(compareResult.changes || []).filter((c: any) => c.materiality === 'minor').length}`,
          },
          sections: [
            {
              heading: '1. Executive Comparison Summary',
              body: compareResult.summary,
            },
            ...(compareResult.changes || []).map((c: any, i: number) => ({
              heading: `${i + 2}. ${c.clause_heading} [${(c.materiality || 'minor').toUpperCase()}]`,
              body: `Original Version:\n"${c.original_text}"\n\nRevised Version:\n"${c.revised_text}"\n\nUser Impact & Legal Shift:\n${c.plain_explanation}`,
              badge: (c.materiality || 'minor').toUpperCase(),
            })),
          ],
        };
      }
      return {
        title: 'LexiClarity — Contract Comparison Draft',
        subtitle: `File: ${fileName || 'Active Document'}`,
        filename: `lexiclarity_${baseFileName}_comparison.pdf`,
        sections: [
          { heading: 'Version A Text', body: docText || 'Document A empty.' },
          { heading: 'Version B Text', body: docBText || 'Document B empty.' },
        ],
      };
    }

    case 'chat': {
      const validMessages = (chatMessages || []).filter((m) => m.id !== 'welcome');
      if (validMessages.length > 0) {
        const sections: PdfExportSection[] = [];
        for (let i = 0; i < validMessages.length; i += 2) {
          const userM = validMessages[i];
          const botM = validMessages[i + 1];
          if (userM && userM.role === 'user') {
            const citations = botM?.citations?.length
              ? botM.citations.map((c: any) => `[${c.clause_ref}] "${c.quote}"`).join('\n')
              : undefined;
            sections.push({
              heading: `Q: ${userM.content}`,
              body: botM?.content || 'Awaiting answer...',
              note: citations,
            });
          }
        }
        return {
          title: 'LexiClarity — Contract Q&A Consultation Transcript',
          subtitle: `File: ${fileName || 'Active Agreement'}`,
          filename: `lexiclarity_${baseFileName}_qa_transcript.pdf`,
          metadata: {
            'Source File': fileName || 'Active Agreement',
            'Questions Answered': `${sections.length}`,
          },
          sections: sections.length > 0 ? sections : [{ heading: 'Q&A Log', body: 'No questions logged.' }],
        };
      }
      return {
        title: 'LexiClarity — Document Reference',
        subtitle: `File: ${fileName || 'Active Document'}`,
        filename: `lexiclarity_${baseFileName}_chat_context.pdf`,
        sections: [{ heading: 'Document Reference Text', body: docText || 'No document loaded.' }],
      };
    }

    case 'lawyer-prep': {
      if (lawyerPrepResult) {
        return {
          title: 'LexiClarity — 1-Page Lawyer Consultation Pack',
          subtitle: 'Structured briefing pack for consultation with legal counsel',
          filename: `lexiclarity_${baseFileName}_lawyer_prep.pdf`,
          metadata: {
            'Parties Count': `${lawyerPrepResult.parties?.length || 0}`,
            'Risk Items': `${lawyerPrepResult.top_risks?.length || 0}`,
            'Prepared For': fileName || 'Agreement',
          },
          sections: [
            {
              heading: '1. Executive Case Summary',
              body: lawyerPrepResult.case_summary,
            },
            ...(lawyerPrepResult.parties?.length
              ? [
                  {
                    heading: '2. Identified Parties & Roles',
                    body: lawyerPrepResult.parties
                      .map((p: any) => `• ${p.name} (${p.role}): ${p.responsibilities}`)
                      .join('\n\n'),
                  },
                ]
              : []),
            ...(lawyerPrepResult.important_dates?.length
              ? [
                  {
                    heading: '3. Critical Dates & Deadlines',
                    body: lawyerPrepResult.important_dates
                      .map((d: any) => `• ${d.date_or_trigger}: ${d.what_happens}`)
                      .join('\n\n'),
                  },
                ]
              : []),
            ...(lawyerPrepResult.financial_obligations?.length
              ? [
                  {
                    heading: '4. Financial Obligations & Triggers',
                    body: lawyerPrepResult.financial_obligations
                      .map((f: any) => `• ${f.item} — Amount: ${f.amount} (Due: ${f.due})\n  Source: "${f.source_span}"`)
                      .join('\n\n'),
                  },
                ]
              : []),
            ...(lawyerPrepResult.top_risks?.length
              ? [
                  {
                    heading: '5. Key Risks to Review With Counsel',
                    body: lawyerPrepResult.top_risks
                      .map((r: any) => `• ${r.risk}:\n  ${r.why}\n  Source: "${r.source_span}"`)
                      .join('\n\n'),
                  },
                ]
              : []),
            ...(lawyerPrepResult.missing_or_ambiguous?.length
              ? [
                  {
                    heading: '6. Missing or Ambiguous Terms',
                    body: lawyerPrepResult.missing_or_ambiguous.map((m: any) => `• ${m}`).join('\n\n'),
                  },
                ]
              : []),
            ...(lawyerPrepResult.questions_for_lawyer?.length
              ? [
                  {
                    heading: '7. Specific Questions to Ask Your Lawyer',
                    body: lawyerPrepResult.questions_for_lawyer
                      .map((q: any, i: number) => `${i + 1}. ${q}`)
                      .join('\n\n'),
                  },
                ]
              : []),
            ...(lawyerPrepResult.documents_to_bring?.length
              ? [
                  {
                    heading: '8. Documents Checklist to Bring',
                    body: lawyerPrepResult.documents_to_bring.map((d: any) => `[  ] ${d}`).join('\n'),
                  },
                ]
              : []),
          ],
        };
      }
      return {
        title: 'LexiClarity — Legal Briefing Pack',
        subtitle: `File: ${fileName || 'Active Document'}`,
        filename: `lexiclarity_${baseFileName}_brief.pdf`,
        sections: [{ heading: 'Document Text', body: docText || 'No document loaded.' }],
      };
    }

    case 'negotiate': {
      if (negotiateResult) {
        return {
          title: 'LexiClarity — Negotiation Counter-Clause Brief',
          subtitle: `Draft starting point for commercial rebalancing`,
          filename: `lexiclarity_${baseFileName}_counter_clause.pdf`,
          metadata: {
            'Objective': negotiateResult.negotiation_goal || 'Commercial Rebalancing',
          },
          sections: [
            {
              heading: '1. Negotiation Objective',
              body: negotiateResult.negotiation_goal,
            },
            {
              heading: '2. Commercial Rationale (Why Negotiate)',
              body: negotiateResult.why_negotiate,
            },
            {
              heading: '3. Proposed Balanced Counter-Clause Wording',
              body: `"${negotiateResult.proposed_clause}"\n\n(Use this balanced wording as your starting position with the counterparty or discuss with counsel.)`,
              badge: 'Counter-Clause Wording',
            },
            ...(negotiateResult.tradeoff
              ? [
                  {
                    heading: '4. Key Tradeoff or Question for Lawyer',
                    body: negotiateResult.tradeoff,
                  },
                ]
              : []),
            ...(negotiateResult.source_span
              ? [
                  {
                    heading: '5. Original Source Clause',
                    body: `"${negotiateResult.source_span}"`,
                    note: negotiateResult.source_span,
                  },
                ]
              : []),
          ],
        };
      }
      return {
        title: 'LexiClarity — Negotiation Workspace',
        subtitle: `File: ${fileName || 'Active Document'}`,
        filename: `lexiclarity_${baseFileName}_negotiate.pdf`,
        sections: [{ heading: 'Document Clause', body: docText.slice(0, 1500) || 'No clause loaded.' }],
      };
    }

    default:
      return {
        title: 'LexiClarity Document Export',
        filename: `${baseFileName}.pdf`,
        sections: [{ heading: 'Document Text', body: docText || 'No document content.' }],
      };
  }
}

export function downloadActiveContent(
  state: ActiveTabExportState,
  format: 'pdf' | 'txt' = 'pdf'
): void {
  const data = getActiveTabExportPayload(state);

  if (format === 'pdf') {
    exportAsPdf({
      title: data.title,
      subtitle: data.subtitle,
      filename: data.filename,
      metadata: data.metadata,
      sections: data.sections,
    });
  } else {
    let txt = `====================================================\n`;
    txt += `${data.title.toUpperCase()}\n`;
    if (data.subtitle) txt += `${data.subtitle}\n`;
    txt += `====================================================\n\n`;

    if (data.metadata && Object.keys(data.metadata).length > 0) {
      Object.entries(data.metadata).forEach(([k, v]) => {
        txt += `${k}: ${v}\n`;
      });
      txt += `\n----------------------------------------------------\n\n`;
    }

    txt += data.sections
      .map((s, idx) => {
        let block = `[${idx + 1}] ${s.heading.toUpperCase()}`;
        if (s.badge) block += ` (${s.badge})`;
        block += `\n${s.body}\n`;
        if (s.note) block += `\nVerbatim Source Quote:\n"${s.note}"\n`;
        return block;
      })
      .join('\n----------------------------------------------------\n\n');

    txt += `\n\n====================================================\n`;
    txt += `DISCLAIMER: Informational GenAI output. Not legal advice.\n`;
    txt += `====================================================\n`;

    const txtFilename = data.filename.replace(/\.pdf$/i, '.txt');
    exportAsTxt(txtFilename, txt);
  }
}

export interface PdfExportOptions {
  title: string;
  subtitle?: string;
  filename: string;
  metadata?: Record<string, string>;
  sections: PdfExportSection[];
}

export function exportAsTxt(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.txt') ? filename : `${filename}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportAsPdf({
  title,
  subtitle,
  filename,
  metadata,
  sections,
}: PdfExportOptions): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  let y = margin;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin - 12) {
      doc.addPage();
      y = margin;
      drawHeaderFooter();
    }
  };

  const drawHeaderFooter = () => {
    const currentPage = doc.getNumberOfPages();
    // Header mini branding
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('LexiClarity — Legal Accessibility Report', margin, 10);

    // Footer page number & disclaimer
    doc.text(
      `Page ${currentPage} | Informational GenAI output. Not formal legal advice.`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  };

  drawHeaderFooter();

  // Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(30, 30, 30);
  doc.text(title, margin, y);
  y += 7;

  // Subtitle
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text(subtitle, margin, y);
    y += 6;
  }

  // Accent divider line
  doc.setDrawColor(180, 83, 9); // amber-700
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // Metadata pills / key-values
  if (metadata && Object.keys(metadata).length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);

    let metaX = margin;
    const metaEntries = Object.entries(metadata);
    for (const [key, value] of metaEntries) {
      const metaText = `${key}: ${value}   `;
      const textWidth = doc.getTextWidth(metaText);
      if (metaX + textWidth > pageWidth - margin) {
        metaX = margin;
        y += 4.5;
      }
      doc.text(metaText, metaX, y);
      metaX += textWidth + 4;
    }
    y += 7;
  }

  // Sections
  for (const sec of sections) {
    checkPageBreak(25);

    // Section Heading with optional Badge
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text(sec.heading, margin, y);

    if (sec.badge) {
      const headingWidth = doc.getTextWidth(sec.heading);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(180, 83, 9);
      doc.text(`[${sec.badge}]`, margin + headingWidth + 3, y);
    }
    y += 5;

    // Body Text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(60, 60, 60);

    const bodyLines = doc.splitTextToSize(sec.body, contentWidth);
    for (const line of bodyLines) {
      checkPageBreak(5);
      doc.text(line, margin, y);
      y += 4.8;
    }

    // Optional Note / Citation quote
    if (sec.note) {
      checkPageBreak(12);
      y += 1.5;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 100, 100);

      const quoteLines = doc.splitTextToSize(`Source Quote: "${sec.note}"`, contentWidth - 4);
      for (const qLine of quoteLines) {
        checkPageBreak(4.5);
        doc.text(qLine, margin + 2, y);
        y += 4.2;
      }
    }

    y += 4; // Space between sections
  }

  // Legal Disclaimer Box at bottom of content
  checkPageBreak(18);
  y += 2;
  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(250, 250, 248);
  doc.roundedRect(margin, y, contentWidth, 14, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(150, 60, 10);
  doc.text('LEGAL DISCLAIMER & NOTICES', margin + 3, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(
    'This report was compiled by LexiClarity AI as an informational accessibility reading aid. It is NOT legal advice.',
    margin + 3,
    y + 8.5
  );
  doc.text(
    'Never make binding legal or financial commitments solely on this summary; consult a qualified legal practitioner.',
    margin + 3,
    y + 11.5
  );

  const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  doc.save(safeFilename);
}
