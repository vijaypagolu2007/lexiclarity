# ⚖️ LexiClarity

> **LexiClarity helps non-lawyers understand what a legal document says, see how changes affect them, and identify what deserves attention — without pretending to replace a lawyer.**

**AI for Legal Assistance & Access** — a GenAI web app that makes legal documents understandable to non-lawyers. Built for Hackathon. See [PRD.md](PRD.md).

**Differentiators:** source-grounded explanations with verbatim citations · material contract comparison with "what changed for you" impact lines · no app-side document persistence (analysis text is sent to Gemini) · audio accessibility.

## Features

| Feature | PRD | What it does |
|---|---|---|
| 📄 Simplify | FR-2 | Rewrites any contract in plain language at 3 reading levels (Simple / Simpler / Summary) |
| 🧭 Clause Explorer | — | Builds a grounded clause map with risk levels, source spans, and related-clause links |
| 🖊️ Signing-Today Card | — | One-tap 🟢 Good / 🟡 Watchouts / 🔴 Dealbreakers summary derived from the clause map |
| 📊 Contract Health Score | — | Aggregates clause risk into a transparent 0–100 score with category breakdown and radar chart |
| 🔊 Voice accessibility | — | Reads generated explanations aloud in-browser |
| 🟥🟩 Redline + Audit Export | — | Shows side-by-side contract changes and exports fingerprinted JSON reports with model and grounding metadata |
| 📚 Reference Pattern Signals | — | Matches clauses against a transparent bundled demo library without unsupported percentile claims |
| ⚙️ Pipeline + Performance | — | Shows analysis progress and tracks latency, token usage, and session-local cache hits |
| 🔀 Compare | FR-3 | Two contract versions → clause-by-clause diff with materiality labels, "what changed for you" impact lines, and impact filters (financial / deadline / obligation / right removed / new penalty) |
| 💬 Ask Questions | FR-7 | Free-form Q&A grounded in your uploaded document (retrieval + Gemini) |
| 📎 Source Grounding | FR-4 | Every output carries a verbatim citation; a post-generation faithfulness check flags any span not found in the source |
| 🏷️ Evidence Transparency | — | Outputs labelled Directly stated / Strongly inferred / Needs verification, with confidence levels |
| ⚡ Sample workflow | — | Judges can load the bundled sample agreement and test every workflow |
| 🛡️ Guardrails | FR-6 | Non-legal documents are refused; scanned/empty/corrupted files get clear errors |
| 🔒 Privacy | §6 | LexiClarity does not persist uploads; AI analysis sends document text to Google Gemini |

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

Run the TypeScript API and rendered accessibility regression checks with `npm run test:api`.

## Architecture

```
Browser (React/Vite)
  └─ api/index.ts      Shared Vercel/local API handler and Gemini orchestration
  └─ server.ts         Local Vite/static host delegating /api/* to api/index.ts
  └─ src/utils/extract.ts  PDF · DOCX · TXT upload extraction
  └─ src/components/  Simplify · Explorer · Compare · Document Chat
  └─ src/utils/grounding.ts  Citation/source-span verification
  └─ prompts/*.md      Versioned system + task prompts (evaluator-inspectable)
```

The deployed product is the TypeScript/Vercel application above. The Python modules under `core/`, `src/`, and `ui/` are retained as research/reference code and are not invoked by the deployed web API; their tests run separately in CI.

## Prompt engineering (PRD §8)

All prompts are versioned under [`prompts/`](prompts/):

- `system.md` — role, grounding, refusal, and output contracts
- `guardrail.md` — reference classifier prompt; the deployed guardrail route currently uses a lightweight keyword heuristic
- `simplify.md` / `map.md` / `compare.md` / `chat.md` — task prompts with strict JSON schemas
- The deployed API checks response fields and verifies citation spans against source text before returning results; unsupported chat citations are removed and marked for verification.

## Deployment

Deploy on Vercel with `npm install` and `npm run build`. Set `GEMINI_API_KEY` in the Production environment; never commit it.

The public API applies a 12-request-per-minute IP limit per warm server instance. Vercel instances do not share this in-memory counter; use a shared rate-limit store before relying on it as an abuse-prevention boundary.

## Future level-up ideas

- Add multilingual simplification and translation after language-specific output verification.

## Disclaimer

LexiClarity is **informational only and does not provide legal advice**. Always consult a qualified lawyer before acting on a legal document.
