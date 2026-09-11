# Product Requirements Document (PRD)

## PromptWars Virtual 2026 — AI for Legal Assistance & Access

---

| Field | Detail |
|---|---|
| **Product Name** | LexiClarity (working title) |
| **Event** | PromptWars Virtual |
| **Document Date** | 9 September 2026 |
| **Version** | v1.0 |

---

## 1. Executive Summary

Build and deploy a **live GenAI web application** that makes legal documents accessible to non-lawyers. The app takes complex legal text (contracts, agreements, notices) and delivers three core capabilities: **(1) simplification** of dense legal language, **(2) side-by-side contract comparison**, and **(3) clause-by-clause clarification** with plain-language explanations — all with source-grounded citations so users can trust what they read.

The submission will be evaluated by PromptWars' upgraded AI Evaluator, so the product must demonstrate strong prompt engineering, reliable grounded outputs, and a polished live user experience.

## 2. Background & Problem Statement

> **Official PS:** *AI for Legal Assistance & Access — Engineer GenAI solutions to simplify complex legal docs, compare contracts, or clarify clauses.*

**The problem:** Legal documents are written in jargon-heavy language. Ordinary citizens, small-business owners, tenants, and freelancers sign contracts they cannot fully understand. Access to a lawyer is expensive and slow, which creates an access-to-justice gap.

**The opportunity:** GenAI can bridge this gap by translating legalese into plain language, flagging risky clauses, and letting users ask questions about their own documents — instantly and at near-zero cost.

## 3. Goals & Objectives

### 3.1 Business / Mission Goals
| # | Goal | How Measured |
|---|---|---|
| G1 | Make any uploaded legal document understandable by a layperson | User-comprehension uplift in testing |
| G2 | Deliver 100% source-grounded answers (no hallucinated clauses) | Faithfulness checks vs. evaluator |
| G3 | Ship a valid submission by 26 Sep 2026 | Checklist complete (URL + repo + video) |
| G4 | Score well on the upgraded AI Evaluator | Refined scoring fairness metrics |

### 3.2 Non-Goals (Out of Scope)
- Providing actual legal advice (app must show a "not legal advice" disclaimer)
- Lawyer marketplace, e-signing, payments, or case filing
- Jurisdiction-specific legal verdicts

## 4. Target Users

| Persona | Description | Key Need |
|---|---|---|
| **Riya, Tenant** | 26, renting an apartment in Hyderabad | Understand her rental agreement before signing |
| **Arjun, Freelancer** | 31, signs client contracts monthly | Spot one-sided clauses, compare contract versions |
| **Small Business Owner** | 45, runs a Kirana store with vendor agreements | Know payment, liability, and termination terms |
| **Law Student / Paralegal** | 22 | Quick first-pass summaries before deep review |

## 5. Functional Requirements

### 5.1 MoSCoW Prioritization

#### Must Have (MVP — required for submission)
| ID | Requirement | Description |
|---|---|---|
| FR-1 | Document Upload | Accept PDF, DOCX, and plain text; extract text client/server-side |
| FR-2 | Simplify Mode | Rewrite full document (or selected section) in plain language; support 3 reading levels (Simple / Simpler / Summary) |
| FR-3 | Clause Clarifier | Select any clause → get plain-language explanation + plain-English risk flag (Low / Medium / High) |
| FR-4 | Contract Compare | Upload two documents → clause-by-clause diff, highlight additions/deletions/modified obligations |
| FR-5 | Source Grounding | Every explanation links back to the exact source sentence(s); no answer without citation |
| FR-6 | Disclaimer | Persistent "informational only, not legal advice" notice |
| FR-7 | Guardrails | Refuse non-legal-document inputs gracefully; handle scanned/empty files with clear errors |

#### Should Have (if time permits)
| ID | Requirement | Description |
|---|---|---|
| FR-8 | Follow-up Chat | Ask free-form questions about the uploaded document (RAG over the doc) |
| FR-9 | Multilingual Output | Simplified output in major Indian languages (Hindi, Telugu, Tamil…) |
| FR-10 | Risk Summary Dashboard | Auto-flag risky clauses (indemnity, auto-renewal, unlimited liability, non-compete) |
| FR-11 | Export | Download simplified text as PDF/Markdown |

#### Could Have (stretch)
| ID | Requirement |
|---|---|
| FR-12 | Voice input/output for accessibility |
| FR-13 | "Explain like I'm signing this today" one-tap summary card |

### 5.2 User Flow (Primary)
1. Land on app → upload a contract (drag & drop)
2. Choose mode: **Simplify** / **Clarify Clause** / **Compare**
3. View output with citations → click citation to jump to source text
4. Ask follow-up questions (FR-8)
5. Export or share summary

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | First response < 10 s; simplify a 10-page doc < 30 s |
| **Reliability** | Graceful handling of corrupted/empty/scanned PDFs |
| **Privacy** | No document retention by default; in-memory processing; add a "documents are not stored" note |
| **Evaluator-Ready** | Prompt templates versioned in repo; consistent structured outputs (JSON mode) |
| **Deployment** | Publicly accessible live URL (Vercel / Render / HF Spaces / Streamlit Cloud) |
| **Repo Constraints** | Public GitHub repo **< 10 MB** — no heavy binaries, models, or datasets; use `.gitignore` |
| **Video** | Walkthrough **< 4 minutes**, showing live screen testing |

