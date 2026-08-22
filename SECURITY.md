# Secrets and data policy

This repository is a synthetic proof of concept. Do not commit real credentials, student data,
homework photos, raw model prompts/responses, or production exports.

- Copy `.env.example` to `.env.local` for local work; `.env*` files are ignored by git.
- Supabase publishable keys are non-secret, but this PoC still keeps them in the server runtime.
  Secret/service-role keys and AI provider keys must never enter browser code or the repository.
- Use anonymised or generated homework images and the synthetic student Nora for development.
- If a secret is exposed, stop work, revoke/rotate it, and document the incident before continuing.
- Review new dependencies and third-party data processors before adding them.
