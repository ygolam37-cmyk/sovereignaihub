# Universal Sovereign AI Network — Pragmatic Build Plan

Combining options **1 + 2 + 3 + 4** into one coherent system. Honest boundary up front: heavy LLM inference cannot run inside every user's browser tab — a phone cannot host a 70B model. So the design is **P2P-first for coordination, verification, and light work; provider-routed for heavy inference**, with the network self-healing across providers and (optionally) peer nodes running small local models via WebGPU.

## What ships

### 1. Community Model Registry (option 1)
- New table `model_registry` in Lovable Cloud: `id, hf_model_id, display_name, lane (fast|reasoning|code|creative), status (pending|approved|rejected|quarantined), submitted_by, sha256, notes, created_at`.
- RLS: anyone authenticated can `SELECT` approved rows; only submitter can insert; only role `admin` can update status.
- Lane router in `ai.server.ts` reads approved models from the registry (with the current hardcoded list as fallback seed).

### 2. Model Submission + Quarantine UI (option 2)
- New page `/_authenticated.models.tsx`: table of models, submit form (HF id, lane, optional SHA), status badges.
- New server fn `submitModel` → inserts as `pending`.
- Admin-only server fn `setModelStatus` (gated by `has_role`).
- No arbitrary code/weight execution — only HF model IDs are stored.

### 3. Signed Manifests (option 4)
- On submit, backend fetches `https://huggingface.co/api/models/{id}` and stores `sha` (commit hash) + `siblings` count as the manifest fingerprint.
- Before routing to a model, verify the current HF `sha` still matches the stored one; mismatch → auto-quarantine and skip.
- Manifest verification result surfaced in the Reasoning Audit ("Manifest verified: sha abc123…").

### 4. Multi-Node Routing / 24-7 Availability (option 3)
- Extend `NetworkIndicator` + `networkStatus` server fn to include real health probes for each configured provider node (HF router, HF direct, and any future peer relay).
- `askSovereignUpstream` already falls back across models — extend to fall back across **providers** in order, mark the failing node down for 60s (in-memory per-worker + Cloud table `node_health` for cross-worker view), and re-route.
- Add optional **peer worker mode**: when a user opts in on `/models`, their browser registers a WebRTC data-channel via a lightweight signaling server route (`/api/public/signal`) and can serve small local WebGPU models (tinyllama-class) to other peers. Heavy prompts still route to providers. This gives real P2P for the subset of prompts a tiny model can handle.

## Files

**New**
- `supabase/migrations/<ts>_usain_registry.sql` — `model_registry`, `node_health`, `app_role` enum (if not exists), `user_roles`, `has_role()`, RLS + grants.
- `src/lib/registry.functions.ts` — `listModels`, `submitModel`, `setModelStatus`, `verifyManifest`.
- `src/lib/registry.server.ts` — HF manifest fetch, SHA compare.
- `src/lib/node-routing.server.ts` — provider node list, health map, `pickHealthyNode`, `markNodeDown`.
- `src/routes/_authenticated.models.tsx` — registry UI (table, submit form, admin actions).
- `src/lib/peer-node.client.ts` — opt-in WebRTC peer worker (WebGPU model stub, feature-detected).
- `src/routes/api/public/signal.ts` — minimal WebRTC signaling relay (rate-limited, no PII stored).

**Edited**
- `src/lib/ai.server.ts` — pull lane candidates from registry, verify manifest, route through `pickHealthyNode`, mark down on 5xx/429.
- `src/lib/search.functions.ts` — extend `networkStatus` to report per-provider + peer counts.
- `src/components/NetworkIndicator.tsx` — show provider + peer node health.
- `src/routes/_authenticated.dashboard.tsx` — link to `/models`.

## Technical section (for the technical reader)

- **No blockchain.** "Signed manifest" = HF commit SHA pinning + optional user-supplied SHA. Same integrity property, zero gas.
- **No arbitrary code execution.** Registry stores identifiers, not weights or code. Peer mode only loads models from a hardcoded WebGPU-safe allowlist (e.g. Xenova/transformers.js), never user-uploaded weights.
- **Admin role** stored in `user_roles` (separate table, `has_role` SECURITY DEFINER) per platform rules — never on profile.
- **Signaling route** under `/api/public/signal` is rate-limited by IP hash and only relays SDP/ICE; no message content persisted.
- **Manifest re-check** cached 10 min in `node_health` to avoid hammering HF.
- **Fallback order** per lane: registry-approved models → hardcoded seed list → error surfaced to UI.
- Peer mode is **feature-detected and opt-in**; if WebGPU or WebRTC is unavailable, the toggle is disabled and routing falls back to providers only.

## Out of scope (intentionally)
- Running 70B-class models in browsers (physically impossible).
- Fully permissionless weight upload with auto-execution (RCE class vulnerability).
- Model merging across architectures (research problem, degrades quality).
- Guaranteed equal latency across all hardware (violates physics).

Approve and I'll ship this as one coherent change set.
