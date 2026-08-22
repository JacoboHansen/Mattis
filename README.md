# Mattis PoC

Mattis is a mobile-first proof of concept for a Norwegian, AI-assisted math tutor. The current
prototype implements the complete synthetic Nora demo flow in Next.js and has a dedicated,
GDPR-oriented Supabase foundation in Stockholm. Email OTP authentication and the demo profile are
connected to Supabase. Tutor sessions and messages are owner-scoped and persisted, and the chat can
use Vercel AI Gateway through a provider-neutral server API. Camera processing is still mocked.

## Requirements

- Node.js 24 or newer
- pnpm 11.19.0 (`corepack enable` can activate the pinned package manager)

## Local start

```bash
corepack pnpm install
cp .env.example .env.local
corepack pnpm dev
```

Add the project publishable key to `.env.local`, then open <http://localhost:3000>. The closed test
accepts only the addresses in `MATTIS_ALLOWED_EMAILS`. Configure `AI_GATEWAY_API_KEY` or run on
Vercel with AI Gateway/OIDC enabled for model responses; without it, Mattis uses a safe local hint
fallback. `MATTIS_TUTOR_MODEL` selects the model and defaults to `openai/gpt-5.6-luna`.

## Demo flow

1. Sign in with the six-digit code sent to the invited demo address.
2. Choose grade and weekly goal.
3. Create a persisted 25-, 45-, or 60-minute session.
4. Add and review mocked homework photos.
5. Work through an algebra task in a persisted, AI-assisted tutor chat.
6. Continue to a geometry task with a deterministic math figure.
7. Review the session summary and learning signals.

All UI copy and demo records are synthetic. The privacy screen is intentionally explicit about the
prototype status.

Local development and Vercel previews expose `/__test/session`, a synthetic, no-database visual
test harness. It is unavailable in production and does not bypass OTP or Supabase RLS.

## Backend status

The reviewed Supabase schema is kept in `mattis-poc-spec/mattis-poc-schema.sql`. The exact live
migrations are in `supabase/migrations/`, generated database types are in
`apps/web/lib/database.types.ts`, and activation notes are in `supabase/README.md`.

The dedicated project is `Mattis` (`ccpyhexgpiqdmtwvzjdd`) in `eu-north-1`. All exposed tables have
RLS and explicit grants, the homework bucket is private, and the live security advisor reports no
table/RLS findings. Authentication uses an invited email plus a six-digit Supabase OTP. The app
keeps session tokens in secure, HTTP-only cookies and the publishable key in the server environment.
Tutor provider calls request zero data retention, and `ai_generations` stores only provider,
model, usage and safety metadata—not prompt or response text.

Before the first login, install `supabase/templates/magic-link.html` as the hosted Magic Link email
template so Supabase sends `{{ .Token }}` instead of a link. See `supabase/templates/README.md`.

See `docs/checkpoints/M4.md` for the implemented AI flow and the remaining product gaps.

## Quality gates

```bash
corepack pnpm format:check
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
```

Playwright starts the web app automatically. Tests must continue using synthetic records unless a
test environment is explicitly configured; never point automated tests at real pupil data.
