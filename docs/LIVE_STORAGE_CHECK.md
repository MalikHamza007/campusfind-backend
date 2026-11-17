# Live private-storage check (local run, 2026-11-17T08:31Z)

Run against `npm run dev` (MONGODB_URI=memory, STORAGE_ROOT=./storage). Commands are in this file's history; results below are real output.

```
upload PDF as student                  -> id 6afc10f4e6b602999ae9f027
GET content (fresh 60s link)           -> 200 application/pdf
headers: X-Content-Type-Options: nosniff Content-Disposition: inline; filename="receipt.pdf"; filename*=UTF-8''receipt.pdf Cache-Control: no-store, private 
other student requests a link         -> 404
student lists ALL files (all=true)     -> returns only own: 4
no token upload                        -> 401
renamed exe as .png                    -> 415
tampered token                         -> 403
waiting 65s for link expiry...
GET same link after 65s                -> {"error":{"code":"LINK_EXPIRED","message":"This file link has expired — request a new one"}} 410
delete unused file                     -> 200
objects in bucket before/after delete  -> 150 / 149
.part leftovers                        -> 0
```

Note: the bucket count includes objects left by earlier in-memory dev restarts (fixed afterwards: `npm run seed` now clears the bucket on reset). The delete removed exactly one object.
