// Runs every test: starts a static server for the app, then the unit and browser tests.
// Usage: npm test   (first time: npm install && npx playwright install chromium)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { spawn } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }).end(body); }
  catch { res.writeHead(404).end('not found'); }
}).listen(8765);

const run = (f) => new Promise((ok) => {
  const p = spawn(process.execPath, [new URL(f, import.meta.url).pathname], { stdio: 'inherit', env: { ...process.env, BASE_URL: 'http://localhost:8765/' } });
  p.on('exit', (code) => ok(code));
});
const only = process.argv[2];
const suites = ['namer.test.mjs', 'reactions.test.mjs', 'app.test.mjs', 'chair-ui.test.mjs'].filter(s => !only || s.startsWith(only));
let failed = 0;
for (const s of suites){ console.log(`\n=== ${s} ===`); if (await run(s)) failed++; }
server.close();
console.log(failed ? `\n${failed} suite(s) failed` : '\nAll suites passed');
process.exit(failed ? 1 : 0);
