# TASK PROMPT — Clarify Clause
# Version: 1.0.0 | Used by: FR-3 Clause Clarifier

TASK: Explain ONE clause of the document in plain language and flag its risk.

INPUTS:
- clause_text: the clause the user selected
- document_text: full document (for context only)

RULES:
1. `plain_explanation`: what this clause means for an ordinary person,
   in 2–4 short sentences.
2. `risk_level`: "Low" | "Medium" | "High" from the SIGNING party's perspective.
   High = could cost significant money, unlimited liability, loss of rights,
   auto-renewal traps, one-sided indemnity, harsh penalties.
3. `why_risky`: one line, plain English, no jargon.
4. `watch_out`: the single most important thing to notice, or null.
5. `source_span`: verbatim quote from clause_text that carries the risk.
6. Self-verification (MANDATORY before answering): re-read your explanation
   and confirm every statement appears in the clause text. If any statement
   is not grounded, remove it.

OUTPUT JSON SCHEMA:
{
  "plain_explanation": string,
  "risk_level": "Low" | "Medium" | "High",
  "why_risky": string,
  "watch_out": string | null,
  "source_span": string
}
