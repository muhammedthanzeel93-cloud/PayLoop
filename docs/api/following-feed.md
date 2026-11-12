# Following-Based Feed & Personalized Timeline API Documentation (Day 16)

This document specifies the **Following-Based Feed & Personalized Timeline** endpoint (`GET /api/v1/tourist/feed/following`), MongoDB aggregation pipeline, ESR partial compound index (`idx_following_feed`), Base64url keyset cursor pagination specification, and privacy/moderation filtering for the Kerala Tourism backend modular monolith.

> [!NOTE]
> **Scope Boundary (Day 16)**: Covers chronological personalized feed retrieval for authenticated active `TOURIST` accounts following other active `TOURIST` accounts. Bookmarks, direct messaging, trending hashtags, push notifications, algorithmic ranking, and future-day features are excluded. *(Note: `docs/api/` does not currently maintain a standalone index file; API specs are organized by domain alongside [`social-posts.md`](file:///c:/Users/aysha/Downloads/New%20folder/docs/api/social-posts.md), [`social-engagement.md`](file:///c:/Users/aysha/Downloads/New%20folder/docs/api/social-engagement.md), and [`follow-system.md`](file:///c:/Users/aysha/Downloads/New%20folder/docs/api/follow-system.md).)*

---

## 1. Architecture & Canonical Module Placement

The personalized feed reuses the Day 13–15 [`posts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/index.ts) and [`users`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/users/index.ts) modules without duplicating `PostModel` or `FollowModel`:

- **Constants**: [`POST_RULES`](file:///c:/Users/aysha/Downloads/New%20folder/packages/constants/src/index.ts) (`DEFAULT_FOLLOWING_FEED_LIMIT = 20`, `MAX_FEED_LIMIT = 50`, `MAX_CURSOR_LENGTH = 256`)
- **Shared Types**: [`CursorPaginationMeta`](file:///c:/Users/aysha/Downloads/New%20folder/packages/shared-types/src/index.ts), `PostDto`
- **Model & Index**: [`PostModel`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post.model.ts) (`idx_following_feed`) and [`FollowModel`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/users/follow.model.ts) (`idx_follows_unique` / `idx_follows_following`)
- **Validation & Cursor Codec**: [`post.validation.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post.validation.ts) (`followingFeedQuerySchema`, `encodeFollowingFeedCursor`, `decodeFollowingFeedCursor`)
- **Repository**: [`post.repository.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post.repository.ts) (`buildFollowingFeedPipeline`, `findFollowingFeed`)
- **Service**: [`post.service.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post.service.ts) (`getFollowingFeed`, `hydratePosts`)
- **Controller & Routing**: [`post.controller.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post.controller.ts), [`post.routes.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/posts/post.routes.ts) (`touristFeedRoutes`), mounted at `/api/v1/tourist/feed` via [`tourist.routes.ts`](file:///c:/Users/aysha/Downloads/New%20folder/server/src/modules/authorization/tourist.routes.ts)

---

## 2. Endpoint Specification

### `GET /api/v1/tourist/feed/following`

Returns a paginated chronological stream of eligible posts authored by active `TOURIST` accounts followed by the authenticated caller.

#### Middleware & Access Control Chain
1. `authenticate` — Validates signed JWT Bearer access token and derives `req.user` (`401 AUTHENTICATION_REQUIRED` / `INVALID_TOKEN` / `TOKEN_EXPIRED`).
2. `requireActiveAccount` — Confirms live account record is active (`403 ACCOUNT_SUSPENDED` / `ACCOUNT_DEACTIVATED`).
3. `requireAccountType(ACCOUNT_TYPES.TOURIST)` — Restricts feed access exclusively to tourist callers (`403 FORBIDDEN_ACCOUNT_TYPE` for `BUSINESS` / `ADMIN`).
4. `validateQuery(followingFeedQuerySchema)` — Strictly validates query params using `.strict()`.

#### Query Parameters
| Parameter | Type | Default | Constraints | Description |
|---|---|---|---|---|
| `limit` | integer | `20` (`DEFAULT_FOLLOWING_FEED_LIMIT`) | `1 <= limit <= 50` (`MAX_FEED_LIMIT`) | Number of posts to return per page |
| `cursor` | string | omitted | `<= 256` chars, URL-safe base64url (`/^[A-Za-z0-9_-]+$/`), canonical JSON `{ p, id }` | Keyset cursor returned by previous page's `pagination.nextCursor` |

> Client-supplied identity params (`accountId`, `userId`, `followerId`) or unknown params (`page`, `sort`, etc.) are rejected with `400 VALIDATION_ERROR` via Zod `.strict()`.

---

## 3. Visibility, Lifecycle & Account Filtering Matrix

A post appears in the caller's personalized following feed **if and only if ALL** of the following server-side guarantees hold:

| Dimension | Allowed in Following Feed | Excluded from Following Feed |
|---|---|---|
| **Relationship** | Active follow edge (`followerId === req.user.id`, `followingId !== req.user.id`) | Unfollowed users; caller's own posts (even if an anomalous self-edge exists) |
| **Author Account** | `accountType === 'TOURIST'` and `status === 'ACTIVE'` | `SUSPENDED`, `DEACTIVATED`, deleted, or non-tourist accounts |
| **Post Visibility** | `PUBLIC`, `FOLLOWERS` | `PRIVATE` |
| **Post Status** | `PUBLISHED` (with valid `Date` `publishedAt`) | `PENDING`, `REJECTED`, `REMOVED`, or missing/null `publishedAt` |
| **Soft Deletion** | `deletedAt === null` | Any post with non-null `deletedAt` |
| **Media Hydration** | `isModerated === true` and non-private/non-kyc `storageKey` | Unmoderated media (`isModerated !== true`), `private/*` or `kyc/*` keys; `storageKey` stripped from DTO |
| **Destination Hydration** | `verificationStatus === 'VERIFIED'` and `publicationStatus === 'PUBLISHED'` | Unverified, rejected, or draft destinations |

---

## 4. Base64url Keyset Cursor Format & Deterministic Tie-Breaking

Offset pagination (`skip`) degrades at scale and shifts rows when new posts arrive between page fetches. Day 16 uses stateless **keyset cursor pagination** ordered by:

```text
ORDER BY publishedAt DESC, _id DESC
```

### Cursor Payload Encoding
When `docs.length > limit`, `nextCursor` encodes the last post returned on the current page:

```json
{
  "p": "2026-10-12T10:00:00.000Z",
  "id": "671000000000000000000002"
}
```

- Encoded via `Buffer.from(JSON.stringify({ p: publishedAt.toISOString(), id }), 'utf8').toString('base64url')` (`encodeFollowingFeedCursor`).
- Decoded & strictly validated via `decodeFollowingFeedCursor`:
  - Must match `/^[A-Za-z0-9_-]+$/` (rejects `=`, whitespace, or corrupt base64url).
  - Decoded JSON must be a plain object with **exact two keys** `p` and `id` (`Array` and prototype-pollution payloads rejected).
  - `p` must be a valid canonical ISO-8601 UTC timestamp (`new Date(p).toISOString() === p`).
  - `id` must match strict 24-hex ObjectId (`Types.ObjectId.isValid(id) && new Types.ObjectId(id).toString() === id`).

### MongoDB Keyset Predicate (Tie-Breaker Safe)
For any decoded cursor `(cursorPublishedAt, cursorId)`, subsequent pages match strictly earlier items:

```js
{
  $or: [
    { publishedAt: { $lt: cursorPublishedAt } },
    { publishedAt: cursorPublishedAt, _id: { $lt: cursorId } }
  ]
}
```

Even when multiple followed authors publish at the exact same millisecond, `_id` descending breaks ties deterministically across page boundaries with **zero duplicates** and **zero skipped posts**.

---

## 5. Response Schema & Empty State

### `200 OK` (Populated Page with More Results)
```json
{
  "success": true,
  "data": [
    {
      "id": "671000000000000000000004",
      "authorId": "670f000000000000000000a2",
      "author": {
        "id": "670f000000000000000000a2",
        "firstName": "Aarav",
        "lastName": "Menon",
        "displayName": "Aarav Menon",
        "profileImage": "https://cdn.keralatourism.org/avatars/tourist.webp"
      },
      "content": "Sunrise bamboo rafting in Periyar Tiger Reserve.",
      "mediaIds": ["671000000000000000000099"],
      "media": [
        {
          "id": "671000000000000000000099",
          "url": "https://cdn.keralatourism.org/media/general/periyar.jpg",
          "mimeType": "image/jpeg",
          "fileSizeBytes": 180000
        }
      ],
      "destinationId": "671000000000000000000088",
      "destination": {
        "id": "671000000000000000000088",
        "name": "Munnar Tea Estates",
        "slug": "munnar-tea-estates",
        "district": "Alappuzha",
        "locality": "Devikulam",
        "primaryImage": "https://cdn.keralatourism.org/destinations/munnar.webp"
      },
      "visibility": "FOLLOWERS",
      "status": "PUBLISHED",
      "likesCount": 7,
      "commentsCount": 3,
      "repostsCount": 2,
      "publishedAt": "2026-10-12T10:00:00.000Z",
      "createdAt": "2026-10-12T10:00:00.000Z",
      "updatedAt": "2026-10-12T10:00:00.000Z"
    }
  ],
  "pagination": {
    "limit": 2,
    "hasMore": true,
    "nextCursor": "eyJwIjoiMjAyNi0xMC0xMlQxMDowMDowMC4wMDBaIiwiaWQiOiI2NzEwMDAwMDAwMDAwMDAwMDAwMDAwMDMifQ"
  }
}
```

### `200 OK` (Empty Follow List / Terminal Page)
When the tourist follows nobody, or reaches the terminal page (`hasMore === false`), `nextCursor` is omitted completely:
```json
{
  "success": true,
  "data": [],
  "pagination": {
    "limit": 20,
    "hasMore": false
  }
}
```

### Error Responses
| HTTP Status | Error Code | Trigger |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Malformed `cursor`, invalid `limit`, or injected/unknown query parameter |
| `401` | `AUTHENTICATION_REQUIRED` / `INVALID_TOKEN` / `TOKEN_EXPIRED` | Missing or invalid JWT Bearer token |
| `403` | `FORBIDDEN_ACCOUNT_TYPE` | Caller is `BUSINESS` or `ADMIN` |
| `403` | `ACCOUNT_SUSPENDED` / `ACCOUNT_DEACTIVATED` | Caller's account is suspended or deactivated |
| `500` | `INTERNAL_ERROR` | Unhandled server or database failure |

---

## 6. MongoDB Aggregation, Index Justification & Performance

1. **Bounded Single-Pipeline Query (`FollowModel.aggregate`)**:
   - Stage 1 (`$match`): `{ followerId: callerObjId, followingId: { $ne: callerObjId } }` uses an `IXSCAN` on `follows` (`idx_follows_unique` / `idx_follows_following`), avoiding loading unbounded followed ID arrays into Node memory.
   - Stage 2 (`$lookup` on `accounts`): Filters `accountType: 'TOURIST'` and `status: 'ACTIVE'` before querying posts.
   - Stage 3 (`$lookup` on `posts`): Runs per active followed author with `$match` + `$sort: { publishedAt: -1, _id: -1 }` + `$limit: limit + 1`, using partial ESR index `idx_following_feed`.
   - Stage 4: `$unwind` + `$replaceRoot` + global `$sort: { publishedAt: -1, _id: -1 }` + `$limit: limit + 1`.
2. **ESR Index Key Order & Write-Cost Trade-off (`idx_following_feed`)**:
   - Definition: `{ authorId: 1, status: 1, deletedAt: 1, publishedAt: -1, _id: -1, visibility: 1 }` with `partialFilterExpression: { status: 'PUBLISHED' }`.
   - Equality keys (`authorId`, `status`, `deletedAt`) narrow each followed author's slice immediately; sort keys (`publishedAt: -1, _id: -1`) precede range/set check `visibility: { $in: ['PUBLIC', 'FOLLOWERS'] }` so MongoDB executes an `IXSCAN` with zero blocking `SORT` stages and zero `COLLSCAN`s.
   - Scoping via `partialFilterExpression: { status: 'PUBLISHED' }` ensures draft/pending/rejected/removed post writes incur zero index overhead.
3. **Zero N+1 Batch Hydration**:
   - `PostsService.hydratePosts(items)` performs one parallel `Promise.all` batch across `TouristProfileModel` (safe projection only: `accountId`, `firstName`, `lastName`, `profileImage`), `MediaModel`, and `DestinationModel`, stripping all author PII (`email`, `passwordHash`, `status`) and internal `storageKey`s before serialization.
