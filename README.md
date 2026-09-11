# ⚖️ LexiClarity

**AI for Legal Assistance & Access** — a GenAI web app that makes legal documents understandable to non-lawyers. Built for **PromptWars Virtual 2026 (Exclusive Edition)** by Hack2skill × Google for Developers. See [PRD.md](PRD.md).

## Features

| Feature | PRD | What it does |
|---|---|---|
| 📄 Simplify | FR-2 | Rewrites any contract in plain language at 3 reading levels (Simple / Simpler / Summary) |
| 🧭 Clause Explorer | — | Builds a grounded clause map with risk levels, source spans, and related-clause links |
| 🔍 Clause Clarifier | FR-3 | Paste any clause → plain-English explanation + Low/Medium/High risk flag |
| 🔀 Compare | FR-4 | Two contract versions → clause-by-clause diff with materiality labels |
| 💬 Ask Questions | FR-8 | Free-form Q&A grounded in your uploaded document (retrieval + Gemini) |
| 📎 Source Grounding | FR-5 | Every output carries a verbatim citation; a post-generation faithfulness check flags any span not found in the source |
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
- `simplify.md` / `map.md` / `clarify.md` / `compare.md` / `chat.md` — task prompts with strict JSON schemas
- Every schema includes `source_span`; `src/grounding.py` verifies each span against the source and the UI flags ungrounded citations instead of hiding them.

## Deployment

Works on Streamlit Cloud / Render / HF Spaces. Repo intentionally has no data files or binaries (< 10 MB).

## Disclaimer

LexiClarity is **informational only and does not provide legal advice**. Always consult a qualified lawyer before acting on a legal document.