## 7. Proposed Technical Architecture

```
User Browser
   │
   ▼
[Frontend]  Streamlit / Next.js — upload, viewer, diff UI
   │
   ▼
[App Layer] Python (FastAPI) or Next.js API routes
   │  ├─ Document parser: PyMuPDF / pdfplumber / python-docx
   │  ├─ Chunking + retrieval (RAG over the uploaded doc)
   │  └─ Prompt orchestration layer (versioned templates)
   ▼
[Model]  Gemini API (Google for Developers collaboration)
   │  ├─ Simplification prompt  (JSON schema output)
   │  ├─ Clause clarification prompt
   │  └─ Comparison prompt (structured diff)
   ▼
[Post-processing] Citation mapper → faithfulness check → UI
```

**Why Gemini:** aligns with the Google for Developers collaboration; native JSON/structured output, long context window for full-document processing.

## 8. Prompt Engineering & Evaluator Strategy

Since this is a **calibration track for the upgraded AI Evaluator**, prompt quality is the product:

- **Structured outputs everywhere** (JSON schema: `clause_id`, `plain_text`, `risk_level`, `source_span`)
- **System-prompt contracts:** role, task, grounding rules, refusal rules
- **Self-verification step:** model re-checks each explanation against the source span before returning
- **Faithfulness guard:** post-generation check that every claim exists in the source; drop or flag otherwise
- **Versioned prompt files** (`/prompts/*.md`) so evaluators can inspect methodology

## 9. Success Metrics

| Metric | Target |
|---|---|
| Grounded-answer rate | ≥ 95% of outputs pass citation check |
| Simplification quality | Layperson comprehension score ≥ 4/5 in user testing |
| Clause-clarification accuracy | ≥ 90% agreement on sample contract set |
| Compare diff recall | ≥ 90% of material changes detected |
| Uptime | Live URL available throughout 27 Sep–4 Oct review window |

## 10. Timeline (Today = 9 Sep 2026, T-minus 17 days)

| Date | Milestone | Deliverable |
|---|---|---|
| **9 Sep (Day 0)** | Kickoff — finalize this PRD, register, scaffold repo | Repo skeleton + README |
| 10–11 Sep | Research + finalize feature scope; build text extraction | FR-1 working locally |
| 12–13 Sep | Simplify + Clause Clarifier core (FR-2, FR-3) | Working prompts with citations |
| 14 Sep | Contract Compare (FR-4) | Diff output locally |
| **15 Sep** | **PS Explainer session — attend live**, incorporate feedback | Updated scope if needed |
| 16–18 Sep | RAG follow-up chat (FR-8), guardrails, disclaimers | Feature-complete local app |
| 19–20 Sep | Prompt hardening, faithfulness checks, evaluator dry-runs | Evaluator score baseline |
| 21–22 Sep | Deploy live URL; end-to-end tests on real contracts | **Live Web App URL** ✅ |
| 23 Sep | Script + record walkthrough video (<4 min) | **Video** ✅ |
| 24–25 Sep | Repo cleanup (<10 MB), README, demo screenshots; buffer for fixes | **GitHub Repo** ✅ |
| **26 Sep** | **SUBMIT before deadline** | Full checklist complete |
| 27 Sep–4 Oct | System review window — keep app live, respond to queries | App uptime ✅ |

## 11. Submission Checklist (from invite)
- [ ] Live Web App URL — publicly accessible
- [ ] Public GitHub Repository — **< 10 MB**
- [ ] Walkthrough Video — **< 4 minutes**, shows live screen testing
- [ ] Valid submission → **1,000 Prompt Credits guaranteed**

## 12. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hallucinated clause explanations | High | Source-span citation + faithfulness post-check (FR-5) |
| Scanned/image PDFs break extraction | Medium | Clear error message; optional OCR fallback if time permits |
| Repo exceeds 10 MB | Medium | `.gitignore` from Day 0; no data files; weekly size audit |
| Deployment failure near deadline | Medium | Deploy by 22 Sep; keep Render/Vercel fallback ready |
| Evaluator scoring surprises | Medium | 19–20 Sep dry-runs; versioned prompts for transparency |
| Time overrun on Compare feature | Medium | FR-4 is Must-have; if blocked, ship section-level diff first |

## 13. Future Scope (post-hackathon)
- Multi-document portfolio review for SMBs
- WhatsApp/Telegram bot interface for low-bandwidth access
- Partnerships with legal-aid NGOs
- Fine-tuned domain model on Indian contract corpus

---
*Prepared on 9 September 2026 for the PromptWars Virtual Exclusive Edition calibration track.*
