# CampusFind API contract

Base URL: `http://localhost:3000/api` (local) · `https://api.vspark.learn2earntech.com/api` (production).
All bodies are JSON unless noted. Authenticated calls send `Authorization: Bearer <accessToken>`.
The refresh token is an `HttpOnly; SameSite=Lax; Path=/api/auth` cookie named `cf_rt` (Secure in production) — the browser sends it with `withCredentials`.

## Error envelope
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Some fields are invalid", "details": [{ "field": "title", "message": "Title must be at least 3 characters" }] } }
```
| HTTP | code(s) |
|---|---|
| 400 | `BAD_REQUEST`, `INVALID_ID`, `INVALID_JSON`, `UPLOAD_ERROR` |
| 401 | `UNAUTHORIZED`, `TOKEN_INVALID`, `INVALID_CREDENTIALS`, `NO_SESSION`, `SESSION_REVOKED`, `SESSION_EXPIRED`, `ACCOUNT_INACTIVE` |
| 403 | `FORBIDDEN`, `CORS_FORBIDDEN`, `LINK_INVALID`, `ACCOUNT_INACTIVE` (login) |
| 404 | `NOT_FOUND`, `ROUTE_NOT_FOUND` (also used instead of 403 where existence must not leak) |
| 409 | `DUPLICATE`, `DUPLICATE_CLAIM`, `SELF_CLAIM`, `ITEM_NOT_CLAIMABLE`, `ACTIVE_CLAIM`, `ITEM_RETURNED`, `ITEM_CLAIMED`, `STALE_VERSION`, `INVALID_STATE`, `ALREADY_APPROVED`, `CLAIM_IMMUTABLE`, `FILE_IN_USE`, `LAST_ADMIN`, `SELF_LOCKOUT`, `LIMIT_REACHED` |
| 410 | `LINK_EXPIRED` (file link older than 60 s) |
| 413 | `FILE_TOO_LARGE`, `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_FILE` |
| 422 | `VALIDATION_ERROR`, `EMPTY_FILE` |
| 429 | `RATE_LIMITED` |

## Roles
Three roles, enforced by `requireRole` (super_admin inherits every `admin` route) plus per-object checks.

| Capability | student | admin (Lost & Found staff) | super_admin (system owner) |
|---|:-:|:-:|:-:|
| Lost/found reports | create; read all; edit/delete own (found: only while `open`) | full CRUD incl. deleted, close/reopen, restore | same as staff |
| Claims | create, read own, edit/withdraw own pending; **sees who is handling it** | read all, **pick up** (assign to self), approve, reject, mark returned, delete pending/rejected | same + **assign a claim to any staff member** |
| Files | upload, view allowed, delete own unused | view/delete all, list everyone's | same |
| Users | read/update own profile | list users; activate/deactivate **students** | change any role, activate/deactivate staff (never self, never the last active super admin) |
| Audit log | — | read | read |

Public registration always creates a `student`. The first super admin comes from `npm run seed:admin` (`ADMIN_EMAIL`/`ADMIN_PASSWORD`).

## Entities (Mongo collections)
`users`, `items`, `claims`, `files`, `refreshtokens`, `auditlogs`, `counters` (item codes), `geocaches` (Nominatim cache). Field lists: see `src/models/*.ts` (they follow the build spec §3 exactly, plus `items.code`, `items.geo` (2dsphere mirror), `claims.active` (backs the partial unique indexes) and `files.deletingAt` (delete tombstone)). Every record exposes `version` (Mongo `__v`) used for optimistic concurrency.

## Endpoints
### Health & config
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | public | `{status:"ok",db:"up"}` (503 when DB down) |
| GET | `/config` | public | university name, email domains, categories, campus bounds |

### Auth
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `fullName,email,studentId,department,phone?,password` (no `role` accepted) | 201 `{user}` |
| POST | `/auth/login` | `email,password` | `{accessToken,user}` + `cf_rt` cookie |
| POST | `/auth/refresh` | cookie | rotated `{accessToken,user}` + new cookie; replaying an old token revokes all sessions |
| POST | `/auth/logout` | cookie | revokes refresh token, clears cookie |
| GET | `/auth/me` | bearer | `{user}` |
| PATCH | `/auth/password` | `currentPassword,newPassword` | revokes all other sessions |

### Items
| Method | Path | Notes |
|---|---|---|
| GET | `/items` | query: `q,type,category,status,dateFrom,dateTo,location,near=lat,lng,radius,sort,page,limit(1-100)`, admin: `includeDeleted,reportedBy` → `{data,page,limit,total,totalPages}` |
| GET | `/items/mine` | same filters, own reports |
| POST | `/items` | `reportType,title,category,description,eventDate,locationName,coordinates{lat,lng},distinctiveFeatures?,color?,brand?,imageFileIds[]` → 201 `{item}` (status `open`, code `CF-L-1001`/`CF-F-2001`) |
| GET | `/items/:id` | `{item}` incl. `images[]` with fresh 60 s links |
| PATCH | `/items/:id` | editable fields + `version`; admin may set `status: open|closed` |
| DELETE | `/items/:id` | soft delete; 409 when an active/approved claim exists or returned |
| POST | `/items/:id/restore` | admin |

### Claims
| Method | Path | Notes |
|---|---|---|
| GET | `/claims` | student: own; admin: all; query `status,foundItemId,q,page,limit` |
| POST | `/claims` | student: `foundItemId,lostItemId?,ownershipEvidence(30-2000),evidenceFileIds[≤3]` → pending; found item → `claim_pending` |
| GET | `/claims/:id` | claimant/admin (404 for others) |
| PATCH | `/claims/:id` | claimant: evidence while pending; admin: `adminNote`; requires `version` |
| POST | `/claims/:id/withdraw` | claimant, pending only |
| POST | `/claims/:id/assign` | staff `{version, staffId?}` → sets `assignedTo` on a pending claim (self; only super_admin may name another staff member). `GET /claims?assigned=me|unassigned` filters the queue |
| POST | `/claims/:id/approve` | admin `{version,adminNote?}` → claim `approved`, items `matched`, competing pending claims auto-rejected (transaction) |
| POST | `/claims/:id/reject` | admin `{version,adminNote}` |
| POST | `/claims/:id/return` | admin `{version,adminNote?}` → claim + found + linked lost item `returned` |
| DELETE | `/claims/:id` | admin, pending/rejected only |

### Files (private bucket)
| Method | Path | Notes |
|---|---|---|
| POST | `/files` | multipart `file` + `purpose` (`item_image` ≤5 MB jpg/png/webp, `claim_evidence` ≤8 MB +pdf, `avatar` ≤2 MB) → 201 `{file}` with a 60 s `url` |
| GET | `/files` | own files; admin `all=true` |
| GET | `/files/:id` | metadata (authorised viewers only) |
| POST | `/files/:id/signed-url` | fresh `{url,expiresAt}` (60 s) |
| GET | `/files/:id/content?token=…[&download=1]` | streams the object; 401 no token, 403 tampered, 410 expired |
| POST | `/files/:id/link` | `{entityType: item|claim|user, entityId}` attach an uploaded file |
| DELETE | `/files/:id` | owner/admin, only when unreferenced |

### Users, map, dashboard, audit
| Method | Path | Notes |
|---|---|---|
| GET | `/users` | admin; `q,role,status,department,page,limit` |
| GET/PATCH | `/users/:id` | self or admin; only admin may send `role/status` |
| GET | `/map/config` | campus centre, bounds, landmarks |
| GET | `/map/search?q=` | landmarks + Nominatim results `{data,source:"live|cache|stale-cache|fallback",warning?}` |
| GET | `/map/reverse?lat=&lng=` | label for a clicked point |
| GET | `/dashboard/stats` | role-scoped KPIs/charts/tables; `dateFrom,dateTo,category,location,department,reportType,granularity=day|week` |
| GET | `/audit-logs` | admin; `action,entityType,actorId,dateFrom,dateTo,page,limit` |
