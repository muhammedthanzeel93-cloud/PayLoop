# Reusable Component Library Specification
**Kerala Tourism Ecosystem Design System**  
**Theme:** Kerala Nature + Premium Travel (`#145C43`, `#78A878`, `#F8F7F1`, `#E99A54`, `#202A25`)  
**Typography:** Inter (400, 500, 600, 700) | **Standard:** WCAG 2.2 AA Compliant

---

## 1. Component Anatomy & Global States

Every interactive component across the ecosystem implements 5 core interactive states and 3 specialized layout states:
- **Default (Rest):** Standard presentation state.
- **Hover:** Subtle visual lift (scale 1.01x or box-shadow level-2) with background tint shift.
- **Active (Pressed):** Inset press effect (scale 0.98x or darker shade).
- **Focus:** 2px high-visibility outline with 2px offset (`ring-2 ring-[#145C43] ring-offset-2`).
- **Disabled:** 40% opacity, pointer-events none, non-focusable.
- **Loading Skeleton:** Pulsing neutral gradient shimmer (`#EFECE4` to `#FFFFFF` to `#EFECE4`).
- **Empty State:** Culturally resonant minimalist iconography, headline, supportive copy, and action trigger.
- **Error State:** High-contrast crimson stroke (`#D32F2F`), error helper text with icon, `aria-invalid="true"`.

---

## 2. Navigation Systems

### 2.1 Web Navbar (Desktop: 1440px / Tablet: 768px)
- **Container:** Height 72px, fixed sticky at `top-0`, z-index 50, background `rgba(248, 247, 241, 0.92)` with `backdrop-filter: blur(12px)`, bottom hairline border `1px solid #E3DFD5`.
- **Left Slot:** 
  - Kerala Tourism Emblem (Golden boat / coconut palm ligature) + Wordmark in `#145C43` (Inter Bold, 18px).
  - Primary navigation links: "Explore", "Near Me", "Stays (Hourly & Daily)", "Packages", "Community Feed".
- **Center Slot:** Quick Search Pill (`w-80 h-10 rounded-full bg-white border border-[#D1CBBF] flex items-center px-4 gap-2 text-sm text-[#505A54]`).
- **Right Slot:**
  - Language switcher (EN / ML).
  - Notifications Bell (with unread badge counter in `#E99A54`).
  - "Submit a Spot" button (Sunset Orange pill).
  - User Avatar dropdown / "Sign In" trigger.
- **Responsive Behavior:** On tablet (<1024px) navigation links collapse into a hamburger slide-over menu; on mobile (<768px), primary wayfinding shifts to the Mobile Bottom Navigation Dock.

### 2.2 Dashboard Sidebar (Admin & Business Dashboards)
- **Container:** Width 260px (collapsible to 76px icon-only), fixed full height `h-screen`, background `#202A25` (Charcoal) or `#FFFFFF` (Light Merchant mode).
- **Header:** Brand mark + Workspace switcher dropdown (e.g. "Kumarakom Lake Resort ▾").
- **Navigation Groups:**
  - Group Header: 11px uppercase Inter SemiBold, letter-spacing +0.08em in `#7D8781`.
  - Nav Item: Height 44px, rounded-md (8px), flex items-center gap-3 px-3.
  - Active Item: Background `#145C43` with `#FFFFFF` text and 4px vertical accent bar on left.
  - Inactive Item: Text `#D1CBBF`, hover background `rgba(255, 255, 255, 0.06)`.
  - Badge counter: Pill with nature green (`#78A878`) background for new booking requests or pending verifications.
- **Footer:** User profile card, role badge ("Verified Agency"), "Collapse Sidebar" toggle, "Logout" button.

### 2.3 Mobile Bottom Navigation Dock (390px Viewport)
- **Container:** Height 64px + safe-area bottom padding (34px on iOS), fixed bottom-0, background `rgba(255, 255, 255, 0.95)` with `backdrop-blur-md`, top hairline border `1px solid #E3DFD5`.
- **5-Tab Layout:**
  1. `Explore` (Compass icon)
  2. `Nearby` (Map pin icon)
  3. `Create` (Center elevated button: 48px circle in `#E99A54` Sunset Orange with white plus icon, elevated shadow)
  4. `Social Feed` (Photo stack icon)
  5. `Profile` (User avatar / person icon)
- **Item States:** Active tab has `#145C43` icon + label and micro-dot beneath; inactive tab has `#7D8781`.

---

## 3. Form Controls & Buttons

### 3.1 Buttons
- **Primary Action (Sunset Orange):**
  - Background: `#E99A54`, text: `#202A25` (SemiBold Inter 14px), radius: `9999px` (Full pill), padding: `12px 24px`.
  - Hover: Background `#DE8C44`, shadow: `level-2`.
  - Active: Scale `0.98`.
  - Focus: `ring-2 ring-[#145C43] ring-offset-2`.
