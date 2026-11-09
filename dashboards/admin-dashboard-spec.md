# Admin Dashboard UI/UX Specification (10 Modules)
**Kerala Tourism Governance & Moderation Portal**  
**Desktop Viewport:** 1440px baseline (collapsible sidebar, responsive down to 1024px)  
**Theme:** Kerala Nature + Governance Dark Slate (`#145C43`, `#78A878`, `#202A25`, `#F8F7F1`)  
**Typography:** Inter (Tabular figures for currency, coordinates, and timestamps)

---

## 1. Global Shell & Information Architecture

- **Persistent Left Navigation Rail (Width: 260px):**
  - Brand identity: Kerala Tourism Emblem + "Admin Console v2.4".
  - Section 1 — Governance: Overview, User Management, Audit Logs.
  - Section 2 — Trust & Safety: Destination Verification Queue (Badge: `8`), Post Moderation (Badge: `3`), Business Verification (Badge: `12`).
  - Section 3 — Marketplace Operations: Booking Management, Payment & Escrow, Reports, Analytics.
  - Admin Profile Footer: "Inspector Rajesh Kumar (Dept. of Tourism)", Status dot (Active), "Sign Out".
- **Top Command Bar (Height: 64px):**
  - Global Search input (`Cmd+K` / `Ctrl+K` palette for quick jumping to User ID, Booking Ref, or Property).
  - Emergency Broadcast Alert trigger ("Post Monsoon Advisory Banner").
  - Notification Bell (real-time alerts on flagged posts and merchant KYC uploads).

---

## 2. The 10 Admin Dashboard Modules

### ADM-01: Overview Dashboard
- **Top KPI Metric Cards (4 Cards):**
  1. `Total Verified Explorers`: 128,490 (`+14% MoM`).
  2. `Active Community Destinations`: 1,420 published (`8 pending review`).
  3. `Total Gross Booking Volume`: ₹4.82 Cr (This month).
  4. `Active Verified Merchants`: 892 (Agencies, Resorts, Homestays).
- **Interactive Kerala District Heatmap:**
  - Map of Kerala with district-level footfall density and booking intensity (Idukki and Alappuzha highlighted).
- **Real-Time Live Activity Stream:**
  - Ticker showing real-time bookings, new user sign-ups, and flagged content in a compact feed.

---

### ADM-02: User Management
- **Filterable Explorer & Guide Directory:**
  - Search bar by Name, Mobile, Email, or Government ID status.
  - Filter chips: `All Users`, `Local Guides (Verified)`, `Travelers`, `Suspended / Banned`.
- **Data Table Columns:**
  - User (Avatar, Full Name, Handle `@arjun_travels`).
  - Account Tier (`Explorer`, `Verified Local Guide`, `Super Contributor`).
  - Activity Metrics (`42 Trips`, `18 Posts`, `3 Spot Submissions`).
  - Registration Date & Last Active IP.
  - Status Badge (`Active` in green, `Flagged` in amber, `Suspended` in red).
  - Actions: "View Profile", "Promote to Guide", "Issue Warning", "Ban User".
- **Ban/Suspension Modal:**
  - Requires mandatory justification note, duration selector (7 days, 30 days, Permanent), and logs event to Audit Trail.

---

### ADM-03: Destination Verification Queue
- **Community Spot Moderation Engine:**
  - Split-pane review interface:
    - Left Column: User submitted content (Spot Title, District, Description, Best Season, Local Tips, User Photos).
    - Right Column: Geospatial verification tools:
      - Live GPS pin on OpenStreetMap vs. user coordinates.
      - Geo-fence validation: Ensures spot is located within Kerala state boundaries and not inside restricted wildlife core zones.
      - Reverse-image search checker to prevent copyrighted photography fraud.
  - Action Bar:
    - `[ Approve & Publish ]` (Promotes to public explore feed + awards user "Verified Contributor" badge).
    - `[ Request More Info ]` (Dispatches in-app notification asking for clearer photos or land permissions).
    - `[ Reject with Reason ]` (Hazardous terrain, private property violation, duplicate spot).

