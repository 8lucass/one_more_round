// Bundles src/main.ts into a single classic script so dist/index.html also
// works when opened directly from disk (file://), no server required.
//   node scripts/build.mjs          → dist/index.html + dist/game.js, and
//                                     dist/one-more-round.html (everything in one
//                                     file, to send by email or copy anywhere)
//   node scripts/build.mjs --serve  → rebuild on change + http://localhost:8000
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

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
  writeStandalone();
}

/** dist/one-more-round.html: index.html with game.js inlined (P04). */
function writeStandalone() {
  const html = readFileSync('index.html', 'utf8');
  const js = readFileSync('dist/game.js', 'utf8');
  const tag = '<script src="game.js"></script>';
  if (!html.includes(tag)) throw new Error(`index.html has no ${tag}`);
  // Inside an inline <script>, "</script" or "<!--" in the code would end or confuse the element.
  if (/<\/script|<!--/i.test(js)) throw new Error('game.js contains </script or <!--: cannot inline it safely');
  const out = html.replace(tag, () => `<script>\n${js}</script>`);
  writeFileSync('dist/one-more-round.html', out);
  console.log(`  dist/one-more-round.html  ${(out.length / 1024).toFixed(1)}kb (standalone)`);
}
