# Business Dashboard UI/UX Specification (4 Tenant Archetypes)
**Kerala Tourism Merchant & Operator Portal**  
**Desktop Viewport:** 1440px baseline | **Tablet:** 768px responsive | **Mobile Quick View:** 390px  
**Theme:** Professional Merchant Light & Warm Cream (`#145C43`, `#78A878`, `#F8F7F1`, `#E99A54`, `#202A25`)  
**Typography:** Inter

---

## 1. Multi-Tenant Architecture & Role Adaptations

The Business Dashboard dynamically adapts its navigation taxonomy, inventory tools, and calendar based on the authenticated business profile:

| Business Archetype | Primary Operational Focus | Exclusive Specialized Modules |
|---|---|---|
| **1. Travel Agencies** | Multi-day curated tours, cab fleets, licensed guides | Package Builder, Itinerary Day-by-Day Editor, Passenger Manifests |
| **2. Hotels & City Stays** | Multi-room inventory, quick transit bookings | Room Category Matrices, Hourly Turnover Cleaning Queue |
| **3. Eco-Resorts** | Large villas, ayurvedic wellness packages, leisure | Resort Amenities Management, Spa Add-ons, Houseboat Jetty Management |
| **4. Independent Room Providers** | Homestays, single villas, private transit rooms | Instant / Request-based Switcher, 15-min Booking Request Responder |

---

## 2. Core Business Dashboard Modules

### BIZ-01: Business Overview (Command Center)
- **Today's Operational Pulse Bar:**
  - `Today's Check-ins`: 8 guests scheduled (3 hourly transit, 5 overnight).
  - `Currently Occupied Rooms`: 14 / 18 rooms (78% occupancy).
  - `Pending Booking Requests`: 2 requests awaiting host response (15-min countdown timer).
  - `This Month's Gross Earnings`: ₹2,84,500 (`+18% vs last month`).
- **Quick Action Bar:**
  - "Block Room for Maintenance", "Adjust Hourly Rates for Today", "Scan Guest Check-in QR".

---

### BIZ-02: Profile Management
- **Property / Agency Public Showcase:**
  - Business Legal Name, Trade Name, Display Headline.
  - High-Resolution Photo Gallery Manager (Drag-and-drop reordering, Hero image tag).
  - Geolocation Pin Setter (Drop pin on satellite map for accurate guest driving directions).
  - Check-in & Check-out Window Configuration:
    - Standard Overnight Check-in: 12:00 PM | Check-out: 11:00 AM.
    - Hourly Transit Slots: Enable/disable 3-hour, 6-hour, or 12-hour booking options.
  - Amenities Checklist (Free WiFi, AC, Kerala Breakfast, River Jetty, Traditional Boat Pier).

---

### BIZ-03: Document Verification (Merchant Compliance)
- **Accreditation & KYC Center:**
  - Status Banner: `Verified Merchant (Kerala Tourism Gold Class Homestay)`.
  - Document Upload Slates:
    1. Kerala Tourism Dept Registration Certificate (`#KTD-HOMESTAY-2024-81`).
    2. Local Panchayat / Municipality Trade License.
    3. Police Verification Certificate of Primary Host.
    4. Merchant Bank Account Passbook (For automated daily payout settlement).
  - Expiry alert indicators: Highlights licenses expiring within 60 days.

---

### BIZ-04: Package Management (Agencies & Guided Tours)
- **Tour Package Builder (Agency Exclusive):**
  - CRUD interface for multi-day itineraries:
    - Package Title (e.g. "4D/3N Alleppey Houseboat & Munnar Tea Trail").
    - Day-by-day builder: Add activities, meal plans, transit type (AC Sedan / Tempo Traveler).
    - Pricing Matrix: Solo traveler rate, Couple rate, Group discount (5+ travelers).
    - Minimum & Maximum group size.
  - Booking Manifest: Download list of passengers with mobile numbers and pickup locations.

---

### BIZ-05: Property Management & Room Inventory (Hotels, Resorts, Rooms)
- **Room Types Listing:**
  - Table of room categories (e.g., "Deluxe Teak Suite", "Waterfront Cottage", "Standard Transit Room").
  - Units in inventory (e.g. 6 Suites, 4 Cottages).
  - Base Daily Overnight Rate (₹) vs. Base Hourly Transit Rate (₹).
  - Extra adult charges, child policies, pet allowances.
  - Instant Booking Toggle: When turned ON, travelers can book immediately without host approval; when turned OFF, bookings require host confirmation within 15 minutes.

---

### BIZ-06: Hourly & Daily Availability Calendar
- **High-Utility Calendar Matrix:**
  - **Dual-Mode Switcher:**
    - `Monthly Grid`: Color-coded overview of room occupancy per day.
    - `24-Hour Time Slot Schedule`: Granular hourly breakdown across rooms.
  - **Slot Controls:**
    - Click and drag across hours to block maintenance periods.
    - One-click price surge overrides for peak holiday weekends (e.g., Onam, Christmas/New Year).
    - Real-time color coding: Green = Available, Amber = Request Pending, Red = Occupied, Grey = Blocked.

---

### BIZ-07: Booking Requests Queue (For Request-Based Hosts)
- **High-Priority Reservation Queue:**
  - Real-time card alerts with audible notification for incoming requests.
  - 15-Minute Countdown Timer: Host must respond before slot auto-expires and releases back to marketplace.
  - Guest Profile Snapshot:
    - Guest Name, Star Rating from previous hosts, Verification Badge.
    - Requested Slot: e.g. "Today 2:00 PM – 5:00 PM (3 Hours Transit) • 2 Adults".
    - Guest Note: "Arriving on Jan Shatabdi Express at Ernakulam station, need shower and rest".
  - Action Triggers:
    - `[ Accept Booking ]` (Locks room, charges guest card, issues QR pass).
    - `[ Suggest Alternative Time ]` (Proposes +1 hour shift).
    - `[ Decline Request ]` (With optional polite reason).

---

### BIZ-08: Customer Information & Digital Check-In Scanner
- **Guest Folio & Contactless Reception:**
  - Built-in Web/Mobile Camera Scanner:
    - Receptionist scans guest's digital pass QR code.
    - Instantly pulls up booking record and verifies government ID match.
    - One-click `[ Complete Check-in ]` button marks room occupied and notifies platform.
  - Guest Manifest export for local police / tourism registry compliance.

---

### BIZ-09: Revenue Reports & Payouts
- **Financial Ledger & Analytics:**
  - Gross Bookings Revenue vs. Platform Fee (8% / 10%) vs. Net Merchant Earnings.
  - Daily Settlement Schedule: Next payout date and linked bank account preview.
  - Downloadable Monthly GST Invoice Summary for business tax filing.