- **Secondary Action (Forest Green Outline):**
  - Background: Transparent, border: `1.5px solid #145C43`, text: `#145C43`, radius: `9999px`, padding: `10px 22px`.
  - Hover: Background `rgba(20, 92, 67, 0.06)`.
- **Tertiary / Ghost Button:**
  - Background: Transparent, border: None, text: `#145C43`, padding: `8px 16px`.
  - Hover: Underline or subtle warm cream fill.
- **Destructive Button:**
  - Background: `#D32F2F`, text: `#FFFFFF`, radius: `8px`, padding: `10px 20px`.
- **Icon Button:**
  - 40px x 40px (Desktop) / 44px x 44px (Mobile touch target), circular, centered SVG icon.

### 3.2 Inputs & Text Fields
- **Container:** Height 48px, rounded-md (`8px`), background `#FFFFFF`, border `1px solid #D1CBBF`, padding `0 16px`, text `#202A25` (Inter 14px).
- **Placeholder:** `#7D8781`.
- **Focus State:** Border `#145C43`, outer glow `ring-2 ring-[#145C43]/20`.
- **Error State:** Border `#D32F2F`, icon suffix in red, helper text below in Inter 12px `#D32F2F`.
- **Prefix / Suffix Icons:** 20px icon in `#505A54` (e.g. currency symbol `₹`, calendar icon, location pin).

### 3.3 Search Bars
- **Global Travel Omnisearch Bar:**
  - 3-Segment pill: 
    1. "Where in Kerala?" (Autocomplete dropdown with Wayanad, Munnar, Varkala, Alleppey, Thekkady).
    2. "Booking Mode" (Segmented toggle: "Daily Stay" vs "Hourly Transit 3h/6h/12h").
    3. "Dates & Guests" (Interactive date range & guest counter stepper).
  - Primary "Search" button with magnifying glass in Sunset Orange.

---

## 4. Domain Cards

### 4.1 Destination Card
- **Dimensions:** Width 100% (grid-aware 380px on desktop), border-radius 12px, overflow hidden, background `#FFFFFF`, border `1px solid #E3DFD5`, box-shadow `level-1`.
- **Media Section:** Aspect ratio 16:10, high-res photography (e.g. misty Munnar hills), overlay bookmark pill (top-right), district pill (top-left, e.g. "Idukki District").
- **Content Section:** Padding 16px.
  - Row 1: Title (Inter SemiBold 18px in `#202A25`) + Star Rating (`★ 4.8 (1.2k)`).
  - Row 2: Category tags (e.g. `Hill Station`, `Trekking Trail`, `Eco-Certified`).
  - Row 3: Meta snippet ("Best Season: Sep - Mar • 4 hrs from Cochin Airport").
  - Row 4 (Footer): Starting package rate or homestay from `₹1,800/night` + "Explore Spot" link.

### 4.2 Social Post Card
- **Header:** User Avatar (40px circular), User Full Name + `@handle`, Verified Badge (Nature Green check), Location Tag ("Varkala Cliff Beach, Kerala"), 3-dots context menu.
- **Media Content:** 1:1 or 4:5 ratio image/video carousel with swipe indicators (dots).
- **Caption & Tags:** Inter Regular 14px with clickable hashtags (`#KeralaTourism`, `#GodsOwnCountry`, `#VarkalaCliff`).
- **Engagement Bar:**
  - Like button with count (interactive heart animation).
  - Comment button with count (opens bottom drawer / side pane).
  - Repost / Share button with count.
  - Save to Itinerary bookmark button.
- **Recent Comment Preview:** 1 top comment with "View all 38 comments" link.

### 4.3 Property & Room Card (Hourly & Daily Dual-Mode)
- **Media:** 3-photo horizontal thumbnail preview with badge: "Instant Booking" or "Verified Host".
- **Details:** Property Title ("Vembanad Lake Breeze Homestay"), Property Category ("Waterfront Heritage Villa").
- **Dual-Mode Pricing Display:**
  - Daily Rate: **₹3,200** / night (Check-in: 12:00 PM, Check-out: 11:00 AM).
  - Hourly Rate Pill: **₹750** / 3 hours (Day-use / Transit slot with private bath).
- **Amenities:** Icons for Free High-Speed WiFi, Traditional Kerala Breakfast, AC, Houseboat Cruise Pier.
- **Action:** Primary CTA "Reserve Slot" (Sunset Orange) + Secondary "View Rooms".

