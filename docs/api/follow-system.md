# Follow & Unfollow System API Documentation (Day 15)

This document specifies the **Follow & Unfollow System** (`Follow` social graph collection, denormalized `TouristProfile` follow counters, REST endpoints, MongoDB ACID transaction policy, and security protections) for the Kerala Tourism backend modular monolith.

> [!NOTE]
> **Scope Boundary (Day 15)**: Covers tourist-to-tourist follow/unfollow mutations, public paginated followers/following lists, atomic denormalized counters (`followersCount`, `followingCount`) on `TouristProfile`, and anti-enumeration / concurrency protections. Following-based feeds, bookmarks, direct messaging, trending hashtags, notifications, and per-user privacy toggles are excluded.

---

## 1. Architecture & Canonical Module Placement

Follow workflows extend [`server/src/modules/users/`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/users/index.ts) and mount under `/api/v1/tourist/users` and `/api/v1/users`:

- **Models**: [`FollowModel`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/users/follow.model.ts) (`follows` collection) and counter fields on [`TouristProfileModel`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/users/models/touristProfile.model.ts)
- **Validation**: [`follow.validation.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/users/follow.validation.ts) (strict `.strict()` Zod schemas)
- **Repository**: [`follow.repository.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/users/follow.repository.ts) (MongoDB multi-document transaction runner with bounded `TransientTransactionError` / `WriteConflict` retries, mandatory transaction enforcement in production, non-negative counter guards, and `$lookup` + `$facet` active-tourist aggregation)
- **Service**: [`follow.service.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/users/follow.service.ts) (`followUser`, `unfollowUser`, `listFollowers`, `listFollowing`, and forward-compatible `assertCanViewFollowConnections` privacy hook)
- **Controller & Routes**: [`follow.controller.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/users/follow.controller.ts), [`users.routes.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/users/users.routes.ts), and [`tourist.routes.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/authorization/tourist.routes.ts)

---

## 2. Database Models & Indexes

### 2.1 `TouristProfile` Counter Additions (`touristProfiles`)
Added non-negative integer counter fields to `TouristProfileModel`:
- `followersCount`: `Number` (default `0`, `min: 0`, required)
- `followingCount`: `Number` (default `0`, `min: 0`, required)

`AccountModel` remains clean as the polymorphic identity core for `TOURIST`, `BUSINESS`, and `ADMIN` accounts. Updated counters are exposed safely through `authService.getMe` and follow mutation responses, while `updateTouristProfileSchema` `.strict()` rejects client attempts to modify counters directly.

### 2.2 `Follow` (`follows` collection)
| Field | Type | Constraints / Notes |
|---|---|---|
| `_id` | `ObjectId` | Auto-generated |
| `followerId` | `ObjectId` | Required, Immutable, Ref `Account` (derived strictly from `req.user.id`) |
| `followingId` | `ObjectId` | Required, Immutable, Ref `Account` (must identify an `ACTIVE` `TOURIST` account; `followerId !== followingId`) |
| `createdAt` | `Date` | Mongoose creation timestamp (`immutable: true`) |

- **Schema Guard**: Pre-validate hook rejects self-follow edges (`followerId.equals(followingId)`).
- **Indexes**:
  - `idx_follows_unique`: `{ followerId: 1, followingId: 1 }` (`unique: true`) — enforces uniqueness of each follow pair even under parallel writes.
  - `idx_follows_followers`: `{ followingId: 1, createdAt: -1, _id: -1 }` — newest-first deterministic follower pagination.
  - `idx_follows_following`: `{ followerId: 1, createdAt: -1, _id: -1 }` — newest-first deterministic following pagination.

---

## 3. Atomic Transactions, Concurrency & Production Policy

1. **Multi-Document Transactions**: `followUser` and `unfollowUser` execute inside `FollowRepository.withTransaction(...)`:
   - `followUser`: validates active `TOURIST` target, inserts `FollowModel` doc, and atomically `$inc`s caller `followingCount: +1` and target `followersCount: +1` in the same session. If any write throws before commit, MongoDB aborts the transaction so zero partial state persists.
   - `unfollowUser`: deletes the caller's edge via `findOneAndDelete({ followerId: principal.id, followingId: targetUserId })` and atomically decrements `followingCount` / `followersCount` using `{ [field]: { $gt: 0 } }` non-negative guards.
2. **Duplicate & `WriteConflict` Handling**:
   - Duplicate follow creation maps MongoDB `E11000` (`idx_follows_unique`) to `409 ConflictError`.
   - `TransientTransactionError` / `WriteConflict` (code `112`) triggers up to `8` jittered retries (`10–35 ms`).
3. **Strict Production Enforcement**:
   - When `NODE_ENV === 'production'`, non-replica-set standalone topologies fail loudly with `500 InternalServerError` (`Atomic follow operations require a MongoDB replica set transaction topology`). Silent fallback with compensating delete only runs in non-production local/dev standalone setups.

---

## 4. Endpoints

