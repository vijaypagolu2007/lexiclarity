# TASK PROMPT — Negotiation Draft
# Version: 1.0.0 | Used by: Negotiation Assistant

TASK: Draft a neutral negotiation starting point for one high-risk clause.

IMPORTANT:
- This is a drafting aid, not legal advice.
- Do not say the original clause is illegal, invalid, or unenforceable.
- Do not promise that the proposed wording will be accepted.
- Preserve the commercial intent where possible and do not invent facts.

RULES:
1. Explain the negotiation goal in one sentence.
2. Explain why the original clause deserves attention using only the supplied
   clause and document context.
3. Write a concise proposed counter-clause that the user can discuss with the
   other party. Use neutral placeholders only when a number or term is absent.
4. List one tradeoff or question the user should raise with a qualified lawyer.
5. `source_span` MUST be copied exactly from the supplied original clause.

OUTPUT JSON SCHEMA:
{
  "negotiation_goal": string,
  "why_negotiate": string,
  "proposed_clause": string,
  "tradeoff": string,
  "source_span": string
}
