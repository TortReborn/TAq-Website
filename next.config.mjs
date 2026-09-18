/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The reference pages and the archive API read data/wiki/sources at
    // request time via path.join(process.cwd(), ...), and Next's file tracer
    // follows that call to the whole directory: every raw source image,
    // gzipped HTML capture and media manifest — 157 MB across 925 files — was
    // shipped inside three serverless functions on every deployment, which is
    // what filled Vercel's function storage. Only the manifest and the
    // extracted documents are read at runtime; everything else in there is
    // research evidence for the scripts and stays out of the bundle.
    outputFileTracingExcludes: {
      '*': ['./data/wiki/sources/!(docs|index.json)/**'],
    },
  },
  // The feature is called the Chronicle, and its route used to be
  // /chronicles. Every article cross-link, the map, the timeline and anyone's
  // bookmarks point at the old path, so it redirects permanently rather than
  // 404ing. Note this must NOT catch /images/chronicles/... — those are asset
  // files under public/ and never moved.
  async redirects() {
    return [
      { source: '/chronicles', destination: '/chronicle', permanent: true },
      { source: '/chronicles/:path*', destination: '/chronicle/:path*', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // Baseline security headers on every response. Vercel adds HSTS on
        // its own; the rest is ours. The CSP is report-only for now: the
        // theme-flash script in layout.tsx and the early-fetch in map/page.tsx
        // are inline, so enforcing it needs nonces first. Watch the browser
        // console for violations, tighten, then rename the header to
        // Content-Security-Policy.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://api.wynncraft.com https://api.mojang.com https://athena.wynntils.com https://vitals.vercel-insights.com",
              "worker-src 'self' blob:",
              "media-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
      {
        // Versioned map assets (bump the filename to invalidate, e.g. fruma_map.v3.webp)
        source: '/images/map/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/territories_verbose.json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/territory_externals.json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
    ];
  },
};

export default nextConfig;
