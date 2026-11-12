# Production Indexing Strategy & Performance Engineering
**Kerala Tourism Ecosystem**  
**Database Engine:** MongoDB Atlas (WiredTiger Storage Engine)  
**Standard:** Strict Index Selectivity, Left-Prefix Compound Alignment, Partial & TTL Index Optimization  

---

## 1. Indexing Principles & Memory Footprint Rules

Every index in MongoDB incurs a RAM overhead in WiredTiger cache and a write latency penalty on inserts, updates, and deletes. To ensure high throughput and minimize index memory consumption:
1. **The ESR Rule (Equality, Sort, Range)**: All compound indexes are ordered with **Equality** fields first, **Sort** fields second, and **Range** fields last.
2. **Left-Prefix Utilization**: We avoid single-field indexes when an existing compound index already contains that field as its leftmost prefix.
3. **Partial Filter Indexes**: We apply `partialFilterExpression` on large collections to index only active, verified, or pending documents, reducing index size by up to **75%**.
4. **Automated TTL Eviction**: Expired sessions, temporary inventory locks, and stale device push tokens are cleaned up asynchronously using background TTL worker threads without manual cron jobs.

---

## 2. Complete Index Catalog Across All 51 Collections

### Domain 1: Authentication & Identity Management

| Collection | Index Keys | Type | Partial Filter / Options | Query Supported |
|---|---|---|---|---|
| `accounts` | `{ email: 1 }` | Unique, Sparse | `{ email: { $exists: true } }` | User login lookup via email |
| `accounts` | `{ phone: 1 }` | Unique, Sparse | `{ phone: { $exists: true } }` | Mobile OTP authentication & registration |
| `accounts` | `{ role: 1, accountStatus: 1 }` | Compound | None | Admin user management directory filters |
| `touristProfiles`| `{ accountId: 1 }` | Unique | None | 1:1 account profile retrieval |
| `touristProfiles`| `{ displayName: 1 }` | Unique | None | Handle lookup and `@mention` resolution |
| `businessProfiles`| `{ accountId: 1 }` | Unique | None | 1:1 merchant profile retrieval |
| `businessProfiles`| `{ kycStatus: 1, accreditationTier: 1 }` | Compound | None | Admin merchant verification queue |
| `businessProfiles`| `{ gstin: 1 }` | Unique, Sparse | None | Merchant tax registration validation |
| `adminProfiles` | `{ accountId: 1 }` | Unique | None | 1:1 admin profile retrieval |
| `adminProfiles` | `{ employeeId: 1 }` | Unique | None | Directorate officer identification |
| `sessions` | `{ expiresAt: 1 }` | TTL Index | `expireAfterSeconds: 0` | Automated session cleanup upon expiration |
| `sessions` | `{ accountId: 1, isRevoked: 1 }` | Compound | None | Active user sessions check |
| `sessions` | `{ refreshTokenHash: 1 }` | Unique | None | Session token refresh & rotation |
| `deviceTokens` | `{ lastSeenAt: 1 }` | TTL Index | `expireAfterSeconds: 7776000` (90 days) | Auto-prune inactive push notification tokens |
| `deviceTokens` | `{ accountId: 1, token: 1 }` | Unique | None | Avoid duplicate push token registrations |

---

### Domain 2: Destinations & Geospatial Registry

