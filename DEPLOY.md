# Deployment Guide — LexiClarity

The current application is a React/Vite frontend with an Express/Gemini server.

## Vercel deployment

1. Redeploy the latest commit; `vercel.json` routes `/api/*` to the serverless Express handler.
2. Build command: `npm run build` (the repository already contains the required Vercel config).
3. Do not set a Vercel start command for this deployment.
4. Set `GEMINI_API_KEY` in Vercel Project Settings → Environment Variables for Production, then redeploy.
5. Verify `/api/health` returns HTTP 200 before testing AI actions.

## Pre-flight checklist

- [ ] Deploy the intended commit from `main`.
- [ ] Confirm `/api/health` returns HTTP 200 and reports `gemini-3.6-flash`.
- [ ] Upload TXT, PDF, and DOCX samples and verify extraction.
- [ ] Test Simplify, Clause Explorer, Compare, and Document Chat.
- [ ] Confirm the disclaimer is visible.
- [ ] Confirm no API key appears in the frontend, logs, or repository.
- [ ] Verify the public URL and keep the service available during review.

## Local run

```bash
npm install
set GEMINI_API_KEY=your_key_here
npm run dev
```

Open `http://localhost:3000`. To choose another port, run `node dev.js --port 7100`.
