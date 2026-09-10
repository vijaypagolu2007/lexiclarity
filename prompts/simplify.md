# TASK PROMPT — Simplify Document
# Version: 1.0.0 | Used by: FR-2 Simplify Mode

TASK: Rewrite the legal document below in plain language.

INPUTS:
- reading_level: {{READING_LEVEL}}  (simple | simpler | summary)
- document_text: the full extracted text

RULES:
1. Preserve the document's structure: keep its sections/clauses in order.
2. For each section produce:
   - `section_id`: short slug, e.g. "termination"
   - `original_heading`: the heading as written (or "Section N")
   - `plain_text`: the plain-language rewrite at the requested reading level
   - `source_span`: verbatim quote of the section's first 1–2 sentences
3. "simple": everyday words, short sentences, no legal terms unexplained.
4. "simpler": explain like to a 10-year-old; use analogies sparingly.
5. "summary": at most 5 bullets covering parties, money, duration,
   termination, and the riskiest obligation.
6. Do NOT add obligations not present in the text. Do NOT omit obligations.

OUTPUT JSON SCHEMA:
{
  "document_type": string,
  "reading_level": string,
  "sections": [ { "section_id": string, "original_heading": string,
                  "plain_text": string, "source_span": string } ],
  "key_terms": [ { "term": string, "meaning": string, "source_span": string } ]
}
