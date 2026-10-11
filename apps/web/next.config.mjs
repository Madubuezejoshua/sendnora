import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pins Next.js's output file tracing to the monorepo root instead of letting
  // it infer one — in an npm-workspaces monorepo it can otherwise walk up far
  // enough to hit OS-specific directories it can't scan (e.g. the Windows
  // "Application Data" junction under the user's home folder) and fail the build.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // Prisma's native engine lives outside apps/web (packages/database/generated) and isn't auto-traced on Vercel.
  outputFileTracingIncludes: {
    '/**/*': [
      './generated/client/*', // copied here by vercel.json's buildCommand — Prisma searches this path at runtime
    ],
  },
  // Linting runs as its own separate CI/npm-scripts step (`npm run lint`)
  // against the whole monorepo — running it again inside `next build` is
  // redundant and, in this Windows dev environment, its directory walk hits
  // an OS-specific permission error scanning outside the project.
  eslint: { ignoreDuringBuilds: true },
  // packages/shared and packages/ui are consumed as raw TypeScript source
  // (no build step) — Next.js needs to know to transpile them itself.
  transpilePackages: [
    '@invoicetap/shared',
    '@invoicetap/ui',
    '@invoicetap/database',
    '@invoicetap/config',
  ],
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  webpack: (config) => {
    // @invoicetap/shared and @invoicetap/ui ship raw TypeScript source using
    // explicit .js-suffixed relative imports (the NodeNext ESM convention,
    // needed for apps/api's Node runtime — see ARCHITECTURE.md). Node's own
    // resolver and tsx handle this natively; webpack needs to be told
    // explicitly to also try .ts/.tsx when an import ends in .js.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
