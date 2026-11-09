# Interactive UX Workflows & User Flow Architecture (Workflows A – K)
**Kerala Tourism Ecosystem**  
**Standards:** Full state coverage (Happy path, edge cases, error recovery, empty & loading states)

---

## Master Workflow Directory

- **Workflow A:** Tourist Registration & Frictionless Login (OTP & Biometric)
- **Workflow B:** GPS-Based Destination Discovery (Radial Proximity & Map Sync)
- **Workflow C:** Manual Destination Search & Multi-Parameter Filter Engine
- **Workflow D:** Community Destination Submission (Crowdsourced Eco-Sanctuaries)
- **Workflow E:** Social Post Creation, Engagement & Double-Tap Interactions
- **Workflow F:** Direct Inquiries & Host Messaging (With Itinerary Attachments)
- **Workflow G:** Multi-Day Travel Tour Package Booking
- **Workflow H:** Instant Hourly & Daily Room Booking (Contactless QR Pass)
- **Workflow I:** Request-Based Room Booking (15-Minute Host Countdown Engine)
- **Workflow J:** Admin Destination Verification (Geofence & Toxicity Inspection)
- **Workflow K:** Business Onboarding, Document Verification & Inventory Activation

---

## 1. Workflow A: Tourist Registration and Login

```mermaid
flowchart TD
    Start([User opens Web or Mobile App]) --> AuthChoice{Has Existing Account?}
    AuthChoice -- Yes --> LoginPrompt[Biometric / Phone Entry]
    AuthChoice -- No --> RegPrompt[Input Indian Mobile Number +91]
    
    RegPrompt --> RequestOTP[System sends 6-digit OTP SMS]
    RequestOTP --> EnterOTP[User inputs OTP / Auto-read]
    EnterOTP --> VerifyOTP{Is OTP Valid?}
    VerifyOTP -- No --> OTPError[Inline Error: Invalid Code / 30s Resend Timer]
    OTPError --> EnterOTP
    VerifyOTP -- Yes --> ProfileOnboarding[Select 3 Travel Interests: Backwaters, Treks, Ayurveda]
    ProfileOnboarding --> HomeSession[Authenticated Session Token & Personalized Home Feed]
    
    LoginPrompt --> BiometricCheck{Biometrics Available?}
    BiometricCheck -- Yes --> FaceID[FaceID / TouchID Prompt]
    FaceID --> HomeSession
    BiometricCheck -- No --> FallbackOTP[SMS OTP / Google SSO]
    FallbackOTP --> HomeSession
```

### UX States & Edge Cases:
- **Happy Path:** Phone number entered → Auto-read OTP fills in 2 seconds → 3 interest chips tapped → lands on personalized home.
- **Edge Case 1 (Delayed SMS):** After 30 seconds, a secondary button appears: "Send OTP via WhatsApp" or "Call Me with Code".
- **Edge Case 2 (Roaming International Traveler):** Option to switch country code (+44, +1, +971) or authenticate via Google/Apple Single Sign-On without local SIM.

---

## 2. Workflow B: GPS-Based Destination Discovery

```mermaid
flowchart TD
    Home[User on Home Screen] --> TapNearMe[Tap 'Near Me' or 'Nearby Map' Tab]
    TapNearMe --> PermCheck{Location Permission Granted?}
    PermCheck -- No --> PermDialog[System Permission Sheet: 'Allow Kerala Tourism to access precise location']
    PermDialog -- Denied --> FallbackCity[Fallback: Select nearest Kerala District manually from picker]
    PermDialog -- Allowed --> FetchGPS[Fetch GPS Coordinates: Lat/Long accurate to 10m]
    
    FallbackCity --> QuerySpots[Query Destinations Database]
    FetchGPS --> QuerySpots
    
    QuerySpots --> DistanceSlider[Apply Radial Distance: Default 10km]
    DistanceSlider --> RenderMap[Render Interactive Map + Clustered Pins]
    RenderMap --> RenderSheet[Slide Up Bottom Sheet: List of Nearby Spots sorted by Distance]
    
    RenderSheet --> PinTap[User taps Pin on Map or Card in Sheet]
    PinTap --> HighlightCard[Highlight Destination Preview Card: Distance, Rating, Audio Guide]
    HighlightCard --> NavigateCTA[Action: 'Navigate via Google Maps' OR 'Book Homestay Nearby']
```

---

## 3. Workflow C: Manual Destination Search & Multi-Filter Engine

