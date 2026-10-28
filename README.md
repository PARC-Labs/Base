# Base v1

**A selective network for experimental practice.** A standalone working prototype and Supabase-backed app, developed independently from Applied State.

## What's included

- Public Explore directory for published research Spaces.
- Responsive, editorial-style interfaces for visual Grid and reading Document views.
- Private/public Spaces, image URL / link / note material, editable metadata.
- Signed-in membership gate; invited accounts only. Accounts are **not** created automatically at sign-in.
- Existing-member collaboration invitations.
- Immutable releases and private forks of publicly released Spaces, with lineage.
- RLS-backed access, owner checks and server-validated release/fork operations.
- Fully interactive **single-browser preview mode** without a backend.

**Not in v1:** native binary upload, image processing, full-text indexing, payment collection, application intake, notifications, member directory, automatic merge, executable protocols, agent orchestration. These are deliberately not claimed as operational.

## Run without accounts (preview mode)

The site is plain HTML/CSS/JavaScript with no build step or runtime dependencies.

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

`src/config.js` is deliberately empty for Supabase credentials, so the app runs in browser-local preview mode. New Spaces, materials, releases and forks persist in your browser's localStorage. Reset from the preview banner. This is **not multi-user**.

The sample materials are synthetic original SVG drawings committed under `assets/`.

## Connect a NEW Supabase project

Do not reuse Applied State's production database.

1. Create a separate Supabase project for Base.
2. Apply `supabase/schema.sql` in Supabase SQL Editor to a new database. Inspect and test RLS before enabling actual membership.
3. In Authentication → URL Configuration, set your deployment origin as Site URL and permitted redirect destination.
4. Configure email authentication (magic links). Use production SMTP before onboarding real members. Test same-browser callback.
5. In `src/config.js`, enter only your **public** Supabase URL and **public anon/publishable key**. Never put a service role key or credentials in browser source.
6. Create or invite accounts manually in Authentication → Users. The `auth_profile_created` trigger creates a pending membership row.
7. Verify the identity of the intended member. Activate their access in SQL Editor:
   ```sql
   update public.memberships set status = 'active'
   where user_id = '<VERIFIED_AUTH_USER_UUID>';
   ```
8. Update `applicationsEmail` in `src/config.js`, or leave the expression-of-interest route explicitly closed.
9. Deploy to any HTTPS static host (GitHub Pages requires base-path configuration, unless custom domain/subdomain is used; Vercel/Netlify root deployment works without modifications).

### Authentication

The browser calls Supabase GoTrue OTP and handles the standard implicit magic-link callback (`#access_token=…`). This first-release client stores the session in localStorage and refreshes expired tokens. Use robust production hardening before accepting sensitive research: strong CSP, session management, token-storage threat assessment, verified redirect destinations, and rate limiting. For production with confidential material, migrating to a well-maintained Supabase Auth client with a pinned lockfile is recommended.

### Security

RLS and explicit table grants protect every table. A logged-in identity without an `active` membership cannot create Spaces. Public read access covers published Spaces and their material. Private content is available only to the active owner and collaborators; privileged fork, release and invitation routines validate identity and authorization at the database layer. Browser clients never receive a service key. Published material is public by design; do not make sensitive research public.

The `private` schema must **not** be exposed through PostgREST. Keep only `public` in Data API exposed schemas. After applying the schema, run Supabase database advisors and test access with at least three accounts: owner, non-member, and collaborator. **No production database has been provisioned or modified by this delivery.**

### Data model

`profiles`, `memberships`, `spaces`, `space_collaborators`, `materials`, `releases`.

A **Space** is a working collection. A **Release** is an immutable JSON snapshot of its material. A **Fork** creates a new private Space from a public release and records `parent_release_id`. Published Spaces can still be edited after a release, without mutating that snapshot.

## Design intent

The visual system is deliberately quiet: editorial typography, spacious grids, material-first presentation, small controls and restrained metadata. Curation applies to membership, not every individual Space. The eventual system-building and operational-protocol layers can evolve from versioned Space objects.

## Next development milestones

1. Replace URL-only image material with secure private Storage upload and access policies.
2. Member profile editing, invitation acceptance and notification delivery.
3. Better material capture and reordering, rich previews, PDF support and public search.
4. Side-by-side release comparison, explicit reuse licences and fork provenance UI.
5. Structured projects/modules and operational-protocol experiments.
6. Formal admissions and payments; billing must remain independent of editorial selection.

## Repository

This export is a standalone Git-ready project. To place it in a newly created repository, create an empty `base` repository under the desired GitHub owner, then push this source. The current connected GitHub application can update existing repositories but cannot create new repositories.
