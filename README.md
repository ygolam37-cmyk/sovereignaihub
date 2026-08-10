# Sovereign AI Hub

A fully self-hosted, decentralized AI network that runs without any third-party
AI provider. Users authenticate with a local algorithmic access code, join a
browser-to-browser P2P mesh, and help store, verify and serve sharded model
files while a native inference engine answers questions from live open-web
search results.

Live app: https://sovereignaihub.lovable.app

## Project Overview

- **Local algorithmic auth** — no OAuth, no email. A 12-character symmetric
  challenge is generated in the browser, typed back by the user, and the session
  is persisted across restarts via IndexedDB + `localStorage` mirroring. A
  dedicated exit gate is required to sign out.
- **Server-verified session gate** — every server function sits behind an
  HMAC-signed, HttpOnly cookie that is only issued after the client solves a
  server-signed proof-of-work challenge.
- **Native inference engine** — no external LLM APIs. Answers are synthesized
  server-side with TF-IDF + MMR over results scraped from DuckDuckGo, Bing,
  Brave and RSS fallbacks.
- **Identity firewall** — prompts and responses are scrubbed of personal
  identifiers (emails, phones, addresses, Aadhaar/SSN/card-like numbers) before
  they cross any boundary.
- **P2P model distribution** — models are split into 256 KB shards with per-shard
  SHA-256 hashes and a Merkle root. Shards are replicated across live peer nodes,
  re-replicated after churn, and repairable from the original source file.
- **Adaptive load balancing** — each device is benchmarked (0–100 score, heavy /
  medium / light tier) and receives a shard plan matching its real capacity,
  with background work throttled by battery and thermal state.
- **Universal share button** — generates a 16-character cryptographic share
  domain and encodes state in the URL fragment, so shares need no server.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | TanStack Start v1 (React 19, SSR + server functions) |
| Routing | TanStack Router (file-based, `src/routes`) |
| Build | Vite 7, Cloudflare Workers target |
| Styling | Tailwind CSS v4 (`src/styles.css` theme tokens) + shadcn/ui + Radix |
| Data | TanStack Query |
| Backend | Supabase (Postgres with RLS, Storage for model shards, Realtime for P2P signaling) |
| Validation | Zod |
| P2P | WebRTC data channels, STUN, Web Workers, IndexedDB |
| Crypto | Web Crypto (SHA-256 shards, Merkle roots, HMAC gate cookies, PoW) |
| Tests | Vitest |

## Project Structure

```text
src/
  routes/            file-based routes (index, login, net, _authenticated/*)
  components/        UI + app components (banner, share, network indicator)
  components/ui/     shadcn/ui primitives
  lib/
    *.functions.ts   server functions callable from the client
    *.server.ts      server-only modules (engine, search, gate, routing)
    privacy.ts       identity firewall / PII scrubbing
    shard.ts         sharding + Merkle root
    webrtc-mesh.ts   P2P mesh
    device-caps.ts   device benchmarking
  integrations/      Supabase clients and auth middleware
supabase/            local backend config
```

## Setup Instructions

### Prerequisites

- Node.js 20+ and npm
- A Supabase project (Postgres + Storage + Realtime)

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```bash
# Client (exposed to the browser — publishable values only)
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-publishable-anon-key>
VITE_SUPABASE_PROJECT_ID=<your-project-ref>

# Server only
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<your-publishable-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Secret used to sign the proof-of-work session cookie (any long random string)
GATE_SECRET=<random-64-char-string>
```

Never commit `.env`. Server-only values must only be read inside server
function handlers (`process.env`), never in browser code.

### 3. Database and storage

Apply the SQL migrations in `supabase/` to your project, then create a private
storage bucket named `model-shards`. All shard tables and that bucket are
locked to `service_role` only — clients reach them exclusively through the
gated server functions.

### 4. Run locally

```bash
npm run dev        # http://localhost:8080
npm run test       # unit tests (privacy, identity, search)
npm run lint       # eslint
npm run build      # production build
npm run preview    # preview the production build
```

## Contributing

1. Fork the repo and create a branch: `git checkout -b feat/my-change`.
2. Keep server-only code in `*.server.ts` and never import it from components.
3. Use design tokens from `src/styles.css` — no hardcoded colors.
4. Run `npm run lint` and `npm run test` before opening a pull request.
5. Describe the change and its security impact in the PR body.

## Security

- All server functions require the signed gate cookie; model mutations are
  additionally ownership-bound to the publishing session.
- Model shard storage and tables grant no `anon`/`authenticated` access.
- Report vulnerabilities privately via a GitHub security advisory rather than a
  public issue.

## License

MIT — see [LICENSE](./LICENSE). Copyright (c) 2026 Golam Yasin.