### 4.1 `POST /api/v1/tourist/users/:userId/follow` — Follow a Tourist
- **Middleware**: `followRateLimiter`, `authenticate`, `requireActiveAccount`, `requireAccountType('TOURIST')`, `validateParams(userIdParamSchema)`, `validateBody(followActionBodySchema)`
- **Request Body**: Empty or `{}` (any extra field such as `followerId` or `followersCount` is rejected with `400 VALIDATION_ERROR`).
- **Response (`201 Created`)**:
```json
{
  "success": true,
  "message": "User followed successfully",
  "data": {
    "targetUserId": "66e04d3e89a4b2c1d8e1f099",
    "following": true,
    "followersCount": 1,
    "followingCount": 1,
    "follow": {
      "id": "66e04d3e89a4b2c1d8e1f120",
      "followerId": "66e04d3e89a4b2c1d8e1f001",
      "followingId": "66e04d3e89a4b2c1d8e1f099",
      "createdAt": "2026-11-11T10:00:00.000Z"
    }
  }
}
```

### 4.2 `DELETE /api/v1/tourist/users/:userId/follow` — Unfollow a Tourist
- **Middleware**: `followRateLimiter`, `authenticate`, `requireActiveAccount`, `requireAccountType('TOURIST')`, `validateParams(userIdParamSchema)`, `validateBody(followActionBodySchema)`
- **Behavior**: Deletes only the relationship where `followerId === req.user.id`. Allows unfollowing even if the followed target was subsequently suspended/deactivated so callers can clean up their own following count cleanly.
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "User unfollowed successfully",
  "data": {
    "targetUserId": "66e04d3e89a4b2c1d8e1f099",
    "following": false,
    "followersCount": 0,
    "followingCount": 0
  }
}
```

### 4.3 `GET /api/v1/users/:userId/followers` — List Tourist Followers
- **Access**: Public (conceals nonexistent, `BUSINESS`, `ADMIN`, `SUSPENDED`, or `DEACTIVATED` target accounts with uniform `404 RESOURCE_NOT_FOUND`).
- **Middleware**: `validateParams(userIdParamSchema)`, `validateQuery(followListQuerySchema)`
- **Query (`followListQuerySchema.strict()`)**:
  - `page`: integer `>= 1`, default `1`
  - `limit`: integer `1..50`, default `20`
- **Aggregation & Projection**: Matches `{ followingId: targetUserId }`, sorts `{ createdAt: -1, _id: -1 }`, filters counterparts against active `TOURIST` accounts **before** `$facet` count/pagination, joins `touristProfiles`, and projects only safe public fields (`id`, `firstName`, `lastName`, `displayName`, `profileImage`, `bio`, `followedAt`). Never leaks `email`, `passwordHash`, `status`, or `accountType`.
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "66e04d3e89a4b2c1d8e1f001",
      "firstName": "Arjun",
      "lastName": "Nair",
      "displayName": "Arjun Nair",
      "profileImage": "https://cdn.example.com/arjun.jpg",
      "bio": "Explorer from Kochi",
      "followedAt": "2026-11-11T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 4.4 `GET /api/v1/users/:userId/following` — List Accounts Followed by Tourist
- **Access & Query**: Same validation, anti-enumeration rules, newest-first ordering (`createdAt DESC`, `_id DESC`), active-tourist filtering, and public DTO projection as `/followers`.

---

## 5. Security Controls & Error Responses

- **Identity Derivation**: `followerId` is always taken from `req.user.id` after DB-backed `authenticate` and `verifyActiveTouristAccount`.
- **Anti-Enumeration**: Targeting nonexistent IDs, `BUSINESS` accounts, `ADMIN` accounts, `SUSPENDED` tourists, or `DEACTIVATED` tourists returns an identical `404 RESOURCE_NOT_FOUND` (`"User not found"`).
- **Rate Limiting**: `followRateLimiter` limits write operations (`POST` and `DELETE`) to `60` requests per `15`-minute window (`429 TOO_MANY_REQUESTS`).

| HTTP Status | Error Code | Condition |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Malformed `:userId`, self-follow attempt (`caller === target`), extra body/query fields, invalid `page`/`limit` |
| `401` | `AUTHENTICATION_REQUIRED` | Missing or invalid bearer access token |
| `403` | `FORBIDDEN_ACCOUNT_TYPE` | Non-tourist (`BUSINESS`/`ADMIN`) caller accessing `/api/v1/tourist/users/:userId/follow` |
| `403` | `ACCOUNT_SUSPENDED` / `ACCOUNT_DEACTIVATED` | Non-active caller account |
| `404` | `RESOURCE_NOT_FOUND` | Missing/ineligible target user, or unfollowing a user not currently followed |
| `409` | `CONFLICT` | Duplicate follow (`You are already following this user`) |
| `429` | `TOO_MANY_REQUESTS` | Exceeded follow/unfollow write rate limit |
| `500` | `INTERNAL_SERVER_ERROR` | Non-replica-set topology detected in `NODE_ENV=production` |

---

## 6. Verification Scope

- **Unit & API Suite** (`server/src/tests/follow-system.test.ts`): Uses in-memory repositories and schema/mock checks for fast HTTP routing, validation, RBAC, anti-enumeration, rollback, production topology guard, and rate-limit testing.
- **Replica Set Integration Suite** (`server/src/tests/follow-replica.integration.test.ts`): Spawns a real single-node MongoDB `8.2.x` replica set (`mongod --replSet rs0`) to verify live `E11000` unique index enforcement, parallel `WriteConflict` retries, multi-document transaction aborts, and `$lookup` + `$facet` aggregation accuracy.
