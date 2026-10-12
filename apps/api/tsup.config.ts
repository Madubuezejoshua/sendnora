import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/vercel.ts', 'src/worker.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  // @sendnaro/shared and @sendnaro/config ship raw TypeScript source
  // with .js-suffixed relative imports that only resolve under tsx/esbuild,
  // not under plain `node` at runtime — so they're bundled in rather than
  // left as external imports.
  //
  // @sendnaro/database is deliberately NOT bundled, unlike the above: it
  // re-exports the generated Prisma client, whose CJS runtime library uses
  // require() patterns esbuild cannot safely bundle for an ESM target (a
  // known Prisma+esbuild incompatibility). Instead it ships a real
  // `npm run build` (tsc) output — see packages/database/package.json's
  // "main" — so plain Node can resolve and run it normally, exactly as it
  // would resolve any other npm package. @node-rs/argon2 (a dependency of
  // @sendnaro/database) similarly ships a platform-specific native
  // binary selected via a dynamic multi-platform require() and must stay
  // a real file under node_modules rather than bundled.
  noExternal: ['@sendnaro/shared', '@sendnaro/config'],
  external: ['@prisma/client', '@node-rs/argon2', '@sendnaro/database'],
});
