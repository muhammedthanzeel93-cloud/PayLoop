# Website Screens UI/UX Specification (18 Screens)
**Kerala Tourism Ecosystem — Web Application**  
**Desktop Viewport:** 1440px (12-column grid) | **Tablet:** 768px (8-column) | **Mobile:** 390px (4-column)  
**Theme:** Kerala Nature + Premium Travel (`#145C43`, `#78A878`, `#F8F7F1`, `#E99A54`, `#202A25`)  
**Typography:** Inter (WCAG 2.2 AA compliant)

---

## Screen Inventory Overview

| ID | Screen Name | Route / View | Primary Purpose | Key Visual Components |
|---|---|---|---|---|
| **WEB-01** | **Landing Page** | `/` | Brand introduction & omnisearch | Immersive video hero, 3-mode search, District spotlight carousel, Homestay teaser, Feed highlights |
| **WEB-02** | **Explore Destinations** | `/destinations` | Curated discovery & filtering | Sticky filter rail (District, Vibe, Season), 3-col card grid, Sort pill, Results count |
| **WEB-03** | **Nearby Destinations** | `/destinations/near-me` | Proximity-based discovery | Geolocation banner, Radial distance slider (5km–100km), Split-screen list & map preview |
| **WEB-04** | **Destination Map** | `/destinations/map` | Geospatial exploration | Fullscreen interactive vector map, Custom Kerala pin markers, Floating bottom drawer preview card |
| **WEB-05** | **Destination Details** | `/destinations/:slug` | Deep destination story | 24-photo modal grid, History narrative, Weather/Monsoon widget, Things-to-do checklist, Nearby stays |
| **WEB-06** | **Social Feed** | `/feed` | Community photo & reel sharing | 2-column stream, Rich post cards with like/comment drawers, Trending spots rail, Follow recommendations |
| **WEB-07** | **Create Post** | `/feed/create` | Community photo/tip publishing | Multi-photo uploader, GPS tagger, Destination link picker, Category tags, Visibility settings |
| **WEB-08** | **User Profile** | `/profile/:username` | Traveler portfolio & reputation | Cover photo, Verified badge, Bio, Trips count, Tabbed feed (Posts, Saved spots, Reviews) |
| **WEB-09** | **Followers & Following** | `/profile/:username/network`| Social network management | Modal / view with search filter, User cards, Mutual connection chips, Follow/Unfollow triggers |
| **WEB-10** | **Messaging** | `/messages` | Direct chat with hosts & guides | Split-pane chat, Conversation list with unread counters, Chat bubble stream, Itinerary attachment card |
| **WEB-11** | **Travel Package Listing** | `/packages` | Multi-day tour packages | Duration filters (2D/1N to 7D/6N), Agency verification badges, Inclusions checklist, Price per traveler |
| **WEB-12** | **Package Details** | `/packages/:id` | Itinerary deep dive & booking | Day-by-day interactive timeline, Tour guide credentials, Inclusions vs Exclusions, Booking widget |
| **WEB-13** | **Hotel & Resort Listing**| `/stays` | Dual-mode accommodations | "Daily Overnight" vs "Hourly Transit" toggle, Amenity filters (Ayurveda, Pool, Waterfront), Property cards |
| **WEB-14** | **Property Details** | `/stays/:id` | Room & amenity breakdown | Virtual room tour preview, Host profile, Amenity matrix, House rules, Location pin |
| **WEB-15** | **Room Selection** | `/stays/:id/rooms` | Hourly & Daily room comparison | Deluxe room cards, Bed config, Hourly slot calculator, Instant Book tag vs Request Host button |
| **WEB-16** | **Booking Checkout** | `/checkout/:bookingId` | Transaction & ID verification | Guest information form, Arrival time selector, Govt ID proof uploader, Price breakdown card, UPI/Card gate |
| **WEB-17** | **My Bookings** | `/my-bookings` | Itinerary & digital pass center | Status tabs (Upcoming, Active, Past), Booking card with QR pass, Download invoice, Host contact |
| **WEB-18** | **Login, Register & Settings**| `/auth` & `/settings` | Authentication & user preferences| Mobile OTP / Email SSO, 2FA settings, Travel preferences, Notification & privacy toggles |

---

## Detailed Screen Specifications

