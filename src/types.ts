export type RiskLevel = 'Low' | 'Medium' | 'High';
export type RiskCategory = 'Financial Risk' | 'Termination Risk' | 'Liability Exposure' | 'Data Privacy';

export interface ClauseItem {
  section_id: string;
  heading: string;
  summary: string;
  risk_level: RiskLevel;
  risk_category: RiskCategory;
  risk_reason: string;
  source_span: string;
  related_section_ids?: string[];
  grounded?: boolean;
}

export interface ClauseMapResult {
  document_type: string;
  clauses: ClauseItem[];
}

export interface SimplifiedSection {
  section_id: string;
  original_heading: string;
  plain_text: string;
  source_span: string;
  grounded?: boolean;
}

export interface KeyTerm {
  term: string;
  meaning: string;
  source_span: string;
}

export interface SimplifyResult {
  document_type: string;
  language: string;
  reading_level: 'simple' | 'simpler' | 'summary';
  sections: SimplifiedSection[];
  key_terms?: KeyTerm[];
}

export interface ClarifyResult {
  plain_explanation: string;
  risk_level: RiskLevel;
  why_risky: string;
  watch_out?: string | null;
  confidence?: string;
  evidence_type?: string;
  source_span: string;
}

export interface CompareChange {
  topic: string;
  change_type: 'added' | 'deleted' | 'modified' | 'unchanged';
  summary: string;
  user_impact: string;
  impact_category?: 'financial' | 'deadline' | 'obligation' | 'right_removed' | 'new_penalty' | 'none' | string;
  materiality: 'material' | 'minor';
  source_span_a?: string | null;
  source_span_b?: string | null;
}

export interface CompareResult {
  changes: CompareChange[];
  overall_assessment: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  advice_declined?: boolean;
  timestamp?: number;
}

export interface LawyerPrepParty {
  name: string;
  role: string;
  responsibilities: string;
}

export interface LawyerPrepDate {
  date_or_trigger: string;
  what_happens: string;
}

export interface LawyerPrepFinancial {
  item: string;
  amount: string;
  due: string;
  source_span: string;
}

export interface LawyerPrepRisk {
  risk: string;
  why: string;
  source_span: string;
}

export interface LawyerPrepTimelineItem {
  when: string;
  event: string;
}

export interface LawyerPrepResult {
  case_summary: string;
  parties: LawyerPrepParty[];
  important_dates: LawyerPrepDate[];
  financial_obligations: LawyerPrepFinancial[];
  top_risks: LawyerPrepRisk[];
  missing_or_ambiguous: string[];
  questions_for_lawyer: string[];
  documents_to_bring: string[];
  timeline: LawyerPrepTimelineItem[];
  confidence?: string;
}

export interface NegotiationResult {
  negotiation_goal: string;
  why_negotiate: string;
  proposed_clause: string;
  tradeoff: string;
  source_span: string;
}

export interface HealthScore {
  overall: number;
  high_risk_count: number;
  category_scores: Record<RiskCategory, number>;
  grounded_rate: number;
}

export interface GuardrailResult {
  is_legal: boolean;
  document_kind: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}
