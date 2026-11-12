# Nearby Destination Discovery & Media Management API Documentation

This document describes the **Geospatial Nearby Destination Discovery**, **Provider-Independent Map Architecture**, and **Destination Media Management** services in the Kerala Tourism backend ecosystem.

---

## 1. Nearby Destination Discovery API

### 1.1 Endpoint Overview
* **Route**: `GET /api/v1/destinations/nearby`
* **Access Level**: Public (No authentication required)
* **Description**: Discovers verified and published destinations within a configurable spherical radius of user-supplied GPS coordinates. Returns destinations sorted strictly nearest-first with dynamic distance calculations.

### 1.2 Query Parameters

| Parameter | Type | Required | Constraints & Validation | Default | Description |
|---|---|---|---|---|---|
| `latitude` | `Number` | **Yes** | Valid WGS84 latitude between `-90.0` and `90.0` | — | User or device current GPS latitude |
| `longitude` | `Number` | **Yes** | Valid WGS84 longitude between `-180.0` and `180.0` | — | User or device current GPS longitude |
| `radiusKm` | `Number` | No | Positive number, maximum `100.0` km | `25` | Search radius in kilometers |
| `categoryId`| `String` | No | Valid 24-character hexadecimal MongoDB ObjectId | — | Optional destination category filter |
| `page` | `Integer`| No | Integer $\ge 1$ | `1` | Pagination page number |
| `limit` | `Integer`| No | Integer between `1` and `50` | `10` | Results per page |

### 1.3 Geospatial Index & Query Pipeline
* **Storage Engine**: MongoDB Atlas with WiredTiger storage engine.
* **Index Utilized**: `2dsphere` geospatial index on `destinations.location`.
* **Aggregation Pipeline**:
  ```javascript
  [
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [longitude, latitude] // [lng, lat] per GeoJSON RFC 7946
        },
        distanceField: "distanceMeters",
        maxDistance: radiusKm * 1000, // Converted to meters
        query: {
          verificationStatus: "VERIFIED",
          publicationStatus: "PUBLISHED"
          // and optional categoryId
        },
        spherical: true
      }
    },
    {
      $facet: {
        items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        totalCount: [{ $count: "total" }]
      }
    }
  ]
  ```

### 1.4 Distance Calculation
* **Server Metric**: Distance is calculated directly on the database engine using spherical geometry (haversine / WGS84 ellipsoid).
* **Return Units**:
  * `distanceMeters`: Whole integer meters.
  * `distanceKm`: Rounded to two decimal places (e.g. `3.14` km).

### 1.5 Security & Visibility Invariants
1. **Zero Unapproved Leakage**: Destinations in `DRAFT`, `ARCHIVED`, `PENDING`, or `REJECTED` states are strictly excluded from results via the database `$geoNear` query filter.
2. **ReDoS / Injection Immune**: Parameters are strongly validated and coerced by Zod (`nearbyDestinationQuerySchema`).
3. **Radius Enforcement**: Searches exceeding `100 km` are rejected with HTTP 400 (`VALIDATION_ERROR`).

---

## 2. API Exemplars

### 2.1 Nearby Search Request
```http
GET /api/v1/destinations/nearby?latitude=9.9312&longitude=76.2673&radiusKm=25&page=1&limit=2 HTTP/1.1
Host: api.keralatourism.org
Accept: application/json
```

### 2.2 Successful Response (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "66e04d3e89a4b2c1d8e1f001",
      "name": "Mattancherry Palace",
      "slug": "mattancherry-palace",
      "description": "Portuguese palace in Mattancherry, Kochi featuring Kerala murals.",
      "categoryIds": ["66e04d3e89a4b2c1d8e1f088"],
      "location": {
        "type": "Point",
        "coordinates": [76.2592, 9.9583]
      },
      "address": "Mattancherry, Kochi, Kerala 682002",
      "district": "Ernakulam",
      "images": [
        "https://cdn.keralatourism.org/media/destinations/mattancherry/mural-art.webp"
      ],
      "facilities": ["Parking", "Guided Tour", "Restrooms"],
      "entryFee": {
        "amount": 25,
        "currency": "INR",
        "isFree": false
      },
      "verificationStatus": "VERIFIED",
      "publicationStatus": "PUBLISHED",
      "distanceMeters": 3140,
      "distanceKm": 3.14,
      "publishedAt": "2026-11-10T08:00:00.000Z",
      "createdAt": "2026-11-10T06:00:00.000Z",
      "updatedAt": "2026-11-10T08:30:00.000Z"
    },
    {
      "id": "66e04d3e89a4b2c1d8e1f002",
      "name": "Fort Kochi Beach",
      "slug": "fort-kochi-beach",
      "description": "Tranquil beach along the Arabian Sea with Chinese fishing nets.",
      "categoryIds": ["66e04d3e89a4b2c1d8e1f089"],
      "location": {
        "type": "Point",
        "coordinates": [76.2415, 9.9658]
      },
      "address": "Fort Kochi, Kochi, Kerala 682001",
      "district": "Ernakulam",
      "images": [
        "https://cdn.keralatourism.org/media/destinations/fort-kochi/nets-at-sunset.webp"
      ],
      "facilities": ["Walkway", "Food Stalls"],
      "entryFee": {
        "amount": 0,
        "currency": "INR",
        "isFree": true
      },
      "verificationStatus": "VERIFIED",
      "publicationStatus": "PUBLISHED",
      "distanceMeters": 4820,
      "distanceKm": 4.82,
      "publishedAt": "2026-11-10T08:00:00.000Z",
      "createdAt": "2026-11-10T06:00:00.000Z",
      "updatedAt": "2026-11-10T08:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 2,
    "total": 5,
    "totalPages": 3
  }
}
```

### 2.3 Empty Results Response (200 OK)
When no verified and published destinations fall within the specified radial distance:
```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