```mermaid
flowchart TD
    SearchInput[User focuses Omnisearch Bar] --> AutoSuggest[Display Recent Searches & Trending Kerala Keywords]
    AutoSuggest --> TypeQuery[User types 'Munnar']
    TypeQuery --> InstantResults[Dropdown shows: 1 District, 4 Waterfalls, 8 Tea Homestays]
    
    InstantResults --> PressEnter[User presses Enter or 'Explore All']
    PressEnter --> ResultsGrid[Render 3-Column Destination Grid: 18 Results]
    
    ResultsGrid --> OpenFilters[User taps Filter Button]
    OpenFilters --> FilterModal[Filter by: Landscape, Best Season, Budget, Eco-Certification]
    FilterModal --> ApplyFilter[User applies: 'Hill Station' + 'Sep-Mar']
    ApplyFilter --> EmptyCheck{Any Matching Results?}
    EmptyCheck -- Yes --> FilteredGrid[Update Grid: Showing 6 Filtered Spots with active filter tags]
    EmptyCheck -- No --> EmptyState[Display Empty State: 'No spots match your filters. Expand your budget or clear tags.']
    EmptyState --> ResetCTA[Tap 'Reset Filters'] --> ResultsGrid
```

---

## 4. Workflow D: Community Destination Submission

```mermaid
flowchart TD
    UserAction[User taps '+ Submit a Spot'] --> CheckAuth{Is User Signed In?}
    CheckAuth -- No --> AuthModal[Trigger Quick Phone OTP Login]
    CheckAuth -- Yes --> FormView[Open Submission Form Modal]
    
    FormView --> CaptureGPS[Auto-fetch GPS button: 'Use My Current Location']
    CaptureGPS --> UploadMedia[Drag & Drop 3-10 High-Res Photos / Videos]
    UploadMedia --> EnterDetails[Input Spot Title, Local Tips, Nearest Railway/Bus Station]
    EnterDetails --> ConsentCheck[Check: 'I confirm this spot is accessible and not private property']
    
    ConsentCheck --> SubmitBtn[Tap 'Submit for Kerala Tourism Department Review']
    SubmitBtn --> SuccessToast[Toast: 'Spot submitted successfully! Tracking ID #SUB-4982']
    SuccessToast --> AdminQueue[Payload arrives in Admin Verification Queue]
```

---

## 5. Workflow E: Social Post Creation & Interactions

```mermaid
flowchart TD
    Feed[User browsing Social Feed] --> CreateBtn[Tap '+' Composer Bar]
    CreateBtn --> SelectMedia[Select 1-4 Photos from Device]
    SelectMedia --> FilterSwipe[Swipe Filters: Kerala Warmth, Misty Forest, Sunset]
    FilterSwipe --> WriteCaption[Add Caption + Suggest Trending Tags: #GodsOwnCountry]
    WriteCaption --> TagLocation[Tag Location: 'Varkala Cliff']
    TagLocation --> Publish[Tap 'Publish Post']
    
    Publish --> FeedItem[Post renders immediately at top of Feed stream with local optimistic update]
    
    FeedItem --> Interaction{Peer Traveler Action}
    Interaction -- Double Tap --> LikeAnim[Heart Burst Animation + Haptic Vibration + Counter Increments]
    Interaction -- Comment Tap --> SlideDrawer[Comment Bottom Sheet slides up without page reload]
    Interaction -- Share Tap --> WhatsAppShare[Opens WhatsApp / Native Share Sheet with preview link]
```

---

## 6. Workflow F: Direct Inquiries & Host Messaging

```mermaid
flowchart TD
    ViewStay[User on Resort or Homestay Details Page] --> MsgCTA[Tap 'Message Host']
    MsgCTA --> OpenChat[Open Split-Pane Chat View with Host Profile]
    OpenChat --> ContextCard[System injects Property Reference Card into thread]
    
    ContextCard --> SendMsg[User types inquiry: 'Is early morning check-in possible?']
    SendMsg --> PushHost[Host receives instant Push Notification & Dashboard alert]
    PushHost --> HostReply[Host replies: 'Yes, we can prepare the Teak Room by 7:00 AM']
    HostReply --> CustomOffer[Host attaches Custom Hourly Offer: ₹800 for 3 hours]
    CustomOffer --> UserAccept[User taps 'Accept & Pay' directly inside chat thread]
    UserAccept --> CheckoutFlow[Proceeds to 1-Click Payment]
```

---

## 7. Workflow G: Travel Package Booking

```mermaid
flowchart TD
    Browse[Browse Curated Travel Packages] --> SelectPkg[Select '4D/3N Backwater & Tea Estate Trail']
    SelectPkg --> ReviewItinerary[Review Day-by-Day Accordion Timeline & Agency License]
    ReviewItinerary --> DateSelect[Select Departure Date from Availability Calendar]
    DateSelect --> TravelersCount[Choose Travelers: 2 Adults, 1 Child]
    TravelersCount --> AddOns[Optional Add-on: 'Private Airport Chauffeur from Kochi (+₹2,200)']
    
    AddOns --> ProceedCheckout[Tap 'Proceed to Checkout']
    ProceedCheckout --> SummaryCard[Display Itemized Cost, GST, and Agency Cancellation Policy]
    SummaryCard --> CompletePayment[Pay 25% Advance via UPI / NetBanking]
    CompletePayment --> PassIssued[Instant Package Itinerary PDF + WhatsApp Confirmation Dispatched]
```

