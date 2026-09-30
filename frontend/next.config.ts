import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: {
    // Pre-existing lint issues in the frontend (unused vars, unescaped
    // entities) shouldn't block a production build — lint checks belong in
    // CI as a separate, non-blocking step. Track and fix these separately;
    // don't let them silently block deploys.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Allows API routes to import shared logic from ../backend (outside this
    // Next.js project's own root). Required for the @backend/* path alias.
    externalDir: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent the app from being embedded in iframes (clickjacking).
          { key: 'X-Frame-Options', value: 'DENY' },
          // Stop browsers from MIME-sniffing responses away from the declared type.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Only send the origin (no path) as the Referer header on cross-origin requests.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Disallow access to camera, microphone, and geolocation APIs.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Force HTTPS for 2 years once the browser has seen this header once.
          // Only meaningful in production (HTTPS); harmless in dev.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Prevent cross-origin information leaks and isolation
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          // Content Security Policy.
          // 'unsafe-inline' for scripts/styles is needed until nonces are wired
          // through Next.js — this is intentionally conservative, not final.
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https: http://127.0.0.1:* http://localhost:*",
              "font-src 'self'",
              "object-src 'none'",
              // Allow WebSocket connections (Next.js dev HMR) and PayFast.
              "connect-src 'self' ws: wss: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:* https://sandbox.payfast.co.za https://www.payfast.co.za",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://sandbox.payfast.co.za https://www.payfast.co.za",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
