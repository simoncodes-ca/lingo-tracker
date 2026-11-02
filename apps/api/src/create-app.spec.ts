import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Controller, Get, HttpCode, type INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import { AppModule } from './app/app.module';
import { ConfigService } from './app/config/config.service';
import { createApp, resolveHost, resolvePort } from './create-app';

function requestWithHost(
  url: string,
  host: string | undefined,
  options: { origin?: string | string[]; method?: string } = {},
): Promise<{ status: number | undefined; body: string; allowOrigin: string | string[] | undefined }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | string[]> = {};
    if (typeof host === 'string') headers.Host = host;
    if (typeof options.origin === 'string' || Array.isArray(options.origin)) headers.Origin = options.origin;
    const req = httpRequest(url, { setHost: false, method: options.method, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        body += chunk;
      });
      res.on('end', () =>
        resolve({ status: res.statusCode, body, allowOrigin: res.headers['access-control-allow-origin'] }),
      );
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('createApp over HTTP', () => {
  let root: string | undefined;
  let app: INestApplication | undefined;
  let baseUrl = '';
  const indexHtml = '<!doctype html><html><body>Lingo Tracker client fixture</body></html>';
  const asset = 'console.log("client fixture");';
  let handlerCalls = 0;

  @Controller('origin-probe')
  class OriginProbeController {
    @Get()
    read() {
      handlerCalls += 1;
      return { ok: true };
    }

    @Post()
    @HttpCode(200)
    write() {
      handlerCalls += 1;
      return { ok: true };
    }
  }

  beforeAll(async () => {
    const projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'lingo-api-bootstrap-')));
    root = projectRoot;
    const clientPath = join(projectRoot, 'client');
    mkdirSync(join(clientPath, 'assets'), { recursive: true });
    writeFileSync(join(clientPath, 'index.html'), indexHtml);
    writeFileSync(join(clientPath, 'assets', 'app.js'), asset);
    const config: LingoTrackerConfig = {
      exportFolder: 'dist/export',
      importFolder: 'dist/import',
      baseLocale: 'en',
      locales: ['en'],
      collections: {},
    };
    writeFileSync(join(projectRoot, '.lingo-tracker.json'), JSON.stringify(config));

    class ProjectConfigService extends ConfigService {
      override get projectRoot(): string {
        return projectRoot;
      }
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [OriginProbeController] })
      .overrideProvider(ConfigService)
      .useValue(new ProjectConfigService())
      .compile();
    app = await createApp({
      clientPath,
      createNestApp: (adapter) => {
        app = moduleRef.createNestApplication(adapter, { logger: false });
        return app;
      },
    });
    await app.listen(0);
    const server = app.getHttpServer() as Server;
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('HTTP server has no TCP address');
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      if (root !== undefined) rmSync(root, { recursive: true, force: true });
    }
  });

  const request = (path: string, init?: RequestInit): Promise<Response> => fetch(`${baseUrl}${path}`, init);

  it('serves the client index at the root', async () => {
    const response = await request('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe(indexHtml);
  });

  it('serves the client index for a deep SPA route', async () => {
    const response = await request('/collections/foo/browse');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe(indexHtml);
  });

  it('serves static assets before the SPA fallback', async () => {
    const response = await request('/assets/app.js');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(await response.text()).toBe(asset);
  });

  it('serves the health route with the global API prefix', async () => {
    const response = await request('/api/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ status: 'all is good' });
  });

  it('returns a Nest JSON 404 for an unknown API route', async () => {
    const response = await request('/api/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      message: 'Cannot GET /api/does-not-exist',
      error: 'Not Found',
      statusCode: 404,
    });
  });

  it('returns a Nest JSON 404 for POST /foo', async () => {
    const response = await request('/foo', { method: 'POST' });
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      message: 'Cannot POST /foo',
      error: 'Not Found',
      statusCode: 404,
    });
  });

  it('returns a Nest JSON 404 for DELETE /some/route', async () => {
    const response = await request('/some/route', { method: 'DELETE' });
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      message: 'Cannot DELETE /some/route',
      error: 'Not Found',
      statusCode: 404,
    });
  });

  it('returns a Nest JSON 404 for GET /apiary', async () => {
    const response = await request('/apiary', { method: 'GET' });
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      message: 'Cannot GET /apiary',
      error: 'Not Found',
      statusCode: 404,
    });
  });

  it('allows same-origin PATCH preflights', async () => {
    const response = await request('/api/collections/x/resources', {
      method: 'OPTIONS',
      headers: { Origin: baseUrl, 'Access-Control-Request-Method': 'PATCH' },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(baseUrl);
    expect(response.headers.get('access-control-allow-methods')?.split(/,\s*/)).toContain('PATCH');
    expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type, Authorization');
  });

  it('allows same-origin DELETE preflights', async () => {
    const response = await request('/api/collections/x/resources', {
      method: 'OPTIONS',
      headers: { Origin: baseUrl, 'Access-Control-Request-Method': 'DELETE' },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(baseUrl);
    expect(response.headers.get('access-control-allow-methods')?.split(/,\s*/)).toContain('DELETE');
    expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type, Authorization');
  });

  it('rejects foreign Origins on GET before the controller runs', async () => {
    const before = handlerCalls;
    const response = await request('/api/origin-probe', { headers: { Origin: 'https://evil.example' } });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ statusCode: 403, message: 'Origin not allowed', error: 'Forbidden' });
    expect(handlerCalls).toBe(before);
  });

  it('rejects a simple multipart POST from a foreign Origin before the controller runs', async () => {
    const before = handlerCalls;
    const body = new FormData();
    body.append('files', new Blob(['{}'], { type: 'application/json' }), 'fr.json');
    const response = await request('/api/origin-probe', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
      body,
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ statusCode: 403, message: 'Origin not allowed', error: 'Forbidden' });
    expect(handlerCalls).toBe(before);
  });

  it('allows requests without an Origin header', async () => {
    const before = handlerCalls;
    const response = await request('/api/origin-probe');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(handlerCalls).toBe(before + 1);
  });

  it('allows the Angular dev Origin when the proxy preserves the matching Host', async () => {
    const response = await requestWithHost(`${baseUrl}/api/origin-probe`, 'localhost:4200', {
      origin: 'http://localhost:4200',
    });
    expect(response.status).toBe(200);
    expect(response.allowOrigin).toBe('http://localhost:4200');
  });

  it('allows a multipart POST from the API origin to reach its controller', async () => {
    const before = handlerCalls;
    const body = new FormData();
    body.append('files', new Blob(['{}'], { type: 'application/json' }), 'fr.json');
    const response = await request('/api/origin-probe', { method: 'POST', headers: { Origin: baseUrl }, body });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('access-control-allow-origin')).toBe(baseUrl);
    expect(handlerCalls).toBe(before + 1);
  });

  it('serves the static Tracker to its own Origin', async () => {
    const response = await request('/', { headers: { Origin: baseUrl } });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(indexHtml);
  });

  it('allows HTTP and HTTPS Origins only with matching loopback Host and port', async () => {
    for (const hostname of ['localhost', '127.0.0.1', '127.20.30.40', '[::1]']) {
      for (const protocol of ['http', 'https']) {
        for (const port of ['', ':4200']) {
          const origin = `${protocol}://${hostname}${port}`;
          const response = await requestWithHost(`${baseUrl}/api/origin-probe`, `${hostname}${port}`, { origin });
          expect(response.status).toBe(200);
          expect(response.allowOrigin).toBe(origin);
        }
      }
    }
  });

  it('rejects another localhost port or loopback hostname before handlers and without CORS permission', async () => {
    const before = handlerCalls;
    for (const origin of ['http://localhost:9999', 'http://127.0.0.1:9999', 'http://localhost:3030']) {
      const response = await requestWithHost(`${baseUrl}/api/origin-probe`, '127.0.0.1:3030', {
        origin,
        method: 'POST',
      });
      expect(response.status).toBe(403);
      expect(JSON.parse(response.body)).toEqual({ statusCode: 403, message: 'Origin not allowed', error: 'Forbidden' });
      expect(response.allowOrigin).toBeUndefined();
    }
    expect(handlerCalls).toBe(before);
  });

  it('rejects null and misleading loopback Origins', async () => {
    const before = handlerCalls;
    for (const origin of [
      'null',
      'http://localhost.evil.example',
      'http://127.0.0.1.evil.example',
      'http://localhost@evil.example',
      'http://@localhost',
      'http://localhost\\evil',
      'ftp://localhost',
      'http://localhost/path',
      'http://localhost.evil.com',
      'http://localhost:4200, http://evil.com',
      'http://localhost:4200 http://evil.com',
      'http://[::1',
      'http://localhost/#fragment',
    ]) {
      const response = await request('/api/origin-probe', { headers: { Origin: origin } });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ statusCode: 403, message: 'Origin not allowed', error: 'Forbidden' });
    }
    expect(handlerCalls).toBe(before);
  });

  it('rejects a foreign Host before the controller or static handler runs with the default binding', async () => {
    const before = handlerCalls;
    for (const path of ['/api/origin-probe', '/']) {
      const response = await requestWithHost(`${baseUrl}${path}`, 'evil.example:3030');
      expect(response.status).toBe(403);
      expect(JSON.parse(response.body)).toEqual({ statusCode: 403, message: 'Host not allowed', error: 'Forbidden' });
    }
    expect(handlerCalls).toBe(before);
  });

  it('allows loopback Host headers with and without ports', async () => {
    for (const hostname of ['localhost', 'LOCALHOST', '127.0.0.1', '192.168.1.5', '[::1]', '[::ffff:7f00:1]']) {
      for (const port of ['', ':3030']) {
        const response = await requestWithHost(`${baseUrl}/api/origin-probe`, `${hostname}${port}`);
        expect(response.status).toBe(200);
      }
    }
  });

  it('rejects foreign Origins before serving static content', async () => {
    const response = await request('/', { headers: { Origin: 'https://evil.example' } });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ statusCode: 403, message: 'Origin not allowed', error: 'Forbidden' });
  });

  it('allows same-origin LAN POST requests with matching Host and Origin', async () => {
    const before = handlerCalls;
    const response = await requestWithHost(`${baseUrl}/api/origin-probe`, '192.168.1.5:3030', {
      origin: 'http://192.168.1.5:3030',
      method: 'POST',
    });
    expect(response.status).toBe(200);
    expect(response.allowOrigin).toBe('http://192.168.1.5:3030');
    expect(JSON.parse(response.body)).toEqual({ ok: true });
    expect(handlerCalls).toBe(before + 1);
  });

  it('rejects DNS rebinding even when the Origin matches the Host', async () => {
    const before = handlerCalls;
    for (const method of ['GET', 'POST']) {
      const response = await requestWithHost(`${baseUrl}/api/origin-probe`, 'evil.com:3030', {
        origin: 'http://evil.com:3030',
        method,
      });
      expect(response.status).toBe(403);
      expect(JSON.parse(response.body)).toEqual({ statusCode: 403, message: 'Host not allowed', error: 'Forbidden' });
    }
    expect(handlerCalls).toBe(before);
  });

  it('rejects a missing Host header before the controller runs', async () => {
    const before = handlerCalls;
    const response = await requestWithHost(`${baseUrl}/api/origin-probe`, undefined);
    expect(response.status).toBe(403);
    expect(JSON.parse(response.body)).toEqual({ statusCode: 403, message: 'Host not allowed', error: 'Forbidden' });
    expect(handlerCalls).toBe(before);
  });

  it('rejects malformed Host headers and unlisted names', async () => {
    for (const host of [
      'localhost.evil.com:3030',
      'my-laptop.local:3030',
      '999.1.2.3',
      '[bad:ip]',
      'localhost/path',
      'localhost@evil.com',
      'localhost:3030,evil.com:3030',
    ]) {
      const response = await requestWithHost(`${baseUrl}/api/origin-probe`, host);
      expect(response.status).toBe(403);
      expect(JSON.parse(response.body)).toEqual({ statusCode: 403, message: 'Host not allowed', error: 'Forbidden' });
    }
  });

  it('rejects multiple Origin header values', async () => {
    const response = await requestWithHost(`${baseUrl}/api/origin-probe`, 'localhost:3030', {
      origin: ['http://localhost:4200', 'http://evil.com'],
    });
    expect(response.status).toBe(403);
    expect(JSON.parse(response.body)).toEqual({ statusCode: 403, message: 'Origin not allowed', error: 'Forbidden' });
  });

  it('rejects LAN Origins whose host or port differs from the Host header', async () => {
    for (const origin of ['http://192.168.1.6:3030', 'http://192.168.1.5:4000']) {
      const response = await requestWithHost(`${baseUrl}/api/origin-probe`, '192.168.1.5:3030', { origin });
      expect(response.status).toBe(403);
      expect(JSON.parse(response.body)).toEqual({ statusCode: 403, message: 'Origin not allowed', error: 'Forbidden' });
    }
  });

  it('serves Swagger UI at /api', async () => {
    const response = await request('/api');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('Swagger UI');
    expect(html).not.toBe(indexHtml);
  });

  it('serves the Swagger JSON document at /api-json', async () => {
    const response = await request('/api-json');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual(
      expect.objectContaining({
        openapi: expect.stringMatching(/^3\./),
        info: expect.objectContaining({ title: 'Lingo Tracker API', version: '1.0' }),
        paths: expect.objectContaining({ '/api/health': expect.objectContaining({ get: expect.any(Object) }) }),
      }),
    );
  });
});