### WEB-01: Landing Page
- **Hero Section (Full-bleed 1440px x 680px):**
  - Atmospheric background: Video loop of backwater mist rising over Alleppey palms and tea hills.
  - Headline: `Explore God's Own Country in Quiet Luxury` (Inter Bold, 48px, `#FFFFFF`).
  - Subhead: `Curated eco-trails, authentic backwater houseboats, and flexible hourly stays across Kerala.`
  - **Omnisearch Container (Centered floating bar, rounded-full, 72px height, `#FFFFFF` with `level-3` shadow):**
    - Slot 1: Location input with GPS "Near Me" trigger button.
    - Slot 2: Booking Type Selector (Segmented chip: "Overnight Stay" | "Hourly Transit 3h/6h/12h").
    - Slot 3: Date & Time Picker with popup calendar.
    - Slot 4: Primary "Search Experiences" button (Sunset Orange `#E99A54` pill with magnifying icon).
- **District Exploration Rail:**
  - 14 Kerala districts displayed in horizontal drag rail (Wayanad, Idukki, Alappuzha, Ernakulam, Trivandrum, etc.).
  - Card: 260px x 340px, portrait photography with gradient scrim, district title, tag ("Misty Tea Estates").
- **Featured Community Destination Submissions:**
  - "Discovered by Locals": 3-column grid highlighting verified hidden spots (e.g. Munroe Island Kayak Route).
- **Hourly Stays & Transit Lounges Showcase:**
  - Value proposition banner: "Need a 3-hour shower & rest between train journeys? Book verified luxury homestays by the hour."
- **Social Feed Ticker & Footer:**
  - Live Instagram-style feed snippet with user photos; comprehensive 4-column footer with Responsible Tourism mission statement and Govt accreditation seals.

---

### WEB-02: Explore Destinations
- **Layout (12 Columns):**
  - **Left Rail (3 Columns, 320px sticky sidebar):**
    - Filter Accordion 1: **District** (Multi-select checkboxes with count badge).
    - Filter Accordion 2: **Landscape Vibe** (Backwaters, Hill Stations, Coastal Beaches, Rainforest Sanctuaries, Heritage Forts).
    - Filter Accordion 3: **Best Season** (Monsoon June-Aug, Peak Sep-Feb, Summer Mar-May).
    - Filter Accordion 4: **Eco-Certification** (Zero-Plastic, Solar Powered, Organic Cuisine).
    - Filter Accordion 5: **Price Range / Free Entry**.
    - "Clear All Filters" and "Apply Filters" buttons.
  - **Right Content Area (9 Columns):**
    - Results Header: "Showing 48 Destinations in Kerala", Sort Dropdown ("Most Popular", "Highest Rated", "Recently Added", "Distance").
    - View Mode Switcher: 3-Column Card Grid vs. Split Map View.
    - Destination Cards Matrix: Responsive 3-column grid of destination cards with rating, bookmark heart, tags.
    - Bottom Pagination: Numbered buttons (1, 2, 3... 12), "Next →", and results indicator.

---

### WEB-03: Nearby Destinations (GPS Proximity)
- **Top Geolocation Bar:**
  - "Current Location: Fort Kochi, KL" (with "Change Location" link).
  - Radial Distance Slider: Interactive slider spanning 5km, 10km, 25km, 50km, 100km.
- **Split-Screen Layout (50% List / 50% Interactive Map):**
  - **Left Scrollable List:** Cards arranged in ascending order of distance ("1.2 km away • 8 mins by car", "4.5 km away • 18 mins by ferry").
  - **Right Sticky Map:** Leaflet/Mapbox vector map rendering live GPS radius circle with custom cluster pins. Clicking a pin highlights the matching left card.

---

### WEB-04: Destination Map
- **Full-Viewport Map Interface:**
  - Header overlay with floating search bar and quick filter pills (`Backwaters`, `Waterfalls`, `Trekking`, `Houseboats`).
  - Map Pins: Custom SVG pins with category icon (Leaf for nature, Wave for backwaters, Bed for homestays).
  - **Floating Bottom Drawer Card (On Pin Tap):**
    - 420px width card sliding from bottom-left: Destination photo, Title, Distance, Rating, "Navigate via Google Maps", "View Full Guide" button.

---

### WEB-05: Destination Details
- **Hero Photographic Mosaic:**
  - 5-photo bento grid (1 large hero photo on left, 4 smaller photos on right) with "View all 28 photos" button.
- **Breadcrumb & Header:**
  - `Home / Destinations / Idukki / Munnar Tea Terraces`.
  - Title (Inter SemiBold 36px, `#202A25`), Verified Local Badge, Bookmark & Share triggers.
