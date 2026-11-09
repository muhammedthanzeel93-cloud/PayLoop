# Mobile Application Screens UI/UX Specification (19 Screens)
**Kerala Tourism Ecosystem — Native iOS & Android Applications**  
**Viewport Baseline:** 390px x 844px | **Design System:** Inter Typography, Approved Kerala Palette  
**Compliance:** iOS Human Interface Guidelines (HIG) + Android Material Design 3 (M3)

---

## 1. Native Mobile Architectural Framework

### 1.1 Touch Ergonomics & Safe Areas
- **Top Safe Area:** 44px (Dynamic Island & status bar: time, battery, cellular).
- **Bottom Safe Area:** 34px (Home indicator swipe bar).
- **Minimum Interactive Touch Target:** 48px x 48px (exceeds Apple 44px standard).
- **One-Handed Thumb Zone:** Primary action triggers (Search FAB, Hourly Booking pill, Bottom sheet drag handles) are placed within the lower 60% of the screen.

### 1.2 Core Navigation Architecture
- **Persistent Bottom Navigation Dock (5 Tabs):**
  1. `Explore` (Icon: compass)
  2. `Nearby` (Icon: map)
  3. `Create` (Center elevated button in Sunset Orange `#E99A54`, 48px circle)
  4. `Social Feed` (Icon: photo_library)
  5. `Profile` (Icon: person)

---

## 2. Complete Mobile Screen Inventory (19 Screens)

| # | Screen Name | Screen Route | Key Native Mobile Patterns |
|---|---|---|---|
| **MOB-01** | **Splash Screen** | `/splash` | Forest green canvas, animated golden Kerala emblem, status bar light |
| **MOB-02** | **Onboarding (3 Slides)** | `/onboarding` | Horizontal gesture swipe, dot indicators, "Skip" & "Get Started" buttons |
| **MOB-03** | **Registration** | `/auth/register` | Mobile number entry (+91 auto), OTP auto-fill, interest chip selector |
| **MOB-04** | **Login** | `/auth/login` | Biometric FaceID/Fingerprint prompt, fallback OTP, "Explore as Guest" |
| **MOB-05** | **Home** | `/home` | Dynamic location header, search pill, horizontal category carousel, hourly stay banner |
| **MOB-06** | **Explore** | `/explore` | Recent searches chips, thematic collections, stacked destination cards |
| **MOB-07** | **Nearby Map** | `/nearby` | Edge-to-edge vector map, GPS locating trigger, 3-position draggable bottom sheet |
| **MOB-08** | **Destination Details** | `/destination/:id` | Collapsing photo header, audio guide mini-player, sticky bottom booking bar |
| **MOB-09** | **Create Post** | `/post/create` | Camera/Gallery picker, live preview filter swipe, GPS tagger, category chips |
| **MOB-10** | **Social Feed** | `/feed` | Full-width vertical feed, double-tap to like, expandable comment bottom drawer |
| **MOB-11** | **User Profile** | `/profile` | Sticky profile header, trip badges, tabs for posts & saved places, settings gear |
| **MOB-12** | **Messaging List** | `/messages` | Swipeable message rows (archive/mute), online badges, search bar |
| **MOB-13** | **Chat Screen** | `/chat/:id` | Keyboard-avoiding container, reservation attachment pass, voice note mic |
| **MOB-14** | **Notifications** | `/notifications` | Grouped list (Today, Earlier), unread dots, direct deep-link triggers |
| **MOB-15** | **Hotel Search** | `/stays/search` | Floating search modal, "Overnight" vs "Hourly (3h/6h)" toggle, guest stepper |
| **MOB-16** | **Room Details** | `/stays/room/:id` | High-res carousel, bed specs, hourly slot breakdown, cancellation tag |
| **MOB-17** | **Date & Time Picker** | `/stays/time-picker`| Custom mobile wheel picker for hourly slots, calendar sheet for overnight |
| **MOB-18** | **Booking Confirmation** | `/booking/success` | Checkmark animation, digital pass with QR code, "Add to Apple Wallet" |
| **MOB-19** | **Settings** | `/settings` | iOS grouped inset list: Language (Malayalam/English), Notifications, 2FA, Logout |

