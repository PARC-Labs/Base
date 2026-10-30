# Base v1

**A selective network for experimental practice.** A standalone working prototype and Supabase-backed app, developed independently from Applied State.

## What's included

- Public Explore directory for published research Spaces.
- Responsive, editorial-style interfaces for visual Grid, reading Document, structural Build and activity Operate views.
- Private/public Spaces, native image and PDF uploads, image URLs, links, notes, editable metadata and optional components and procedures.
- Free-tier private Supabase Storage bucket with Space-scoped file permissions, signed temporary viewing links and browser-local WebP compression.
- Email-link sign-in: visitors can create a verified identity, but **only addresses preapproved by the institution receive active membership**. Others cannot access private Spaces.
- Owner-authorised collaboration with existing active members (currently direct access grants, without acceptance or notifications).
- Immutable releases and private forks of publicly released Spaces, with server-enforced lineage; append-only activity records referencing a released version.
- RLS-backed access, owner checks and server-validated release/fork operations.
- Fully interactive **single-browser preview mode** without a backend.

**Not in v1:** paid image transformation services, full-text indexing, payment collection, application intake, notifications, member directory, automatic merge, executable protocols, agent orchestration or robotic operations. The Operate view records human activities; it does not execute procedures. These are deliberately not claimed as operational.

## Run without accounts (preview mode)

The site is plain HTML/CSS/JavaScript with no build step or runtime dependencies.

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

For local-only preview mode, temporarily leave the public Supabase URL and publishable key blank in `src/config.js`; the production checkout uses live Supabase. New Spaces, materials, releases and forks persist in your browser's localStorage. Reset from the preview banner. This is **not multi-user**.

The sample materials are synthetic original SVG drawings committed under `assets/`. Native uploads are unavailable in local-only preview mode; they require authentication to the existing Base Supabase project.

## Connect a NEW Supabase project

Do not reuse Applied State's production database.

1. Create a separate Supabase project for Base.
2. Apply `supabase/schema.sql` in Supabase SQL Editor to a new database. Inspect and test RLS before enabling actual membership.
3. In Authentication → URL Configuration, set your deployment origin as Site URL and permitted redirect destination.
4. Configure email authentication (magic links). In **Authentication → URL Configuration**, set Site URL to `https://parc-labs.github.io/Base/` and add that exact URL as an allowed Redirect URL. Use production SMTP before onboarding real members. Test same-browser callback.
5. In `src/config.js`, enter only your **public** Supabase URL and **public anon/publishable key**. Never put a service role key or credentials in browser source.
6. Preapprove member addresses privately using a trusted administrator's SQL Editor session:
   ```sql
   insert into private.approved_member_emails(email)
   values (lower('invited.member@example.com')) on conflict do nothing;
   ```
   Never commit real email addresses to the public repository. The email-link form can create an Auth identity. The database trigger grants active membership only to preapproved addresses; all other users remain `pending`.
7. For a member who registered **before** preapproval, confirm ownership in **Authentication → Users** and activate manually:
   ```sql
   update public.memberships set status = 'active'
   where user_id = '<VERIFIED_AUTH_USER_UUID>';
   ```
8. Update `applicationsEmail` in `src/config.js`, or leave the expression-of-interest route explicitly closed.
9. Deploy to any HTTPS static host (GitHub Pages requires base-path configuration, unless custom domain/subdomain is used; Vercel/Netlify root deployment works without modifications).

### Native media / free limits

In an editable Space select **+ UPLOAD**, choose an image or PDF, optionally add a title and caption, and submit. Dragging a file onto the material grid also works on supported browsers. JPEG/PNG/WebP images are resized in the user's browser to at most 1600 px per side and encoded as WebP, normally no more than 2 MB. Source images are limited to 12 MB and 45 million decoded pixels; PDFs are limited to 5 MB and their PDF header is checked. The Storage bucket itself rejects objects over 5 MB. No paid transformation API is used.