describe.each(['', '  My-Laptop.Local , OTHER.local  ', '  My-Laptop.Local:3030 , OTHER.local:4000 , :3030 ,  '])(
  'createApp with the production Nest factory (allowedHosts %s)',
  (allowedHosts) => {
    let root: string | undefined;
    let app: INestApplication | undefined;
    let baseUrl = '';
    const indexHtml = '<!doctype html><html><body>Production factory client fixture</body></html>';

    beforeAll(async () => {
      const clientPath = realpathSync(mkdtempSync(join(tmpdir(), 'lingo-api-production-bootstrap-')));
      root = clientPath;
      writeFileSync(join(clientPath, 'index.html'), indexHtml);

      app = await createApp({ clientPath, allowedHosts });
      await app.listen(0);
      const server = app.getHttpServer() as Server;
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('HTTP server has no TCP address');
      baseUrl = `http://localhost:${address.port}`;
    });

    afterAll(async () => {
      try {
        await app?.close();
      } finally {
        if (root !== undefined) rmSync(root, { recursive: true, force: true });
      }
    });

    it('serves API health and the client index without an app creation override', async () => {
      const healthResponse = await fetch(`${baseUrl}/api/health`);
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.headers.get('content-type')).toContain('application/json');
      expect(await healthResponse.json()).toEqual({ status: 'all is good' });

      const clientResponse = await fetch(`${baseUrl}/`);
      expect(clientResponse.status).toBe(200);
      expect(clientResponse.headers.get('content-type')).toContain('text/html');
      expect(await clientResponse.text()).toBe(indexHtml);
    });
    it('rejects a foreign Host regardless of allowed names', async () => {
      const response = await requestWithHost(`${baseUrl}/api/health`, 'evil.example:3030');
      expect(response.status).toBe(403);
      expect(JSON.parse(response.body)).toEqual({ statusCode: 403, message: 'Host not allowed', error: 'Forbidden' });
    });

    it('allows listed hosts with a different port', async () => {
      const response = await requestWithHost(`${baseUrl}/api/health`, 'MY-LAPTOP.local:9090');
      expect(response.status).toBe(allowedHosts.length > 0 ? 200 : 403);
    });

    it('still rejects foreign Origins with explicitly allowed names', async () => {
      const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'http://evil.example' } });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ statusCode: 403, message: 'Origin not allowed', error: 'Forbidden' });
    });
    it('allows named LAN access only when explicitly listed, trimmed and case-insensitive', async () => {
      const response = await requestWithHost(`${baseUrl}/api/health`, 'MY-LAPTOP.local:3030', {
        origin: 'http://my-laptop.LOCAL:3030',
      });
      const listed = allowedHosts.length > 0;
      expect(response.status).toBe(listed ? 200 : 403);
      expect(JSON.parse(response.body)).toEqual(
        listed
          ? { status: 'all is good' }
          : {
              statusCode: 403,
              message: 'Host not allowed',
              error: 'Forbidden',
            },
      );
      if (listed) expect(response.allowOrigin).toBe('http://my-laptop.LOCAL:3030');
    });
  },
);

