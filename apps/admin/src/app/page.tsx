import React from 'react';
import { THEME_COLORS, GEOSPATIAL_RULES } from '@kerala-tourism/constants';

export default function AdminDashboardPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header */}
      <header
        style={{
          backgroundColor: THEME_COLORS.CHARCOAL,
          color: THEME_COLORS.WARM_CREAM,
          padding: '16px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '3px solid ' + THEME_COLORS.FOREST_GREEN,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '-0.02em' }}>
            Kerala Tourism | State Governance Console
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: THEME_COLORS.FOREST_GREEN,
              color: '#FFFFFF',
              padding: '3px 8px',
              borderRadius: '4px',
            }}
          >
            OFFICIAL ADMIN
          </span>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '13px' }}>
          <span>Officer: <strong>K. R. Nambiar (D-ID: #KER-901)</strong></span>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#10B981',
            }}
          />
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, padding: '32px', maxWidth: '1440px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0', color: THEME_COLORS.CHARCOAL }}>
            Ecosystem Oversight & Governance Modules
          </h1>
          <p style={{ fontSize: '14px', color: '#6B7280', margin: 0 }}>
            Regulatory queue auditing, community submissions, merchant KYC compliance, and platform integrity.
          </p>
        </div>

        {/* 10 Governance Modules Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          {[
            { name: 'Destination Queue', count: '14 Pending', desc: 'GPS & EXIF audits', highlight: true },
            { name: 'Business KYC', count: '6 Pending', desc: 'Resorts & homestays' },
            { name: 'Post Moderation', count: '3 Flagged', desc: 'Community feed' },
            { name: 'Booking Escrow', count: '₹2.4M Safe', desc: 'Payment settlement' },
            { name: 'Audit Logs', count: '1,280 Events', desc: 'Immutable security log' },
          ].map((mod, i) => (
            <div
              key={i}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '10px',
                padding: '20px',
                border: mod.highlight ? '2px solid ' + THEME_COLORS.FOREST_GREEN : '1px solid #E2E8F0',
                boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#4B5563', marginBottom: '6px' }}>
                {mod.name}
              </div>
              <div
                style={{
                  fontSize: '22px',
                  fontWeight: 800,
                  color: mod.highlight ? THEME_COLORS.FOREST_GREEN : THEME_COLORS.CHARCOAL,
                  marginBottom: '4px',
                }}
              >
                {mod.count}
              </div>
              <div style={{ fontSize: '12px', color: '#9CA3AF' }}>{mod.desc}</div>
            </div>
          ))}
        </div>

        {/* Verification Rules Card */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '24px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
          }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0', color: THEME_COLORS.CHARCOAL }}>
            Active Cadastral & Geofence Policy Constraints
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            <div style={{ padding: '16px', backgroundColor: '#F8F9FA', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280' }}>Forest Buffer Policy</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: THEME_COLORS.FOREST_GREEN, marginTop: '4px' }}>
                {GEOSPATIAL_RULES.PROTECTED_FOREST_BUFFER_METERS}m Mandatory Clearance
              </div>
              <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>
                Kerala Forest Act 1961 reserve boundary enforcement
              </div>
            </div>

            <div style={{ padding: '16px', backgroundColor: '#F8F9FA', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280' }}>Proximity Deduplication</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: THEME_COLORS.FOREST_GREEN, marginTop: '4px' }}>
                {GEOSPATIAL_RULES.PROXIMITY_DEDUPLICATION_RADIUS_METERS}m Deduplication Radius
              </div>
              <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>
                Prevents duplicate community coordinate submissions
              </div>
            </div>

            <div style={{ padding: '16px', backgroundColor: '#F8F9FA', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280' }}>Photo Authenticity</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: THEME_COLORS.FOREST_GREEN, marginTop: '4px' }}>
                Hardware EXIF Validation
              </div>
              <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>
                Camera timestamp and sensor geotag cross-referencing
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
