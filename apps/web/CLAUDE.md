# apps/web — Claude Instructions

## Status: infrastructure-baseline shell

This is an **emptied web shell** for the memorial-site baseline. All the original product
UI, routes, data, auth client, PWA, and Capacitor native projects were removed in
feature `001-reset-infra-baseline`. What remains:

- `src/main.tsx` — minimal React 19 entry (StrictMode + `App`).
- `src/App.tsx` — placeholder shell component.
- `src/index.css`, `src/vite-env.d.ts` — kept.
- Build config: `vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`,
  `tailwind.config.js`, `postcss.config.js`, `index.html`.
- Deploy: `Dockerfile` (nginx static serve) + `nginx.conf.template`
  (SPA fallback + `/api/auth` proxy through Kong).

## Conventions for the new business domain

- React 19 + Vite + Tailwind. Add routing (e.g. react-router-dom), state, and an
  API client back as needed — they were intentionally removed to keep the shell minimal.
- All API calls go through the Kong gateway (constitution Principle I). The nginx
  template proxies `/api/auth` → Kong → auth-service; add further `/api/*` blocks there.
- Frontend owns its own auth locally in `src/` — do not cross-import from `apps/auth-service`.
- Keep `strict: true`, explicit return types, no `any` (constitution Principle IV).