### 4.4 Booking Card
- **Header:** Booking Reference `#KL-78291` + Status Chip (`Confirmed` in Nature Green, `Pending` in Amber, `Completed` in Slate).
- **Body:** Property or Package Thumbnail, Check-in / Check-out timestamps, Guest Name, Room Type ("Deluxe Teak Suite").
- **QR Code Voucher Slot:** 64x64px QR code for contactless check-in at property reception.
- **Action Bar:** "View Digital Pass", "Get Directions (GPS)", "Modify / Cancel".

---

## 5. Interactive Availability Calendar (Hourly & Daily)

- **Dual-View Switcher:**
  - Monthly View: Standard 7-day columns (Mon-Sun), day tiles displaying base daily price and occupancy dot.
  - Hourly Slot View: Selected date breakdown into 2-hour and 3-hour blocks:
    - `06:00 - 09:00` (Morning Transit)
    - `09:00 - 12:00` (Day Rest)
    - `12:00 - 15:00` (Afternoon Stay)
    - `15:00 - 18:00` (Sunset Slot)
    - `18:00 - 21:00` (Evening Transit)
    - `21:00 - 09:00` (Full Overnight)
- **Cell States:**
  - Available (White with subtle green border, price displayed).
  - Booked / Occupied (Solid warm cream `#EFECE4` with diagonal hash, disabled).
  - Selected (Solid `#145C43` with white text).
  - Blocked by Host (Muted grey with lock icon).

---

## 6. Data Tables (Admin & Business Dashboards)

- **Header Bar:** Table title, active filter pills, search input, bulk actions ("Export CSV", "Batch Approve").
- **Column Headers:** Inter SemiBold 12px uppercase in `#505A54`, sortable arrows (`▲▼`).
- **Row Styling:** Height 56px, hover background `rgba(20, 92, 67, 0.03)`, alternating borders `1px solid #E3DFD5`.
- **Status Badges:**
  - Active / Verified: Background `#E8F5E9`, text `#2E7D32` (Nature Green).
  - Pending Review: Background `#FFF3E0`, text `#ED6C02` (Amber).
  - Flagged / Suspended: Background `#FFEBEE`, text `#D32F2F` (Crimson).
- **Row Actions:** Inline action icons (View details `eye`, Edit `pencil`, Approve `check`, Reject `close`, Menu `...`).

---

## 7. Dialogs, Modals & Toast Notifications

### 7.1 Modals
- **Backdrop:** `rgba(32, 42, 37, 0.65)` with `backdrop-filter: blur(8px)`.
- **Container:** Rounded-xl (16px), background `#FFFFFF`, max-width 560px (desktop) / full-width bottom sheet on mobile, shadow `level-3`.
- **Structure:**
  - Header: Title (Inter SemiBold 18px), subtitle, close `✕` button.
  - Body: Scrollable content container with 24px padding.
  - Footer: Sticky bottom action bar with Cancel (Secondary outline) and Confirm (Primary Sunset Orange).

### 7.2 Toast Notifications
- **Position:** Top-right on desktop (24px from edges), Top-center on mobile.
- **Dimensions:** Min-width 320px, height auto, rounded-lg (8px), shadow `level-2`.
- **Variants:**
  - `Success`: Nature Green icon + border, "Destination submitted for verification".
  - `Error`: Crimson icon + border, "Failed to confirm payment. Please check your card".
  - `Info`: Charcoal icon + border, "New booking request received for 3-hour slot".
- **Progress Bar:** 3-second auto-dismiss indicator bar along the bottom edge.

---

## 8. State Variants: Skeletons, Empty & Error States

### 8.1 Loading Skeletons
- Shimmer pulse effect across placeholder rectangles:
  - Destination Card Skeleton: 16:10 image box, 2 text lines, 1 tag pill, 1 button placeholder.
  - Table Skeleton: 5 rows with 4 pulsing grey bars per row.
  - Profile Skeleton: Circular avatar + 3 header lines.

### 8.2 Empty States
- **Visual:** Minimal line-art illustration of Kerala backwaters / quiet canoe.
- **Copy:**
  - Headline: "No Destinations Found in this Range".
  - Body: "Try expanding your radial distance filter or search for another district like Wayanad or Alleppey."
- **Action:** "Reset Filters" (Secondary button) or "Submit a New Spot" (Primary button).

### 8.3 Error States
- **Form Error:** Red hairline perimeter, floating red badge with exclamation mark, descriptive guidance ("Please enter a valid 10-digit Indian mobile number").
- **Global 404:** "Lost in the Backwaters? This trail doesn't exist." CTA: "Return to Explore".
- **Network Error:** "Connection interrupted. Reconnecting to Kerala Tourism servers..." with offline retry trigger.
