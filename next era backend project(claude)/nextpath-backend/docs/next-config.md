# `next.config.ts`

The project's Next.js configuration file, typed via `NextConfig` from `next`.

Currently sets a single option: **`reactStrictMode: true`**, which enables React's extra development-time checks (double-invoking certain lifecycle/render code to surface side-effect bugs, warning on deprecated APIs, etc.). Since this project is a backend/API surface rather than a page-rendering app, strict mode mainly matters if React components are added later — it costs nothing today and is the recommended default for any Next.js project.

No other config (redirects, headers, custom webpack/turbopack config, image domains, etc.) is set — the project is currently just two API routes, so the defaults are sufficient.
