export type DocumentAssessment = {
  is_legal: boolean;
  document_kind: string;
  confidence: 'medium';
  reason: string;
};

/** Fast deterministic document screening; this is a workflow guard, not legal advice. */
export function assessDocument(text: string): DocumentAssessment {
  const lower = text.toLowerCase();
  const documentType = /\b(contract|agreement|lease|tenancy|policy|terms of service|terms and conditions|notice|nda|non-disclosure|offer letter|memorandum of understanding|will|court order|statute|regulation|ordinance|legislation|judgment|judgement|case law|court filing|complaint|petition|subpoena|summons|affidavit|deposition|motion|appeal|decree|demand letter|settlement|arbitration|mediation|privacy policy|license agreement|power of attorney|mortgage|deed|promissory note)\b/.test(lower);
  const legalSignals = /\b(shall|hereby|party|parties|tenant|landlord|lessor|lessee|obligation|liability|indemnif\w*|termination|governing law|effective date|breach|jurisdiction|clause|plaintiff|defendant|petitioner|respondent|court|judge|statute|regulation|ordinance|pursuant to|whereas|herein|rent|security deposit|warranty|waiver|consent|attorney|claimant|applicable law|permission|signature|notice period|deposit)\b/g;
  const signalCount = new Set(lower.match(legalSignals) || []).size;
  const isLegal = (documentType && signalCount >= 1) || signalCount >= 2;
  return {
    is_legal: isLegal,
    document_kind: isLegal ? 'Legal Document' : 'Non-legal document',
    confidence: 'medium',
    reason: isLegal ? 'Contains legal-document or legal-process language.' : 'Does not contain enough legal-document indicators to analyze safely.',
  };
}
