import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname;
const PROJECT = '/Users/benjamin/Documents/Code/K7-Player';
// Only these repo-relative targets may be written.
const ALLOW = new Set([
  'src/app/components/oled/font04b03.ts',
  'src/app/components/oled/icons.ts',
]);
const MIME = { '.html':'text/html', '.ttf':'font/ttf', '.svg':'image/svg+xml', '.js':'text/javascript' };

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-filename, content-type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'POST' && req.url === '/write') {
    const name = req.headers['x-filename'];
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      if (!ALLOW.has(name)) { res.writeHead(403); return res.end('forbidden: ' + name); }
      const dest = join(PROJECT, name);
      writeFileSync(dest, body);
      console.log('WROTE', dest, body.length, 'bytes');
      res.writeHead(200); res.end('ok ' + body.length);
    });
    return;
  }

  const path = req.url === '/' ? '/bake.html' : req.url.split('?')[0];
  const file = join(ROOT, path);
  if (!existsSync(file)) { res.writeHead(404); return res.end('nf'); }
  res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
  res.writeHead(200); res.end(readFileSync(file));
}).listen(8791, () => console.log('gen server on http://localhost:8791'));
