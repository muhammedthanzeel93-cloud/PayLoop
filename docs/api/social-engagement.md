# Social Engagement System API Documentation (Day 14)

This document specifies the **Social Engagement System** (`PostLike`, `PostComment`, `PostRepost`, and post engagement counters) for the Kerala Tourism backend modular monolith.

> [!NOTE]
> **Scope Boundary (Day 14)**: Covers post likes/unlikes, flat post comments (create, paginated public list, author edit, author soft-delete), post reposts/unreposts, and atomic denormalized post counters (`likesCount`, `commentsCount`, `repostsCount`). Follow/unfollow, following feeds, bookmarks, nested comment replies, direct messaging, trending hashtags, and notifications are excluded.

---

## 1. Architecture & Canonical Module Placement

Engagement workflows extend [`server/src/modules/posts/`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/index.ts):
- **Models**: [`PostModel`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post.model.ts), [`PostLikeModel`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post-like.model.ts), [`PostCommentModel`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post-comment.model.ts), [`PostRepostModel`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post-repost.model.ts)
- **Validation**: [`post-engagement.validation.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post-engagement.validation.ts) (strict `.strict()` Zod schemas)
- **Repository**: [`post-engagement.repository.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post-engagement.repository.ts) (MongoDB ACID transaction runner with bounded `TransientTransactionError` / `WriteConflict` retries and non-negative counter guards)
- **Service**: [`post-engagement.service.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post-engagement.service.ts)
- **Controller & Routes**: [`post-engagement.controller.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post-engagement.controller.ts), [`post.routes.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post.routes.ts), mounted under `/api/v1/posts`, `/api/v1/tourist/posts`, and `/api/v1/tourist/comments`.

---

## 2. Database Models & Indexes

### 2.1 `Post` Counter Additions (`posts`)
Added non-negative integer counter fields to `PostModel`:
- `likesCount`: `Number` (default `0`, `min: 0`, required)
- `commentsCount`: `Number` (default `0`, `min: 0`, required)
- `repostsCount`: `Number` (default `0`, `min: 0`, required)

### 2.2 `PostLike` (`postLikes` collection)
| Field | Type | Constraints / Notes |
|---|---|---|
| `_id` | `ObjectId` | Auto-generated |
| `accountId` | `ObjectId` | Required, Immutable, Ref `Account` (derived strictly from `req.user.id`) |
| `postId` | `ObjectId` | Required, Immutable, Ref `Post` |
| `createdAt` | `Date` | Mongoose creation timestamp |

- **Indexes**:
  - `idx_post_likes_unique`: `{ accountId: 1, postId: 1 }` (`unique: true`) — enforces 1 like per account per post.
  - `idx_post_likes_by_post`: `{ postId: 1, createdAt: -1 }` — supports post-level lookups.

### 2.3 `PostComment` (`postComments` collection)
| Field | Type | Constraints / Notes |
|---|---|---|
| `_id` | `ObjectId` | Auto-generated |
| `postId` | `ObjectId` | Required, Immutable, Ref `Post` |
| `authorId` | `ObjectId` | Required, Immutable, Ref `Account` (derived strictly from `req.user.id`) |
| `content` | `String` | Required, trimmed, `1–1000` chars |
| `status` | `String` | `ACTIVE \| REMOVED`, default `ACTIVE` |
| `deletedAt` | `Date \| null` | Default `null` (set on soft deletion) |
| `createdAt`, `updatedAt` | `Date` | Mongoose timestamps |

- **Indexes**:
  - `idx_post_comments_public`: `{ postId: 1, status: 1, deletedAt: 1, createdAt: -1, _id: -1 }` (`partialFilterExpression: { status: 'ACTIVE' }`) — ESR index for newest-first public comment pagination excluding soft-deleted records.
  - `idx_author_comments`: `{ authorId: 1, status: 1, deletedAt: 1, createdAt: -1 }` — supports author comment queries and ownership checks.

### 2.4 `PostRepost` (`postReposts` collection)
| Field | Type | Constraints / Notes |
|---|---|---|
| `_id` | `ObjectId` | Auto-generated |
| `accountId` | `ObjectId` | Required, Immutable, Ref `Account` |
| `originalPostId` | `ObjectId` | Required, Immutable, Ref `Post` |
| `createdAt` | `Date` | Mongoose creation timestamp |

- **Indexes**:
  - `idx_post_reposts_unique`: `{ accountId: 1, originalPostId: 1 }` (`unique: true`) — prevents duplicate reposts.
  - `idx_post_reposts_by_post`: `{ originalPostId: 1, createdAt: -1 }` — post-scoped repost lookup.
- Original post content and media are **never** duplicated into `postReposts`.

---

## 3. Engagement-Count Strategy & Trade-Offs

Day 14 maintains **denormalized atomic counters** (`likesCount`, `commentsCount`, `repostsCount`) on `PostModel`:
1. **Multi-Document ACID Transactions**: Every like/unlike, comment add/delete, and repost/unrepost wraps the engagement record change and the post `$inc` update inside `PostEngagementRepository.withTransaction`.
2. **Duplicate & Retry Safety**:
   - Unique compound indexes (`idx_post_likes_unique`, `idx_post_reposts_unique`) reject duplicate inserts (`409 Conflict`), aborting the transaction before committing any `$inc`.
   - Transient WiredTiger write conflicts (`code: 112` / `TransientTransactionError`) automatically retry up to `8` attempts so concurrent distinct users never lose counter increments.
   - In non-replica-set fallback topologies, the engagement record is written first and a compensating deletion executes if `$inc` throws.
3. **Non-Negative Counter Guards**:
   - Decrements execute **only after** `findOneAndDelete` (likes/reposts) or `findOneAndUpdate({ status: 'ACTIVE', deletedAt: null })` (comments) confirms an active record existed and was removed/marked deleted.
   - `$inc: -1` queries include `{ [field]: { $gt: 0 } }` so counts can never become negative even under retries or concurrent `DELETE` races.
4. **Trade-Offs**: Fast $O(1)$ count reads on feed and detail queries (`GET /api/v1/posts`, `GET /api/v1/posts/:postId`) without runtime `$group` aggregations, in exchange for slight write-contention retry overhead on hot posts.

---

## 4. API Endpoints

### 4.1 `POST /api/v1/tourist/posts/:postId/likes` — Like a Post
- **Auth & Middleware**: `engagementRateLimiter`, `authenticate`, `requireActiveAccount`, `requireAccountType('TOURIST')`, `validateParams(postIdParamSchema)`
- **Response (`201 Created`)**:
```json
{
  "success": true,
  "message": "Post liked successfully",
  "data": {
    "postId": "66e04d3e89a4b2c1d8e1f099",
    "liked": true,
    "likesCount": 1,
    "like": {
      "id": "66e04d3e89a4b2c1d8e1f201",
      "accountId": "66e04d3e89a4b2c1d8e1f001",
      "postId": "66e04d3e89a4b2c1d8e1f099",
      "createdAt": "2026-11-11T06:20:00.000Z"
    }
  }
}
```

### 4.2 `DELETE /api/v1/tourist/posts/:postId/likes` — Unlike Own Like
- **Auth & Middleware**: `authenticate`, `requireActiveAccount`, `requireAccountType('TOURIST')`, `validateParams(postIdParamSchema)`
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Post unliked successfully",
  "data": {
    "postId": "66e04d3e89a4b2c1d8e1f099",
    "liked": false,
    "likesCount": 0
  }
}
```

### 4.3 `POST /api/v1/tourist/posts/:postId/comments` — Create Comment
- **Auth & Middleware**: `engagementRateLimiter`, `authenticate`, `requireActiveAccount`, `requireAccountType('TOURIST')`, `validateParams(postIdParamSchema)`, `validateBody(createCommentSchema)`
- **Request (`createCommentSchema.strict()`)**: `{ "content": "Best viewed at dawn before the ferry arrives." }`
- **Response (`201 Created`)**: Returns hydrated `PostCommentDto` (safe `author` summary, no PII) and `commentsCount`.

### 4.4 `GET /api/v1/posts/:postId/comments` — Public Paginated Comments
- **Access**: Public (conceals `PRIVATE`, `FOLLOWERS`, `PENDING`, `REJECTED`, and `REMOVED` posts with `404 RESOURCE_NOT_FOUND`).
- **Query (`postCommentsQuerySchema.strict()`)**: `page` (int $\ge 1$, default `1`), `limit` (int `1..50`, default `20`).
- **Sorting**: Chronological **newest-first** (`createdAt DESC`, `_id DESC`).
- **Response (`200 OK`)**: `{ "success": true, "data": PostCommentDto[], "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 } }`.

### 4.5 `PATCH /api/v1/tourist/comments/:commentId` — Edit Own Comment
- **Auth & Ownership**: Authenticated active `TOURIST` + `assertOwnership(comment.authorId, req.user.id, { concealWithNotFound: true })`.
- **Request (`updateCommentSchema.strict()`)**: `{ "content": "Updated commentary within 1000 chars." }`.

### 4.6 `DELETE /api/v1/tourist/comments/:commentId` — Soft-Delete Own Comment
- **Auth & Ownership**: Authenticated active `TOURIST` + `assertOwnership` (`404 RESOURCE_NOT_FOUND` concealment).
- **Behavior**: Sets `status = 'REMOVED'`, `deletedAt = new Date()`, decrements post `commentsCount` atomically inside transaction.

### 4.7 `POST /api/v1/tourist/posts/:postId/reposts` — Repost Post
- **Auth & Middleware**: `engagementRateLimiter`, `authenticate`, `requireActiveAccount`, `requireAccountType('TOURIST')`, `validateParams(postIdParamSchema)`
- **Response (`201 Created`)**: `{ "success": true, "message": "Post reposted successfully", "data": { "postId": "...", "reposted": true, "repostsCount": 1, "repost": { "id": "...", "accountId": "...", "originalPostId": "...", "createdAt": "..." } } }`.

### 4.8 `DELETE /api/v1/tourist/posts/:postId/reposts` — Remove Own Repost
- **Auth & Middleware**: `authenticate`, `requireActiveAccount`, `requireAccountType('TOURIST')`, `validateParams(postIdParamSchema)`
- **Response (`200 OK`)**: `{ "success": true, "message": "Post unreposted successfully", "data": { "postId": "...", "reposted": false, "repostsCount": 0 } }`.

---

## 5. Security Controls & Error Responses

- **Identity Derivation**: `accountId` / `authorId` is exclusively taken from `req.user.id`. Client-submitted `accountId`, `authorId`, `likesCount`, `commentsCount`, `repostsCount`, `status`, or `parentCommentId` fields are rejected via `.strict()` Zod schemas (`400 VALIDATION_ERROR`).
- **BOLA / IDOR Concealment**: Modifying/deleting another tourist's comment, unliking/unreposting a post the caller has not engaged with, or targeting missing, `REMOVED`, `REJECTED`, `PENDING`, `PRIVATE`, or `FOLLOWERS` posts returns `404 RESOURCE_NOT_FOUND`.
- **Rate Limiting**: `engagementRateLimiter` caps creation endpoints (`POST .../likes`, `.../comments`, `.../reposts`) at 60 requests per 15-minute window per IP (`429 TOO_MANY_REQUESTS`).

| HTTP Status | Code | Condition |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Malformed ObjectId, empty or `>1000`-char comment, extra body/query fields |
| `401` | `AUTHENTICATION_REQUIRED` | Missing or invalid bearer access token |
| `403` | `FORBIDDEN_ACCOUNT_TYPE` | Business or Admin account accessing `/api/v1/tourist/*` engagement endpoints |
| `403` | `ACCOUNT_SUSPENDED` / `ACCOUNT_DEACTIVATED` | Non-active authenticated account |
| `404` | `RESOURCE_NOT_FOUND` | Missing/removed comment, non-owned comment, or ineligible/non-public/removed post |
| `409` | `CONFLICT` | Duplicate like (`{ accountId, postId }`) or duplicate repost (`{ accountId, originalPostId }`) |
| `429` | `TOO_MANY_REQUESTS` | Exceeded engagement rate limit |
