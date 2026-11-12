# MongoDB Collections Specification & Data Dictionary
**Kerala Tourism Ecosystem**  
**Total Collections:** 51 Collections across 8 Core Functional Domains  
**Format:** Production BSON Schema, Validation Constraints, Cross-References & JSON Document Exemplars  

---

## Domain 1: Authentication & Identity Management

### 1. `accounts`
- **Purpose**: Centralized authentication identity storing primary credentials, security parameters, and account lifecycle state.
- **Fields**:
  - `_id`: `ObjectId` (Primary Key)
  - `email`: `String` (Normalized lowercase email, unique sparse)
  - `phone`: `String` (E.164 format, unique sparse)
  - `passwordHash`: `String` (bcrypt/Argon2id hash; nullable for OAuth-only users)
  - `role`: `String` (Enum: `TOURIST`, `AGENCY`, `HOTEL`, `INDEPENDENT_HOST`, `ADMIN`)
  - `accountStatus`: `String` (Enum: `ACTIVE`, `PENDING_VERIFICATION`, `SUSPENDED`, `DEACTIVATED`)
  - `isEmailVerified`: `Boolean` (Default `false`)
  - `isPhoneVerified`: `Boolean` (Default `false`)
  - `failedLoginAttempts`: `Int32` (Counter for brute force mitigation, default `0`)
  - `lockoutUntil`: `Date` (Optional temporary lockout expiration timestamp)
  - `twoFactorEnabled`: `Boolean` (Default `false`)
  - `twoFactorSecret`: `String` (Encrypted TOTP secret key, optional)
  - `createdAt`: `Date` (Auto timestamp)
  - `updatedAt`: `Date` (Auto timestamp)
- **Validation**: Email must match RFC 5322 regex. Phone must match `^\+?[1-9]\d{9,14}$`.
- **References**: Profile collections link back to `accountId: ObjectId(accounts._id)`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "email": "arjun.explorer@gmail.com",
  "phone": "+919847012345",
  "passwordHash": "$2b$12$K8j7x9yZ2e3W1v0U...hashed",
  "role": "TOURIST",
  "accountStatus": "ACTIVE",
  "isEmailVerified": true,
  "isPhoneVerified": true,
  "failedLoginAttempts": 0,
  "twoFactorEnabled": false,
  "createdAt": { "$date": "2026-11-10T06:00:00Z" },
  "updatedAt": { "$date": "2026-11-10T06:00:00Z" }
}
```

---

### 2. `touristProfiles`
- **Purpose**: Traveler demographic profile, personalization preferences, and engagement reputation.
- **Fields**:
  - `_id`: `ObjectId`
  - `accountId`: `ObjectId` (Required, Ref: `accounts`, unique)
  - `fullName`: `String` (Required, 2-100 chars)
  - `displayName`: `String` (Required, unique handle)
  - `avatarUrl`: `String` (Optional media URL)
  - `bio`: `String` (Optional, max 300 chars)
  - `preferredLanguage`: `String` (Enum: `EN`, `ML`, default `EN`)
  - `travelInterests`: `Array<String>` (e.g., `["BACKWATERS", "TREKKING", "AYURVEDA"]`)
  - `emergencyContact`: `Object` (Embedded: `name`, `phone`, `relationship`)
  - `tripsCompleted`: `Int32` (Default `0`)
  - `reputationScore`: `Int32` (Default `100`)
  - `isEcoCertifiedTraveler`: `Boolean` (Default `false`)
  - `followersCount`: `Int32` (Default `0`, non-negative `min: 0`)
  - `followingCount`: `Int32` (Default `0`, non-negative `min: 0`)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f002" },
  "accountId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "fullName": "Arjun Nair",
  "displayName": "arjun_trails",
  "avatarUrl": "https://cdn.keralatourism.gov.in/avatars/arjun.jpg",
  "bio": "Backpacker exploring Western Ghats & ancient temples.",
  "preferredLanguage": "EN",
  "travelInterests": ["BACKWATERS", "HILL_STATION", "AYURVEDA"],
  "emergencyContact": {
    "name": "Lakshmi Nair",
    "phone": "+919847054321",
    "relationship": "Spouse"
  },
  "tripsCompleted": 8,
  "reputationScore": 140,
  "isEcoCertifiedTraveler": true,
  "createdAt": { "$date": "2026-11-10T06:05:00Z" },
  "updatedAt": { "$date": "2026-11-10T06:05:00Z" }
}
```

---

### 3. `businessProfiles`
- **Purpose**: Legal commercial identity and regulatory accreditation data for verified tourism operators.
- **Fields**:
  - `_id`: `ObjectId`
  - `accountId`: `ObjectId` (Required, Ref: `accounts`, unique)
  - `legalEntityName`: `String` (Required)
  - `tradeName`: `String` (Required, customer-facing business name)
  - `businessType`: `String` (Enum: `AGENCY`, `HOTEL`, `RESORT`, `INDEPENDENT_HOST`)
  - `gstin`: `String` (15-character Indian GST identification number)
  - `pan`: `String` (10-character Permanent Account Number)
  - `keralaTourismLicenseNumber`: `String` (e.g. `KTD-HOMESTAY-2024-81`)
  - `accreditationTier`: `String` (Enum: `GOLD`, `SILVER`, `BRONZE`, `UNACCREDITED`)
  - `kycStatus`: `String` (Enum: `PENDING`, `UNDER_REVIEW`, `VERIFIED`, `REVISIONS_REQUIRED`, `REJECTED`)
  - `verifiedAt`: `Date` (Optional timestamp when Directorate approved)
  - `verifiedByAdminId`: `ObjectId` (Optional Ref: `adminProfiles`)
  - `bankSettlementDetails`: `Object` (Encrypted: `accountNumber`, `ifscCode`, `beneficiaryName`)
  - `registeredAddress`: `Object` (Embedded address: `street`, `district`, `pincode`)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `accounts._id`, Ref: `adminProfiles._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f003" },
  "accountId": { "$oid": "66e04d3e89a4b2c1d8e1f099" },
  "legalEntityName": "Vembanad Heritage Hospitality Pvt Ltd",
  "tradeName": "Kumarakom Lake Breeze Homestay",
  "businessType": "INDEPENDENT_HOST",
  "gstin": "32AAACV1234F1Z8",
  "pan": "AAACV1234F",
  "keralaTourismLicenseNumber": "KTD-HOMESTAY-2024-81",
  "accreditationTier": "GOLD",
  "kycStatus": "VERIFIED",
  "verifiedAt": { "$date": "2026-10-15T10:00:00Z" },
  "registeredAddress": {
    "street": "Post Office Ward, Kavanattinkara",
    "district": "Kottayam",
    "pincode": "686563"
  },
  "createdAt": { "$date": "2026-10-10T08:00:00Z" },
  "updatedAt": { "$date": "2026-10-15T10:00:00Z" }
}
```

---

### 4. `adminProfiles`
- **Purpose**: Government official and platform regulatory supervisor profile with fine-grained RBAC permissions.
- **Fields**:
  - `_id`: `ObjectId`
  - `accountId`: `ObjectId` (Required, Ref: `accounts`, unique)
  - `employeeId`: `String` (Required, unique official government ID, e.g. `KTD-GOV-4091`)
  - `officialName`: `String` (Required)
  - `department`: `String` (e.g. `Tourism Directorate`, `District Collectorate Idukki`)
  - `assignedDistrict`: `String` (Optional district restriction, e.g. `Idukki`, or `ALL`)
  - `permissions`: `Array<String>` (e.g. `["VERIFY_DESTINATION", "APPROVE_KYC", "DISPUTE_REFUND", "VIEW_AUDIT"]`)
  - `clearanceLevel`: `String` (Enum: `SUPER_ADMIN`, `DISTRICT_OFFICER`, `MODERATOR`)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f004" },
  "accountId": { "$oid": "66e04d3e89a4b2c1d8e1f088" },
  "employeeId": "KTD-INSPECT-04",
  "officialName": "Inspector Rajesh Kumar",
  "department": "Dept of Tourism Governance",
  "assignedDistrict": "ALL",
  "permissions": ["VERIFY_DESTINATION", "APPROVE_KYC", "AUDIT_LEDGER"],
  "clearanceLevel": "DISTRICT_OFFICER",
  "createdAt": { "$date": "2026-09-01T04:00:00Z" },
  "updatedAt": { "$date": "2026-09-01T04:00:00Z" }
}
```

---

### 5. `sessions`
- **Purpose**: Authenticated device sessions with cryptographically hashed refresh tokens and TTL expiration.
- **Fields**:
  - `_id`: `ObjectId`
  - `accountId`: `ObjectId` (Required, Ref: `accounts`)
  - `refreshTokenHash`: `String` (Required, SHA-256 hash of refresh token)
  - `userAgent`: `String` (Browser / Client agent string)
  - `ipAddress`: `String` (Client IPv4/IPv6 address)
  - `isRevoked`: `Boolean` (Default `false`)
  - `expiresAt`: `Date` (Required, TTL index target)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f005" },
  "accountId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "refreshTokenHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)",
  "ipAddress": "49.207.210.12",
  "isRevoked": false,
  "expiresAt": { "$date": "2026-12-10T06:00:00Z" },
  "createdAt": { "$date": "2026-11-10T06:00:00Z" }
}
```

