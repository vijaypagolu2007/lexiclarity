# ⚖️ LexiClarity

> **LexiClarity helps non-lawyers understand what a legal document says, see how changes affect them, and identify what deserves attention — without pretending to replace a lawyer.**

**AI for Legal Assistance & Access** — a GenAI web app that makes legal documents understandable to non-lawyers. Built for Hackathon. See [PRD.md](PRD.md).

**Differentiators:** source-grounded explanations with verbatim citations · material contract comparison with "what changed for you" impact lines · privacy-first in-memory processing · multilingual + audio accessibility · works instantly in Showcase Mode with no API key.

## Features

| Feature | PRD | What it does |
|---|---|---|
| 📄 Simplify | FR-2 | Rewrites any contract in plain language at 3 reading levels (Simple / Simpler / Summary) |
| 🧭 Clause Explorer | — | Builds a grounded clause map with risk levels, source spans, and related-clause links |
| 🖊️ Signing-Today Card | — | One-tap 🟢 Good / 🟡 Watchouts / 🔴 Dealbreakers summary derived from the clause map |
| 📊 Contract Health Score | — | Aggregates clause risk into a transparent 0–100 score with category breakdown and radar chart |
| 🌐 Multilingual + Voice | — | Simplifies explanations in English, Hindi, Spanish, Tamil, or Telugu and reads the result aloud in-browser |
| 🟥🟩 Redline + Audit Export | — | Shows side-by-side contract changes and exports fingerprinted JSON reports with model and grounding metadata |
| 📚 Reference Pattern Signals | — | Matches clauses against a transparent bundled demo library without unsupported percentile claims |
| ⚙️ Pipeline + Performance | — | Shows analysis progress and tracks latency, token usage, and session-local cache hits |
| 🔀 Compare | FR-3 | Two contract versions → clause-by-clause diff with materiality labels, "what changed for you" impact lines, and impact filters (financial / deadline / obligation / right removed / new penalty) |
| 💬 Ask Questions | FR-7 | Free-form Q&A grounded in your uploaded document (retrieval + Gemini) |
| 📎 Source Grounding | FR-4 | Every output carries a verbatim citation; a post-generation faithfulness check flags any span not found in the source |
| 🏷️ Evidence Transparency | — | Outputs labelled Directly stated / Strongly inferred / Needs verification, with confidence levels |
| ⚡ Showcase Mode | — | Judges can explore every feature instantly with zero setup: pre-computed grounded analysis of the bundled sample, no API key required |
| 🛡️ Guardrails | FR-6 | Non-legal documents are refused; scanned/empty/corrupted files get clear errors |
| 🔒 Privacy | §6 | In-memory processing only — documents are never stored |

## Quick start

```bash
npm install
set GEMINI_API_KEY=your_key_here        # Windows (or export on macOS/Linux)
npm run dev
```

Open `http://localhost:3000` and try the bundled sample agreement.

Optional preview launcher:

```bash
node dev.js --port 7100
```

Run the Phase 1 and Phase 2 test suite with:

```bash
pip install -r requirements-dev.txt
python -m pytest -q
```

## Architecture

```
Browser (React/Vite)
  └─ server.ts         Express API and Gemini orchestration
  └─ src/utils/extract.ts  PDF · DOCX · TXT upload extraction
  └─ src/components/  Simplify · Explorer · Compare · Document Chat
  └─ src/utils/grounding.ts  Citation/source-span verification
  └─ prompts/*.md      Versioned system + task prompts (evaluator-inspectable)
```

## Prompt engineering (PRD §8)

All prompts are versioned under [`prompts/`](prompts/):

- `system.md` — role, grounding, refusal, and output contracts
- `guardrail.md` — legal-vs-non-legal classifier (runs before processing)
- `simplify.md` / `map.md` / `compare.md` / `chat.md` — task prompts with strict JSON schemas
- Every schema includes `source_span`; `src/grounding.py` verifies each span against the source and the UI flags ungrounded citations instead of hiding them.

## Deployment

Deploy as a Node service using `npm install`, `npm run build`, and `npm start`. Set `GEMINI_API_KEY` in the hosting provider’s secret store; never commit it.

## Disclaimer

LexiClarity is **informational only and does not provide legal advice**. Always consult a qualified lawyer before acting on a legal document.
