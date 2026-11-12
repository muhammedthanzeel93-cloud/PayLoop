# Admin User Management & Audit Logging API Documentation (Day 17)

This document specifies the **Admin User Management** endpoints (`GET /api/v1/admin/users`, `GET /api/v1/admin/users/:userId`, `PATCH /api/v1/admin/users/:userId/suspend`, `PATCH /api/v1/admin/users/:userId/reactivate`), RBAC & privilege hierarchy rules, session revocation semantics, and immutable `AuditLog` behavior.

> [!NOTE]
> **Scope Boundary (Day 17)**: Account deletion is explicitly excluded. Only non-destructive operational directory browsing, account detail inspection, suspension, and reactivation are implemented.

---

## 1. Architecture & Canonical Module Placement

- **Constants**: [`ADMIN_PERMISSIONS`](file:///c:/Users/aysha/Downloads/New%20folder/packages/constants/src/index.ts), `SESSION_REVOCATION_REASONS.ADMIN_SUSPENSION`, `ADMIN_AUDIT_ACTIONS`, `ADMIN_USER_MANAGEMENT_RULES`
- **Validation**: [`adminUsersQuerySchema`](file:///c:/Users/aysha/Downloads/New%20folder/packages/validation/src/index.ts), `adminUserIdParamSchema`, `suspendUserSchema`, `reactivateUserSchema`
- **Models**: [`AccountModel`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/auth/models/account.model.ts), [`AuditLogModel`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/admin/audit-log.model.ts) (`auditLogs` collection)
- **Services & Repository**: [`admin.repository.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/admin/admin.repository.ts), [`admin.service.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/admin/admin.service.ts), [`audit-log.service.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/admin/audit-log.service.ts)
- **Routes**: Mounted under `/api/v1/admin` in [`admin.routes.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/authorization/admin.routes.ts)

---

## 2. Permission Matrix

Every endpoint enforces `authenticate` → `requireActiveAccount` → `requireAccountType('ADMIN')` → DB-backed permission verification:

| Endpoint | Required Permission(s) | Rate Limiter |
|---|---|---|
| `GET /api/v1/admin/users` | `VIEW_USERS` **or** `MANAGE_USERS` | Standard |
| `GET /api/v1/admin/users/:userId` | `VIEW_USERS` **or** `MANAGE_USERS` | Standard |
| `PATCH /api/v1/admin/users/:userId/suspend` | `SUSPEND_USERS` | `adminMutationRateLimiter` (30 req / 15m in prod/dev, 20 in test) |
| `PATCH /api/v1/admin/users/:userId/reactivate` | `MANAGE_USERS` | `adminMutationRateLimiter` (30 req / 15m in prod/dev, 20 in test) |

---

## 3. Endpoints

### A. List Users — `GET /api/v1/admin/users`

#### Query Parameters (Zod `.strict()`)
Unrecognized query parameters return `400 VALIDATION_ERROR`.

| Parameter | Type | Default | Constraints | Description |
|---|---|---|---|---|
| `page` | integer | `1` | `1..10000` | Page number |
| `limit` | integer | `20` | `1..50` | Page size |
| `search` | string | omitted | `1..100` chars, no null bytes | Matches exact 24-hex ObjectId (`_id`) OR escaped case-insensitive substring on `email` |
| `accountType` | enum | omitted | `TOURIST \| BUSINESS \| ADMIN` | Filter by split-identity type |
| `status` | enum | omitted | `ACTIVE \| SUSPENDED \| DEACTIVATED` | Filter by account status |
| `sortBy` | enum | `createdAt` | `createdAt` | Strictly allowlisted sort field |
| `sortOrder` | enum | `desc` | `asc \| desc` | Deterministic ordering (`{ createdAt, _id }`) |

#### Profile Hydration & Data Minimization
- `AdminRepository.findUsersPaginated` hydrates matching polymorphic profiles via at most **3 batched `$in` indexed queries** (`TouristProfileModel`, `BusinessProfileModel`, `AdminProfileModel`), eliminating N+1 queries.
- **Explicitly never selected or returned**: `passwordHash`, `refreshTokenHash`, `replacedByTokenHash`, `BusinessProfile.documents[].storageKey`, internal `__v`.

#### Example Response (`200 OK`)

```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": {
    "items": [
      {
        "id": "671000000000000000000010",
        "email": "traveler@example.com",
        "accountType": "TOURIST",
        "status": "ACTIVE",
        "emailVerifiedAt": null,
        "lastLoginAt": "2026-11-12T04:15:00.000Z",
        "createdAt": "2026-11-10T08:00:00.000Z",
        "updatedAt": "2026-11-12T04:15:00.000Z",
        "profile": {
          "id": "671000000000000000000011",
          "firstName": "Ananya",
          "lastName": "Nair",
          "preferredLanguage": "EN",
          "followersCount": 14,
          "followingCount": 8
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

### B. Get User Details — `GET /api/v1/admin/users/:userId`

#### Path Parameters
- `userId`: Strict 24-hex MongoDB ObjectId (`400 VALIDATION_ERROR` if malformed, `404 USER_NOT_FOUND` if nonexistent).

Returns account metadata (`id`, `email`, `accountType`, `status`, `emailVerifiedAt`, `lastLoginAt`, `createdAt`, `updatedAt`) and safe associated `profile` summary (`documentsCount` instead of private `documents[].storageKey` for `BUSINESS` accounts).

---

### C. Suspend User — `PATCH /api/v1/admin/users/:userId/suspend`

#### Request Body (Zod `.strict()`)
```json
{
  "reason": "Repeated spam reports violating community guidelines"
}
```
- `reason`: required string, trimmed, `3..500` characters. Extra/unknown fields are rejected (`400`).

#### Security & Transactional Behavior
1. **Self-Suspension Prevention**: Rejects `actorAdminId === targetUserId` with `403 SELF_SUSPENSION_FORBIDDEN`.
2. **Privilege Hierarchy Enforcement** (`SUPER_ADMIN` `3` > `DISTRICT_OFFICER` `2` > `MODERATOR` `1`):
   - Rejects targeting a strictly higher-ranking admin (`403 INSUFFICIENT_PRIVILEGE_LEVEL`).
   - Rejects targeting an equal-ranking peer for non-`SUPER_ADMIN` callers (`403 INSUFFICIENT_PRIVILEGE_LEVEL`).
   - Fail-closed if an `ADMIN` account lacks a verified `AdminProfile`.
3. **Atomic State Validation**: Uses `AccountModel.findOneAndUpdate({ _id, status: 'ACTIVE' }, { $set: { status: 'SUSPENDED' } })` inside a MongoDB ACID transaction. Suspensions against already `SUSPENDED` or `DEACTIVATED` accounts fail with `409 INVALID_STATUS_TRANSITION` (even under concurrent duplicate requests).
4. **Session Revocation**: Marks all active `SessionModel` records (`revokedAt: null`) for `targetUserId` with `revokedAt = now` and `revocationReason = 'ADMIN_SUSPENSION'`.
5. **Real-Time Blocking**: [`authenticate`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/middlewares/auth.middleware.ts) queries live account status on every request, immediately rejecting existing access tokens (`403 ACCOUNT_SUSPENDED`), while `authService.login` and `authService.refreshToken` also reject suspended accounts/revoked sessions.
6. **Immutable Audit Log**: Atomically writes a `USER_SUSPENDED` record in `auditLogs`.

---

### D. Reactivate User — `PATCH /api/v1/admin/users/:userId/reactivate`

#### Request Body (Zod `.strict()`)
```json
{
  "reason": "Identity appeal reviewed and verified"
}
```
- `reason`: optional string (`3..500` chars when provided; defaults to `"Account reactivated by administrator"` in the audit log if omitted).

#### Security & Transactional Behavior
1. **Same Self-Modification & Admin Privilege Hierarchy Guards**: Lower/equal non-`SUPER_ADMIN` admins cannot reactivate privileged admin accounts (`403 INSUFFICIENT_PRIVILEGE_LEVEL`).
2. **State Validation**: Transitions strictly `SUSPENDED -> ACTIVE`. Calling `/reactivate` on `ACTIVE` or `DEACTIVATED` accounts returns `409 INVALID_STATUS_TRANSITION`.
3. **No Silent Session Restoration**: Previously revoked `Session` records remain revoked (`revokedAt !== null`); old refresh tokens continue failing (`401 SESSION_REVOKED`), requiring fresh login.
4. **Historical Audit Preservation**: Appends a new `USER_REACTIVATED` record to `auditLogs` while leaving all prior audit entries untouched.

---

## 4. Audit Logging (`auditLogs`)

- **Recorded Fields**: `actorAccountId`, `actorAccountType`, `actorAdminLevel`, `action`, `targetEntityId`, `targetEntityType ('ACCOUNT')`, sanitized `reason`, `beforeState`, `afterState`, `ipAddress`, `userAgent`, `timestamp`.
- **Sensitive Data Redaction**: Passwords, hashes, JWTs, refresh tokens, headers/cookies, and `storageKey` values are actively stripped/never accepted into audit snapshots.
- **Immutability**: No edit/delete endpoints exist; Mongoose `pre` hooks block `updateOne`, `updateMany`, `findOneAndUpdate`, `deleteOne`, `deleteMany`, and `findOneAndDelete` operations on `AuditLogModel`.

---

## 5. Error Responses

| Status | Error Code | Scenario |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Malformed `:userId`, unknown body/query keys, invalid filters, missing/short `reason` |
| `401` | `AUTHENTICATION_REQUIRED` / `SESSION_REVOKED` | Unauthenticated request or revoked refresh session |
| `403` | `ACCOUNT_SUSPENDED` / `INSUFFICIENT_PERMISSIONS` / `SELF_SUSPENSION_FORBIDDEN` / `INSUFFICIENT_PRIVILEGE_LEVEL` | Caller suspended, lacks permission, targets self, or outranked by target admin |
| `404` | `USER_NOT_FOUND` | Nonexistent target `Account` ID |
| `409` | `INVALID_STATUS_TRANSITION` | Suspending non-`ACTIVE`, reactivating non-`SUSPENDED`, or concurrent transition loss |
| `429` | `TOO_MANY_REQUESTS` | Exceeded `adminMutationRateLimiter` threshold |

---

## 6. Manual Testing Examples (`curl`)

```bash
# 1. List suspended tourists sorted oldest first
curl -X GET "http://localhost:5000/api/v1/admin/users?accountType=TOURIST&status=SUSPENDED&sortOrder=asc&page=1&limit=10" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# 2. Search by email or exact ObjectId
curl -X GET "http://localhost:5000/api/v1/admin/users?search=traveler@example.com" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# 3. Get user details
curl -X GET "http://localhost:5000/api/v1/admin/users/671000000000000000000010" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# 4. Suspend user (requires SUSPEND_USERS)
curl -X PATCH "http://localhost:5000/api/v1/admin/users/671000000000000000000010/suspend" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Abusive automated requests detected"}'

# 5. Reactivate user (requires MANAGE_USERS)
curl -X PATCH "http://localhost:5000/api/v1/admin/users/671000000000000000000010/reactivate" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Appeal verified by district officer"}'
```
