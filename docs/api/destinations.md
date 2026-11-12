# Destination Management System API & Architecture Documentation

This document describes the **Destination Management System** for the Kerala Tourism backend ecosystem.

---

## 1. Domain Overview & Dual-Status Architecture

The destination ecosystem operates on an **independent dual-status architecture** to cleanly separate administrative geospatial accreditation from public release scheduling:

```
+-------------------------------------------------------------+
|              DESTINATION VERIFICATION LIFECYCLE             |
|                                                             |
|   [ Tourist Submission ]                                    |
|             │                                               |
|             ▼                                               |
|       ( PENDING ) ──[ Admin Rejection ]──> ( REJECTED )     |
|             │                                               |
|             └───[ Admin Verification ]───> ( VERIFIED )     |
+-------------------------------------------------------------+
                              │
                              ▼
+-------------------------------------------------------------+
|              DESTINATION PUBLICATION LIFECYCLE              |
|                                                             |
|                          ( DRAFT )                          |
|                              │                              |
|           ┌──────────────────┴──────────────────┐           |
|           │ Admin Publish                       │           |
|           │ (Req: VERIFIED)                     │           |
|           ▼                                     ▼           |
|     ( PUBLISHED )                        ( ARCHIVED )       |
|     (Publicly Discoverable)                                 |
+-------------------------------------------------------------+
```

### Public Discoverability Invariant
A destination is accessible through public endpoints (`/api/v1/destinations`, `/api/v1/destinations/:slug`, `/api/v1/destinations/search`) **strictly** when:
$$\text{verificationStatus} = \text{VERIFIED} \quad \land \quad \text{publicationStatus} = \text{PUBLISHED}$$

Any destination in `DRAFT`, `ARCHIVED`, `PENDING`, or `REJECTED` state returns HTTP `404 Not Found` upon public single-resource lookup to conceal its existence.

---

## 2. Data Models & Schemas

### 2.1 Destination Model (`destinations`)

| Field | BSON / TS Type | Constraints & Description |
|---|---|---|
| `_id` | `ObjectId` | Primary Key |
| `name` | `String` | Required, trimmed, 2–120 characters |
| `slug` | `String` | Required, unique index, normalized lowercase alphanumeric + hyphens |
| `description` | `String` | Required, trimmed, 20–5000 characters |
| `shortDescription` | `String` | Optional summary, max 300 characters |
| `categoryIds` | `Array<ObjectId>` | References `destinationCategories._id`, indexed |
| `location` | `GeoPoint` | GeoJSON `Point`: `{ type: "Point", coordinates: [lng, lat] }`, `2dsphere` indexed |
| `address` | `String` | Required, 5–300 characters |
| `district` | `String` | Required, enum: 14 approved Kerala districts, indexed |
| `locality` | `String` | Optional landmark or revenue village |
| `images` | `Array<String>` | Media URLs or media reference IDs |
| `facilities` | `Array<String>` | Available amenities (e.g., `["PARKING", "RESTROOMS", "GUIDE"]`) |
| `bestTimeToVisit` | `String` | Recommended months or seasonal window |
| `entryFee` | `Object` | `{ amount: Number (>= 0), currency: "INR", isFree: Boolean }` |
| `verificationStatus` | `String` | Enum: `PENDING`, `VERIFIED`, `REJECTED` (default: `PENDING`), indexed |
| `publicationStatus` | `String` | Enum: `DRAFT`, `PUBLISHED`, `ARCHIVED` (default: `DRAFT`), indexed |
| `createdBy` | `ObjectId` | Ref: `accounts._id`, Creator identity |
| `verifiedBy` | `ObjectId` | Optional Ref: `accounts._id`, Reviewing administrator |
| `publishedAt` | `Date` | Timestamp of initial publication |
| `createdAt` / `updatedAt` | `Date` | Automated audit timestamps |

#### GeoJSON Coordinate Rules:
- Must use **`[longitude, latitude]`** order (RFC 7946 / MongoDB 2dsphere specification).
- Bound by Kerala geographic boundary:
  - Longitude: `74.86 <= lng <= 77.42`
  - Latitude: `8.18 <= lat <= 12.85`

---

### 2.2 DestinationCategory Model (`destinationCategories`)

Master taxonomic registry for travel discovery classifications.

| Field | BSON / TS Type | Description |
|---|---|---|
| `_id` | `ObjectId` | Primary Key |
| `name` | `String` | Required, unique, trimmed, 2–50 characters (e.g. `Backwaters & Lagoons`) |
| `slug` | `String` | Required, unique, normalized lowercase (e.g. `backwaters-lagoons`) |
| `description` | `String` | Optional, max 500 characters |
| `icon` | `String` | Material Symbol icon key (e.g. `water`, `terrain`) |
| `isActive` | `Boolean` | Visibility flag, default `true`, indexed |

---

### 2.3 DestinationSubmission Model (`destinationSubmissions`)

Community crowdsourced travel proposals submitted by tourists awaiting regulatory review.