---

## 3. Deep Screen Design Specifications

### MOB-01: Splash Screen
- **Background:** Solid Forest Green `#145C43`.
- **Center:** Embossed Kerala Tourism gold emblem (Houseboat & coconut palms motif) fading in with a 600ms ease-out spring.
- **Wordmark:** "KERALA TOURISM" in Inter Bold 20px `#FFFFFF`, subtext "God's Own Country in Your Hands".
- **Bottom:** Minimalist loading spinner in Nature Green `#78A878`.

---

### MOB-02: Onboarding (3 Slides)
- **Slide 1:** "Discover Untouched Sanctuaries" (Visual: High-altitude tea hills in Munnar).
- **Slide 2:** "Book Rooms by the Hour" (Visual: Lakefront homestay transit lounge).
- **Slide 3:** "Join 50,000+ Responsible Explorers" (Visual: Community photo feed).
- **Controls:** Bottom navigation with animated pagination pills, "Skip" (top-right text button), and "Continue" (Sunset Orange pill).

---

### MOB-03: Registration
- **Input Field:** Indian phone number input with flag dropdown (+91 default). Large 18px numeric font.
- **Auto-Read OTP:** 6 individual rounded-lg input boxes with SMS auto-fill permission.
- **Personalization Chips:** "Pick 3 things you love in Kerala": `[ Backwaters ]`, `[ Mountain Treks ]`, `[ Ayurveda ]`, `[ Houseboats ]`, `[ Wildlife ]`.

---

### MOB-04: Login
- **Primary:** "Log in with Biometrics" (FaceID / Fingerprint) button with haptic feedback.
- **Secondary:** "Continue with Phone OTP" / "Continue with Apple / Google".
- **Tertiary:** "Browse as Guest" at screen bottom.

---

### MOB-05: Home Screen
- **Top Bar:** 
  - Left: Location indicator pill with drop-down ("Current: Fort Kochi, KL ▾").
  - Right: Notification bell with amber counter dot + User avatar.
- **Quick Search Pill:** Full-width 48px rounded pill with microphone icon and search icon.
- **Horizontal Category Rail:**
  - Compact circular icons with labels: `Backwaters`, `Hill Stations`, `Beaches`, `Ayurveda`, `Houseboats`, `Waterfalls`.
- **Hourly Stays Discovery Widget:**
  - Card: "Quick Day-Use & Transit Rooms (3h / 6h slots nearby)".
- **Curated Spot of the Day:**
  - Full-width hero card: "Munroe Island Hidden Mangrove Canal" with rating 4.9.

---

### MOB-06: Explore
- **Search Header:** Persistent search field with clear `✕` button.
- **Trending Searches:** Horizontal chips (`Munnar tea trek`, `Varkala cliff sunset`, `Alleppey hourly boat`).
- **Curated Collections:** "Monsoon Rejuvenation", "Eco-Certified Homestays", "Hidden Waterfalls".
- **Vertical Stream:** Full-width destination cards optimized for one-hand scrolling.

---

### MOB-07: Nearby Map (Draggable Bottom Sheet)
- **Map:** Edge-to-edge interactive Mapbox/Google Maps canvas with user blue pulsing dot.
- **Floating Controls:** Compass, "Locate Me" button, Layer switcher (Satellite / Vector).
- **Draggable Bottom Sheet (3 Snap Points):**
  - **Collapsed (Height: 96px):** Shows "18 spots found within 5km" + peak card.
  - **Half Screen (Height: 400px):** Horizontal swipeable carousel of nearby destinations with distance badges ("1.2 km away").
  - **Full Screen (Height: 740px):** Full list view with filtering pills.

---

### MOB-08: Destination Details
- **Header:** Sticky collapsing photo header with dynamic back arrow and bookmark icon.
- **Audio Guide Mini-Player:** "Listen to 2-min history of Alleppey canals" (Play/Pause pill).
- **Content:** Weather card, Cultural narrative, Things to do checklist, Verified community photos.
- **Sticky Bottom Action Bar:**
  - Price indicator ("From ₹850").
  - CTA Button: "Reserve Stay / Experience" (Sunset Orange pill).