- **2-Column Editorial Layout (8 Columns Main / 4 Columns Sticky Booking Widget):**
  - **Left Main Column:**
    - Live Weather & Ayurvedic Season Widget (e.g. `21°C • Light Drizzle • Karkidakam Monsoon`).
    - Narrative Story & Cultural History.
    - Key Highlights Checklist (e.g. "Tea Tasting Workshop", "Eravikulam Tahr Spotting").
    - Community Reviews & Star Breakdown.
    - Verified User Photos carousel.
  - **Right Sticky Sidebar:**
    - "Stay Nearby" card showing top-rated homestays within 5km.
    - Starting price from `₹1,200/night` or `₹450/3 hrs transit`.
    - "Plan Trip / Add to Itinerary" primary CTA.

---

### WEB-06: Social Feed
- **Feed Stream (8 Columns Centered):**
  - Story Bar: Circular traveler avatars with Nature Green active rings ("Munnar Dawn", "Alleppey Sunset", "Theyyam Ritual").
  - Post Composer Bar: "Share your Kerala journey, photos, or hidden waterway..." with media upload icons.
  - Social Post Cards: Multi-image carousels, heart like animations, rich caption text with location geotags.
  - Comment Drawer: Slides out from right without navigating away, allowing inline commenting and @mentions.
