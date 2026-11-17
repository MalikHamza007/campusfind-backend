# Assumptions & decisions

Built from the scenario plus `CampusFind_Build_Spec.md`. Where something was unspecified, this is what was chosen.

1. **University:** "Green Valley State University" (configurable `UNIVERSITY_NAME`), email domain `campusfind.edu.pk` (`ALLOWED_EMAIL_DOMAINS`), campus in Lahore with bounds `31.49,74.30 → 31.55,74.40` (`CAMPUS_BOUNDS`) and 8 landmarks from the spec.
2. **Storage:** the scenario says "cloud storage"; the fixed stack requires the owner's VPS, so files live in a **private bucket-style store** on the VPS (`LocalBucketProvider`), with an S3-compatible driver ready (`STORAGE_DRIVER=s3`).
3. **Students upload their own files** (needed for item photos and claim evidence) — the write-up wins over the generic "admin-only upload" default. Admin-only: listing everyone's files and deleting other people's files.
4. **Two "link" endpoints:** `POST /files/:id/link` attaches a file to an entity (as in the spec); 60-second view links come from `POST /files/:id/signed-url`.
5. **One approved claim per item:** approving a claim automatically rejects competing pending claims on the same found item (note shown to those students). A partial unique index also rejects a concurrent second approval.
6. **Claims are student-only** (spec: admins review, not claim). Admins may still report items (e.g. items handed in at the office).
7. **ID-card privacy:** digit runs of 7+ characters in ID-card reports are masked (`•••••671`) for everyone except the reporter and admins.
8. **Reporter privacy:** other students only see the reporter's first name + initial and department; admins see email and student ID.
9. **Search:** case-insensitive substring search across title, description, brand, location, color and item code (more forgiving than Mongo `$text` while typing). The text index from the spec is still created.
10. **Audit seed:** 55 entries — the 26 most recent item reports plus all claim, review, return, withdrawal and profile events.
11. **Local development without Mongo:** `MONGODB_URI=memory` starts an in-memory replica set and auto-seeds (data resets on restart). Production uses Atlas (transactions need a replica set).
12. **Refresh cookie** is `SameSite=Lax` — `vspark.learn2earntech.com` and `api.vspark.learn2earntech.com` are same-site.
13. **PrimeNG 21 + Angular 21:** PrimeNG 22 shows an "Invalid PrimeUI License" banner without a paid key, so the newest MIT-licensed pairing was used.
14. **PDF preview** uses pdf.js (lazy-loaded) so it renders inside the app in every browser, not only those with a PDF plugin.
15. Out of scope per spec: email/OTP verification, notifications, chat, AI matching, payments, native apps.
16. **Three roles, derived from how a campus lost & found actually runs** (the spec named only student/admin): `student`; `admin` shown as **Staff** (Lost & Found Office / Campus Security, who pick up and process claims); `super_admin` (system owner who manages staff, roles and claim assignment). Kept the `admin` value so existing production accounts keep working; `seed:admin` promotes `ADMIN_EMAIL` to super admin.
17. **Claim handling is visible:** staff pick up a pending claim (`assignedTo`), and the student sees the handler's name and office on their claim. Contact details stay private.
