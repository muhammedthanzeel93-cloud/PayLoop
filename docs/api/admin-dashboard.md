# Admin Dashboard Overview API Documentation (Day 17)

This document specifies the **Admin Dashboard Overview API** (`GET /api/v1/admin/dashboard/overview`) for the Kerala Tourism modular monolith.

> [!NOTE]
> **Backward Compatibility**: The Day 10 KPI route `GET /api/v1/admin/dashboard` (requiring `ADMIN_PERMISSIONS.VIEW_ANALYTICS`) remains preserved intact alongside the new operational overview endpoint `GET /api/v1/admin/dashboard/overview`.

---

## 1. Architecture & Canonical Module Placement

- **Constants**: [`ADMIN_PERMISSIONS.VIEW_DASHBOARD`](file:///c:/Users/aysha/Downloads/New%20folder/packages/constants/src/index.ts)
- **Shared Types**: [`AdminDashboardOverviewDto`](file:///c:/Users/aysha/Downloads/New%20folder/packages/shared-types/src/index.ts)
- **Repository Aggregations**: [`admin.repository.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/admin/admin.repository.ts) (`getDashboardOverviewAggregates`)
- **Service**: [`admin.service.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/admin/admin.service.ts) (`getDashboardOverview`)
- **Controller & Routing**: [`admin.controller.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/admin/admin.controller.ts), mounted under `/api/v1/admin` in [`admin.routes.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/authorization/admin.routes.ts)

---

## 2. Endpoint Contract

### `GET /api/v1/admin/dashboard/overview`

Returns operational summary counts calculated across platform MongoDB collections via parallel single-pass `$group` aggregation pipelines.

#### Middleware & Access Control Chain
1. `authenticate` — Validates bearer JWT access token (`401 AUTHENTICATION_REQUIRED` / `INVALID_TOKEN` / `TOKEN_EXPIRED`) and checks live account status.
2. `requireActiveAccount` — Explicitly rejects `SUSPENDED` (`403 ACCOUNT_SUSPENDED`) and `DEACTIVATED` (`403 ACCOUNT_DEACTIVATED`) callers.
3. `requireAccountType('ADMIN')` — Restricts access exclusively to `ADMIN` accounts (`403 FORBIDDEN_ACCOUNT_TYPE`).
4. `requirePermission('VIEW_DASHBOARD')` — Verifies against database [`AdminProfileModel`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/users/models/adminProfile.model.ts) that the acting admin possesses `VIEW_DASHBOARD` (`403 INSUFFICIENT_PERMISSIONS`). Never trusts client-supplied permissions or headers.

#### Success Response (`200 OK`)

```json
{
  "success": true,
  "message": "Admin dashboard overview retrieved successfully",
  "data": {
    "users": {
      "total": 124,
      "tourists": 100,
      "businesses": 18,
      "admins": 6,
      "active": 119,
      "suspended": 3
    },
    "destinations": {
      "total": 42,
      "verified": 35,
      "pending": 5,
      "published": 30
    },
    "social": {
      "totalPosts": 310,
      "pendingPosts": 12,
      "publishedPosts": 295
    },
    "businessVerification": {
      "pending": 7,
      "verified": 10,
      "rejected": 1
    }
  }
}
```

#### Metric Calculation Semantics & Edge Cases
- **Users (`accounts`)**: `total` counts all `Account` documents (including `DEACTIVATED` accounts, so `total >= active + suspended`). `tourists`, `businesses`, and `admins` partition `total` by `accountType`.
- **Destinations (`destinations`)**: `verified` and `pending` reflect `verificationStatus` (`VERIFIED`, `PENDING`; rejected destinations are included in `total`), whereas `published` reflects `publicationStatus === 'PUBLISHED'`.
- **Social (`posts`)**: Matches non-soft-deleted posts (`$match: { deletedAt: null }`) so soft-deleted `REMOVED` posts do not inflate `totalPosts`; `pendingPosts` counts `status === 'PENDING'`, and `publishedPosts` counts `status === 'PUBLISHED'`.
- **Business Verification (`businessprofiles`)**: `pending`, `verified`, and `rejected` reflect `verificationStatus === 'PENDING' | 'VERIFIED' | 'REJECTED'` (`UNDER_REVIEW` profiles are excluded from `pending` unless explicitly promoted/updated).
- **Empty / Missing Collections**: Aggregation pipelines return `[]` on empty or uninitialized collections and default cleanly to `0` across every field without throwing errors.
- **No Unbacked Metrics**: Metrics outside existing active schemas (e.g., future-day bookings/revenues) are excluded rather than fabricated.

---

## 3. Database Aggregation Strategy

Four concurrent single-pass MongoDB `$group` aggregations run via `Promise.all` inside MongoDB WiredTiger without loading collection documents into Node.js memory:
- `AccountModel.aggregate([{ $group: ... }, { $project: { _id: 0 } }])`
- `DestinationModel.aggregate([{ $group: ... }, { $project: { _id: 0 } }])`
- `PostModel.aggregate([{ $match: { deletedAt: null } }, { $group: ... }, { $project: { _id: 0 } }])`
- `BusinessProfileModel.aggregate([{ $group: ... }, { $project: { _id: 0 } }])` (utilizes `{ verificationStatus: 1 }`)

---

## 4. Error Responses

| HTTP Status | Error Code | Cause |
|---|---|---|
| `401 Unauthorized` | `AUTHENTICATION_REQUIRED` / `INVALID_TOKEN` / `TOKEN_EXPIRED` | Missing, malformed, or expired Bearer JWT |
| `403 Forbidden` | `ACCOUNT_SUSPENDED` / `ACCOUNT_DEACTIVATED` | Acting admin account is not `ACTIVE` |
| `403 Forbidden` | `FORBIDDEN_ACCOUNT_TYPE` | Caller is a `TOURIST` or `BUSINESS` account |
| `403 Forbidden` | `INSUFFICIENT_PERMISSIONS` | Admin lacks `VIEW_DASHBOARD` permission |
| `500 Internal Server Error` | `DASHBOARD_OVERVIEW_ERROR` | Safe sanitized error if database aggregation fails (raw Mongo errors are never exposed) |

---

## 5. Manual Testing Example (`curl`)

```bash
curl -X GET "http://localhost:5000/api/v1/admin/dashboard/overview" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN_WITH_VIEW_DASHBOARD>" \
  -H "Accept: application/json"
```