| Field | BSON / TS Type | Description |
|---|---|---|
| `_id` | `ObjectId` | Primary Key |
| `submittedBy` | `ObjectId` | Ref: `accounts._id`, anchored strictly to authenticated JWT identity |
| `name` | `String` | Required, 2–120 characters |
| `description` | `String` | Required, 20–2000 characters |
| `categoryIds` | `Array<ObjectId>` | References `destinationCategories._id` |
| `submittedLocation` | `GeoPoint` | GeoJSON `{ type: "Point", coordinates: [lng, lat] }` |
| `submittedAddress` | `String` | Required street/landmark address, 5–300 characters |
| `imageMediaIds` | `Array<String>` | 1 to 10 media references |
| `submissionStatus` | `String` | Enum: `PENDING`, `APPROVED`, `REJECTED` (default: `PENDING`) |
| `reviewedBy` | `ObjectId` | Ref: `accounts._id`, reviewing admin |
| `reviewedAt` | `Date` | Timestamp of review decision |
| `reviewNotes` | `String` | Administrator feedback or justification, max 1000 characters |
| `destinationId` | `ObjectId` | Optional Ref: `destinations._id` (linked upon approval) |

---

## 3. Public API Endpoints

### 3.1 List Published Destinations
- **Endpoint**: `GET /api/v1/destinations`
- **Access**: Public
- **Query Parameters**:
  - `page`: Integer $\ge 1$ (default: `1`)
  - `limit`: Integer $1 \le \text{limit} \le 50$ (default: `10`)
  - `district`: Valid Kerala district (e.g., `Idukki`, `Wayanad`)
  - `categoryId`: 24-character hexadecimal `ObjectId`
  - `search`: Keyword string (case-insensitive substring match)
  - `sortBy`: `name` \| `createdAt` (default: `createdAt`)
  - `sortOrder`: `asc` \| `desc` (default: `desc`)

**Response Example (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "672f5d912b7a9e018a3d5f12",
      "name": "Athirappilly Waterfalls",
      "slug": "athirappilly-waterfalls",
      "description": "Majestic 80-foot waterfall on the Chalakudy River, known as the Niagara of India.",
      "categoryIds": ["672f5d912b7a9e018a3d5f01"],
      "location": {
        "type": "Point",
        "coordinates": [76.5688, 10.285]
      },
      "address": "Athirappilly, Thrissur District, Kerala 680721",
      "district": "Thrissur",
      "images": ["https://cdn.keralatourism.gov.in/spots/athirappilly-1.jpg"],
      "facilities": ["PARKING", "RESTROOMS", "VIEWPOINT"],
      "entryFee": {
        "amount": 50,
        "currency": "INR",
        "isFree": false
      },
      "verificationStatus": "VERIFIED",
      "publicationStatus": "PUBLISHED",
      "publishedAt": "2026-11-10T08:00:00.000Z",
      "createdAt": "2026-11-10T06:00:00.000Z",
      "updatedAt": "2026-11-10T08:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### 3.2 Get Destination By Slug
- **Endpoint**: `GET /api/v1/destinations/:slug`
- **Access**: Public
- **Security Invariant**: Returns `404 Not Found` if the destination does not exist, or if its status is `DRAFT`, `ARCHIVED`, `PENDING`, or `REJECTED`.

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "672f5d912b7a9e018a3d5f12",
    "name": "Athirappilly Waterfalls",
    "slug": "athirappilly-waterfalls",
    "description": "Majestic 80-foot waterfall...",
    "location": { "type": "Point", "coordinates": [76.5688, 10.285] },
    "district": "Thrissur",
    "verificationStatus": "VERIFIED",
    "publicationStatus": "PUBLISHED"
  }
}
```

---

### 3.3 Search Destinations
- **Endpoint**: `GET /api/v1/destinations/search?q=Munnar`
- **Access**: Public
- **Query Parameters**:
  - `q` or `search`: Search query (trimmed, regex-escaped against ReDoS)
  - `page`: Page index (default: 1)
  - `limit`: Page size (default: 10, max: 50)

---

### 3.4 List Active Destination Categories
- **Endpoint**: `GET /api/v1/destination-categories`
- **Access**: Public
- **Behavior**: Returns active categories sorted alphabetically. Excludes internal admin metadata (`createdAt`, `updatedAt`, `__v`).

**Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "672f5d912b7a9e018a3d5f01",
      "name": "Backwaters & Lagoons",
      "slug": "backwaters-lagoons",
      "description": "Canal cruises and traditional kettuvallam houseboats",
      "icon": "water"
    },
    {
      "id": "672f5d912b7a9e018a3d5f02",
      "name": "Hill Stations & Tea Estates",
      "slug": "hill-stations-tea-estates",
      "description": "Misty mountain peaks and colonial plantations",
      "icon": "terrain"
    }
  ]
}
```

---

## 4. Tourist Destination Submissions

Authenticated tourists can submit hidden spots or community suggestions.

