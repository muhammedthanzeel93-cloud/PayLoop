import React from 'react';
import { THEME_COLORS } from '@kerala-tourism/constants';

export default function WebHomePage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header
        style={{
          backgroundColor: THEME_COLORS.FOREST_GREEN,
          color: THEME_COLORS.WARM_CREAM,
          padding: '16px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: THEME_COLORS.SUNSET_ORANGE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              color: THEME_COLORS.CHARCOAL,
            }}
          >
            KT
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em' }}>
              Kerala Tourism
            </div>
            <div style={{ fontSize: '11px', opacity: 0.8 }}>God's Own Country</div>
          </div>
        </div>

        <nav style={{ display: 'flex', gap: '24px', alignItems: 'center', fontSize: '14px' }}>
          <a href="#destinations" style={{ color: THEME_COLORS.WARM_CREAM, textDecoration: 'none' }}>
            Destinations
          </a>
          <a href="#stays" style={{ color: THEME_COLORS.WARM_CREAM, textDecoration: 'none' }}>
            Hourly & Daily Stays
          </a>
          <a href="#community" style={{ color: THEME_COLORS.WARM_CREAM, textDecoration: 'none' }}>
            Community
          </a>
          <button
            style={{
              backgroundColor: THEME_COLORS.SUNSET_ORANGE,
              color: THEME_COLORS.CHARCOAL,
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Sign In
          </button>
        </nav>
      </header>

      {/* Hero Section */}
      <section
        style={{
          padding: '80px 32px',
          textAlign: 'center',
          backgroundColor: THEME_COLORS.WARM_CREAM,
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '6px 14px',
              borderRadius: '999px',
              backgroundColor: '#E8F5E9',
              color: THEME_COLORS.FOREST_GREEN,
              fontSize: '12px',
              fontWeight: 600,
              marginBottom: '16px',
            }}
          >
            OFFICIAL KERALA TOURISM ECOSYSTEM
          </span>
          <h1
            style={{
              fontSize: '44px',
              fontWeight: 800,
              color: THEME_COLORS.CHARCOAL,
              margin: '0 0 20px 0',
              lineHeight: 1.15,
            }}
          >
            Discover Scenic Backwaters, Wild Sanctuaries & Heritage Stays
          </h1>
          <p style={{ fontSize: '18px', color: '#4B5563', lineHeight: 1.6, margin: '0 0 32px 0' }}>
            Explore verified destinations, plan transit rooms by the hour, or book overnight eco-resorts
            with transparent real-time availability.
          </p>

          {/* Quick Omnisearch Bar */}
          <div
            style={{
              display: 'flex',
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '8px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              border: '1px solid #E2E8F0',
              maxWidth: '650px',
              margin: '0 auto',
            }}
          >
            <input
              type="text"
              placeholder="Search Munnar, Alleppey, Wayanad or nearest transit hub..."
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                padding: '12px 16px',
                fontSize: '15px',
              }}
              readOnly
            />
            <button
              style={{
                backgroundColor: THEME_COLORS.FOREST_GREEN,
                color: '#FFFFFF',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Explore
            </button>
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section style={{ padding: '60px 32px', maxWidth: '1200px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: THEME_COLORS.CHARCOAL, marginBottom: '24px' }}>
          Platform Pillars
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
          {[
            {
              title: 'GPS Destination Discovery',
              desc: 'Find eco-trails, waterfalls, and cultural sites with verified coordinates and forest buffer clearances.',
              tag: 'Discovery',
            },
            {
              title: 'Hourly & Daily Stays',
              desc: 'Rent verified transit rooms for 3h, 6h, or 12h, or book full overnight homestay vacations.',
              tag: 'Reservations',
            },
            {
              title: 'Verified Community Insights',
              desc: 'Community submissions verified against cadastral maps and hardware EXIF data.',
              tag: 'Community',
            },
            {
              title: 'Contactless Digital Pass',
              desc: 'Encrypted QR pass for rapid check-in at partnered hotels, resorts, and wildlife trails.',
              tag: 'Fast Pass',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                padding: '24px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: THEME_COLORS.FOREST_GREEN,
                  backgroundColor: '#E8F5E9',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  marginBottom: '12px',
                }}
              >
                {item.tag}
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: THEME_COLORS.CHARCOAL }}>
                {item.title}
              </h3>
              <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: 1.5, margin: 0 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          marginTop: 'auto',
          backgroundColor: THEME_COLORS.CHARCOAL,
          color: '#9CA3AF',
          padding: '32px',
          textAlign: 'center',
          fontSize: '13px',
        }}
      >
        <p style={{ margin: '0 0 8px 0' }}>
          © {new Date().getFullYear()} Kerala Tourism Ecosystem. Monorepo Architecture Foundation.
        </p>
        <p style={{ margin: 0, opacity: 0.7 }}>
          Colors: Forest Green (#145C43) • Nature Green (#78A878) • Sunset Orange (#E99A54)
        </p>
      </footer>
    </main>
  );
}
