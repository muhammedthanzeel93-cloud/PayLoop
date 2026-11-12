# User Content Reports API Documentation (Day 18)

This document specifies the **Tourist Content Reporting** (`/api/v1/tourist/reports`) and **Admin Report Review** (`/api/v1/admin/moderation/reports`) workflows.

---

## 1. Tourist Reporting Endpoints (`/api/v1/tourist/reports`)

Requires `authenticate` → `requireActiveAccount` → `requireAccountType('TOURIST')`.

### `POST /api/v1/tourist/reports`
Protected by `reportRateLimiter` (`15` req / 15m in `test`, `20` req / 15m otherwise).

#### Request Body (`.strict()`)
- `targetType`: `DESTINATION | POST | COMMENT | ACCOUNT`
- `targetId`: 24-hex ObjectId
- `reason`: `SPAM | HARASSMENT | MISLEADING_INFORMATION | INAPPROPRIATE_CONTENT | FAKE_DESTINATION | FRAUD | OTHER`
- `description`: optional string (max `1000` chars); **mandatory** (`>= 5` chars) when `reason === 'OTHER'`.
- Client-supplied `reporterId`, `status`, or extra fields are rejected with `400 VALIDATION_ERROR`.

#### Behavior & Integrity Guarantees
- `reporterId` is derived strictly from `req.user.id`.
- Target existence is verified against the canonical collection (`404 RESOURCE_NOT_FOUND` if nonexistent or already deleted/removed).
- Self-reporting (targeting caller's own `ACCOUNT` ID or caller-authored `POST`/`COMMENT`) is rejected with `403 SELF_REPORT_FORBIDDEN`.
- Duplicate active reports (`PENDING` or `UNDER_REVIEW`) by the same reporter for the same `(targetType, targetId)` are blocked both in service logic and by MongoDB partial unique index `idx_reports_active_unique` (`409 DUPLICATE_ACTIVE_REPORT`). Historical `RESOLVED`/`DISMISSED` reports are preserved and do not block new reports after resolution.
- Submitting a report never automatically alters target content visibility or moderation status.

### `GET /api/v1/tourist/reports`
Returns paginated reports submitted by the authenticated caller (`reporterId === req.user.id`), filterable by `status` and `targetType`.

---

## 2. Admin Report Review Endpoints (`/api/v1/admin/moderation/reports`)

### `GET /api/v1/admin/moderation/reports`
Requires `VIEW_MODERATION_QUEUE` or `REVIEW_REPORTS`. Supports pagination (`page`, `limit`) and filters (`status`, `targetType`, `reason`), sorted FIFO (`{ createdAt: 1, _id: 1 }`) via `idx_reports_triage`.

### `PATCH /api/v1/admin/moderation/reports/:reportId/review`
Requires `REVIEW_REPORTS` and `moderationRateLimiter`.

#### Request Body (`.strict()`)
- `status`: `UNDER_REVIEW | RESOLVED | DISMISSED`
- `moderatorNotes`: optional for `UNDER_REVIEW`; **mandatory** (`3..1000` chars) for `RESOLVED` or `DISMISSED`.

#### Allowed State Machine
- `PENDING` → `UNDER_REVIEW`, `RESOLVED`, `DISMISSED`
- `UNDER_REVIEW` → `RESOLVED`, `DISMISSED`
- `RESOLVED` / `DISMISSED` → *(terminal; any transition returns `409 INVALID_STATUS_TRANSITION`)*

All state changes execute atomically inside a MongoDB ACID transaction paired with an immutable `AuditLog` (`REPORT_UNDER_REVIEW`, `REPORT_RESOLVED`, `REPORT_DISMISSED`).

---

## 3. Manual Testing Examples (`curl`)

```bash
# Submit a report as a Tourist
curl -X POST "http://localhost:5000/api/v1/tourist/reports" \
  -H "Authorization: Bearer <TOURIST_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"targetType":"POST","targetId":"671000000000000000000030","reason":"MISLEADING_INFORMATION","description":"Trail is closed for monsoon landslides"}'

# Review & resolve report as Admin with REVIEW_REPORTS permission
curl -X PATCH "http://localhost:5000/api/v1/admin/moderation/reports/671000000000000000000050/review" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"status":"RESOLVED","moderatorNotes":"Verified warning posted and post removed"}'
```