describe('resolvePort', () => {
  it('supports --port=value with precedence over the environment', () => {
    expect(resolvePort(['node', 'main.js', '--port=4000'], { LINGO_TRACKER_PORT: 'fallback' })).toBe('4000');
  });

  it('ignores a following flag and falls back to the environment', () => {
    expect(resolvePort(['node', 'main.js', '--port', '--host', '4000'], { LINGO_TRACKER_PORT: '4000' })).toBe('4000');
  });

  it('uses the default for an empty equals value or a following flag', () => {
    expect(resolvePort(['--port='], {})).toBe(3030);
    expect(resolvePort(['--port', '--host', '4000'], {})).toBe(3030);
  });

  it('prefers the argv port over the environment port', () => {
    expect(resolvePort(['node', 'main.js', '--port', '4040'], { LINGO_TRACKER_PORT: '5050' })).toBe('4040');
  });

  it('uses the environment port when argv has no port', () => {
    expect(resolvePort(['node', 'main.js'], { LINGO_TRACKER_PORT: '5050' })).toBe('5050');
  });

  it('defaults to 3030 when neither argv nor the environment has a port', () => {
    expect(resolvePort(['node', 'main.js'], {})).toBe(3030);
  });

  it('falls back to the environment when --port has no value', () => {
    expect(resolvePort(['node', 'main.js', '--port'], { LINGO_TRACKER_PORT: '5050' })).toBe('5050');
  });

  it('falls back to the default when --port has no value and the environment has no port', () => {
    expect(resolvePort(['node', 'main.js', '--port'], {})).toBe(3030);
  });
});

