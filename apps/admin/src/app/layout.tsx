import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'Kerala Tourism — Admin Governance Console',
  description: 'Department of Tourism verification queue, cadastral mapping checks, and platform analytics.',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          fontFamily: 'Inter, -apple-system, sans-serif',
          backgroundColor: '#F8F7F1',
          color: '#202A25',
          margin: 0,
          padding: 0,
        }}
      >
        {children}
      </body>
    </html>
  );
}