- **Right Context Rail (4 Columns):**
  - "Trending Spots Today" (e.g. #AthirappillyRain, #VarkalaSunset).
  - "Top Local Guides to Follow" with 1-click Follow button.

---

### WEB-07: Create Post (Modal / Dedicated Screen)
- **Modal Dialog (640px Max Width):**
  - Header: "Share a Travel Moment" + Close `✕`.
  - Drag-and-drop media dropzone: Supports up to 10 photos / 60s video clips with re-order drag handles.
  - Textarea: "Write a caption, tell a story, or provide local tips..." (Inter 14px, character counter 0/1000).
  - Location Tagger: Auto-detect GPS or searchable Kerala landmark dropdown.
  - Linked Destination / Hotel: Optional tag linking the post directly to a booking page.
  - Audience Selector: "Public (Kerala Feed)" | "Followers Only".
  - Sticky Footer: "Save Draft" & "Publish Post" (Sunset Orange pill).

---

### WEB-08: User Profile
- **Cover & Header:**
  - Wide panoramic banner (e.g. Western Ghats ridge).
  - Profile avatar (96px circular) with Verified Contributor badge.
  - Stats: `42 Trips Logged • 1.4k Followers • 289 Following`.
  - Bio: "Eco-backpacker exploring remote tribal trails in Wayanad and backwater canoe routes."
- **Content Tabs:**
  - `Posts` (3-column photo grid).
  - `Saved Destinations` (Bookmarked spots grouped into custom lists: "Monsoon 2026", "Houseboats").
  - `My Submissions` (Community spots submitted by the user with "Verified by Admin" status).
  - `Reviews` (Authentic reviews authored for hotels and tour operators).

---

### WEB-09: Followers & Following
- **Split Tabbed View:**
  - Search input: "Search travelers and local guides...".
  - List item: Avatar, Name, Handle, Mutual followers indicator ("Followed by @kerala_nature + 4 others").
  - Action button: Dynamic "Follow" (Sunset Orange) / "Following" (Secondary Forest Green outline with checkmark).

---

### WEB-10: Messaging (Direct Inquiries)
- **Split-Pane Chat View (Height: calc(100vh - 72px)):**
  - **Left Rail (380px):**
    - Search bar + Filter chips: "All", "Hosts & Stays", "Agencies", "Unread".
    - Chat Thread Cards: Avatar, Property / User Name, Timestamp, Snippet ("Your 3-hour room is confirmed for 2 PM"), Unread counter badge.
  - **Right Chat Pane:**
    - Header: Host / Guide Profile, Online indicator, Property reference link, "Call Host" button.
    - Message Stream: Timestamp dividers, Inbound bubbles (White with `#E3DFD5` border), Outbound bubbles (Forest Green `#145C43` with white text).
    - Itinerary Attachment Card: Embedded reservation pass with QR code and check-in countdown.
    - Input Dock: Attachment paperclip (Photos, GPS pin, PDF Voucher), emoji picker, message textarea, "Send" button.

---

### WEB-11: Travel Package Listing
- **Multi-Day Tour Explorer:**
  - Filter Rail: Duration (Day Trips, 2-3 Days, 4-7 Days), Travel Style (Honeymoon, Backwater Cruise, Wildlife Safari, Ayurvedic Wellness), Budget Slider.
  - Package Cards: 3-column grid featuring day-count pill ("4 Days / 3 Nights"), inclusions icons (Cab, Houseboat, Guide, Meals), Agency trust rating, "From ₹12,500 / person".

---

### WEB-12: Package Details
- **Interactive Day-by-Day Itinerary:**
  - Accordion timeline (Day 1: Arrival in Cochin & Fort Kochi Heritage Walk → Day 2: Scenic Drive to Munnar Tea Gardens → Day 3: Alleppey Houseboat Overnight → Day 4: Departure).
  - Agency Credentials Box: Kerala Tourism Dept License `#KTD-2024-91`, Insurance coverage, Verified Guide info.
  - Inclusions vs. Exclusions 2-column checklist.
  - Sticky Booking Card: Date selection, traveler counter (Adults, Children), add-on airport transfer, "Book Package" CTA.

---

### WEB-13: Hotel & Resort Listing (Hourly & Daily Dual Marketplace)
- **Top Dual-Mode Booking Banner:**
  - Segmented Switcher:
    - `[ Daily Overnight Stays ]` — For standard vacations, check-in 12 PM, check-out 11 AM.
    - `[ Hourly Transit Rooms ]` — For quick airport/railway rest, meetings, or day visits (3 hrs, 6 hrs, 12 hrs).
- **Property Cards:**
  - Displays dual pricing: "₹750 / 3 hrs" AND "₹3,200 / night".
  - Quick amenity badges: Waterfront, Private Plunge Pool, High-Speed WiFi, Ayurvedic Spa.

---

### WEB-14: Property Details
- **Full Accommodation Presentation:**
  - Photo gallery with room tour videos.
  - Host introduction ("Hosted by Thomas Kurian — 3rd generation spice estate owner").
  - Amenity taxonomy: Room features, Bathroom & toiletries, Dining & kitchen, Outdoor & leisure.
  - Location & Transit Directions: Distance from Cochin International Airport (COK), nearest railway station, private boat jetty access.

---

### WEB-15: Room Selection
- **Multi-Room Comparison Matrix:**
  - Room cards (e.g. "Backwater View Teak Suite", "Cottage with Open-Air Shower", "Standard Transit Room").
  - Live availability calendar for each room type.
  - Dual Rate Selector: Radio button between "Hourly Slot (Select 3h/6h)" and "Daily Overnight".
  - "Select Room & Proceed" CTA.

---

### WEB-16: Booking Checkout
- **2-Column Optimized Transaction Flow:**
  - **Left Form Column (7 Columns):**
    - Step 1: Primary Guest Details (Name, Phone with OTP, Email).
    - Step 2: Arrival Details (Estimated check-in hour for hourly bookings).
    - Step 3: Govt ID Verification Upload (Aadhaar, Passport, or Voter ID for state tourism registry compliance).
    - Step 4: Payment Method (UPI Auto-read, Credit/Debit Cards, NetBanking, Pay at Property).
  - **Right Sticky Price Summary (5 Columns):**
    - Itemized breakdown: Base room charge + Kerala Luxury GST (12%) + Eco-Conservation Cess (1%) = Total Payable ₹.
    - Cancellation policy notice: "Free cancellation up to 4 hours before hourly check-in".

---

### WEB-17: My Bookings
- **User Booking Management Hub:**
  - Tabs: "Upcoming", "Active / Ongoing", "Completed", "Cancelled".
  - Booking Card: Reference `#KL-BOOK-8821`, Property Thumbnail, Booking Mode ("6-Hour Transit Slot"), Check-in QR Code pass, "Add to Apple/Google Wallet", "Get GPS Directions", "Modify Booking" trigger.

---

### WEB-18: Login, Registration & Account Settings
- **Unified Auth Modal / Page:**
  - Step 1: Mobile number entry with country code (+91 default).
  - Step 2: 6-digit OTP verification with 30s resend timer.
  - Social alternatives: "Continue with Google", "Continue with Apple".
- **Account Settings Portal:**
  - Profile edit: Avatar, bio, phone, emergency travel contacts.
  - Preferences: Preferred language (English, Malayalam), dietary preferences (Kerala vegetarian, Seafood).
  - Security: 2-Factor Authentication, Active Sessions list, Data privacy download.