| Collection | Index Keys | Type | Partial Filter / Options | Query Supported |
|---|---|---|---|---|
| `destinations` | `{ location: "2dsphere" }` | Geospatial | None | Proximity searches (`$nearSphere`, `$geoNear` within radial distance) |
| `destinations` | `{ slug: 1 }` | Unique | None | Clean URL destination details (`/destinations/:slug`) |
| `destinations` | `{ district: 1, verificationStatus: 1, publicationStatus: 1 }` | Compound | None | District filter rail for verified & published destinations |
| `destinations` | `{ categoryIds: 1, verificationStatus: 1, publicationStatus: 1 }` | Compound | None | Category filter rail for verified & published destinations |
| `destinations` | `{ verificationStatus: 1, publicationStatus: 1, createdAt: -1 }` | Compound | None | Paginated public listing sorted by newest |
| `destinations` | `{ name: "text", description: "text", locality: "text" }` | Text | `weights: { name: 10, locality: 5, description: 1 }` | Full-text relevance search |
| `destinationCategories` | `{ slug: 1 }` | Unique | None | Category lookup and routing |
| `destinationCategories` | `{ isActive: 1 }` | Single Field | None | Active category filtering |
| `destinationSubmissions` | `{ submittedBy: 1, createdAt: -1 }` | Compound | None | Tourist profile "My Submissions" history |
| `destinationSubmissions` | `{ status: 1, createdAt: -1 }` | Compound | None | Admin review queue filtering |
| `destinationSubmissions` | `{ destinationId: 1 }` | Single Field | `sparse: true` | Audit linkage to approved destination |

---

### Domain 3: Social Networking & Community Feed

| Collection | Index Keys | Type | Partial Filter / Options | Query Supported |
|---|---|---|---|---|
| `posts` | `{ visibility: 1, status: 1, deletedAt: 1, publishedAt: -1, _id: -1 }` | Compound Partial | `partialFilterExpression: { visibility: "PUBLIC", status: "PUBLISHED" }` | Chronological public social feed stream (`GET /api/v1/posts`) |
| `posts` | `{ authorId: 1, deletedAt: 1, createdAt: -1 }` | Compound | None | Tourist own active posts (`GET /api/v1/tourist/posts`) |
| `posts` | `{ destinationId: 1, visibility: 1, status: 1, deletedAt: 1, publishedAt: -1 }` | Compound Partial | `partialFilterExpression: { destinationId: { $type: "objectId" }, visibility: "PUBLIC", status: "PUBLISHED" }` | Destination-scoped public posts |
| `posts` | `{ status: 1, createdAt: -1 }` | Compound Partial | `partialFilterExpression: { status: { $in: ["PENDING", "REJECTED"] } }` | Future moderation queue filtering |
| `posts` | `{ authorId: 1, status: 1, deletedAt: 1, publishedAt: -1, _id: -1, visibility: 1 }` | Compound Partial (`idx_following_feed`) | `partialFilterExpression: { status: "PUBLISHED" }` | Bounded per-author personalized following feed (`GET /api/v1/tourist/feed/following`) |
| `postLikes` | `{ accountId: 1, postId: 1 }` | Unique Compound | None | Prevent duplicate likes (`POST .../likes`) |
| `postLikes` | `{ postId: 1, createdAt: -1 }` | Compound | None | Post-scoped like lookups & ordering |
| `postComments` | `{ postId: 1, status: 1, deletedAt: 1, createdAt: -1, _id: -1 }` | Compound Partial | `partialFilterExpression: { status: "ACTIVE" }` | Paginated active public comment stream (`GET /api/v1/posts/:postId/comments`) |
| `postComments` | `{ authorId: 1, status: 1, deletedAt: 1, createdAt: -1 }` | Compound | None | Author comment lookups & BOLA checks |
| `postReposts` | `{ accountId: 1, originalPostId: 1 }` | Unique Compound | None | Prevent duplicate reposts (`POST .../reposts`) |
| `postReposts` | `{ originalPostId: 1, createdAt: -1 }` | Compound | None | Post-scoped repost lookups |
| `follows` | `{ followerId: 1, followingId: 1 }` | Unique Compound | None | Uniqueness of social connection |
| `follows` | `{ followingId: 1, createdAt: -1, _id: -1 }` | Compound | None | User's follower list (newest-first deterministic pagination) |
| `follows` | `{ followerId: 1, createdAt: -1, _id: -1 }` | Compound | None | User's following list (newest-first deterministic pagination) |
| `bookmarks` | `{ userId: 1, entityId: 1, entityType: 1 }` | Unique Compound | None | User saved places deduplication |
| `hashtags` | `{ tag: 1 }` | Unique | None | Hashtag autocomplete & trending discovery |
| `hashtags` | `{ usageCount: -1 }` | Single Field | None | Trending tags ticker |

---

### Domain 4: Direct Messaging & Inquiries