### 2.4 Error Responses (400 Bad Request)

#### Latitude Out of Range
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed: Latitude must be between -90 and 90",
    "details": [
      {
        "field": "latitude",
        "message": "Latitude must be between -90 and 90"
      }
    ]
  }
}
```

#### Radius Exceeding Maximum Limit
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed: Radius cannot exceed 100 km",
    "details": [
      {
        "field": "radiusKm",
        "message": "Radius cannot exceed 100 km"
      }
    ]
  }
}
```

---

## 3. Provider-Independent Map Architecture

### 3.1 Public Map Configuration Endpoint
* **Route**: `GET /api/v1/maps/config`
* **Access Level**: Public
* **Description**: Returns safe map configuration for web/mobile applications without exposing server-side private credentials or billing keys.

#### Example Response (200 OK)
```json
{
  "success": true,
  "data": {
    "provider": "osm",
    "defaultCenter": {
      "latitude": 10.8505,
      "longitude": 76.2711
    },
    "defaultZoom": 8,
    "bounds": {
      "minLatitude": 8.18,
      "maxLatitude": 12.85,
      "minLongitude": 74.86,
      "maxLongitude": 77.42
    },
    "tileLayerUrl": "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
  }
}
```

---

## 4. Destination Media Management

### 4.1 Attach Media to Destination
* **Route**: `POST /api/v1/destinations/:id/media`
* **Access Level**: Authenticated (Admin with `MANAGE_DESTINATIONS` or destination creator)
* **MIME Types Allowed**: `image/jpeg`, `image/png`, `image/webp`, `image/avif`
* **Max Size**: `5 MB` (5,242,880 bytes)

#### Request Payload
```json
{
  "storageKey": "destinations/mattancherry/mural-art.webp",
  "url": "https://cdn.keralatourism.org/media/destinations/mattancherry/mural-art.webp",
  "mimeType": "image/webp",
  "fileSizeBytes": 245000,
  "dimensions": {
    "width": 1920,
    "height": 1080
  },
  "isPrimary": true,
  "displayOrder": 1
}
```

#### Response (201 Created)
```json
{
  "success": true,
  "message": "Media attached to destination successfully",
  "data": {
    "id": "66e04d3e89a4b2c1d8e1f055",
    "uploaderAccountId": "66e04d3e89a4b2c1d8e1f001",
    "destinationId": "66e04d3e89a4b2c1d8e1f002",
    "storageKey": "destinations/mattancherry/mural-art.webp",
    "url": "https://cdn.keralatourism.org/media/destinations/mattancherry/mural-art.webp",
    "mimeType": "image/webp",
    "fileSizeBytes": 245000,
    "dimensions": {
      "width": 1920,
      "height": 1080
    },
    "isPrimary": true,
    "displayOrder": 1,
    "isModerated": true,
    "createdAt": "2026-11-10T13:00:00.000Z",
    "updatedAt": "2026-11-10T13:00:00.000Z"
  }
}
```

### 4.2 Update Destination Media
* **Route**: `PATCH /api/v1/destinations/:id/media/:mediaId`
* **Access Level**: Authenticated (Admin or destination creator)

### 4.3 Delete Destination Media
* **Route**: `DELETE /api/v1/destinations/:id/media/:mediaId`
* **Access Level**: Authenticated (Admin or destination creator)

### 4.4 List Destination Media Gallery
* **Route**: `GET /api/v1/destinations/:id/media`
* **Access Level**: Public
* **Sorting**: Ordered by `isPrimary` descending (primary first), then `displayOrder` ascending.
