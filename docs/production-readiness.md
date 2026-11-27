# Base — operational readiness gate

This is a technical acceptance checklist, not a declaration that the service is ready.

## Controls in place

- All exposed application tables use Supabase RLS. Private Space, material, storage and linked-Space access is determined by the authenticated member's ownership or collaborator role.
- Read permissions for profiles are restricted to the owner. The member allowlist is private.
- Public early-access signup and privacy forms are routed through the `base-public-form` Edge Function, whose server-only service credential executes `public.base_submit_public_form`.
- The database procedure validates submissions and enforces atomic per-fingerprint and per-email request quotas; only salted HMAC identifiers are stored in the rate-limit table. It returns generic confirmation for duplicates.
- Browser network requests have explicit timeouts. Auth sessions survive transient network faults. Invalid credentials are discarded.
- Media links expire after 10 minutes. Uploaded objects have Space-scoped RLS, enforced content type and size limits; failed material inserts attempt to clean up the uploaded object.
- Changes require CI JavaScript syntax checks and unit/contract tests for deployment.

## Deployment order for form hardening

1. Apply `20261127_base_public_form_guard.sql` to Base's dedicated Supabase database.
2. Deploy `base-public-form` with `verify_jwt=false` and the default server-side Supabase secret.
3. Deploy the client that calls `/functions/v1/base-public-form`.
4. Smoke-test an invalid request (expect HTTP 400) and a real consented registration (expect HTTP 200, recorded once).
5. **Completed 27 November 2026:** revocation migration `20261127_lock_down_public_forms.sql` removed all old column-level and table-level INSERT grants. The Edge Function is now the only public-submission writer. GitHub Pages deployment and a live HTTP smoke test both passed; synthetic test records were deleted.

Avoid doing step 5 before the new client is live. Never place a service-role key in GitHub, a screenshot or browser code.

## Remaining launch gates

- Use at least three real account roles to verify RLS: active owner, active collaborator, non-member; test both public/private Spaces, native uploads, releases, forks, links, suspension and sign-out.
- Add reliable email sending and verified double-opt-in for larger outreach, plus documented data retention, POPIA/GDPR operator details and a contact address.
- Confirm the platform's trusted client-IP header in Supabase's Edge runtime. The current handler prefers proxy client-IP headers; origin checks alone do not prove a request is from a browser and IP controls can be evaded using multiple egress addresses.
- Confirm that passwords are disabled or enable compromised-password checks if they are offered.
- Configure protected main branch, required checks, monitoring, alerting, and a tested recovery procedure. GitHub Pages does not support application-defined HTTP security headers; its CSP is a meta policy and cannot set frame-ancestors.
- Add real browser/device acceptance testing and a media retention/backup plan.
- Review scaling and pagination beyond the initial 200 Spaces.

Do not claim production readiness until the outstanding gates are verified.
