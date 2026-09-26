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
  grounded?: boolean;
  advice_declined?: boolean;
  timestamp?: number;
}

export interface ChatApiResponse {
  answer: string;
  citations: string[];
  grounded: boolean;
  advice_declined: boolean;
  confidence: 'high' | 'medium' | 'low';
  evidence_type: 'directly_stated' | 'strongly_inferred' | 'needs_verification';
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

export interface LoadedDocument {
  id: string;
  name: string;
  text: string;
  wordCount: number;
  clauseCount: number;
  uploadedAt?: number;
  sourceUrl?: string;
  mimeType?: string;
}
