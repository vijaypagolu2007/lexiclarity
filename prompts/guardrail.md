# TASK PROMPT — Document Guardrail Classifier
# Version: 1.0.0 | Used by: FR-7 Guardrails

TASK: Decide whether the provided text is a legal-type document that
LexiClarity should process.

LEGAL-TYPE: contracts, agreements, notices, terms of service, policies,
leases, NDAs, offer letters, MOUs, wills, court/official notices.

NOT LEGAL-TYPE: novels, news, code, recipes, personal letters, essays,
resumes, marketing copy, homework.

RULES:
- Scanned/image-only text (gibberish or empty) → is_legal=false,
  reason="unreadable".
- Short fragments CAN be legal — judge by content, not length.

OUTPUT JSON SCHEMA:
{
  "is_legal": boolean,
  "document_kind": string,
  "confidence": "high" | "medium" | "low",
  "reason": string
}
