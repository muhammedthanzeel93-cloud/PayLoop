# Admin Content Moderation API Documentation (Day 18)

This document specifies the centralized **Admin Content Moderation API** (`/api/v1/admin/moderation/*`) for the Kerala Tourism modular monolith.

> [!NOTE]
> **Day 11 Backward Compatibility**: Legacy Day 11 submission review routes (`GET /api/v1/admin/destination-submissions` and `PATCH /api/v1/admin/destination-submissions/:id/review`, gated by `VERIFY_DESTINATIONS`) remain preserved with idempotent `200 OK` retry behavior. Day 18 `/api/v1/admin/moderation/destinations/*` routes enforce `MODERATE_DESTINATIONS` and strict `PENDING`-only transitions (`409 INVALID_STATUS_TRANSITION` on duplicate or conflicting reviews).

---

## 1. Architecture & Module Placement

- **Constants**: [`ADMIN_PERMISSIONS`](file:///c:/Users/aysha/Downloads/New%20folder/packages/constants/src/index.ts), `MODERATION_CONTENT_TYPES`, `MODERATION_RULES`, `ADMIN_AUDIT_ACTIONS`
- **Validation**: [`packages/validation/src/index.ts`](file:///c:/Users/aysha/Downloads/New%20folder/packages/validation/src/index.ts) (strict `.strict()` Zod schemas)
- **Repository & Service**: [`moderation.repository.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/moderation/moderation.repository.ts), [`moderation.service.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/moderation/moderation.service.ts)
- **Controller & Routes**: [`moderation.controller.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/moderation/moderation.controller.ts), [`moderation.routes.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/moderation/moderation.routes.ts) mounted at `/api/v1/admin/moderation` via [`admin.routes.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/authorization/admin.routes.ts)

---

## 2. Permission Matrix

Every `/api/v1/admin/moderation/*` route enforces `authenticate` → `requireActiveAccount` → `requireAccountType('ADMIN')` → DB-backed `AdminProfileModel` permission validation:

| Endpoint | Method | Required Permission(s) | Rate Limiter |
|---|---|---|---|
| `/api/v1/admin/moderation/queue` | `GET` | `VIEW_MODERATION_QUEUE` | Standard |
| `/api/v1/admin/moderation/destinations` | `GET` | `VIEW_MODERATION_QUEUE` or `MODERATE_DESTINATIONS` | Standard |
| `/api/v1/admin/moderation/destinations/:submissionId/approve` | `PATCH` | `MODERATE_DESTINATIONS` | `moderationRateLimiter` |
| `/api/v1/admin/moderation/destinations/:submissionId/reject` | `PATCH` | `MODERATE_DESTINATIONS` | `moderationRateLimiter` |
| `/api/v1/admin/moderation/posts` | `GET` | `VIEW_MODERATION_QUEUE` or `MODERATE_POSTS` | Standard |
| `/api/v1/admin/moderation/posts/:postId/approve` | `PATCH` | `MODERATE_POSTS` | `moderationRateLimiter` |
| `/api/v1/admin/moderation/posts/:postId/reject` | `PATCH` | `MODERATE_POSTS` | `moderationRateLimiter` |
| `/api/v1/admin/moderation/posts/:postId/remove` | `PATCH` | `MODERATE_POSTS` | `moderationRateLimiter` |
| `/api/v1/admin/moderation/comments` | `GET` | `VIEW_MODERATION_QUEUE` or `MODERATE_COMMENTS` | Standard |
| `/api/v1/admin/moderation/comments/:commentId/remove` | `PATCH` | `MODERATE_COMMENTS` | `moderationRateLimiter` |
| `/api/v1/admin/moderation/comments/:commentId/restore` | `PATCH` | `MODERATE_COMMENTS` | `moderationRateLimiter` |
| `/api/v1/admin/moderation/reports` | `GET` | `VIEW_MODERATION_QUEUE` or `REVIEW_REPORTS` | Standard |
| `/api/v1/admin/moderation/reports/:reportId/review` | `PATCH` | `REVIEW_REPORTS` | `moderationRateLimiter` |

---

## 3. Centralized Moderation Queue (`GET /api/v1/admin/moderation/queue`)

### Supported Query Filters (`.strict()`)
- `contentType`: `DESTINATION | POST | COMMENT`
- `moderationStatus`: matches collection-valid statuses (`PENDING | APPROVED | REJECTED` for submissions, `PENDING | PUBLISHED | REJECTED | REMOVED` for posts, `ACTIVE | REMOVED` for comments)
- `submissionDate`, `submittedFrom`, `submittedTo`: ISO dates / `YYYY-MM-DD`
- `creatorAccountId`: 24-hex ObjectId
- `district`: one of the 14 `KERALA_DISTRICTS` (automatically scopes unfiltered queue queries to `DESTINATION`)
- `page` (default `1`), `limit` (`1..50`, default `20`)

### Heterogeneous Collection Pagination Strategy
Because `destinationSubmissions`, `posts`, and `postComments` define distinct status enums and only destination items carry `district`:
- When `contentType` (or `district`) is provided, MongoDB executes a single-collection indexed `.sort({ createdAt: -1, _id: -1 }).skip().limit()` query with exact `countDocuments`.
- When `contentType` is omitted (unified cross-collection triage), queries are strictly bounded by `page * limit <= 500` (`MODERATION_RULES.MAX_UNIFIED_QUEUE_WINDOW`) returning only eligible items: `PENDING` submissions, non-deleted `PENDING` or actively reported posts, and actively reported active comments. Unfiltered requests exceeding the `500`-item window return `400 VALIDATION_ERROR` directing the caller to scope by `contentType`.
- Creator hydration selects only `_id`, `accountType`, `status`, and display names — `email`, `passwordHash`, token hashes, and `storageKey` values are never queried or returned.

---

## 4. State Transitions & Workflows

### Destination Submissions
- `PENDING -> APPROVED` (`PATCH .../approve`): Atomically claims the `PENDING` submission inside a MongoDB ACID transaction, creates a new official `Destination` (`verificationStatus: 'VERIFIED'`, `publicationStatus: 'DRAFT'`) or updates a specified existing `Destination` without auto-publishing, preserves `DestinationSubmission.submittedLocation` untouched while allowing verified `location` / `district` / `address` overrides on `Destination`, and writes `DESTINATION_SUBMISSION_APPROVED` to `auditLogs`.
- `PENDING -> REJECTED` (`PATCH .../reject`): Requires `reviewNotes` (`3..1000` chars). Writes `DESTINATION_SUBMISSION_REJECTED` to `auditLogs`.
- Repeated or conflicting transitions on non-`PENDING` submissions return `409 INVALID_STATUS_TRANSITION`.

### Social Posts
- `PENDING -> PUBLISHED` (`PATCH .../approve`): Sets `status: 'PUBLISHED'` and `publishedAt` if unset; writes `POST_APPROVED`.
- `PENDING -> REJECTED` (`PATCH .../reject`): Requires `reason` (`3..500` chars); writes `POST_REJECTED`. Public and following feeds exclude `REJECTED` posts.
- `PUBLISHED -> REMOVED` (`PATCH .../remove`): Requires `reason` (`3..500` chars); sets `status: 'REMOVED'` and `deletedAt = now` without permanent deletion, removing the post immediately from public and following feeds; writes `POST_REMOVED`.

### Post Comments
- `ACTIVE -> REMOVED` (`PATCH .../remove`): Requires `reason` (`3..500` chars). Inside a MongoDB ACID transaction: sets `status: 'REMOVED'`, `deletedAt = now`, atomically decrements `PostModel.commentsCount` guarded by `{ commentsCount: { $gt: 0 } }` (preventing negative counts), and writes `COMMENT_REMOVED`. Duplicate removal returns `409 INVALID_STATUS_TRANSITION` without double-decrementing.
- `REMOVED -> ACTIVE` (`PATCH .../restore`): Optional `reason` (defaults to `'Comment restored by moderator'`). Verifies parent post still exists and is not `REMOVED` (`deletedAt === null`), restores comment visibility, increments `PostModel.commentsCount`, and writes `COMMENT_RESTORED`.

---

## 5. Manual Testing Examples (`curl`)

```bash
# 1. Unified Moderation Queue (requires VIEW_MODERATION_QUEUE)
curl -X GET "http://localhost:5000/api/v1/admin/moderation/queue?page=1&limit=20" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>"

# 2. Approve Destination Submission (creates VERIFIED/DRAFT official destination; requires MODERATE_DESTINATIONS)
curl -X PATCH "http://localhost:5000/api/v1/admin/moderation/destinations/671000000000000000000020/approve" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"district":"Idukki","reviewNotes":"Verified coordinates on field inspection"}'

# 3. Remove Violating Published Post (requires MODERATE_POSTS)
curl -X PATCH "http://localhost:5000/api/v1/admin/moderation/posts/671000000000000000000030/remove" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Promotes unauthorized entry into restricted reserve"}'

# 4. Remove Comment & Decrement Post Counter (requires MODERATE_COMMENTS)
curl -X PATCH "http://localhost:5000/api/v1/admin/moderation/comments/671000000000000000000040/remove" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Harassment targeting another traveler"}'
```
