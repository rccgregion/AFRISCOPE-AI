# Security model and production readiness

## Implemented controls

- Opaque 32-byte session tokens; only SHA-256 hashes stored; eight-hour expiry; httpOnly, SameSite=Strict cookies; Secure in production.
- scrypt password hashes with per-user salt; constant-time comparison; per-email attempt throttle (eight per 15 minutes).
- Unsafe requests require a custom header and permitted Origin; JSON body limit 1 MB.
- Organisation/project RLS under a non-login application role; transaction-local user context; column grants protect password/platform-admin fields; session/invitation tables are inaccessible to that role.
- Cross-organisation and cross-project reference triggers; immutable evidence, versions, runs, approvals, and audit records.
- Server-side role checks, independent approval, self-implementation prohibition, and reasoned transitions.
- Single-use, email-bound, 72-hour invitations; tokens stored hashed.
- Upload size/row/column and XLSX expansion checks; allowlisted schemas/tables/columns; parameterised SQL; no arbitrary SQL endpoint.
- CSV formula escaping; security headers; API responses no-store; generic 5xx messages.
- External AI disabled by default; server-only key; HTTPS; sensitive-evidence exclusion; schema/citation/numeric checks; labelled fallback.
- Demo reset requires admin role, demo organisation, and typed `RESET`; it does not delete private organisations.

## Threat model

Assume hostile browser input, attempted cross-tenant access, malicious CSV/XLSX, spreadsheet-formula injection, prompt injection in evidence, stolen invitation links, and accidental privileged UI actions. Controls above are tested at unit/API/database/browser levels where practical.

## Not production-certified

No external PostgreSQL/Supabase deployment, penetration test, MFA/SSO, email verification/recovery, distributed rate limiting, backup/restore drill, retention scheduler, key-management service, WAF, or compliance certification was performed. PGlite is a single-instance embedded database. Production cookies require HTTPS. The host-derived Origin allowance is convenient for previews but deployment should set an exact `APP_ORIGIN` behind a trusted proxy. Review proxy header handling before exposing a private instance.

## Deployment checklist

1. Use PostgreSQL with TLS, least-privileged migration/runtime accounts, backups, and restore tests.
2. Set `DEMO_ENABLED=false`, exact `APP_ORIGIN`, HTTPS, and private database storage.
3. Bootstrap a private administrator through the CLI; remove demo credentials/data from the production database.
4. Keep `LLM_EXTERNAL_ENABLED=false` until provider privacy and adversarial evaluations are approved.
5. Configure secret storage, log redaction/retention, monitoring, incident contacts, and access reviews.
6. Add MFA/SSO, verified recovery, distributed throttling, and invitation-delivery controls.
7. Test RLS against the actual PostgreSQL deployment and run dependency/security scans in CI.

Never expose service-role credentials to the browser. Never commit `.env`, database files, tokens, or private uploads.