---

### 6. `deviceTokens`
- **Purpose**: Push notification registration tokens (FCM/APNS) for mobile devices.
- **Fields**:
  - `_id`: `ObjectId`
  - `accountId`: `ObjectId` (Required, Ref: `accounts`)
  - `token`: `String` (Required, unique push registration token)
  - `platform`: `String` (Enum: `IOS`, `ANDROID`, `WEB`)
  - `lastSeenAt`: `Date` (Target for 90-day stale token TTL cleanup)
  - `createdAt`: `Date`
- **References**: Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f006" },
  "accountId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "token": "fcm_token_98fa9f7a810f8a9e8b7...",
  "platform": "ANDROID",
  "lastSeenAt": { "$date": "2026-11-10T06:00:00Z" }
}
```

---

## Domain 2: Destinations & Geospatial Registry

### 7. `destinations`
- **Purpose**: Official verified tourism destinations published for public exploration with GeoJSON coordinates.
- **Fields**:
  - `_id`: `ObjectId` (Primary Key)
  - `name`: `String` (Required, 2–120 chars, trimmed)
  - `slug`: `String` (Required, unique, lowercase, normalized)
  - `description`: `String` (Required, 20–5000 chars)
  - `shortDescription`: `String` (Optional summary, max 300 chars)
  - `categoryIds`: `Array<ObjectId>` (References `destinationCategories._id`, indexed)
  - `location`: `Object` (GeoJSON Point: `{ type: "Point", coordinates: [Number, Number] }`, 2dsphere indexed)
  - `address`: `String` (Required, 5–300 chars)
  - `district`: `String` (Required, enum: 14 approved Kerala districts, indexed)
  - `locality`: `String` (Optional locality/village, max 100 chars)
  - `images`: `Array<String>` (Media reference URLs/IDs)
  - `facilities`: `Array<String>` (e.g. `["PARKING", "RESTROOMS", "VIEWPOINT"]`)
  - `bestTimeToVisit`: `String` (e.g. `October to March`)
  - `entryFee`: `Object` (`{ amount: Number, currency: String, isFree: Boolean }`)
  - `verificationStatus`: `String` (Enum: `PENDING`, `VERIFIED`, `REJECTED`, default: `PENDING`, indexed)
  - `publicationStatus`: `String` (Enum: `DRAFT`, `PUBLISHED`, `ARCHIVED`, default: `DRAFT`, indexed)
  - `createdBy`: `ObjectId` (Required, Ref: `accounts`)
  - `verifiedBy`: `ObjectId` (Optional Ref: `accounts`)
  - `publishedAt`: `Date` (Timestamp of publication)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `destinationCategories._id`, Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f007" },
  "name": "Munroe Island Mangrove Waterways",
  "slug": "munroe-island-mangrove-waterways",
  "categoryIds": [{ "$oid": "66e04d3e89a4b2c1d8e1f008" }],
  "district": "Kollam",
  "description": "Quiet canoe trails weaving through narrow tidal canals where the Kallada River meets Ashtamudi Lake.",
  "location": {
    "type": "Point",
    "coordinates": [76.6117, 8.9953]
  },
  "address": "Munroe Island, Kollam District, Kerala 691502",
  "images": [
    "https://cdn.keralatourism.gov.in/spots/munroe-1.jpg",
    "https://cdn.keralatourism.gov.in/spots/munroe-2.jpg"
  ],
  "facilities": ["CANOE_HIRE", "HOMESTAY_ACCESS", "PARKING"],
  "bestTimeToVisit": "October to February",
  "entryFee": {
    "amount": 0,
    "currency": "INR",
    "isFree": true
  },
  "verificationStatus": "VERIFIED",
  "publicationStatus": "PUBLISHED",
  "publishedAt": { "$date": "2026-08-01T00:00:00Z" },
  "createdBy": { "$oid": "66e04d3e89a4b2c1d8e1f004" },
  "verifiedBy": { "$oid": "66e04d3e89a4b2c1d8e1f004" },
  "createdAt": { "$date": "2026-08-01T00:00:00Z" },
  "updatedAt": { "$date": "2026-08-01T00:00:00Z" }
}
```

---

### 8. `destinationCategories`
- **Purpose**: Master taxonomic classifications for Kerala travel destinations.
- **Fields**:
  - `_id`: `ObjectId`
  - `name`: `String` (Required, unique, trimmed, 2–50 chars)
  - `slug`: `String` (Required, unique, lowercase, trimmed)
  - `description`: `String` (Optional, max 500 chars)
  - `icon`: `String` (Material Symbol icon key, e.g. `water`, `terrain`)
  - `isActive`: `Boolean` (Default `true`, indexed)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f008" },
  "name": "Backwaters & Lagoons",
  "slug": "backwaters-and-lagoons",
  "description": "Canal networks, coastal lakes and houseboats",
  "icon": "water",
  "isActive": true,
  "createdAt": { "$date": "2026-08-01T00:00:00Z" },
  "updatedAt": { "$date": "2026-08-01T00:00:00Z" }
}
```

---

### 9. `destinationSubmissions`
- **Purpose**: Crowdsourced community destination suggestions submitted by tourists awaiting regulatory review.
- **Fields**:
  - `_id`: `ObjectId`
  - `submittedBy`: `ObjectId` (Required, Ref: `accounts`, indexed)
  - `name`: `String` (Required, 2–120 chars)
  - `description`: `String` (Required, 20–2000 chars)
  - `categoryIds`: `Array<ObjectId>` (References `destinationCategories._id`)
  - `district`: `String` (Optional, Enum: 14 approved Kerala districts; indexed for moderation queue filtering)
  - `submittedLocation`: `Object` (GeoJSON Point: `{ type: "Point", coordinates: [Number, Number] }`)
  - `submittedAddress`: `String` (Required, 5–300 chars)
  - `imageMediaIds`: `Array<String>` (1 to 10 media references)
  - `submissionStatus`: `String` (Enum: `PENDING`, `APPROVED`, `REJECTED`, default: `PENDING`, indexed)
  - `reviewedBy`: `ObjectId` (Optional Ref: `accounts`)
  - `reviewedAt`: `Date` (Optional review decision timestamp)
  - `reviewNotes`: `String` (Optional review justification, max 1000 chars)
  - `destinationId`: `ObjectId` (Optional Ref: `destinations`, linked upon approval)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `accounts._id`, Ref: `destinationCategories._id`, Ref: `destinations._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f009" },
  "submittedBy": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "name": "Cheeyappara Lower Cascades",
  "description": "Hidden natural pool 400m below the main highway viewpoint.",
  "categoryIds": [{ "$oid": "66e04d3e89a4b2c1d8e1f008" }],
  "submittedLocation": {
    "type": "Point",
    "coordinates": [76.8921, 10.0124]
  },
  "submittedAddress": "Near Mile-marker 32 on Kochi-Dhanushkodi Highway, Idukki",
  "imageMediaIds": ["media-photo-001.jpg", "media-photo-002.jpg"],
  "submissionStatus": "PENDING",
  "createdAt": { "$date": "2026-11-10T04:00:00Z" },
  "updatedAt": { "$date": "2026-11-10T04:00:00Z" }
}
```

---

### 10. `destinationVerifications`
- **Purpose**: Formal administrative decision record, geo-fence audit, and reverse-image safety check.
- **Fields**:
  - `_id`: `ObjectId`
  - `submissionId`: `ObjectId` (Required, Ref: `destinationSubmissions`, unique)
  - `reviewedByAdminId`: `ObjectId` (Required, Ref: `adminProfiles`)
  - `geofenceCheckResult`: `String` (Enum: `PASS_KERALA_BOUNDS`, `FAIL_OUTSIDE_STATE`, `FAIL_CORE_TIGER_ZONE`)
  - `reverseImageSafetyScore`: `Double` (Percentage score from copyright/EXIF authenticity scanner)
  - `decision`: `String` (Enum: `APPROVED`, `REVISION_REQUESTED`, `REJECTED`)
  - `reviewerNotes`: `String` (Audit justification)
  - `assignedDestinationId`: `ObjectId` (Optional Ref: `destinations` if approved)
  - `createdAt`: `Date`
- **References**: Ref: `destinationSubmissions._id`, Ref: `adminProfiles._id`, Ref: `destinations._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f010" },
  "submissionId": { "$oid": "66e04d3e89a4b2c1d8e1f009" },
  "reviewedByAdminId": { "$oid": "66e04d3e89a4b2c1d8e1f004" },
  "geofenceCheckResult": "PASS_KERALA_BOUNDS",
  "reverseImageSafetyScore": 98.4,
  "decision": "APPROVED",
  "reviewerNotes": "Coordinates verified against Forest Department non-restricted recreational buffer.",
  "assignedDestinationId": { "$oid": "66e04d3e89a4b2c1d8e1f007" },
  "createdAt": { "$date": "2026-11-10T05:30:00Z" }
}
```

---

## Domain 3: Social Networking & Community Feed

### 11. `posts`
- **Purpose**: Community traveler posts, travel stories, and optional media/destination-linked moments (Day 13).
- **Fields**:
  - `_id`: `ObjectId`
  - `authorId`: `ObjectId` (Required, Immutable, Ref: `accounts`)
  - `content`: `String` (Required, trimmed, 1–2000 chars)
  - `mediaIds`: `Array<ObjectId>` (Default `[]`, max 10 unique IDs, Ref: `media`)
  - `destinationId`: `ObjectId | null` (Optional Ref: `destinations` — must be `VERIFIED` and `PUBLISHED`)
  - `visibility`: `String` (Enum: `PUBLIC`, `FOLLOWERS`, `PRIVATE`, default `PUBLIC`)
  - `status`: `String` (Enum: `PENDING`, `PUBLISHED`, `REJECTED`, `REMOVED`, default `PUBLISHED`)
  - `publishedAt`: `Date | null` (Publication timestamp used for chronological sorting)
  - `deletedAt`: `Date | null` (Soft-deletion timestamp, default `null`)
  - `likesCount`: `Number` (Default `0`, min `0` — denormalized atomic engagement counter, Day 14)
  - `commentsCount`: `Number` (Default `0`, min `0` — denormalized atomic active comment counter, Day 14)
  - `repostsCount`: `Number` (Default `0`, min `0` — denormalized atomic repost counter, Day 14)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `accounts._id`, Ref: `media._id`, Ref: `destinations._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f011" },
  "authorId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "content": "Watching fishermen haul traditional Chinese fishing nets as mist rolls in over Fort Kochi.",
  "mediaIds": [{ "$oid": "66e04d3e89a4b2c1d8e1f055" }],
  "destinationId": { "$oid": "66e04d3e89a4b2c1d8e1f007" },
  "visibility": "PUBLIC",
  "status": "PUBLISHED",
  "likesCount": 12,
  "commentsCount": 3,
  "repostsCount": 2,
  "publishedAt": { "$date": "2026-11-11T05:00:00Z" },
  "deletedAt": null,
  "createdAt": { "$date": "2026-11-11T05:00:00Z" },
  "updatedAt": { "$date": "2026-11-11T05:00:00Z" }
}
```

---

### 12. `postLikes`
- **Purpose**: Idempotent tracking of tourist post likes (Day 14).
- **Fields**:
  - `_id`: `ObjectId`
  - `accountId`: `ObjectId` (Required, Immutable, Ref: `accounts`)
  - `postId`: `ObjectId` (Required, Immutable, Ref: `posts`)
  - `createdAt`: `Date`
- **Constraint**: Unique compound index `{ accountId: 1, postId: 1 }`.
- **References**: Ref: `accounts._id`, Ref: `posts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f012" },
  "accountId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "postId": { "$oid": "66e04d3e89a4b2c1d8e1f011" },
  "createdAt": { "$date": "2026-11-11T06:10:00Z" }
}
```

---

### 13. `postComments`
- **Purpose**: Flat paginated tourist comments on published public community posts (Day 14).
- **Fields**:
  - `_id`: `ObjectId`
  - `postId`: `ObjectId` (Required, Immutable, Ref: `posts`)
  - `authorId`: `ObjectId` (Required, Immutable, Ref: `accounts`)
  - `content`: `String` (Required, trimmed, `1–1000` chars)
  - `status`: `String` (Enum: `ACTIVE`, `REMOVED`, default `ACTIVE`)
  - `deletedAt`: `Date | null` (Default `null`)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `posts._id`, Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f013" },
  "postId": { "$oid": "66e04d3e89a4b2c1d8e1f011" },
  "authorId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "content": "Is the ferry operational early in the morning?",
  "status": "ACTIVE",
  "deletedAt": null,
  "createdAt": { "$date": "2026-11-11T06:15:00Z" },
  "updatedAt": { "$date": "2026-11-11T06:15:00Z" }
}
```