---

### ADM-04: Post Moderation
- **Community Social Stream Moderation:**
  - Automated Toxicity & NSFW Score indicator (e.g. `Safety Score: 98% Safe`).
  - Flagged Content Queue:
    - User report reasons: "Littering in eco-fragile zone", "Spam/Self-promotion", "Misleading location tag".
    - Media preview modal with high-res zoom.
  - Batch Actions: "Dismiss Flag", "Hide from Public Feed", "Delete Post & Notify User".

---

### ADM-05: Business Verification (KYC & Licensing)
- **Merchant Onboarding Portal (Agencies, Hotels, Homestays):**
  - Document Inspection Viewer:
    - GSTIN Certificate verification against Govt GST portal.
    - Kerala Tourism Department Accreditation Certificate (`KTD Form-A`).
    - Property Ownership Deed or Valid Commercial Lease.
    - Owner Aadhaar / PAN card with photo cross-check.
  - Status Workflow:
    - `Pending Review` → `Under Field Inspection` → `Approved & Activated` → `Rejected / Re-upload Required`.
  - Inspector assignment dropdown to dispatch local district tourism officer for physical homestay audit.

---

### ADM-06: Booking Management
- **Ecosystem-Wide Master Ledger:**
  - Filter by Booking Type: `All`, `Daily Overnight Stay`, `Hourly Transit (3h/6h/12h)`, `Travel Tour Package`.
  - Filter by Status: `Confirmed`, `Checked-In`, `Completed`, `Cancelled`, `Disputed`.
- **Table Columns:**
  - Booking ID (`#KL-78291`), Property/Package Name, Traveler Name, Check-in Timestamp, Booking Duration, Total Amount ₹, Commission Earned ₹.
  - Quick action: "Inspect Voucher", "Download Invoice PDF", "Force Cancellation / Refund".

---

### ADM-07: Payment Monitoring & Escrow Release
- **Financial Settlement Engine:**
  - Platform Fee & Commission Rules (e.g., 8% platform fee on hourly bookings, 10% on tour packages).
  - Escrow Release Tracker:
    - Funds held in escrow until 2 hours after scheduled guest check-in.
    - Status pills: `In Escrow`, `Released to Merchant Bank`, `Refund Pending`, `Disputed Chargeback`.
  - Payment Gateway Log viewer (Razorpay / UPI transaction IDs, webhook status, failure logs).

---

### ADM-08: Reports Module
- **Official Kerala Tourism Directorate Exports:**
  - Pre-built Report Templates:
    - Monthly Tourist Footfall by District (PDF).
    - Homestay Revenue & Tax Compliance Report (CSV / Excel).
    - Eco-Tourism Impact & Zero-Plastic Certification Audit (PDF).
  - Custom Date Range Picker and Scheduled Automated Emailing to District Collectors.

---

### ADM-09: Analytics & Forecasting
- **Deep-Dive Data Visualizations:**
  - Chart 1: Seasonal Tourism Curve (Comparing Peak Season vs. Monsoon Season trends over 3 years).
  - Chart 2: Hourly vs. Daily Room Booking Demand (Distribution of transit stays across Kochi, Kozhikode, and Trivandrum hubs).
  - Chart 3: Top Performing Community Guides & Conversion Funnels.

---

### ADM-10: Audit Logs
- **Immutable Security & Governance Ledger:**
  - Every administrative action recorded with cryptographic checksum:
    - Timestamp (ISO 8601 with milliseconds).
    - Admin Operator ID & Role (`Admin_Rajesh_04`).
    - Originating IP Address and User Agent.
    - Action Taken (`APPROVED_DESTINATION_ID_482`, `SUSPENDED_USER_9281`, `OVERRODE_PAYMENT_REFUND`).
    - Before / After JSON Diff Viewer modal.
