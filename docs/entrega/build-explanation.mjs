// Builds the printable explanation (DOCX + PDF) from docs/entrega/explanation.md.
// Usage (from the project root): npm install --no-save docx@9 && node docs/entrega/build-explanation.mjs .
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  AlignmentType, Document, Footer, Header, Packer, PageBreak, PageNumber, Paragraph, TextRun,
} from 'docx';

const root = process.argv[2];
const md = readFileSync(join(root, 'docs/entrega/explanation.md'), 'utf8');
const OUT = join(root, 'docs/entrega');
const BASE = 'Lucas-A-Teenage-Brain-on-Video-Games';

// ── Parse the small markdown subset used by the draft ──
const lines = md.split('\n');
const title = lines[0].replace(/^# /, '').trim();
const meta = [];
let i = 1;
while (i < lines.length && !lines[i].startsWith('## ') && !(meta.length && lines[i].trim() === '' && lines[i + 1]?.trim() && !lines[i + 1].startsWith('Block'))) {
  if (lines[i].trim()) meta.push(lines[i].trim());
  i++;
  if (meta.length === 2) break;
}
const blocks = []; // {type:'p'|'h'|'ref', text}
let inRefs = false;
for (; i < lines.length; i++) {
  const l = lines[i].trim();
  if (!l) continue;
  if (l.startsWith('## ')) {
    const h = l.slice(3);
    if (h === 'References') { inRefs = true; continue; }
    blocks.push({ type: 'h', text: h });
  } else blocks.push({ type: inRefs ? 'ref' : 'p', text: l });
}

// APA 7 level-1 headings: title case (minor words lower case unless first / after a colon).
const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'it']);
const titleCase = (s) =>
  s.split(' ').map((w, k, arr) => {
    const prev = arr[k - 1] ?? '';
    const lw = w.toLowerCase();
    if (k > 0 && !prev.endsWith(':') && MINOR.has(lw) && lw !== 'it') return lw;
    if (lw === 'does' || lw === 'not' || lw === 'what' || lw === 'it') return w[0].toUpperCase() + w.slice(1);
    return w[0].toUpperCase() + w.slice(1);
  }).join(' ');

// *italic* segments → [{text, italics}]
const segs = (s) => s.split(/(\*[^*]+\*)/).filter(Boolean).map((t) => (t.startsWith('*') ? { text: t.slice(1, -1), italics: true } : { text: t, italics: false }));

// ── DOCX ──
const FONT = 'Times New Roman';
const SIZE = 24; // half-points = 12 pt
const DOUBLE = { line: 480, before: 0, after: 0 };
const run = (o) => new TextRun({ font: FONT, size: SIZE, ...o });
const children = [];
for (const m of meta) children.push(new Paragraph({ spacing: DOUBLE, children: [run({ text: m })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: DOUBLE, children: [run({ text: title, bold: true })] }));
for (const b of blocks) {
  if (b.type === 'h') {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: DOUBLE, keepNext: true, children: [run({ text: titleCase(b.text), bold: true })] }));
  } else if (b.type === 'p') {
    children.push(new Paragraph({ spacing: DOUBLE, indent: { firstLine: 720 }, children: segs(b.text).map((s) => run(s)) }));
  }
}
const refs = blocks.filter((b) => b.type === 'ref');
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: DOUBLE, keepNext: true, children: [run({ text: 'References', bold: true })] }));
for (const r of refs) children.push(new Paragraph({ spacing: DOUBLE, indent: { left: 720, hanging: 720 }, children: segs(r.text).map((s) => run(s)) }));

const doc = new Document({
  creator: 'Lucas A.',
  title,
  styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440, header: 720, footer: 720 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run({ children: [PageNumber.CURRENT] })] })] }) },
    footers: { default: new Footer({ children: [] }) },
    children,
  }],
});
writeFileSync(join(OUT, `${BASE}.docx`), await Packer.toBuffer(doc));

// ── HTML twin → PDF (Chromium), same text and formatting ──
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = (s) => segs(s).map((x) => (x.italics ? `<i>${esc(x.text)}</i>` : esc(x.text))).join('');
const body = [
  ...meta.map((m) => `<p class="meta">${esc(m)}</p>`),
  `<p class="title">${esc(title)}</p>`,
  ...blocks.filter((b) => b.type !== 'ref').map((b) => (b.type === 'h' ? `<h2>${esc(titleCase(b.text))}</h2>` : `<p>${html(b.text)}</p>`)),
  '<section class="refs"><h2>References</h2>',
  ...refs.map((r) => `<p class="ref">${html(r.text)}</p>`),
  '</section>',
].join('\n');
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: Letter; margin: 1in; }
body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 2; margin: 0; }
p { margin: 0; text-indent: 0.5in; orphans: 2; widows: 2; }
p.meta { text-indent: 0; }
p.title, h2 { text-align: center; font-weight: bold; font-size: 12pt; text-indent: 0; margin: 0; }
h2 { break-after: avoid; }
section.refs { break-before: page; }
p.ref { text-indent: -0.5in; padding-left: 0.5in; overflow-wrap: anywhere; }
</style></head><body>${body}</body></html>`;
writeFileSync(join(OUT, `${BASE}.html`), page);

const { chromium } = createRequire(join(root, 'package.json'))('playwright');
const browser = await chromium.launch();
const p = await browser.newPage();
await p.setContent(page, { waitUntil: 'load' });
await p.pdf({
  path: join(OUT, `${BASE}.pdf`),
  format: 'Letter',
  margin: { top: '1in', bottom: '1in', left: '1in', right: '1in' },
  displayHeaderFooter: true,
  headerTemplate: '<div style="width:100%;font-family:\'Times New Roman\',serif;font-size:12pt;text-align:right;padding:0 1in;margin-top:0.5in;"><span class="pageNumber"></span></div>',
  footerTemplate: '<div></div>',
});
await browser.close();

const words = blocks.filter((b) => b.type === 'p').map((b) => b.text.split(/\s+/).length).reduce((a, b) => a + b, 0);
console.log(`docx + pdf written; body words: ${words}; references: ${refs.length}`);
