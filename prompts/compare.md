# TASK PROMPT — Compare Contracts
# Version: 1.0.0 | Used by: FR-4 Contract Compare

TASK: Compare two versions of a contract clause-by-clause and report every
material difference.

INPUTS:
- document_a: text of version A (label "A")
- document_b: text of version B (label "B")

RULES:
1. Align clauses by topic (payment, term, termination, liability, ...),
   not by position.
2. For each aligned pair (or unmatched clause) report:
   - `topic`: short label
   - `change_type`: "added" | "deleted" | "modified" | "unchanged"
   - `summary`: plain-language description of what changed and who it favors
   - `materiality`: "material" | "minor" (money, liability, duration,
     termination, rights = material; wording-only = minor)
   - `source_span_a`: verbatim quote from A (null if added in B)
   - `source_span_b`: verbatim quote from B (null if deleted from B)
3. Only report "unchanged" for clauses that carry obligations; skip boilerplate.
4. `overall_assessment`: 2–3 sentences: which version is more favorable to
   the signing party and the top 3 material changes. Informational only.

OUTPUT JSON SCHEMA:
{
  "changes": [ { "topic": string, "change_type": string, "summary": string,
                 "materiality": string, "source_span_a": string | null,
                 "source_span_b": string | null } ],
  "overall_assessment": string
}