---

### 14. `postReposts`
- **Purpose**: Shares of eligible published public posts by authenticated tourists without duplicating original media or content (Day 14).
- **Fields**:
  - `_id`: `ObjectId`
  - `accountId`: `ObjectId` (Required, Immutable, Ref: `accounts`)
  - `originalPostId`: `ObjectId` (Required, Immutable, Ref: `posts`)
  - `createdAt`: `Date`
- **Constraint**: Unique compound index `{ accountId: 1, originalPostId: 1 }`.
- **References**: Ref: `accounts._id`, Ref: `posts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f014" },
  "accountId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "originalPostId": { "$oid": "66e04d3e89a4b2c1d8e1f011" },
  "createdAt": { "$date": "2026-11-11T06:30:00Z" }
}
```

---

### 15. `follows`
- **Purpose**: Directed follow relationships between active `TOURIST` accounts (`followerId` -> `followingId`), synced atomically with denormalized `followersCount` / `followingCount` counters on `touristProfiles`.
- **Fields**:
  - `_id`: `ObjectId`
  - `followerId`: `ObjectId` (Required, Immutable, Ref: `accounts` — active `TOURIST`)
  - `followingId`: `ObjectId` (Required, Immutable, Ref: `accounts` — active `TOURIST`, `followingId !== followerId`)
  - `createdAt`: `Date` (Immutable creation timestamp)
- **Constraints & Indexes**: Unique compound index `{ followerId: 1, followingId: 1 }` (`idx_follows_unique`), `{ followingId: 1, createdAt: -1, _id: -1 }` (`idx_follows_followers`), `{ followerId: 1, createdAt: -1, _id: -1 }` (`idx_follows_following`); schema pre-validate hook rejects self-following.
- **References**: Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f015" },
  "followerId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "followingId": { "$oid": "66e04d3e89a4b2c1d8e1f099" },
  "createdAt": { "$date": "2026-11-09T19:00:00Z" }
}
```

---

### 16. `bookmarks`
- **Purpose**: Private saved collections of destinations, stays, or tour packages.
- **Fields**:
  - `_id`: `ObjectId`
  - `userId`: `ObjectId` (Required, Ref: `accounts`)
  - `entityId`: `ObjectId` (Required, generic ref ID)
  - `entityType`: `String` (Enum: `DESTINATION`, `PROPERTY`, `TRAVEL_PACKAGE`, `POST`)
  - `collectionFolder`: `String` (e.g. `Monsoon Trip`, `Weekend Transit`)
  - `createdAt`: `Date`
- **Constraint**: Unique compound index `{ userId: 1, entityId: 1, entityType: 1 }`.
- **References**: Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f016" },
  "userId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "entityId": { "$oid": "66e04d3e89a4b2c1d8e1f007" },
  "entityType": "DESTINATION",
  "collectionFolder": "Monsoon 2026",
  "createdAt": { "$date": "2026-11-09T19:30:00Z" }
}
```

---

### 17. `hashtags`
- **Purpose**: Trending topics and tag discovery index.
- **Fields**:
  - `_id`: `ObjectId`
  - `tag`: `String` (Required, lowercase without `#`, unique)
  - `usageCount`: `Int32` (Default `1`)
  - `lastUsedAt`: `Date`
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f017" },
  "tag": "godsowncountry",
  "usageCount": 18490,
  "lastUsedAt": { "$date": "2026-11-10T06:00:00Z" }
}
```

---

## Domain 4: Direct Messaging & Inquiries

### 18. `conversations`
- **Purpose**: In-app messaging channels between travelers and hospitality hosts or tour operators.
- **Fields**:
  - `_id`: `ObjectId`
  - `conversationType`: `String` (Enum: `DIRECT`, `BOOKING_INQUIRY`, `SUPPORT`)
  - `propertyId`: `ObjectId` (Optional Ref: `properties`)
  - `bookingId`: `ObjectId` (Optional Ref: `bookings`)
  - `lastMessageSnippet`: `String` (Preview text)
  - `lastMessageTimestamp`: `Date`
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `properties._id`, Ref: `bookings._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f018" },
  "conversationType": "BOOKING_INQUIRY",
  "propertyId": { "$oid": "66e04d3e89a4b2c1d8e1f027" },
  "lastMessageSnippet": "Yes, we can prepare the Teak Room by 7:00 AM.",
  "lastMessageTimestamp": { "$date": "2026-11-10T06:12:00Z" },
  "createdAt": { "$date": "2026-11-10T06:00:00Z" }
}
```

---

### 19. `conversationMembers`
- **Purpose**: Membership junction managing read states and unread counters per user.
- **Fields**:
  - `_id`: `ObjectId`
  - `conversationId`: `ObjectId` (Required, Ref: `conversations`)
  - `accountId`: `ObjectId` (Required, Ref: `accounts`)
  - `unreadCount`: `Int32` (Default `0`)
  - `lastReadTimestamp`: `Date`
  - `isMuted`: `Boolean` (Default `false`)
  - `isArchived`: `Boolean` (Default `false`)
- **Constraint**: Unique compound index `{ conversationId: 1, accountId: 1 }`.
- **References**: Ref: `conversations._id`, Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f019" },
  "conversationId": { "$oid": "66e04d3e89a4b2c1d8e1f018" },
  "accountId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "unreadCount": 0,
  "lastReadTimestamp": { "$date": "2026-11-10T06:15:00Z" }
}
```

