import { jsPDF } from 'jspdf';
import { ChatMessage, ClauseItem, CompareResult, HealthScore, SimplifyResult } from '../types';

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
  activeTab: 'simplify' | 'explorer' | 'compare' | 'chat';
  fileName: string;
  docText: string;
  docBText?: string;
  simplifyResult?: SimplifyResult | null;
  explorerResult?: { clauses: ClauseItem[]; health: HealthScore } | null;
  compareResult?: CompareResult | null;
  chatMessages?: ChatMessage[];
}

export function getActiveTabExportPayload(state: ActiveTabExportState): TabExportData {
  const {
    activeTab,
    fileName,
    docText,
    docBText,
    simplifyResult,
    explorerResult,
    compareResult,
    chatMessages,
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
            ...(simplifyResult.sections.map((s) => ({
              heading: s.original_heading,
              body: s.plain_text,
              note: s.source_span,
              badge: s.grounded ? 'Verified Grounded' : 'Needs Review',
            }))),
            ...(simplifyResult.key_terms?.length
              ? [
                  {
                    heading: 'Key Terms Defined',
                    body: simplifyResult.key_terms.map((t) => `• ${t.term}: ${t.meaning}`).join('\n\n'),
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
            ...clauses.map((c, i) => ({
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

    case 'compare': {
      if (compareResult) {
        return {
          title: 'LexiClarity — Contract Version Comparison & Redlines',
          subtitle: `Overall Impact: ${compareResult.overall_assessment || 'Version comparison report'}`,
          filename: `lexiclarity_${baseFileName}_version_comparison.pdf`,
          metadata: {
            'Material Changes': `${compareResult.changes.filter((c) => c.materiality === 'material').length}`,
            'Minor Changes': `${compareResult.changes.filter((c) => c.materiality === 'minor').length}`,
          },
          sections: [
            {
              heading: '1. Executive Comparison Assessment',
              body: compareResult.overall_assessment,
            },
            ...compareResult.changes.map((c, i) => ({
              heading: `${i + 2}. ${c.topic} [${(c.materiality || 'minor').toUpperCase()} - ${(c.change_type || 'modified').toUpperCase()}]`,
              body: `Summary:\n${c.summary}\n\nWhat changed for you:\n${c.user_impact}` +
                (c.source_span_a ? `\n\nOriginal (Version A):\n"${c.source_span_a}"` : '') +
                (c.source_span_b ? `\n\nRevised (Version B):\n"${c.source_span_b}"` : ''),
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
              ? botM.citations.join('\n')
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

    // Optional Note / Citation quote with yellow highlight box
    if (sec.note) {
      checkPageBreak(12);
      y += 2;

      const quoteText = `Source Citation: "${sec.note}"`;
      const quoteLines = doc.splitTextToSize(quoteText, contentWidth - 8);
      const boxHeight = quoteLines.length * 4.5 + 4;

      // Draw yellow highlight box
      doc.setFillColor(254, 240, 138); // Yellow highlighter
      doc.setDrawColor(245, 158, 11); // Amber border
      doc.roundedRect(margin, y, contentWidth, boxHeight, 1, 1, 'FD');

      doc.setFont('helvetica', 'bolditalic');
      doc.setFontSize(8.5);
      doc.setTextColor(120, 53, 15); // Dark amber text

      let lineY = y + 4.5;
      for (const qLine of quoteLines) {
        checkPageBreak(4.5);
        doc.text(qLine, margin + 3, lineY);
        lineY += 4.5;
      }
      y += boxHeight + 2;
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
