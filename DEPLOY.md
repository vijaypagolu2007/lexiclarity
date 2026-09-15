# Deployment Guide — LexiClarity

PRD target: **publicly accessible live URL by 22 Sep 2026**, live throughout the 27 Sep–4 Oct review window.

## Option A — Streamlit Community Cloud (recommended, fastest)

1. Push this repo to a **public GitHub repository** (verify size < 10 MB: this repo is ~35 KB of source).
2. Go to https://share.streamlit.io → **New app**.
3. Select your repo, branch `main`, main file path `app.py`.
4. Before deploying, open **Advanced settings → Secrets** and paste:

   ```toml
   GEMINI_API_KEY = "your-gemini-api-key-here"
   ```

5. Deploy. The app reads the key from `st.secrets` automatically (`src/llm.py: load_secrets_into_env`).
6. Your live URL will be `https://<your-app-name>.streamlit.app`.

## Option B — Render

1. Push to GitHub, then https://render.com → **New → Web Service** → connect repo.
2. Build command: `pip install -r requirements.txt`
3. Start command: `streamlit run app.py --server.port $PORT --server.address 0.0.0.0 --server.headless true`
4. Add environment variable `GEMINI_API_KEY` in the Render dashboard.
5. Free tier spins down when idle — for the review window, use a paid instance or prefer Streamlit Cloud.

## Option C — Hugging Face Spaces

1. Create a new Space (SDK: Streamlit), upload repo files.
2. Add `GEMINI_API_KEY` under **Settings → Secrets**.
3. Space URL is immediately public.

## Pre-flight checklist (before sharing the URL)

- [ ] `GEMINI_API_KEY` set in platform secrets (never committed to git — `.gitignore` covers `.streamlit/secrets.toml`)
- [ ] Upload `samples/sample_rental_agreement.txt` and run all 4 tabs end-to-end on the live URL
- [ ] Confirm the disclaimer banner renders on every tab
- [ ] Confirm repo size < 10 MB (`git count-objects -vH` — `size-pack` under 10 MB)
- [ ] Keep the app awake during 27 Sep–4 Oct review window (Streamlit Cloud: visit it at least once every few days, or enable "always on")

## Local run

```bash
pip install -r requirements.txt
cp .streamlit/secrets.toml.example .streamlit/secrets.toml  # then edit in your key
streamlit run app.py
```
