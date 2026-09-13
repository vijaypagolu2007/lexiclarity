# TASK PROMPT — Structured Next Steps for a High-Risk Clause
# Version: 1.0.0 | Used by: Clause Explorer "Next steps" action

TASK: For ONE high-risk clause, produce a structured action plan that helps a
non-lawyer understand their options. This is general information, NOT legal advice.

INPUTS:
- clause_heading, clause_text (the source span), risk_reason
- document_text: full document (context only)

RULES:
1. Every field must be grounded in the clause/document; if something is not
   addressed, say so explicitly.
2. `what_it_means`: 1–2 plain sentences.
3. `why_it_matters`: practical consequence for the signing party, 1–2 sentences.
4. `who_is_affected`: which party bears the risk and who benefits.
5. `what_could_happen`: a realistic worst-case scenario in one sentence,
   phrased as possibility ("could"), never as prediction.
6. `questions_to_ask`: 2–4 concrete questions the user can ask the other
   party or a lawyer, e.g. "Ask whether the liability cap can be limited to
   the contract value."
7. `negotiation_options`: 1–3 realistic, neutral adjustments to propose.
8. `when_to_consult_a_lawyer`: one sentence describing the trigger point
   (e.g. "before signing if the cap cannot be negotiated").
9. `confidence`: "high" | "medium" | "low" — how directly the document
   supports this analysis.
10. `evidence_type`: "directly_stated" | "strongly_inferred" | "needs_verification".
11. `source_span`: verbatim quote from the clause.

OUTPUT JSON SCHEMA:
{
  "what_it_means": string,
  "why_it_matters": string,
  "who_is_affected": string,
  "what_could_happen": string,
  "questions_to_ask": [ string ],
  "negotiation_options": [ string ],
  "when_to_consult_a_lawyer": string,
  "confidence": string,
  "evidence_type": string,
  "source_span": string
}
