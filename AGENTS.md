# Metals Atlas repository rules

## Scope

- The current implementation boundary is Phase 1A only.
- Do not add maps, project comparison, live source adapters, schedulers, Celery, Redis, S3, full RBAC, audit-log infrastructure, publication batches, or Playwright unless the user explicitly starts a later phase.
- Phase 1A validates: Excel template -> preview -> confirmed import -> pending review -> accept and publish / modify, accept and publish / reject -> public project pages.

## Data semantics

- Never convert missing values to zero. Database values stay `NULL`; APIs return `null` plus a structured `missing_reason`. Only the UI renders the Chinese label `待补`.
- Explicitly distinguish calendar years from fiscal years, quarterly values from YTD and annual values, and project-100% figures from equity, attributable, and consolidated figures.
- Every observation must identify its production stage. Never add values across incompatible stages.
- Every observation must reference one concrete source material and include an effective date, source publication date, and verification date.
- `(source_code, record_key)` is the stable idempotency key on each observation table.
- Excel imports always create unpublished, pending observations.
- In Phase 1A, the only publication actions are `接受并发布` and `修改后接受并发布`. This is temporary; do not describe plain acceptance as a separate action.
- Ownership effective-date overlaps are validated in the service layer and must be covered by tests.
- Demo fixtures must be marked as demo and must never be represented as verified production facts.

## Security and sources

- Do not commit passwords, tokens, cookies, real `.env` files, paid data, or source files whose redistribution is not permitted.
- Tests must not access live websites. Use fixed, sanitized fixtures.
- Preserve concrete source material metadata: organization, material title, material URL, publication date, source type, and verification date.

## Commands

- Compose validation: `docker compose config`
- Start: `docker compose up --build -d`
- Migrate: `docker compose exec api alembic upgrade head`
- Create/update the sole admin: `docker compose exec api python -m app.cli create-admin`
- Reset the sole admin password interactively: `docker compose exec api python -m app.cli reset-admin-password` (enter it twice; `--show-input` is allowed only on a private local terminal; never pass the password as a command argument).
- Backend tests: `docker compose exec api pytest`
- Frontend dependencies: run `npm ci` in `apps/web`
- Frontend type check: run `npm run typecheck` in `apps/web`
- Frontend production build: run `npm run build` in `apps/web`
- Containerized frontend checks and image build: `docker compose build web` (the Dockerfile runs both type checking and the production build)