### 4.1 Create Destination Submission
- **Endpoint**: `POST /api/v1/tourist/destination-submissions`
- **Access**: Authenticated (`TOURIST` account only)
- **Security**: `submittedBy` is derived exclusively from `req.user.id`. Any `submittedBy` in the body triggers HTTP `400 Bad Request`.

**Request Body**:
```json
{
  "name": "Hidden Stream in Marayoor",
  "description": "A crystal-clear natural stream passing through the natural sandalwood forests.",
  "categoryIds": ["672f5d912b7a9e018a3d5f02"],
  "submittedLocation": {
    "type": "Point",
    "coordinates": [77.1593, 10.2798]
  },
  "submittedAddress": "Near Marayoor Sandalwood Reserve, Idukki",
  "imageMediaIds": ["media-photo-001", "media-photo-002"]
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "message": "Destination suggestion submitted successfully",
  "data": {
    "id": "672f6a193c8b0e129b4e6a01",
    "submittedBy": "66e04d3e89a4b2c1d8e1f001",
    "name": "Hidden Stream in Marayoor",
    "submissionStatus": "PENDING",
    "createdAt": "2026-11-10T12:00:00.000Z"
  }
}
```

---

### 4.2 Tourist Self-Service Submissions Query
- **Endpoint**: `GET /api/v1/tourist/destination-submissions`
- **Access**: Authenticated (`TOURIST` account only)
- **Behavior**: Retrieves only submissions created by the caller (`submittedBy === req.user.id`).

---

### 4.3 Tourist Submission Lookup (IDOR Concealment)
- **Endpoint**: `GET /api/v1/tourist/destination-submissions/:id`
- **Access**: Authenticated (`TOURIST` account only)
- **Security Invariant**: If a tourist queries a submission ID belonging to another tourist, the system responds with:
  ```json
  {
    "success": false,
    "error": {
      "message": "Destination submission not found",
      "code": "RESOURCE_NOT_FOUND"
    }
  }
  ```
  HTTP `404 Not Found` completely conceals resource existence, preventing IDOR probing.

---

## 5. Administrative Destination Management

All administrative routes require authentication, active account status, and specific fine-grained permissions.

### 5.1 Create Official Destination
- **Endpoint**: `POST /api/v1/admin/destinations`
- **Access**: `ADMIN` account with `MANAGE_DESTINATIONS` permission
- **Behavior**: Creates an official destination in `VERIFIED` and `DRAFT` status.

---

### 5.2 Update Official Destination
- **Endpoint**: `PATCH /api/v1/admin/destinations/:id`
- **Access**: `ADMIN` account with `MANAGE_DESTINATIONS` permission

---

### 5.3 Publish Destination
- **Endpoint**: `PATCH /api/v1/admin/destinations/:id/publish`
- **Access**: `ADMIN` account with `MANAGE_DESTINATIONS` permission
- **Enforcement Rule**: Destination must have `verificationStatus === 'VERIFIED'`.
- **Rejection on Unverified**: If `verificationStatus !== 'VERIFIED'`, returns:
  ```json
  {
    "success": false,
    "error": {
      "message": "Cannot publish an unverified destination. Destination must be VERIFIED prior to publication.",
      "code": "CANNOT_PUBLISH_UNVERIFIED_DESTINATION"
    }
  }
  ```
  HTTP `400 Bad Request`.

---

### 5.4 Archive Destination
- **Endpoint**: `PATCH /api/v1/admin/destinations/:id/archive`
- **Access**: `ADMIN` account with `MANAGE_DESTINATIONS` permission
- **Behavior**: Transitions `publicationStatus` to `ARCHIVED`, immediately removing it from public search and listing.

---

### 5.5 List Submissions for Moderation
- **Endpoint**: `GET /api/v1/admin/destination-submissions`
- **Access**: `ADMIN` account with `VERIFY_DESTINATIONS` permission
- **Query Parameters**: `status` (`PENDING`, `APPROVED`, `REJECTED`), `page`, `limit`

---

### 5.6 Review Submission (Approval & Rejection)
- **Endpoint**: `PATCH /api/v1/admin/destination-submissions/:id/review`
- **Access**: `ADMIN` account with `VERIFY_DESTINATIONS` permission
- **Request Body**:
  ```json
  {
    "action": "APPROVE",
    "reviewNotes": "Coordinates verified against Forest Department boundary map."
  }
  ```

#### Approval Behavior & Idempotency:
1. Validates the submission exists.
2. Checks if `submissionStatus === 'APPROVED'` and `destinationId` is present. If so, returns the existing official destination without creating duplicates.
3. If first approval:
   - Creates official `Destination` with `verificationStatus: 'VERIFIED'`, `publicationStatus: 'DRAFT'`, `verifiedBy: req.user.id`.
   - Links `destinationId` in the submission.
   - Updates submission to `submissionStatus: 'APPROVED'`, records `reviewedBy`, `reviewedAt`.

#### Rejection Behavior:
- Sets `submissionStatus: 'REJECTED'`, records `reviewedBy`, `reviewedAt`, and `reviewNotes`.
