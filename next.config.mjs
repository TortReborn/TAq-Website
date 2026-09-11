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
