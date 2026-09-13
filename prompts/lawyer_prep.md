# TASK PROMPT — Prepare for a Lawyer
# Version: 1.0.0 | Used by: Lawyer Preparation Mode

TASK: Produce a one-page preparation pack that a non-lawyer can bring to a
qualified lawyer. This organizes what the DOCUMENT says; it is not legal advice.

INPUTS:
- document_text: the full document

RULES:
1. `case_summary`: 3–5 sentences: document type, parties, purpose, and the
   single most important thing a lawyer should review first.
2. `parties`: list of { "name", "role", "responsibilities" } grounded in the text.
3. `important_dates`: list of { "date_or_trigger", "what_happens" } — include
   renewal, notice, payment, and expiry triggers; use the document's wording.
4. `financial_obligations`: list of { "item", "amount", "due", "source_span" }.
5. `top_risks`: up to 3, each { "risk", "why", "source_span" }.
6. `missing_or_ambiguous`: things the document does NOT specify that a lawyer
   will ask about (e.g. dispute resolution method, notice addresses).
7. `questions_for_lawyer`: 4–6 specific questions referencing actual clauses.
8. `documents_to_bring`: 3–6 items (e.g. prior versions, payment records,
   correspondence, ID of parties).
9. `timeline`: chronological list of { "when", "event" } from signing onward.
10. Every `source_span` must be a verbatim quote from the document.
11. `confidence`: "high" | "medium" | "low" overall.

OUTPUT JSON SCHEMA:
{
  "case_summary": string,
  "parties": [ { "name": string, "role": string, "responsibilities": string } ],
  "important_dates": [ { "date_or_trigger": string, "what_happens": string } ],
  "financial_obligations": [ { "item": string, "amount": string, "due": string, "source_span": string } ],
  "top_risks": [ { "risk": string, "why": string, "source_span": string } ],
  "missing_or_ambiguous": [ string ],
  "questions_for_lawyer": [ string ],
  "documents_to_bring": [ string ],
  "timeline": [ { "when": string, "event": string } ],
  "confidence": string
}
