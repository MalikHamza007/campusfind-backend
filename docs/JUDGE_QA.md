# Demo script & judge Q&A

## 2-minute walkthrough (the scenario's expected demo)
1. **Sign in as a student** (`ali.raza@campusfind.edu.pk`) → dashboard: hero with live campus map, KPI tiles, charts (click a bar → filtered directory).
2. **Report lost item** → "Casio FX-991EX Calculator", category Calculator, upload a photo (goes to the private bucket, preview renders back through a 60 s link), search "IT Lab" in the map picker (Nominatim + landmarks) → submit → code `CF-L-10xx`.
3. **Another student reports the found calculator** (`hamza.saeed@…`) with a photo and the same location → `CF-F-20xx`.
4. Back as Ali: open the found item → **"This is mine — claim it"**, link the lost report, write evidence, attach a PDF receipt → claim is *Pending review*, item becomes *Claim pending*.
5. **Sign in as admin** → dashboard queue → **Review**: finder's report, owner's lost report (same location/category checks), evidence PDF rendered inside the app → **Approve** (items → *Matched*) → **Mark returned** (claim, found and lost items → *Returned*; audit entries written).
6. Show **Activity audit** and **System health** (DB, bucket usage, Nominatim live/cached counts).

## Likely questions
1. **Where are files stored and why is that "cloud storage"?** A private bucket-style object store on our VPS (`/var/lib/campusfind/storage`, mode 0700, outside the web root) behind a `StorageProvider` interface; switching to S3/R2/MinIO is `STORAGE_DRIVER=s3`. Files are only served by the API through HMAC-signed links that expire after 60 seconds.
2. **What stops someone uploading a script or a renamed .exe?** Auth and rate limit run before parsing; we sniff magic bytes, require the extension to match the real type, reject SVG/HTML/scripts/double extensions, enforce per-purpose size limits, store under random keys, and stream with `nosniff` + sandbox CSP. Tests cover 401/415/413/429 and path traversal.
3. **How do you prevent two admins approving different owners at the same time?** Approvals run in a MongoDB transaction with an optimistic `version` check, and a partial unique index allows only one `approved` claim per found item. The race test proves one 200 and one 409.
4. **How does session restore work without storing tokens in localStorage?** The access token is kept in memory; on page load the app calls `/auth/refresh`, which reads the HttpOnly refresh cookie, rotates it, and returns a new access token. Reusing an old refresh token revokes every session for that user.
5. **Which external API, and what if it's down?** OpenStreetMap Nominatim via our proxy (search + reverse geocoding) with a 1 req/s throttle, timeout, Mongo TTL cache, stale-cache fallback, and campus landmarks as the final fallback; the UI shows a warning instead of failing.
6. **How are roles enforced?** Twice: Angular guards/permission map hide routes and buttons; the server checks `requireAuth`, `requireRole` and object ownership on every route (students get 404 for other people's claims/files). Registration can't set a role; the first admin comes from `npm run seed:admin`.
7. **Can a student delete a report someone has claimed?** No — delete/edit is blocked while a pending/approved claim exists, returned records are immutable, and deletes are soft so admins keep an audit trail (and can restore).
8. **How is personal data protected in public listings?** Reporter contact details are hidden from other students (first name + initial only), ID numbers on ID-card reports are masked, evidence files are private to the claimant and admins, and every privileged action is in the append-only audit log.