| Collection | Index Keys | Type | Partial Filter / Options | Query Supported |
|---|---|---|---|---|
| `conversations` | `{ propertyId: 1, createdAt: -1 }` | Compound, Sparse | None | Host property inquiry channel lookup |
| `conversationMembers` | `{ conversationId: 1, accountId: 1 }` | Unique Compound | None | Participant lookup in chat channel |
| `conversationMembers` | `{ accountId: 1, unreadCount: -1 }` | Compound | None | Inbox unread message counters |
| `messages` | `{ conversationId: 1, createdAt: 1 }` | Compound | None | Chronological chat bubble message stream |
| `messageReceipts` | `{ messageId: 1, recipientId: 1 }` | Unique Compound | None | Delivery & read receipt verification |

---

### Domain 5: Travel Agencies & Packages

| Collection | Index Keys | Type | Partial Filter / Options | Query Supported |
|---|---|---|---|---|
| `agencies` | `{ businessProfileId: 1 }` | Unique | None | 1:1 business profile mapping |
| `agencies` | `{ licenseNumber: 1 }` | Unique | None | Directorate license validation |
| `agencyDocuments` | `{ agencyId: 1, docType: 1 }` | Compound | None | Compliance document inspections |
| `travelPackages` | `{ slug: 1 }` | Unique | None | Package details URL routing |
| `travelPackages` | `{ agencyId: 1, isActive: 1 }` | Compound | None | Agency active catalog listing |
| `travelPackages` | `{ durationDays: 1, basePricePerPerson: 1 }` | Compound | None | Package multi-filter search |
| `packageSchedules` | `{ packageId: 1, departureDate: 1 }` | Compound | None | Departure calendar availability lookup |
| `packageBookings` | `{ bookingId: 1 }` | Unique | None | Booking manifest linkage |
| `packageBookings` | `{ scheduleId: 1 }` | Single Field | None | Passenger manifest export for departure |

---

### Domain 6: Accommodation & Dual-Mode Inventory

| Collection | Index Keys | Type | Partial Filter / Options | Query Supported |
|---|---|---|---|---|
| `properties` | `{ location: "2dsphere" }` | Geospatial | `partialFilterExpression: { isVerified: true }` | Nearby homestay/resort proximity search |
| `properties` | `{ slug: 1 }` | Unique | None | Property details routing (`/stays/:slug`) |
| `properties` | `{ district: 1, propertyType: 1, isVerified: 1 }` | Compound | None | Accommodations directory filter rail |
| `propertyDocuments` | `{ propertyId: 1, docType: 1 }` | Compound | None | Property regulatory compliance check |
| `rooms` | `{ propertyId: 1, isActive: 1 }` | Compound | None | Room selection matrix for property |
| `roomRates` | `{ roomId: 1 }` | Unique | None | 1:1 hourly and daily pricing retrieval |
| `roomInventory` | `{ roomId: 1, date: 1 }` | Unique Compound | None | Daily calendar occupancy grid |
| `propertyFacilities`| `{ propertyId: 1, facilityCode: 1 }` | Compound | None | Amenity filter matching |
| `propertyMenus` | `{ propertyId: 1, isAvailable: 1 }` | Compound | None | Dining menu preview |

---

### Domain 7: Bookings, Concurrency & Financial Settlement

