# Kerala Tourism Ecosystem — Monorepo

Enterprise-grade full-stack platform for the Kerala Tourism ecosystem, unifying tourist discovery, community submissions, social engagement, travel agency and resort bookings (hourly and daily), and governmental regulatory administration.

---

## 1. Monorepo Architecture

```
kerala-tourism-monorepo/
├── apps/
│   ├── web/            # Tourist Web Application (Next.js 14 App Router, TypeScript)
│   ├── mobile/         # Tourist Mobile Application (React Native + Expo SDK 51, TypeScript)
│   ├── business/       # Merchant & Provider Dashboard (Next.js 14 App Router, TypeScript)
│   └── admin/          # Tourism Board Governance Dashboard (Next.js 14 App Router, TypeScript)
├── server/             # Shared Backend API (Modular Monolith: Node.js, Express, MongoDB)
├── packages/
│   ├── shared-types/   # Centralized TypeScript domain interfaces and DTOs
│   ├── validation/     # Zod runtime schemas for requests, coordinates, and bookings
│   ├── constants/      # Approved theme tokens (#145C43, #78A878), SLA limits, rules
│   └── api-client/     # Universal type-safe Fetch HTTP client wrapper
└── design-system/      # Design foundations, tokens.json, and interactive prototypes
```

---

## 2. Prerequisites

- **Node.js**: `v20.x` or `v24.x` (LTS or Current)
- **npm**: `v10.x` or `v11.x`
- **MongoDB**: `v7.x` or `v8.x` (Local or MongoDB Atlas)

---

## 3. Getting Started

### Installation
```bash
# Install all dependencies across workspaces
npm install
```

### Environment Configuration
```bash
# Copy environment template
cp .env.example .env
```

### Development Commands

| Command | Target | Port / Environment |
|---|---|---|
| `npm run dev:server` | Backend Express API | `http://localhost:5000` |
| `npm run dev:web` | Tourist Web Portal | `http://localhost:3000` |
| `npm run dev:admin` | Admin Governance Portal | `http://localhost:3001` |
| `npm run dev:business` | Merchant Dashboard | `http://localhost:3002` |
| `npm run dev:mobile` | Tourist Expo Mobile | Metro Bundler |

### Quality & Build Commands

```bash
# Strict TypeScript check across all workspaces
npm run typecheck

# Code formatting & lint checks
npm run lint
npm run format:check

# Production builds
npm run build
```

---

## 4. Git Branching Strategy

- **`main`**: Production-ready, locked branch.
- **`develop`**: Primary integration branch for active features.
- **Feature Branches**: `feature/<module>-<description>` (e.g. `feature/booking-turnover-buffer`)
- **Bugfix Branches**: `bugfix/<issue>-<description>` (e.g. `bugfix/exif-gps-parser`)
- **Release Branches**: `release/vX.Y.Z`

*Note: Direct commits to `main` are restricted. All contributions require pull requests with passing typecheck and lint pipelines.*
