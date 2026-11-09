import React from 'react';
import { THEME_COLORS, BOOKING_RULES } from '@kerala-tourism/constants';

export default function BusinessDashboardPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Merchant Top Header */}
      <header
        style={{
          backgroundColor: THEME_COLORS.FOREST_GREEN,
          color: THEME_COLORS.WARM_CREAM,
          padding: '16px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '-0.02em' }}>
            Kerala Tourism | Partner Console
          </span>
          <span
            style={{
              fontSize: '12px',
              backgroundColor: 'rgba(255,255,255,0.15)',
              padding: '4px 10px',
              borderRadius: '6px',
            }}
          >
            Kumarakom Heritage Backwater Villa (ID: #KUM-849)
          </span>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            style={{
              backgroundColor: THEME_COLORS.SUNSET_ORANGE,
              color: THEME_COLORS.CHARCOAL,
              border: 'none',
              padding: '8px 14px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Scan Guest QR Pass
          </button>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: THEME_COLORS.NATURE_GREEN,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '13px',
              color: '#FFFFFF',
            }}
          >
            KV
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, padding: '32px', maxWidth: '1440px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 4px 0', color: THEME_COLORS.CHARCOAL }}>
              Property Availability & StayOps Overview
            </h1>
            <p style={{ fontSize: '14px', color: '#6B7280', margin: 0 }}>
              Live 24-hour room inventory matrix, turnover sanitization buffers, and incoming traveler requests.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: THEME_COLORS.FOREST_GREEN,
                backgroundColor: '#E8F5E9',
                padding: '6px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>Housekeeping Buffer:</span>
              <strong>{BOOKING_RULES.TURNOVER_BUFFER_MINUTES} mins auto-lock</strong>
            </div>
          </div>
        </div>

        {/* Metrics Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
          {[
            { label: 'Today’s Occupancy', val: '86%', sub: '4 of 5 suites active' },
            { label: 'Hourly Transit Revenue', val: '₹14,250', sub: '7 transit slots booked today' },
            { label: 'Turnover in Progress', val: '1 Room', sub: 'Suite 102 (Ready in 35m)' },
            { label: 'Pending Requests', val: '2 Requests', sub: '15-min SLA active', alert: true },
          ].map((card, i) => (
            <div
              key={i}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '10px',
                padding: '20px',
                border: card.alert ? '1px solid #F59E0B' : '1px solid #E2E8F0',
                boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '8px' }}>{card.label}</div>
              <div
                style={{
                  fontSize: '26px',
                  fontWeight: 800,
                  color: card.alert ? '#D97706' : THEME_COLORS.CHARCOAL,
                  marginBottom: '4px',
                }}
              >
                {card.val}
              </div>
              <div style={{ fontSize: '12px', color: '#9CA3AF' }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* 24-Hour Timeline Matrix Placeholder Card */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '24px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: THEME_COLORS.CHARCOAL }}>
              24-Hour Hourly & Daily Turnover Matrix
            </h2>
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: THEME_COLORS.FOREST_GREEN }} />
                Daily Overnight Stay
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: THEME_COLORS.NATURE_GREEN }} />
                Hourly Transit (3h / 6h / 12h)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#CBD5E1' }} />
                1-Hour Turnover Buffer
              </span>
            </div>
          </div>

          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              backgroundColor: '#F8F9FA',
              borderRadius: '8px',
              border: '1px dashed #CBD5E1',
              color: '#6B7280',
              fontSize: '14px',
            }}
          >
            24-Hour Timeline Grid Container ready for live inventory streaming via backend API.
          </div>
        </div>
      </main>
    </div>
  );
}
