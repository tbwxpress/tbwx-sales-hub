import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",   // unsafe-inline needed for theme localStorage script
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  compress: true,
  experimental: {
    // Tree-shake heavy barrel imports so per-route client JS is smaller.
    optimizePackageImports: ['lucide-react', 'date-fns', '@tanstack/react-table'],
  },
  async headers() {
    // /admin/wa-numbers loads Meta's JS SDK for WhatsApp Embedded Signup
    // (coexistence onboarding) — only that route gets the facebook.com
    // allowances; every other path keeps the strict policy.
    const embeddedSignupHeaders = securityHeaders.map(h =>
      h.key === 'Content-Security-Policy'
        ? {
            key: h.key,
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://www.facebook.com",
              "connect-src 'self' https://www.facebook.com https://graph.facebook.com https://connect.facebook.net",
              "frame-src https://www.facebook.com https://web.facebook.com",
              "frame-ancestors 'none'",
            ].join('; '),
          }
        : h
    )
    return [
      {
        source: '/((?!admin/wa-numbers).*)',
        headers: securityHeaders,
      },
      {
        source: '/admin/wa-numbers/:path*',
        headers: embeddedSignupHeaders,
      },
    ]
  },
};

export default nextConfig;
