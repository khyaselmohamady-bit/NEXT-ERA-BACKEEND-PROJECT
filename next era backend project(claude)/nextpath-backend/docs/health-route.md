# `src/app/api/health/route.ts`

A minimal Next.js Route Handler mounted at `GET /api/health`.

It takes no input and returns a fixed JSON body:

```json
{ "status": "ok", "service": "nextpath-backend" }
```

Purpose: gives the team, load balancers, and deployment platforms (Vercel, uptime monitors, etc.) a cheap way to confirm the API process is up and responding, without touching the database or the eligibility engine. It deliberately does nothing else — no auth, no dependencies — so it can't itself become a point of failure.