The `base-media` bucket is private. Storage object names include the owning Space UUID, and RLS permits reads of public Spaces or by active owners/collaborators of private Spaces. Each page view requests a 1-hour signed viewing URL (revocation of a public Space may leave already-issued links temporarily usable until expiry). No service-role credentials appear in the browser.

Files remain in Storage when their corresponding material is removed, because released snapshots may still reference them. **There is not yet automated garbage collection or per-member quota enforcement**. Monitor the organisation's free Storage allowance (currently 1 GB shared with other projects in the organisation); impose manual intake limits during the founding trial. A fork of native media produces a link back to the original Space rather than copying potentially copyrighted files. Production use requires stronger upload scanning, quota controls and media lifecycle tooling.

### Authentication

The browser calls Supabase GoTrue OTP and handles the standard implicit magic-link callback (`#access_token=…`). OTP creates an **identity**, not a membership. The access gate is enforced by the database even if the UI is bypassed. This first-release client stores the session in localStorage and refreshes expired tokens. Use robust production hardening before accepting sensitive research: strong CSP, session management, token-storage threat assessment, verified redirect destinations, and rate limiting. For production with confidential material, migrating to a well-maintained Supabase Auth client with a pinned lockfile is recommended.

### Security

RLS and explicit table grants protect every table. A logged-in identity without an `active` membership cannot create Spaces. Public read access covers published Spaces and their material. Private content is available only to the active owner and collaborators; privileged fork, release and invitation routines validate identity and authorization at the database layer. Browser clients never receive a service key. Published material is public by design; do not make sensitive research public.

The `private` schema must **not** be exposed through PostgREST. Keep only `public` in Data API exposed schemas. After applying the schema, run Supabase database advisors and test access with at least three accounts: owner, non-member, and collaborator. The separate Base production database is provisioned and contains the new private Storage bucket. A real authenticated upload/visibility test is still required.

### Data model

`profiles`, `memberships`, `spaces`, `space_collaborators`, `materials`, `releases`, `operation_logs`.

A **Space** is a working collection. A **Release** is an immutable JSON snapshot of its material. A **Fork** creates a new private Space from a public release and records `parent_release_id`. Published Spaces can still be edited after a release, without mutating that snapshot. Components and procedures are structured research material; operational activity references an immutable release. The database disallows clients from forging fork ancestry through normal Space inserts/updates.

## Design intent

The visual system is deliberately quiet: editorial typography, spacious grids, material-first presentation, small controls and restrained metadata. Curation applies to membership, not every individual Space. The eventual system-building and operational-protocol layers can evolve from versioned Space objects.

## Next development milestones

1. Extend native upload with reusable media blocks, cover images, upload quota dashboard and lifecycle cleanup.
2. Member profile editing, invitation acceptance and notification delivery.
3. Better material capture and reordering, rich previews, PDF support and public search.
4. Side-by-side release comparison, explicit reuse licences and fork provenance UI.
5. Extend structured projects/modules into typed, validated and optionally executable protocols with controlled external integrations.
6. Formal admissions and payments; billing must remain independent of editorial selection.

## Hosting and current status

The application lives in `PARC-Labs/Base`, separate from Applied State. It can be served as a static site. The repository includes a GitHub Actions Pages deployment workflow and supports repository-subpath URLs, so Vercel is not required.

GitHub Pages is enabled at `https://parc-labs.github.io/Base/`. The repository is **public**, so never commit API secrets or real membership email addresses. Working data now persists in the separate Base Supabase project, subject to membership checks and RLS. When no Supabase configuration is provided, local single-browser preview remains available.

The Supabase schema and `supabase/migrations/20261030_base_native_media.sql` are installed in Base's dedicated free project (`niotfttsjntivmpizrnc`), and the public publishable key is in `src/config.js`. The preapproved-email trigger is installed in a private schema. Test row-level security and three-account access isolation before admitting any real users. No new paid infrastructure should be provisioned without account owner approval.

## Repository

[PARC-Labs/Base](https://github.com/PARC-Labs/Base) — standalone codebase, independent of the institutional website.
