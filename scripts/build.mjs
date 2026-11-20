// Bundles src/main.ts into a single classic script so dist/index.html also
// works when opened directly from disk (file://), no server required.
//   node scripts/build.mjs          → dist/
//   node scripts/build.mjs --serve  → rebuild on change + http://localhost:8000
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

const serve = process.argv.includes('--serve');
mkdirSync('dist', { recursive: true });
copyFileSync('index.html', 'dist/index.html');

const options = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'dist/game.js',
  sourcemap: serve,
  minify: !serve,
  logLevel: 'info',
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: 8000 });
  console.log(`One More Round → http://localhost:${port}`);
} else {
  await esbuild.build(options);
}
