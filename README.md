# ⚖️ LexiClarity

> **LexiClarity helps non-lawyers understand what a legal document says, see how changes affect them, identify what deserves attention, and prepare better questions for a lawyer — without pretending to replace one.**

**AI for Legal Assistance & Access** — a GenAI web app that makes legal documents understandable to non-lawyers. Built for Hackathon. See [PRD.md](PRD.md).

**Differentiators:** source-grounded explanations with verbatim citations · actionable next steps per high-risk clause · material contract comparison with "what changed for you" impact lines · lawyer-preparation mode · privacy-first in-memory processing · multilingual + audio accessibility · works instantly in Showcase Mode with no API key.

## Features

| Feature | PRD | What it does |
|---|---|---|
| 📄 Simplify | FR-2 | Rewrites any contract in plain language at 3 reading levels (Simple / Simpler / Summary) |
| 🧭 Clause Explorer | — | Builds a grounded clause map with risk levels, source spans, and related-clause links |
| 🧭 Next Steps | — | Per high-risk clause: what it means, why it matters, who's affected, what could happen, questions to ask, negotiation options, when to consult a lawyer |
| 🧑‍⚖️ Lawyer Prep | — | One-page pack for a legal consultation: case summary, parties, dates, financials, top risks, gaps, questions, documents to bring, timeline — PDF/Markdown export |
| 🖊️ Signing-Today Card | FR-13 | One-tap 🟢 Good / 🟡 Watchouts / 🔴 Dealbreakers summary derived from the clause map |
| 📊 Contract Health Score | — | Aggregates clause risk into a transparent 0–100 score with category breakdown and radar chart |
| 🤝 Negotiation Assistant | — | Drafts a neutral counter-clause for high-risk items, always tied to the original source span |
| 🌐 Multilingual + Voice | — | Simplifies explanations in English, Hindi, Spanish, Tamil, or Telugu and reads the result aloud in-browser |
| 🟥🟩 Redline + Audit Export | — | Shows side-by-side contract changes and exports fingerprinted JSON reports with model and grounding metadata |
| 📚 Reference Pattern Signals | — | Matches clauses against a transparent bundled demo library without unsupported percentile claims |
| ⚙️ Pipeline + Performance | — | Shows analysis progress and tracks latency, token usage, and session-local cache hits |
| 🔍 Clause Clarifier | FR-3 | Paste any clause → plain-English explanation + Low/Medium/High risk flag + confidence & evidence labels |
| 🔀 Compare | FR-4 | Two contract versions → clause-by-clause diff with materiality labels, "what changed for you" impact lines, and impact filters (financial / deadline / obligation / right removed / new penalty) |
| 💬 Ask Questions | FR-8 | Free-form Q&A grounded in your uploaded document (synonym-aware retrieval + Gemini) |
| 📎 Source Grounding | FR-5 | Every output carries a verbatim citation; a post-generation faithfulness check flags any span not found in the source |
| 🏷️ Evidence Transparency | — | Outputs labelled Directly stated / Strongly inferred / Needs verification, with confidence levels |
| ⚡ Showcase Mode | — | Judges can explore every feature instantly with zero setup: pre-computed grounded analysis of the bundled sample, no API key required |
| 🛡️ Guardrails | FR-7 | Non-legal documents are refused; scanned/empty/corrupted files get clear errors |
| 🔒 Privacy | §6 | In-memory processing only — documents are never stored |

## Quick start

```bash
pip install -r requirements.txt
set GEMINI_API_KEY=your_key_here        # Windows (or export on macOS/Linux)
streamlit run app.py
```

Try it with [samples/sample_rental_agreement.txt](samples/sample_rental_agreement.txt).

Optional preview launcher (forges `--port/--host` to Streamlit):

```bash
npm run dev -- --port 7100 --host 127.0.0.1
```

Run the Phase 1 and Phase 2 test suite with:

```bash
pip install -r requirements-dev.txt
python -m pytest -q
```

## Architecture

```
Browser (Streamlit)
  └─ src/extract.py    PDF (pdfplumber) · DOCX (python-docx) · TXT
  └─ src/llm.py        Gemini client, JSON mode, versioned prompt loading
  └─ src/retrieval.py  Token-overlap RAG for follow-up chat
  └─ src/grounding.py  Faithfulness check: every citation must match the source verbatim
  └─ prompts/*.md      Versioned system + task prompts (evaluator-inspectable)
```

## Prompt engineering (PRD §8)

All prompts are versioned under [`prompts/`](prompts/):

- `system.md` — role, grounding, refusal, and output contracts
- `guardrail.md` — legal-vs-non-legal classifier (runs before processing)
- `simplify.md` / `map.md` / `negotiate.md` / `clarify.md` / `compare.md` / `chat.md` — task prompts with strict JSON schemas
- Every schema includes `source_span`; `src/grounding.py` verifies each span against the source and the UI flags ungrounded citations instead of hiding them.

## Deployment

Works on Streamlit Cloud / Render / HF Spaces. Repo intentionally has no data files or binaries (< 10 MB).

## Disclaimer

LexiClarity is **informational only and does not provide legal advice**. Always consult a qualified lawyer before acting on a legal document.