---

### 20. `messages`
- **Purpose**: Individual chat messages and embedded reservation passes.
- **Fields**:
  - `_id`: `ObjectId`
  - `conversationId`: `ObjectId` (Required, Ref: `conversations`)
  - `senderId`: `ObjectId` (Required, Ref: `accounts`)
  - `content`: `String` (Required, text message)
  - `messageType`: `String` (Enum: `TEXT`, `IMAGE`, `CUSTOM_OFFER`, `BOOKING_PASS`, `SYSTEM_NOTICE`)
  - `metadata`: `Object` (Optional embedded offer details: `{ price: 850, hours: 3 }`)
  - `attachments`: `Array<String>` (Media URLs)
  - `createdAt`: `Date`
- **References**: Ref: `conversations._id`, Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f020" },
  "conversationId": { "$oid": "66e04d3e89a4b2c1d8e1f018" },
  "senderId": { "$oid": "66e04d3e89a4b2c1d8e1f099" },
  "content": "Special 3-hour transit offer for early arrival.",
  "messageType": "CUSTOM_OFFER",
  "metadata": {
    "roomId": "66e04d3e89a4b2c1d8e1f029",
    "slot": "07:00-10:00",
    "rate": 800
  },
  "createdAt": { "$date": "2026-11-10T06:12:00Z" }
}
```

---

### 21. `messageReceipts`
- **Purpose**: Delivery and read acknowledgment tracking per recipient.
- **Fields**:
  - `_id`: `ObjectId`
  - `messageId`: `ObjectId` (Required, Ref: `messages`)
  - `recipientId`: `ObjectId` (Required, Ref: `accounts`)
  - `deliveredAt`: `Date`
  - `readAt`: `Date`
- **Constraint**: Unique compound index `{ messageId: 1, recipientId: 1 }`.
- **References**: Ref: `messages._id`, Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f021" },
  "messageId": { "$oid": "66e04d3e89a4b2c1d8e1f020" },
  "recipientId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "deliveredAt": { "$date": "2026-11-10T06:12:02Z" },
  "readAt": { "$date": "2026-11-10T06:15:00Z" }
}
```

---

## Domain 5: Travel Agencies & Curated Packages

### 22. `agencies`
- **Purpose**: Licensed tour operator commercial profiles.
- **Fields**:
  - `_id`: `ObjectId`
  - `businessProfileId`: `ObjectId` (Required, Ref: `businessProfiles`, unique)
  - `agencyName`: `String` (Required)
  - `licenseNumber`: `String` (Required, Kerala Tourism Directorate License)
  - `headquartersDistrict`: `String` (Required)
  - `operatingSince`: `Int32` (Year established)
  - `fleetTypes`: `Array<String>` (e.g. `["AC_SEDAN", "TEMPO_TRAVELER", "HOUSEBOAT"]`)
  - `rating`: `Double` (Default `0.0`)
  - `isEcoCertified`: `Boolean` (Default `false`)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `businessProfiles._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f022" },
  "businessProfileId": { "$oid": "66e04d3e89a4b2c1d8e1f003" },
  "agencyName": "Kerala Malabar Eco Trails",
  "licenseNumber": "KTD-AGENCY-2024-91",
  "headquartersDistrict": "Ernakulam",
  "operatingSince": 2014,
  "fleetTypes": ["AC_SEDAN", "TEMPO_TRAVELER"],
  "rating": 4.92,
  "isEcoCertified": true,
  "createdAt": { "$date": "2026-05-01T00:00:00Z" }
}
```

---

### 23. `agencyDocuments`
- **Purpose**: Regulatory compliance files (Panchayat license, fleet insurance, guide licenses).
- **Fields**:
  - `_id`: `ObjectId`
  - `agencyId`: `ObjectId` (Required, Ref: `agencies`)
  - `documentType`: `String` (Enum: `TRADE_LICENSE`, `INSURANCE_CERT`, `GUIDE_BADGE`)
  - `fileUrl`: `String` (Private cloud storage reference)
  - `expiryDate`: `Date` (Optional expiry)
  - `verificationStatus`: `String` (Enum: `PENDING`, `APPROVED`, `EXPIRED`)
  - `createdAt`: `Date`
- **References**: Ref: `agencies._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f023" },
  "agencyId": { "$oid": "66e04d3e89a4b2c1d8e1f022" },
  "documentType": "TRADE_LICENSE",
  "fileUrl": "s3://kerala-tourism-vault/agency/trade-lic-91.pdf",
  "expiryDate": { "$date": "2027-03-31T00:00:00Z" },
  "verificationStatus": "APPROVED"
}
```

---

### 24. `travelPackages`
- **Purpose**: Multi-day curated tour packages with day-by-day itineraries.
- **Fields**:
  - `_id`: `ObjectId`
  - `agencyId`: `ObjectId` (Required, Ref: `agencies`)
  - `title`: `String` (Required, e.g. `4D/3N Backwaters & Tea Trail`)
  - `slug`: `String` (Required, unique)
  - `durationDays`: `Int32` (Required)
  - `durationNights`: `Int32` (Required)
  - `basePricePerPerson`: `Double` (Required)
  - `itinerary`: `Array<Object>` (Embedded: `[{ day: 1, title: "Fort Kochi Heritage", activities: [...] }]`)
  - `inclusions`: `Array<String>` (e.g. `["AC Cab", "All Meals", "Houseboat Stay"]`)
  - `exclusions`: `Array<String>` (e.g. `["Airfare", "Personal Expenses"]`)
  - `maxGroupSize`: `Int32` (Default `15`)
  - `isActive`: `Boolean` (Default `true`)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `agencies._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f024" },
  "agencyId": { "$oid": "66e04d3e89a4b2c1d8e1f022" },
  "title": "4D/3N Backwaters & Misty Munnar Trail",
  "slug": "4d-3n-backwaters-and-misty-munnar-trail",
  "durationDays": 4,
  "durationNights": 3,
  "basePricePerPerson": 14500.0,
  "itinerary": [
    { "day": 1, "title": "Cochin Arrival & Heritage Walk", "activities": ["Dutch Palace", "Jew Town"] },
    { "day": 2, "title": "Munnar Scenic Drive", "activities": ["Tea Terraces", "Cheeyappara Falls"] }
  ],
  "inclusions": ["AC Sedan Chauffeur", "Traditional Breakfast & Dinner", "Deluxe Tea Estate Stay"],
  "exclusions": ["Airfare to COK"],
  "maxGroupSize": 10,
  "isActive": true,
  "createdAt": { "$date": "2026-07-01T00:00:00Z" }
}
```

---

### 25. `packageSchedules`
- **Purpose**: Departure dates and available group slots for travel packages.
- **Fields**:
  - `_id`: `ObjectId`
  - `packageId`: `ObjectId` (Required, Ref: `travelPackages`)
  - `departureDate`: `Date` (Required)
  - `returnDate`: `Date` (Required)
  - `seatsTotal`: `Int32` (Required)
  - `seatsBooked`: `Int32` (Default `0`)
  - `status`: `String` (Enum: `OPEN`, `FILLING_FAST`, `SOLD_OUT`, `CANCELLED`)
- **References**: Ref: `travelPackages._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f025" },
  "packageId": { "$oid": "66e04d3e89a4b2c1d8e1f024" },
  "departureDate": { "$date": "2026-12-05T03:30:00Z" },
  "returnDate": { "$date": "2026-12-09T14:30:00Z" },
  "seatsTotal": 10,
  "seatsBooked": 6,
  "status": "OPEN"
}
```

---

### 26. `packageBookings`
- **Purpose**: Passenger manifest and booking records for scheduled tour departures.
- **Fields**:
  - `_id`: `ObjectId`
  - `bookingId`: `ObjectId` (Required, Ref: `bookings`, unique)
  - `scheduleId`: `ObjectId` (Required, Ref: `packageSchedules`)
  - `pickupLocation`: `String` (e.g. `Cochin International Airport T3`)
  - `passengerManifest`: `Array<Object>` (Embedded: `[{ name, age, gender, phone }]`)
  - `assignedGuide`: `String` (Optional guide name)
