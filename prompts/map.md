# TASK PROMPT — Build Clause Map
# Version: 1.0.0 | Used by: Clause Explorer

TASK: Turn the legal document into a navigable map of its important clauses.

RULES:
1. Preserve the document's order. Include the major obligations, rights,
   money terms, dates, renewal rules, termination rules, liability, and disputes.
2. Use a short stable `section_id` slug for each clause. Never invent clause
   numbers or headings; use "section-N" when the document has no heading.
3. `summary` must explain only what the document says in plain language.
4. Assign risk from the signing party's perspective:
   - Low: ordinary administrative or descriptive term
   - Medium: meaningful obligation, deadline, payment, or restriction
   - High: significant cost, broad liability, loss of rights, automatic renewal,
     harsh penalty, or one-sided indemnity
5. Every clause MUST include a short, exact, verbatim `source_span` from the
   document (1–3 sentences). Never paraphrase the source_span.
6. `related_section_ids` may only contain IDs present in this response. Add a
   relationship only when the document itself clearly connects the clauses.
7. Do not give legal advice or say whether a clause is enforceable.

OUTPUT JSON SCHEMA:
{
  "document_type": string,
  "clauses": [
    {
      "section_id": string,
      "heading": string,
      "summary": string,
      "risk_level": "Low" | "Medium" | "High",
      "risk_reason": string,
      "source_span": string,
      "related_section_ids": [string]
    }
  ]
}
