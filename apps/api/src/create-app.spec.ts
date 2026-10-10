import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import { AppModule } from './app/app.module';
import { ConfigService } from './app/config/config.service';
import { createApp, resolvePort } from './create-app';

describe('createApp over HTTP', () => {
  let root: string | undefined;
  let app: INestApplication | undefined;
  let baseUrl = '';
  const indexHtml = '<!doctype html><html><body>Lingo Tracker client fixture</body></html>';
  const asset = 'console.log("client fixture");';

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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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

  it('allows cross-origin PATCH preflights', async () => {
    const response = await request('/api/collections/x/resources', {
      method: 'OPTIONS',
      headers: { Origin: 'http://example.com', 'Access-Control-Request-Method': 'PATCH' },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')?.split(/,\s*/)).toContain('PATCH');
    expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type, Authorization');
  });

  it('allows cross-origin DELETE preflights', async () => {
    const response = await request('/api/collections/x/resources', {
      method: 'OPTIONS',
      headers: { Origin: 'http://example.com', 'Access-Control-Request-Method': 'DELETE' },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')?.split(/,\s*/)).toContain('DELETE');
    expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type, Authorization');
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

describe('createApp with the production Nest factory', () => {
  let root: string | undefined;
  let app: INestApplication | undefined;
  let baseUrl = '';
  const indexHtml = '<!doctype html><html><body>Production factory client fixture</body></html>';

  beforeAll(async () => {
    const clientPath = realpathSync(mkdtempSync(join(tmpdir(), 'lingo-api-production-bootstrap-')));
    root = clientPath;
    writeFileSync(join(clientPath, 'index.html'), indexHtml);

    app = await createApp({ clientPath });
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
});

describe('resolvePort', () => {
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