- **References**: Ref: `bookings._id`, Ref: `packageSchedules._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f026" },
  "bookingId": { "$oid": "66e04d3e89a4b2c1d8e1f034" },
  "scheduleId": { "$oid": "66e04d3e89a4b2c1d8e1f025" },
  "pickupLocation": "Cochin International Airport Terminal 3",
  "passengerManifest": [
    { "name": "Arjun Nair", "age": 32, "gender": "M", "phone": "+919847012345" },
    { "name": "Lakshmi Nair", "age": 29, "gender": "F", "phone": "+919847054321" }
  ]
}
```

---

## Domain 6: Accommodation & Dual-Mode Inventory

### 27. `properties`
- **Purpose**: Hospitality establishment record (Homestays, Hotels, Eco-Resorts, Houseboats).
- **Fields**:
  - `_id`: `ObjectId`
  - `businessProfileId`: `ObjectId` (Required, Ref: `businessProfiles`)
  - `name`: `String` (Required, e.g. `Kumarakom Lake Breeze Homestay`)
  - `slug`: `String` (Required, unique)
  - `propertyType`: `String` (Enum: `HOMESTAY`, `HOTEL`, `RESORT`, `HOUSEBOAT`)
  - `district`: `String` (Required)
  - `location`: `Object` (GeoJSON Point: `[longitude, latitude]`)
  - `address`: `String` (Required)
  - `images`: `Array<String>` (Media gallery)
  - `supportsHourly`: `Boolean` (Enables day-use transit bookings, default `false`)
  - `supportsDaily`: `Boolean` (Enables overnight stays, default `true`)
  - `instantBookEnabled`: `Boolean` (If false, requires 15-minute host response)
  - `checkInHourDaily`: `String` (Default `'12:00'`)
  - `checkOutHourDaily`: `String` (Default `'11:00'`)
  - `isVerified`: `Boolean` (Default `false`)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `businessProfiles._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f027" },
  "businessProfileId": { "$oid": "66e04d3e89a4b2c1d8e1f003" },
  "name": "Kumarakom Lake Breeze Homestay",
  "slug": "kumarakom-lake-breeze-homestay",
  "propertyType": "HOMESTAY",
  "district": "Kottayam",
  "location": {
    "type": "Point",
    "coordinates": [76.4281, 9.6178]
  },
  "address": "Kavanattinkara Jetty Road, Kumarakom, Kottayam 686563",
  "images": ["https://cdn.keralatourism.gov.in/stays/lake-breeze-1.jpg"],
  "supportsHourly": true,
  "supportsDaily": true,
  "instantBookEnabled": true,
  "checkInHourDaily": "12:00",
  "checkOutHourDaily": "11:00",
  "isVerified": true,
  "createdAt": { "$date": "2026-08-15T00:00:00Z" }
}
```

---

### 28. `propertyDocuments`
- **Purpose**: Property ownership deeds, local Panchayat licenses, and police verification files.
- **Fields**:
  - `_id`: `ObjectId`
  - `propertyId`: `ObjectId` (Required, Ref: `properties`)
  - `docType`: `String` (Enum: `OWNERSHIP_DEED`, `PANCHAYAT_LICENSE`, `HOST_POLICE_VERIFICATION`)
  - `fileUrl`: `String` (Private S3 URL)
  - `expiryDate`: `Date` (Optional)
  - `isApproved`: `Boolean` (Default `false`)
  - `createdAt`: `Date`
- **References**: Ref: `properties._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f028" },
  "propertyId": { "$oid": "66e04d3e89a4b2c1d8e1f027" },
  "docType": "PANCHAYAT_LICENSE",
  "fileUrl": "s3://kerala-tourism-vault/properties/panchayat-lic-81.pdf",
  "isApproved": true
}
```

---

### 29. `rooms`
- **Purpose**: Specific room unit or room category under a property.
- **Fields**:
  - `_id`: `ObjectId`
  - `propertyId`: `ObjectId` (Required, Ref: `properties`)
  - `roomName`: `String` (Required, e.g. `Deluxe Teak Suite #1`)
  - `roomType`: `String` (Enum: `DELUXE_SUITE`, `HERITAGE_VILLA`, `ECO_COTTAGE`, `TRANSIT_POD`)
  - `capacityAdults`: `Int32` (Required)
  - `capacityChildren`: `Int32` (Default `0`)
  - `bedConfiguration`: `String` (e.g. `1 King Bed + 1 Daybed`)
  - `turnoverBufferMinutes`: `Int32` (Housekeeping buffer, default `60`)
  - `isActive`: `Boolean` (Default `true`)
  - `createdAt`: `Date`
- **References**: Ref: `properties._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f029" },
  "propertyId": { "$oid": "66e04d3e89a4b2c1d8e1f027" },
  "roomName": "Waterfront Deluxe Teak Room 101",
  "roomType": "DELUXE_SUITE",
  "capacityAdults": 2,
  "capacityChildren": 1,
  "bedConfiguration": "1 King Bed with Lake View Balcony",
  "turnoverBufferMinutes": 60,
  "isActive": true
}
```

---

### 30. `roomRates`
- **Purpose**: Dual-mode pricing matrix defining daily rates and hourly transit blocks.
- **Fields**:
  - `_id`: `ObjectId`
  - `roomId`: `ObjectId` (Required, Ref: `rooms`, unique)
  - `baseDailyOvernightRate`: `Double` (Required, e.g. `3200.00`)
  - `hourlyRate3Hours`: `Double` (Rate for 3-hour day rest slot, e.g. `750.00`)
  - `hourlyRate6Hours`: `Double` (Rate for 6-hour slot, e.g. `1350.00`)
  - `hourlyRate12Hours`: `Double` (Rate for 12-hour day slot, e.g. `2200.00`)
  - `currency`: `String` (Default `'INR'`)
  - `extraAdultCharge`: `Double` (Default `500.00`)
  - `updatedAt`: `Date`
- **References**: Ref: `rooms._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f030" },
  "roomId": { "$oid": "66e04d3e89a4b2c1d8e1f029" },
  "baseDailyOvernightRate": 3200.0,
  "hourlyRate3Hours": 750.0,
  "hourlyRate6Hours": 1350.0,
  "hourlyRate12Hours": 2200.0,
  "currency": "INR",
  "extraAdultCharge": 600.0,
  "updatedAt": { "$date": "2026-11-01T00:00:00Z" }
}
```

---

### 31. `roomInventory`
- **Purpose**: Daily status ledger for room availability, maintenance blocks, and holiday pricing surge.
- **Fields**:
  - `_id`: `ObjectId`
  - `roomId`: `ObjectId` (Required, Ref: `rooms`)
  - `date`: `Date` (UTC midnight representation of calendar date)
  - `isBlocked`: `Boolean` (Maintenance or host personal use)
  - `priceSurgeMultiplier`: `Double` (e.g. `1.25` for Onam peak week, default `1.0`)
  - `allocatedIntervals`: `Array<Object>` (Allocated slot intervals: `[{ start: Date, end: Date, bookingId: ObjectId }]`)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **Constraint**: Unique compound index `{ roomId: 1, date: 1 }`.
- **References**: Ref: `rooms._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f031" },
  "roomId": { "$oid": "66e04d3e89a4b2c1d8e1f029" },
  "date": { "$date": "2026-11-10T00:00:00Z" },
  "isBlocked": false,
  "priceSurgeMultiplier": 1.0,
  "allocatedIntervals": [
    {
      "start": { "$date": "2026-11-10T06:30:00Z" },
      "end": { "$date": "2026-11-10T10:30:00Z" },
      "bookingId": { "$oid": "66e04d3e89a4b2c1d8e1f034" }
    }
  ]
}
```

---

### 32. `propertyFacilities`
- **Purpose**: Amenity catalog linked to properties (Ayurveda, Private Jetty, WiFi).
- **Fields**:
  - `_id`: `ObjectId`
  - `propertyId`: `ObjectId` (Required, Ref: `properties`)
  - `facilityCode`: `String` (Enum: `FREE_WIFI`, `AC`, `KERALA_BREAKFAST`, `AYURVEDIC_SPA`, `HOUSEBOAT_JETTY`)
  - `isComplimentary`: `Boolean` (Default `true`)
  - `description`: `String` (Optional notes)
- **References**: Ref: `properties._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f032" },
  "propertyId": { "$oid": "66e04d3e89a4b2c1d8e1f027" },
  "facilityCode": "HOUSEBOAT_JETTY",
  "isComplimentary": true,
  "description": "Private wooden jetty for direct canoe & houseboat boarding"
}
```

---

### 33. `propertyMenus`
- **Purpose**: Traditional authentic Kerala dining menu available on property.
- **Fields**:
  - `_id`: `ObjectId`
  - `propertyId`: `ObjectId` (Required, Ref: `properties`)
  - `dishName`: `String` (Required, e.g. `Appam with Vegetable Stew`, `Karimeen Pollichathu`)
  - `isVegetarian`: `Boolean` (Required)
  - `price`: `Double` (Required)
  - `isAvailable`: `Boolean` (Default `true`)
- **References**: Ref: `properties._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f033" },
  "propertyId": { "$oid": "66e04d3e89a4b2c1d8e1f027" },
  "dishName": "Karimeen Pollichathu (Pearl Spot Wrapped in Banana Leaf)",
  "isVegetarian": false,
  "price": 450.0,
  "isAvailable": true
}
```