| Collection | Index Keys | Type | Partial Filter / Options | Query Supported |
|---|---|---|---|---|
| `bookings` | `{ bookingNumber: 1 }` | Unique | None | Customer booking lookup & invoice generation |
| `bookings` | `{ touristId: 1, createdAt: -1 }` | Compound | None | Traveler "My Bookings" timeline |
| `bookings` | `{ propertyId: 1, bookingStatus: 1, checkInTime: 1 }` | Compound | None | Host check-in dashboard register |
| `bookings` | `{ roomId: 1, checkInTime: 1, checkOutTime: 1 }` | Compound | `partialFilterExpression: { bookingStatus: { $in: ["CONFIRMED", "CHECKED_IN"] } }` | Concurrency overlapping reservation detection |
| `inventoryHolds` | `{ expiresAt: 1 }` | TTL Index | `expireAfterSeconds: 0` | Auto-release of abandoned checkout holds |
| `inventoryHolds` | `{ idempotencyKey: 1 }` | Unique | None | Double-submit idempotency protection |
| `inventoryHolds` | `{ roomId: 1, holdStartTime: 1, holdEndTime: 1 }` | Compound | None | Atomic overlap lock verification |
| `bookingGuests` | `{ bookingId: 1 }` | Single Field | None | Police guest manifest retrieval |
| `bookingEvents` | `{ bookingId: 1, timestamp: 1 }` | Compound | None | Chronological audit trail of booking |
| `cancellationRequests`| `{ bookingId: 1 }` | Unique | None | Cancellation appeal tracking |
| `payments` | `{ gatewayTransactionId: 1 }` | Unique | None | Idempotent payment gateway webhook ingestion |
| `payments` | `{ bookingId: 1 }` | Single Field | None | Transaction details for booking |
| `payments` | `{ status: 1, escrowReleaseDueAt: 1 }` | Compound | `partialFilterExpression: { status: "HELD_IN_ESCROW" }` | Automated escrow release cron scanner |
| `refunds` | `{ gatewayRefundId: 1 }` | Unique | None | Payment gateway refund reconciliation |
| `commissions` | `{ bookingId: 1 }` | Unique | None | 1:1 commission record |
| `commissions` | `{ businessProfileId: 1, isSettled: 1 }` | Compound | None | Merchant pending payout calculation |
| `providerPayouts` | `{ payoutReference: 1 }` | Unique | None | Bank settlement manifest tracking |
| `financialLedger` | `{ entryNumber: 1 }` | Unique | None | Double-entry ledger sequential tracking |
| `financialLedger` | `{ bookingId: 1 }` | Single Field, Sparse | None | Tax compliance audit ledger |

---

### Domain 8: Governance, Moderation & Support

| Collection | Index Keys | Type | Partial Filter / Options | Query Supported |
|---|---|---|---|---|
| `reviews` | `{ targetId: 1, targetType: 1, rating: -1 }` | Compound | None | Star review breakdown for stay/spot |
| `reviews` | `{ bookingId: 1 }` | Unique, Sparse | None | 1 review per booking enforcement |
| `reports` | `{ status: 1, createdAt: 1 }` | Compound | None | Admin moderation queue triage |
| `blocks` | `{ blockerAccountId: 1, blockedAccountId: 1 }` | Unique Compound | None | User blocking check |
| `notifications` | `{ recipientAccountId: 1, isRead: 1, createdAt: -1 }` | Compound | None | Unread notification tray |
| `media` | `{ storageKey: 1 }` | Unique | None | Cloud object key deduplication |
| `media` | `{ destinationId: 1, displayOrder: 1 }` | Compound | None | Destination media gallery sorting |
| `media` | `{ uploaderAccountId: 1, createdAt: -1 }` | Compound | None | Account media upload history |
| `auditLogs` | `{ timestamp: -1 }` | Single Field | None | Directorate immutable audit log viewer |
| `auditLogs` | `{ targetEntityId: 1, targetEntityType: 1 }` | Compound | None | Entity change history inspection |
| `supportTickets` | `{ ticketNumber: 1 }` | Unique | None | Tourist police ticket tracking |
| `supportTickets` | `{ status: 1, priority: 1, createdAt: 1 }` | Compound | None | Tourist Police 1364 emergency queue |
| `systemSettings` | `{ configKey: 1 }` | Unique | None | Fast configuration key retrieval |

> [!NOTE]
> **Partial ESR Trade-Off (`idx_following_feed`)**: Ordering `{ authorId: 1, status: 1, deletedAt: 1, publishedAt: -1, _id: -1, visibility: 1 }` satisfies exact equality filters first, preserves pre-sorted `(publishedAt DESC, _id DESC)` order ahead of the `$in` check on `visibility` (`['PUBLIC', 'FOLLOWERS']`) to eliminate blocking in-memory sorts, and restricts index maintenance to `status: "PUBLISHED"` documents only.