---

## 8. Workflow H: Instant Hourly & Daily Room Booking

```mermaid
flowchart TD
    BrowseStays[User browses Stays Marketplace] --> ToggleHourly[Toggle 'Hourly Transit Rooms']
    ToggleHourly --> PickDuration[Select Duration: 3 Hours / 6 Hours / 12 Hours]
    PickDuration --> SelectProperty[Select 'Coconut Lagoon Villa']
    
    SelectProperty --> InstantBadge{Is 'Instant Book' Badge present?}
    InstantBadge -- Yes --> PickSlot[Select Slot: '12:00 PM – 03:00 PM Today']
    PickSlot --> FastCheckout[1-Click Checkout: Enter Name + Phone + Upload ID]
    FastCheckout --> PayGate[Pay ₹850 + GST via UPI / Card]
    PayGate --> SuccessPass[Issue Instant Contactless QR Code Pass]
    SuccessPass --> NotifyReception[Hotel PMS reception screen instantly notified of incoming guest]
```

---

## 9. Workflow I: Request-Based Room Booking (15-Minute Countdown)

```mermaid
flowchart TD
    SelectRoom[Select Boutique Homestay with Request-Based Booking] --> SendRequest[Send Booking Request with Custom Time Window]
    SendRequest --> HoldCard[Authorize Payment on Traveler Card: Funds held, not captured]
    HoldCard --> StartTimer[Start 15:00 Real-Time Countdown Timer on Traveler & Host screens]
    
    StartTimer --> HostResponse{Host Action within 15 mins}
    HostResponse -- Accept --> CaptureFunds[Capture Payment + Issue Confirmed QR Pass]
    HostResponse -- Alternative --> OfferAlt[Host suggests +1 hour shift: Traveler reviews and accepts/declines]
    HostResponse -- Decline --> ReleaseHold[Release Card Hold immediately + Suggest 3 nearby available homestays]
    HostResponse -- Timeout (15m expired) --> AutoCancel[System auto-releases room and refunds hold with apology notification]
```

---

## 10. Workflow J: Admin Destination Verification

```mermaid
flowchart TD
    AdminLogin[Tourism Department Officer logs into Admin Console] --> OpenQueue[Navigate to 'Destination Verification Queue' (8 Pending)]
    OpenQueue --> SelectSubmission[Select #SUB-4982: Cheeyappara Lower Cascades]
    
    SelectSubmission --> InspectionTools[Side-by-Side Review Tool]
    InspectionTools --> CheckGPS[Validate GPS against Forest Dept Buffer Boundaries]
    InspectionTools --> CheckToxicity[Automated Image Safety Scan: 100% Safe, Original EXIF data verified]
    InspectionTools --> CheckDuplication[Check nearest existing spots within 500m radius]
    
    CheckDuplication --> Decision{Inspector Decision}
    Decision -- Approve --> PublishLive[Tag with 'Verified Community Spot' & Publish to Public Explore Stream]
    Decision -- Need More Info --> RequestFieldAudit[Assign Local District Tourism Officer for physical site audit]
    Decision -- Reject --> RejectForm[Select reason: Restricted Wildlife Corridor / Private Estate]
    RejectForm --> NotifyUser[Notify submitting traveler with feedback]
```

---

## 11. Workflow K: Business Registration & Compliance Verification

```mermaid
flowchart TD
    PartnerCTA[Operator clicks 'Partner With Us / List Your Stay'] --> RoleSelect[Select: Homestay / Hotel / Resort / Travel Agency]
    RoleSelect --> WizardStep1[Step 1: Business Profile, Property Address, Satellite Pin]
    WizardStep1 --> WizardStep2[Step 2: Upload Documents: GSTIN, Panchayat License, Host Police Verification]
    WizardStep2 --> WizardStep3[Step 3: Setup Bank Details for Automated Payouts (IFSC/Account)]
    WizardStep3 --> WizardStep4[Step 4: Configure Room Inventory & Hourly Rates (₹)]
    
    WizardStep4 --> SubmitKYC[Submit Application for Directorate Accreditation]
    SubmitKYC --> PendingState[Dashboard activated in 'Sandbox Review' Mode]
    PendingState --> AdminInspection[Tourism Inspector verifies documents & dispatches field rating]
    AdminInspection --> GrantBadge[Approve Account: Award Kerala Tourism Gold/Silver Accreditation Badge]
    GrantBadge --> GoLive[Property and Rooms go live on Public Marketplace]
```