---

## Domain 7: Bookings, Concurrency & Financial Settlement

### 34. `bookings`
- **Purpose**: Master reservation contract across hourly, daily, and package transactions.
- **Fields**:
  - `_id`: `ObjectId`
  - `bookingNumber`: `String` (Required, unique, e.g. `KL-BOOK-8821`)
  - `touristId`: `ObjectId` (Required, Ref: `accounts`)
  - `propertyId`: `ObjectId` (Optional Ref: `properties`)
  - `roomId`: `ObjectId` (Optional Ref: `rooms`)
  - `packageScheduleId`: `ObjectId` (Optional Ref: `packageSchedules`)
  - `bookingMode`: `String` (Enum: `HOURLY`, `DAILY`, `TOUR_PACKAGE`)
  - `checkInTime`: `Date` (Required UTC timestamp)
  - `checkOutTime`: `Date` (Required UTC timestamp)
  - `durationHours`: `Int32` (Optional: 3, 6, or 12 for hourly bookings)
  - `guestsCount`: `Int32` (Required)
  - `baseAmount`: `Double` (Required)
  - `taxAmountGst`: `Double` (Kerala Luxury GST 12%)
  - `ecoCessAmount`: `Double` (Kerala Eco-Conservation Cess 1%)
  - `totalAmount`: `Double` (Total payable amount)
  - `bookingStatus`: `String` (Enum: `PENDING_APPROVAL`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`, `REJECTED`)
  - `qrPassCode`: `String` (Encrypted digital pass hash)
  - `isInstantBook`: `Boolean` (True if instant, false if 15-min host approval required)
  - `approvalExpiresAt`: `Date` (15-min countdown deadline for request bookings)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `accounts._id`, Ref: `properties._id`, Ref: `rooms._id`, Ref: `packageSchedules._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f034" },
  "bookingNumber": "KL-BOOK-8821",
  "touristId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "propertyId": { "$oid": "66e04d3e89a4b2c1d8e1f027" },
  "roomId": { "$oid": "66e04d3e89a4b2c1d8e1f029" },
  "bookingMode": "HOURLY",
  "checkInTime": { "$date": "2026-11-10T08:30:00Z" },
  "checkOutTime": { "$date": "2026-11-10T11:30:00Z" },
  "durationHours": 3,
  "guestsCount": 2,
  "baseAmount": 750.0,
  "taxAmountGst": 90.0,
  "ecoCessAmount": 7.5,
  "totalAmount": 847.5,
  "bookingStatus": "CONFIRMED",
  "qrPassCode": "QR-KL-PASS-a7f9b8c0e1",
  "isInstantBook": true,
  "createdAt": { "$date": "2026-11-10T08:00:00Z" }
}
```

---

### 35. `inventoryHolds`
- **Purpose**: High-concurrency temporary reservation hold (15-minute TTL) protecting rooms during checkout.
- **Fields**:
  - `_id`: `ObjectId`
  - `roomId`: `ObjectId` (Required, Ref: `rooms`)
  - `touristId`: `ObjectId` (Required, Ref: `accounts`)
  - `holdStartTime`: `Date` (Required UTC timestamp)
  - `holdEndTime`: `Date` (Required UTC timestamp including 60-min housekeeping buffer)
  - `idempotencyKey`: `String` (Required unique client request token)
  - `expiresAt`: `Date` (Required TTL index target, 15 minutes from creation)
  - `createdAt`: `Date`
- **Constraint**: Unique index on `idempotencyKey`, TTL on `expiresAt`.
- **References**: Ref: `rooms._id`, Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f035" },
  "roomId": { "$oid": "66e04d3e89a4b2c1d8e1f029" },
  "touristId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "holdStartTime": { "$date": "2026-11-10T08:30:00Z" },
  "holdEndTime": { "$date": "2026-11-10T12:30:00Z" },
  "idempotencyKey": "idem_hold_9f81a7b8e01",
  "expiresAt": { "$date": "2026-11-10T08:15:00Z" },
  "createdAt": { "$date": "2026-11-10T08:00:00Z" }
}
```

---

### 36. `bookingGuests`
- **Purpose**: Guest manifest and mandatory pre-arrival government ID proofs for state tourism police compliance.
- **Fields**:
  - `_id`: `ObjectId`
  - `bookingId`: `ObjectId` (Required, Ref: `bookings`)
  - `fullName`: `String` (Required)
  - `age`: `Int32` (Required)
  - `gender`: `String` (Enum: `M`, `F`, `OTHER`)
  - `idProofType`: `String` (Enum: `AADHAAR`, `PASSPORT`, `VOTER_ID`)
  - `idProofMaskedNumber`: `String` (e.g. `XXXX-XXXX-1234`)
  - `idProofDocumentUrl`: `String` (Encrypted private cloud storage reference)
  - `isPrimaryGuest`: `Boolean` (Default `false`)
- **References**: Ref: `bookings._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f036" },
  "bookingId": { "$oid": "66e04d3e89a4b2c1d8e1f034" },
  "fullName": "Arjun Nair",
  "age": 32,
  "gender": "M",
  "idProofType": "AADHAAR",
  "idProofMaskedNumber": "XXXX-XXXX-9842",
  "idProofDocumentUrl": "s3://kerala-tourism-kyc/passports/arjun-masked.pdf",
  "isPrimaryGuest": true
}
```

---