describe('resolveHost', () => {
  it('supports --host=value with precedence over the environment', () => {
    expect(resolveHost(['node', 'main.js', '--host=0.0.0.0'], { LINGO_TRACKER_HOST: 'fallback' })).toBe('0.0.0.0');
  });

  it('ignores a following flag and falls back to the environment', () => {
    expect(resolveHost(['node', 'main.js', '--host', '--port', '4000'], { LINGO_TRACKER_HOST: '0.0.0.0' })).toBe(
      '0.0.0.0',
    );
  });

  it('uses the default for an empty equals value or a following flag', () => {
    expect(resolveHost(['--host='], {})).toBe('127.0.0.1');
    expect(resolveHost(['--host', '--port', '4000'], {})).toBe('127.0.0.1');
  });

  it('prefers the argv host over the environment host', () => {
    expect(resolveHost(['node', 'main.js', '--host', '0.0.0.0'], { LINGO_TRACKER_HOST: '192.168.1.10' })).toBe(
      '0.0.0.0',
    );
  });

  it('uses the environment host when argv has no host', () => {
    expect(resolveHost(['node', 'main.js'], { LINGO_TRACKER_HOST: '0.0.0.0' })).toBe('0.0.0.0');
  });

  it('defaults to 127.0.0.1 when neither argv nor the environment has a host', () => {
    expect(resolveHost(['node', 'main.js'], {})).toBe('127.0.0.1');
  });

  it('falls back to the environment when --host has no value', () => {
    expect(resolveHost(['node', 'main.js', '--host'], { LINGO_TRACKER_HOST: '0.0.0.0' })).toBe('0.0.0.0');
  });

  it('falls back to the default when --host has no value and the environment has no host', () => {
    expect(resolveHost(['node', 'main.js', '--host'], {})).toBe('127.0.0.1');
  });
});