---

### MOB-09: Create Post
- **Header:** "New Post" + "Share" button in top-right.
- **Media Preview:** Large 4:5 image frame with filter presets at bottom (Original, Kerala Warmth, Misty Forest, Sunset Glow).
- **Form Controls:**
  - Caption textarea with auto-hashtag suggestions.
  - "Tag Location" (Auto-suggests nearest verified landmark).
  - "Link Destination / Hotel" (Enables direct in-post booking for viewers).

---

### MOB-10: Social Feed
- **Stream:** Full-screen vertical scrolling.
- **Double-Tap Interaction:** Double-tapping photo triggers floating white heart animation + haptic vibration.
- **Action Icons (Right-aligned or bottom):** Like (with count), Comment (opens bottom drawer), Repost, Share to WhatsApp.

---

### MOB-11: User Profile
- **Header:** Avatar, Bio, Follower stats, "Edit Profile" button.
- **Segmented Control (Tabs):** `[ My Posts ]`, `[ Saved Places ]`, `[ Bookings ]`.
- **Grid:** 3-column photo grid. Tapping opens full-screen post view.

---

### MOB-12: Messaging List
- **List Rows:** 72px row height. Avatar, Name, Online indicator, Message snippet, Timestamp.
- **Swipe Actions:** Swipe left to "Archive" or "Delete"; swipe right to "Pin".

---

### MOB-13: Chat Screen
- **Keyboard Handling:** Auto-adjusts padding without layout jumps.
- **Interactive Pass Card:** Embedded booking voucher inside the chat thread with "View QR Code" button.
- **Bottom Dock:** Attachment icon (+), Voice note microphone (hold to record), Input field, Send button.

---

### MOB-14: Notifications
- **Sections:** "Today", "Yesterday", "Earlier This Week".
- **Item Types:**
  - Booking confirmed: Green calendar icon.
  - New follower: Blue user icon.
  - Admin approval: Gold shield icon.

---

### MOB-15: Hotel Search (Mobile Modal)
- **Modal Sheet:**
  - Segmented tab: "Daily Overnight" vs "Hourly Transit".
  - For Hourly: Select duration (3 Hours, 6 Hours, 12 Hours).
  - Guest Stepper: Adults (+ / -), Children (+ / -).
  - Location radius slider: 5km to 30km.

---

### MOB-16: Room Details
- **Visuals:** Swipeable room photo carousel with dot indicator.
- **Specs:** "1 King Bed • Private Balcony • Lake View • Free High-Speed WiFi".
- **Hourly vs. Daily Rate Cards:** Radio buttons allowing the traveler to pick between a 3-hour transit rate (₹750) or full-night stay (₹3,200).

---

### MOB-17: Date & Time Wheel Selector
- **Native iOS/Android Wheel Picker:**
  - Date wheel: "Today, Nov 9", "Tomorrow, Nov 10", etc.
  - Hourly Slot Wheel: "06:00 AM - 09:00 AM", "09:00 AM - 12:00 PM", "12:00 PM - 03:00 PM", "03:00 PM - 09:00 PM".

---

### MOB-18: Booking Confirmation & Digital Pass
- **Success State:** Green animated checkmark with haptic celebration.
- **Digital Pass Card:**
  - Property Name, Room Type, Check-in / Check-out time.
  - Scannable 2D QR Code.
  - Action buttons: "Add to Apple Wallet / Google Wallet", "Share via WhatsApp", "Get Driving Directions".

---

### MOB-19: Settings
- **Grouped Inset List:**
  - Account & Security (Mobile Number, Email, 2FA).
  - App Language (English, മലയാളം - Malayalam).
  - Notification Preferences (Booking updates, Community likes, Marketing).
  - Responsible Tourism Pledge (Zero-plastic commitment badge).
  - Help & Emergency Support (Kerala Tourist Police Helpline: 1364).
  - "Log Out" (Destructive text).