### 37. `bookingEvents`
- **Purpose**: Append-only event-sourcing log auditing every status transition on a booking.
- **Fields**:
  - `_id`: `ObjectId`
  - `bookingId`: `ObjectId` (Required, Ref: `bookings`)
  - `eventType`: `String` (Enum: `CREATED`, `HOLD_ACQUIRED`, `HOST_APPROVED`, `PAID`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`)
  - `triggeredByAccountId`: `ObjectId` (Required, Ref: `accounts`)
  - `priorStatus`: `String`
  - `newStatus`: `String`
  - `notes`: `String` (Optional explanation)
  - `timestamp`: `Date` (Required)
- **References**: Ref: `bookings._id`, Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f037" },
  "bookingId": { "$oid": "66e04d3e89a4b2c1d8e1f034" },
  "eventType": "CHECKED_IN",
  "triggeredByAccountId": { "$oid": "66e04d3e89a4b2c1d8e1f099" },
  "priorStatus": "CONFIRMED",
  "newStatus": "CHECKED_IN",
  "notes": "Reception scanned 2D QR Code voucher",
  "timestamp": { "$date": "2026-11-10T08:32:00Z" }
}
```

---

### 38. `cancellationRequests`
- **Purpose**: Cancellation appeals, refund policy calculations, and penalty tracking.
- **Fields**:
  - `_id`: `ObjectId`
  - `bookingId`: `ObjectId` (Required, Ref: `bookings`, unique)
  - `requestedByAccountId`: `ObjectId` (Required, Ref: `accounts`)
  - `cancellationReason`: `String` (Required)
  - `hoursBeforeCheckIn`: `Double` (Hours remaining at cancellation time)
  - `refundPercentageApplied`: `Double` (e.g. `100.0` or `50.0`)
  - `calculatedRefundAmount`: `Double`
  - `status`: `String` (Enum: `PENDING_REVIEW`, `REFUNDED`, `REJECTED`)
  - `processedAt`: `Date`
- **References**: Ref: `bookings._id`, Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f038" },
  "bookingId": { "$oid": "66e04d3e89a4b2c1d8e1f034" },
  "requestedByAccountId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "cancellationReason": "Flight delayed at Cochin Airport",
  "hoursBeforeCheckIn": 4.5,
  "refundPercentageApplied": 100.0,
  "calculatedRefundAmount": 847.5,
  "status": "REFUNDED",
  "processedAt": { "$date": "2026-11-10T04:00:00Z" }
}
```

---

### 39. `payments`
- **Purpose**: External payment gateway transaction logs (UPI, NetBanking, Cards).
- **Fields**:
  - `_id`: `ObjectId`
  - `bookingId`: `ObjectId` (Required, Ref: `bookings`)
  - `gatewayTransactionId`: `String` (Required, unique provider transaction reference)
  - `paymentGateway`: `String` (Enum: `RAZORPAY`, `CASHFREE`, `UPI_DIRECT`)
  - `amount`: `Double` (Required)
  - `currency`: `String` (Default `'INR'`)
  - `paymentMethod`: `String` (Enum: `UPI`, `CARD`, `NETBANKING`, `PAY_AT_PROPERTY`)
  - `status`: `String` (Enum: `AUTHORIZED`, `CAPTURED`, `FAILED`, `HELD_IN_ESCROW`, `REFUNDED`)
  - `escrowReleaseDueAt`: `Date` (2 hours post-check-in release timestamp)
  - `isEscrowReleased`: `Boolean` (Default `false`)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `bookings._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f039" },
  "bookingId": { "$oid": "66e04d3e89a4b2c1d8e1f034" },
  "gatewayTransactionId": "pay_O9a8b7c6d5e4f3",
  "paymentGateway": "RAZORPAY",
  "amount": 847.5,
  "currency": "INR",
  "paymentMethod": "UPI",
  "status": "HELD_IN_ESCROW",
  "escrowReleaseDueAt": { "$date": "2026-11-10T10:30:00Z" },
  "isEscrowReleased": false,
  "createdAt": { "$date": "2026-11-10T08:02:00Z" }
}
```

---

### 40. `refunds`
- **Purpose**: Financial reversal records processed back to the traveler's source payment account.
- **Fields**:
  - `_id`: `ObjectId`
  - `paymentId`: `ObjectId` (Required, Ref: `payments`)
  - `bookingId`: `ObjectId` (Required, Ref: `bookings`)
  - `gatewayRefundId`: `String` (Required, unique gateway refund reference)
  - `amount`: `Double` (Required)
  - `reason`: `String` (Required)
  - `status`: `String` (Enum: `INITIATED`, `PROCESSED`, `FAILED`)
  - `completedAt`: `Date`
- **References**: Ref: `payments._id`, Ref: `bookings._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f040" },
  "paymentId": { "$oid": "66e04d3e89a4b2c1d8e1f039" },
  "bookingId": { "$oid": "66e04d3e89a4b2c1d8e1f034" },
  "gatewayRefundId": "rfnd_K9j8h7g6f5e4",
  "amount": 847.5,
  "reason": "Host declined booking within 15-minute SLA",
  "status": "PROCESSED",
  "completedAt": { "$date": "2026-11-10T08:15:00Z" }
}
```

---

### 41. `commissions`
- **Purpose**: Kerala Tourism platform maintenance fees and directorate levies.
- **Fields**:
  - `_id`: `ObjectId`
  - `bookingId`: `ObjectId` (Required, Ref: `bookings`, unique)
  - `businessProfileId`: `ObjectId` (Required, Ref: `businessProfiles`)
  - `grossBookingAmount`: `Double` (Required)
  - `commissionRatePercent`: `Double` (e.g. `8.0` for hourly stays, `10.0` for tour packages)
  - `commissionAmount`: `Double`
  - `netMerchantAmount`: `Double`
  - `isSettled`: `Boolean` (Default `false`)
- **References**: Ref: `bookings._id`, Ref: `businessProfiles._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f041" },
  "bookingId": { "$oid": "66e04d3e89a4b2c1d8e1f034" },
  "businessProfileId": { "$oid": "66e04d3e89a4b2c1d8e1f003" },
  "grossBookingAmount": 750.0,
  "commissionRatePercent": 8.0,
  "commissionAmount": 60.0,
  "netMerchantAmount": 690.0,
  "isSettled": true
}
```

---

### 42. `providerPayouts`
- **Purpose**: Batch bank payouts released to verified merchants following escrow clearance.
- **Fields**:
  - `_id`: `ObjectId`
  - `payoutReference`: `String` (Required, unique, e.g. `PAYOUT-202611-0081`)
  - `businessProfileId`: `ObjectId` (Required, Ref: `businessProfiles`)
  - `totalSettledAmount`: `Double` (Required)
  - `bankUtrNumber`: `String` (Bank transaction reference number)
  - `includedBookingIds`: `Array<ObjectId>` (Ref: `bookings`)
  - `payoutStatus`: `String` (Enum: `SCHEDULED`, `PROCESSING`, `COMPLETED`, `FAILED`)
  - `payoutDate`: `Date`
- **References**: Ref: `businessProfiles._id`, Ref: `bookings._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f042" },
  "payoutReference": "PAYOUT-202611-0081",
  "businessProfileId": { "$oid": "66e04d3e89a4b2c1d8e1f003" },
  "totalSettledAmount": 14250.0,
  "bankUtrNumber": "SBIN00829182910",
  "includedBookingIds": [{ "$oid": "66e04d3e89a4b2c1d8e1f034" }],
  "payoutStatus": "COMPLETED",
  "payoutDate": { "$date": "2026-11-10T11:00:00Z" }
}
```

---

### 43. `financialLedger`
- **Purpose**: Immutable double-entry audit ledger for statutory state tax compliance.
- **Fields**:
  - `_id`: `ObjectId`
  - `entryNumber`: `String` (Required, unique auto-incrementing ledger ID)
  - `bookingId`: `ObjectId` (Ref: `bookings`)
  - `entryType`: `String` (Enum: `ESCROW_CREDIT`, `COMMISSION_FEE`, `MERCHANT_PAYOUT`, `GST_COLLECTED`, `REFUND_DEBIT`)
  - `debit`: `Double` (Default `0.0`)
  - `credit`: `Double` (Default `0.0`)
  - `currency`: `String` (Default `'INR'`)
  - `checksum`: `String` (Cryptographic verification hash)
  - `createdAt`: `Date`
- **References**: Ref: `bookings._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f043" },
  "entryNumber": "LEDGER-2026-092819",
  "bookingId": { "$oid": "66e04d3e89a4b2c1d8e1f034" },
  "entryType": "COMMISSION_FEE",
  "debit": 0.0,
  "credit": 60.0,
  "currency": "INR",
  "checksum": "sha256_e819b7a0c1f2e...",
  "createdAt": { "$date": "2026-11-10T08:02:00Z" }
}
```

---

## Domain 8: Governance, Moderation & Support

### 44. `reviews`
- **Purpose**: Verified reviews and star ratings for homestays, resorts, packages, and destinations.
- **Fields**:
  - `_id`: `ObjectId`
  - `authorId`: `ObjectId` (Required, Ref: `accounts`)
  - `targetId`: `ObjectId` (Required generic entity ref)
  - `targetType`: `String` (Enum: `PROPERTY`, `TRAVEL_PACKAGE`, `DESTINATION`)
  - `bookingId`: `ObjectId` (Optional Ref: `bookings` proving verified stay)
  - `rating`: `Int32` (Required, 1 to 5 stars)
  - `reviewText`: `String` (Required, 10 to 1000 chars)
  - `photos`: `Array<String>` (Optional guest photos)
  - `isVerifiedStay`: `Boolean` (True if booked through platform)
  - `createdAt`: `Date`
- **References**: Ref: `accounts._id`, Ref: `bookings._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f044" },
  "authorId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "targetId": { "$oid": "66e04d3e89a4b2c1d8e1f027" },
  "targetType": "PROPERTY",
  "bookingId": { "$oid": "66e04d3e89a4b2c1d8e1f034" },
  "rating": 5,
  "reviewText": "Exceptional sunrise view over the backwaters. The transit room was spotless.",
  "isVerifiedStay": true,
  "createdAt": { "$date": "2026-11-10T12:00:00Z" }
}
```

---

### 45. `reports`
- **Purpose**: Community flags submitted by tourists for inappropriate destinations, posts, comments, or accounts, reviewed separately from content moderation lifecycle.
- **Fields**:
  - `_id`: `ObjectId`
  - `reporterId`: `ObjectId` (Required, Ref: `accounts`, immutable)
  - `targetType`: `String` (Enum: `DESTINATION`, `POST`, `COMMENT`, `ACCOUNT`, immutable)
  - `targetId`: `ObjectId` (Required target document ID, immutable)
  - `reason`: `String` (Enum: `SPAM`, `HARASSMENT`, `MISLEADING_INFORMATION`, `INAPPROPRIATE_CONTENT`, `FAKE_DESTINATION`, `FRAUD`, `OTHER`)
  - `description`: `String | null` (Optional details up to 1000 chars; required >= 5 chars when `reason === 'OTHER'`)
  - `status`: `String` (Enum: `PENDING`, `UNDER_REVIEW`, `RESOLVED`, `DISMISSED`, default: `PENDING`)
  - `reviewedBy`: `ObjectId | null` (Optional Ref: `accounts`)
  - `reviewedAt`: `Date | null` (Timestamp when moderator reviewed)
  - `moderatorNotes`: `String | null` (Optional up to 1000 chars; required >= 3 chars when `RESOLVED` or `DISMISSED`)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f045" },
  "reporterId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "targetType": "POST",
  "targetId": { "$oid": "66e04d3e89a4b2c1d8e1f011" },
  "reason": "MISLEADING_INFORMATION",
  "description": "Post claims waterfall entry road is open despite monsoon closure.",
  "status": "PENDING",
  "reviewedBy": null,
  "reviewedAt": null,
  "moderatorNotes": null,
  "createdAt": { "$date": "2026-11-12T09:00:00Z" },
  "updatedAt": { "$date": "2026-11-12T09:00:00Z" }
}
```

---

### 46. `blocks`
- **Purpose**: User-to-user blocking for messaging and social feed seclusion.
- **Fields**:
  - `_id`: `ObjectId`
  - `blockerAccountId`: `ObjectId` (Required, Ref: `accounts`)
  - `blockedAccountId`: `ObjectId` (Required, Ref: `accounts`)
  - `createdAt`: `Date`
