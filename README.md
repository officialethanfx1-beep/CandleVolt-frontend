# CandleVolt Frontend

This is the real, deployable version of the CandleVolt app — meant to run on
its own website (Vercel), not inside a claude.ai artifact preview, since
artifact previews restrict outbound calls to external APIs like your Render
backend.

## Deploy to Vercel (free) — same pattern as the backend

1. Upload this whole folder to a **new GitHub repo** (e.g. `candlevolt-frontend`)
   — same drag-and-drop method you used for the backend repo.
2. Go to [vercel.com](https://vercel.com), sign up with GitHub.
3. **"Add New" → "Project"** → select your `candlevolt-frontend` repo.
4. Vercel auto-detects it's a Vite project — leave the defaults:
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Click **Deploy**.
6. You'll get a URL like `https://candlevolt-frontend.vercel.app` — open it.
   This is a real website, so it can talk to your Render backend without any
   sandbox restriction.

## If you ever change the backend URL

Edit `src/CandleVolt.jsx`, find:
```js
const BACKEND_URL = "https://candlevolt-backend-2.onrender.com";
```
update it, commit the change on GitHub — Vercel auto-redeploys.
