import http from 'node:http';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { effectAsset, imageFixture } from './config.mjs';
const { WebSocketServer } = createRequire(import.meta.url)('ws');

// Independent protocol fixture; this does not execute Rust or Tauri IPC.
export async function startFixture() {
  const requests = [], connections = [];
  const frontendDist = process.env.OBS_FRONTEND_DIST ? path.resolve(process.env.OBS_FRONTEND_DIST) : null;
  const frontendRequests = [];
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (frontendDist && (url.pathname === '/obs.html' || url.pathname.startsWith('/assets/'))) {
        const file = path.join(frontendDist, url.pathname.slice(1));
        const bytes = await fs.readFile(file);
        const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff' }[path.extname(file)] || 'application/octet-stream';
        frontendRequests.push({ path: url.pathname, file, bytes: bytes.length });
        res.writeHead(200, { 'content-type': mime, 'content-length': bytes.length }); res.end(req.method === 'HEAD' ? undefined : bytes); return;
      }
      if (url.pathname.startsWith('/upstream/')) {
        if (url.pathname.endsWith('/references.json')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ src: [{ imgUrl: 'image.jpg', srcTag: '[avatar]' }], nested: { url: './image.jpg', src: 'data:image/png;base64,AA==' } })); return;
        }
        if (url.pathname.endsWith('/image.jpg')) {
          const bytes = await fs.readFile(imageFixture);
          res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': bytes.length }); res.end(bytes); return;
        }
        const file = url.pathname.endsWith('/effect.mp4') ? 'effect.mp4' : 'effect.json';
        if (url.pathname.endsWith('/broken.json')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{broken'); return; }
        const bytes = await fs.readFile(effectAsset(file));
        const headers = { 'content-type': file.endsWith('.mp4') ? 'video/mp4' : 'application/json', 'accept-ranges': 'bytes' };
        let start = 0, end = bytes.length - 1, status = 200;
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
        if (range) { start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end; status = 206; headers['content-range'] = `bytes ${start}-${end}/${bytes.length}`; }
        headers['content-length'] = end - start + 1;
        requests.push({ upstream: url.pathname, method: req.method, range: req.headers.range, ifRange: req.headers['if-range'], status });
        res.writeHead(status, headers); res.end(req.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1)); return;
      }
      if (url.pathname.startsWith('/gift-effects/')) {
        const [, , token, name] = url.pathname.split('/');
        const source = new URL(Buffer.from(token, 'base64url').toString());
        const record = { path: url.pathname, source: source.href, range: req.headers.range };
        requests.push(record);
        if (process.env.OBS_RUST_PROXY_PORT) {
          const upstream = http.request({ hostname: '127.0.0.1', port: Number(process.env.OBS_RUST_PROXY_PORT), path: req.url, method: req.method, headers: req.headers }, incoming => {
            record.status = incoming.statusCode;
            res.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(res);
          });
          upstream.on('error', error => { res.writeHead(502); res.end(error.message); }); req.pipe(upstream); return;
        }
        if (source.pathname.endsWith('/broken.json')) {
          res.writeHead(200, { 'content-type': 'application/json' }); res.end('{broken'); return;
        }
        const file = name.endsWith('.json') ? 'effect.json' : 'effect.mp4';
        const bytes = await fs.readFile(effectAsset(file));
        let start = 0, end = bytes.length - 1, status = 200;
        const headers = { 'content-type': file.endsWith('.json') ? 'application/json' : 'video/mp4', 'accept-ranges': 'bytes' };
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
        if (range) {
          start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end; status = 206;
          headers['content-range'] = `bytes ${start}-${end}/${bytes.length}`;
        }
        headers['content-length'] = end - start + 1;
        res.writeHead(status, headers); res.end(req.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1)); return;
      }
      const upstream = http.request({ hostname: '127.0.0.1', port: 1442, path: req.url, method: req.method, headers: { ...req.headers, host: '127.0.0.1:1442' } }, incoming => {
        res.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(res);
      });
      upstream.on('error', error => { res.writeHead(502); res.end(error.message); });
      req.pipe(upstream);
    } catch (error) { res.writeHead(500); res.end(String(error)); }
  });
  const ws = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/ws') { socket.destroy(); return; }
    ws.handleUpgrade(req, socket, head, client => ws.emit('connection', client, req));
  });
  ws.on('connection', (client, req) => {
    connections.push({ client, query: req.url, received: [] });
    client.on('message', data => connections.find(item => item.client === client).received.push(data.toString()));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`, requests, connections, frontendDist, frontendRequests,
    send(message) { for (const client of ws.clients) if (client.readyState === 1) client.send(JSON.stringify(message)); },
    disconnect() { for (const client of ws.clients) client.close(); },
    async close() { for (const client of ws.clients) client.terminate(); await new Promise(resolve => ws.close(resolve)); await new Promise(resolve => server.close(resolve)); },
  };
}