- **Constraint**: Unique compound index `{ blockerAccountId: 1, blockedAccountId: 1 }`.
- **References**: Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f046" },
  "blockerAccountId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "blockedAccountId": { "$oid": "66e04d3e89a4b2c1d8e1f099" },
  "createdAt": { "$date": "2026-11-10T09:30:00Z" }
}
```

---

### 47. `notifications`
- **Purpose**: System alerts (Booking confirmed, 15-min countdown, Admin approval).
- **Fields**:
  - `_id`: `ObjectId`
  - `recipientAccountId`: `ObjectId` (Required, Ref: `accounts`)
  - `notificationType`: `String` (Enum: `BOOKING_CONFIRMED`, `KYC_APPROVED`, `NEW_FOLLOWER`, `OFFER_RECEIVED`)
  - `title`: `String` (Required)
  - `body`: `String` (Required)
  - `deepLinkRoute`: `String` (e.g. `/my-bookings?id=KL-BOOK-8821`)
  - `isRead`: `Boolean` (Default `false`)
  - `createdAt`: `Date`
- **References**: Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f047" },
  "recipientAccountId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "notificationType": "BOOKING_CONFIRMED",
  "title": "Hourly Room Confirmed",
  "body": "Kumarakom Lake Breeze Homestay confirmed your 3-hour transit slot.",
  "deepLinkRoute": "/my-bookings?id=KL-BOOK-8821",
  "isRead": false,
  "createdAt": { "$date": "2026-11-10T08:02:00Z" }
}
```

---

### 48. `media`
- **Purpose**: Centralized registry of uploaded photography, video assets, and metadata for destinations and platform entities.
- **Fields**:
  - `_id`: `ObjectId` (Primary Key)
  - `uploaderAccountId`: `ObjectId` (Required, Ref: `accounts`)
  - `destinationId`: `ObjectId` (Optional, Ref: `destinations`, indexed)
  - `storageKey`: `String` (Required, unique cloud object key)
  - `url`: `String` (Required, direct CDN or accessible storage URL)
  - `mimeType`: `String` (Enum: `image/jpeg`, `image/png`, `image/webp`, `image/avif`)
  - `fileSizeBytes`: `Int64` (File size in bytes, max 5,242,880 / 5MB)
  - `dimensions`: `Object` (Embedded: `{ width: 1920, height: 1080 }`)
  - `isPrimary`: `Boolean` (Default `false`, designates primary destination cover image)
  - `displayOrder`: `Int32` (Default `0`, gallery sort order)
  - `isModerated`: `Boolean` (Default `true`)
  - `createdAt`: `Date` (Auto timestamp)
  - `updatedAt`: `Date` (Auto timestamp)
- **Indexes**:
  - `{ storageKey: 1 }` (Unique)
  - `{ destinationId: 1, displayOrder: 1 }` (Gallery ordering compound index)
  - `{ uploaderAccountId: 1, createdAt: -1 }` (Uploader audit history)
- **References**: Ref: `accounts._id`, Ref: `destinations._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f048" },
  "uploaderAccountId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "destinationId": { "$oid": "66e04d3e89a4b2c1d8e1f009" },
  "storageKey": "destinations/munroe-aerial-1.webp",
  "url": "https://cdn.keralatourism.org/media/destinations/munroe-aerial-1.webp",
  "mimeType": "image/webp",
  "fileSizeBytes": 482100,
  "dimensions": { "width": 1920, "height": 1080 },
  "isPrimary": true,
  "displayOrder": 1,
  "isModerated": true,
  "createdAt": { "$date": "2026-11-10T04:00:00Z" },
  "updatedAt": { "$date": "2026-11-10T04:00:00Z" }
}
```

---

### 49. `auditLogs`
- **Purpose**: Append-only, immutable administrative governance and moderation ledger recording user status overrides and content moderation decisions.
- **Fields**:
  - `_id`: `ObjectId`
  - `actorAccountId`: `ObjectId` (Required, Ref: `accounts`)
  - `actorAccountType`: `String` (`ADMIN`)
  - `actorAdminLevel`: `String` (`SUPER_ADMIN`, `DISTRICT_OFFICER`, `MODERATOR`)
  - `action`: `String` (`USER_SUSPENDED`, `USER_REACTIVATED`, `DESTINATION_SUBMISSION_APPROVED`, `DESTINATION_SUBMISSION_REJECTED`, `POST_APPROVED`, `POST_REJECTED`, `POST_REMOVED`, `COMMENT_REMOVED`, `COMMENT_RESTORED`, `REPORT_UNDER_REVIEW`, `REPORT_RESOLVED`, `REPORT_DISMISSED`)
  - `targetEntityId`: `ObjectId`
  - `targetEntityType`: `String` (`ACCOUNT`, `DESTINATION`, `DESTINATION_SUBMISSION`, `POST`, `COMMENT`, `REPORT`)
  - `reason`: `String` (Sanitized justification, max 500 chars)
  - `beforeState`: `Object` (Redacted snapshot prior to modification)
  - `afterState`: `Object` (Redacted snapshot post modification)
  - `ipAddress`: `String | null`, `userAgent`: `String | null`
  - `timestamp`: `Date` (Required)
- **References**: Ref: `accounts._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f049" },
  "actorAccountId": { "$oid": "66e04d3e89a4b2c1d8e1f088" },
  "actorRole": "DISTRICT_OFFICER",
  "action": "APPROVE_DESTINATION_SUBMISSION",
  "targetEntityId": { "$oid": "66e04d3e89a4b2c1d8e1f009" },
  "targetEntityType": "destinationSubmissions",
  "ipAddress": "103.24.18.91",
  "beforeState": { "submissionStatus": "IN_REVIEW" },
  "afterState": { "submissionStatus": "ACCEPTED" },
  "timestamp": { "$date": "2026-11-10T05:30:00Z" }
}
```

---

### 50. `supportTickets`
- **Purpose**: Tourist grievances and Kerala Tourist Police emergency escalation tickets (Helpline 1364).
- **Fields**:
  - `_id`: `ObjectId`
  - `ticketNumber`: `String` (Required, unique, e.g. `HELP-1364-8921`)
  - `requesterAccountId`: `ObjectId` (Required, Ref: `accounts`)
  - `category`: `String` (Enum: `TOURIST_POLICE_EMERGENCY`, `BOOKING_DISPUTE`, `LOST_PROPERTY`, `GENERAL_INQUIRY`)
  - `priority`: `String` (Enum: `CRITICAL_URGENT`, `HIGH`, `MEDIUM`, `LOW`)
  - `subject`: `String` (Required)
  - `description`: `String` (Required)
  - `status`: `String` (Enum: `OPEN`, `DISPATCHED_TO_TOURIST_POLICE`, `RESOLVED`, `CLOSED`)
  - `assignedOfficerId`: `ObjectId` (Ref: `adminProfiles`)
  - `createdAt`: `Date`, `updatedAt`: `Date`
- **References**: Ref: `accounts._id`, Ref: `adminProfiles._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f050" },
  "ticketNumber": "HELP-1364-8921",
  "requesterAccountId": { "$oid": "66e04d3e89a4b2c1d8e1f001" },
  "category": "TOURIST_POLICE_EMERGENCY",
  "priority": "CRITICAL_URGENT",
  "subject": "Stranded during heavy monsoon downpour near Athirappilly",
  "description": "Taxi broken down on forest highway. Need nearest tourist assistance dispatch.",
  "status": "DISPATCHED_TO_TOURIST_POLICE",
  "assignedOfficerId": { "$oid": "66e04d3e89a4b2c1d8e1f004" },
  "createdAt": { "$date": "2026-11-10T10:00:00Z" }
}
```

---

### 51. `systemSettings`
- **Purpose**: Global platform configurations, active monsoon advisories, and statutory tax parameters.
- **Fields**:
  - `_id`: `ObjectId`
  - `configKey`: `String` (Required, unique, e.g. `PLATFORM_FEES`, `MONSOON_ALERT_BANNER`)
  - `configValue`: `Object` (Dynamic JSON structure)
  - `lastModifiedByAdminId`: `ObjectId` (Ref: `adminProfiles`)
  - `updatedAt`: `Date`
- **References**: Ref: `adminProfiles._id`.
- **Example Document**:
```json
{
  "_id": { "$oid": "66e04d3e89a4b2c1d8e1f051" },
  "configKey": "PLATFORM_FEES",
  "configValue": {
    "hourlyStayCommissionPercent": 8.0,
    "dailyStayCommissionPercent": 8.0,
    "tourPackageCommissionPercent": 10.0,
    "luxuryGstRatePercent": 12.0,
    "ecoConservationCessPercent": 1.0,
    "instantBookingGraceMinutes": 120
  },
  "lastModifiedByAdminId": { "$oid": "66e04d3e89a4b2c1d8e1f004" },
  "updatedAt": { "$date": "2026-11-01T00:00:00Z" }
}
```
