import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fixtures } from './fixtures.mjs';
import { developmentAuth } from './auth-config.mjs';

// Use a test tenant with its own matching frontend API, never a production
// key paired with the workspace's development Clerk proxy.
const auth = developmentAuth();
const output = mkdtempSync(path.join(tmpdir(), 'hockey-production-smoke-'));
const cleanup = () => rmSync(output, { recursive: true, force: true });
process.on('exit', cleanup);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => process.exit(0));
execFileSync('pnpm', ['run', 'build', '--outDir', output], {
  stdio: 'inherit',
  env: {
    ...process.env, NODE_ENV: 'production', PORT: '4179', BASE_PATH: '/',
    VITE_CLERK_PROXY_URL: auth.origin,
  },
});

const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
};
createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method !== 'GET') {
    res.writeHead(405).end('Smoke server is read-only');
    return;
  }
  if (pathname.startsWith('/api/')) {
    if (!Object.hasOwn(fixtures, pathname)) {
      res.writeHead(404).end(`Unconfigured smoke fixture: ${pathname}`);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fixtures[pathname]));
    return;
  }
  const file = path.resolve(output, `.${decodeURIComponent(pathname)}`);
  if (file !== output && !file.startsWith(`${output}/`)) {
    res.writeHead(403).end();
    return;
  }
  let target = file;
  try {
    if (!statSync(target).isFile()) target = path.join(output, 'index.html');
  } catch {
    if (path.extname(pathname)) { res.writeHead(404).end(); return; }
    target = path.join(output, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(target)] ?? 'application/octet-stream' });
  res.end(readFileSync(target));
}).listen(4179, '127.0.0.1', () => console.log('Production smoke bundle ready'));