/* Flattens the booth display into one self-contained file.
   node bundle.js            -> cv-booth-display.standalone.html (full document)
   node bundle.js --artifact -> cv-booth-display.artifact.html  (no doctype/head/body) */
const fs = require('fs');
const path = require('path');
const DIST = require('path').join(__dirname, '..') + '/';
const asArtifact = process.argv.includes('--artifact');

let html = fs.readFileSync(DIST + 'display.html', 'utf8');

// inline every local <script src>
html = html.replace(/[ \t]*<script src="([^"]+)"[^>]*><\/script>\n?/g, (m, src) => {
  const p = path.join(DIST, src);
  if (!fs.existsSync(p)) return '';
  return '<script>\n' + fs.readFileSync(p, 'utf8') + '\n</script>\n';
});

if (asArtifact) {
  const title = (html.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
  const fonts = html.match(/<link rel="stylesheet"[^>]*fonts\.googleapis[^>]*>/g) || [];
  const style = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
  html = title + '\n' + fonts.join('\n') + '\n' + style + '\n' + body.trim() + '\n';
  // the preview has no phones pointed at it
  html = html.replace("mode: 'demo'", "mode: 'demo'");
}

const out = DIST + (asArtifact ? 'cv-booth-display.artifact.html' : 'cv-booth-display.standalone.html');
fs.writeFileSync(out, html);
console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
