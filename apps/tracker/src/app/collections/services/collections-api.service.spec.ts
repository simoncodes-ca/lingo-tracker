import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createServiceFactory } from '@ngneat/spectator/vitest';
import { describe, expect, it, vi } from 'vitest';
import { CollectionsApiService } from './collections-api.service';

const createService = createServiceFactory({
  service: CollectionsApiService,
  providers: [provideHttpClient(), provideHttpClientTesting()],
});
describe('CollectionsApiService exports', () => {
  it('posts dry runs with the DTO body', () => {
    const spectator = createService();
    const http = spectator.inject(HttpTestingController);
    const request = { format: 'xliff' as const };
    spectator.service.dryRunExport(request).subscribe();
    const pending = http.expectOne('/api/exports/dry-run');
    expect(pending.request.method).toBe('POST');
    expect(pending.request.body).toEqual(request);
    pending.flush({});
    http.verify();
  });
  it('posts export jobs with the DTO body', () => {
    const spectator = createService();
    const http = spectator.inject(HttpTestingController);
    const request = { format: 'json' as const };
    spectator.service.startExport(request).subscribe();
    const pending = http.expectOne('/api/exports');
    expect(pending.request.method).toBe('POST');
    expect(pending.request.body).toEqual(request);
    pending.flush({});
    http.verify();
  });
  it('encodes job ids in the manifest route', () => {
    const spectator = createService();
    const http = spectator.inject(HttpTestingController);
    spectator.service.getExportJob('a/b c').subscribe();
    const pending = http.expectOne('/api/exports/jobs/a%2Fb%20c');
    expect(pending.request.method).toBe('GET');
    pending.flush({});
    http.verify();
  });
});

describe('CollectionsApiService imports', () => {
  const body = { collection: 'main', files: [{ path: 'in/fr.xlf', locale: 'fr' }], strategy: 'update' as const };

  it('uploads each file as a named files part and returns the refreshed listing', () => {
    const spectator = createService();
    const http = spectator.inject(HttpTestingController);
    const files: readonly File[] = [
      new File(['{}'], 'fr.JSON', { type: 'application/json' }),
      new File(['<xliff/>'], 'de.xlf', { type: 'application/xml' }),
      new File(['<xliff/>'], 'es.xliff', { type: 'application/xml' }),
    ];
    const listing = { collection: 'My & collection', folder: 'in', defaultFolder: 'in', exists: true, files: [] };
    const next = vi.fn();
    spectator.service.uploadImportSources('My & collection', files).subscribe(next);
    const pending = http.expectOne((req) => req.url === '/api/imports/sources');
    expect(pending.request.method).toBe('POST');
    expect(pending.request.params.keys()).toEqual(['collection']);
    expect(pending.request.params.get('collection')).toBe('My & collection');
    expect(pending.request.headers.has('Content-Type')).toBe(false);
    const form: unknown = pending.request.body;
    expect(form).toBeInstanceOf(FormData);
    if (form instanceof FormData) {
      const fields: string[] = [];
      form.forEach((_value, key) => {
        fields.push(key);
      });
      expect(fields).toEqual(['files', 'files', 'files']);
      const parts = form.getAll('files');
      expect(parts).toHaveLength(files.length);
      for (const [index, file] of files.entries()) {
        const part = parts[index];
        expect(part).toBeInstanceOf(File);
        if (part instanceof File) {
          expect(part.name).toBe(file.name);
          expect(part.size).toBe(file.size);
          expect(part.type).toBe(file.type);
        }
      }
    }
    pending.flush(listing, { status: 201, statusText: 'Created' });
    expect(next).toHaveBeenCalledExactlyOnceWith(listing);
    http.verify();
  });

  it('passes nonblank upload folders unchanged and enables overwrite only when true', () => {
    const spectator = createService();
    const http = spectator.inject(HttpTestingController);
    for (const folder of ['vendor/a & b', ' vendor/fr ']) {
      spectator.service.uploadImportSources('main', [], { folder, overwrite: true }).subscribe();
      const pending = http.expectOne((req) => req.url === '/api/imports/sources');
      expect(pending.request.params.keys()).toEqual(['collection', 'folder', 'overwrite']);
      expect(pending.request.params.get('collection')).toBe('main');
      expect(pending.request.params.get('folder')).toBe(folder);
      expect(pending.request.params.get('overwrite')).toBe('true');
      expect(pending.request.headers.has('Content-Type')).toBe(false);
      pending.flush({});
    }
    http.verify();
  });

  it('omits blank upload folders and false overwrite from the query', () => {
    const spectator = createService();
    const http = spectator.inject(HttpTestingController);
    for (const folder of [undefined, '', '   ', '\t\n']) {
      spectator.service.uploadImportSources('main', [], { folder, overwrite: false }).subscribe();
      const pending = http.expectOne('/api/imports/sources?collection=main');
      expect(pending.request.params.keys()).toEqual(['collection']);
      pending.flush({});
    }
    http.verify();
  });

  it('lists sources with the collection and omits an undefined folder', () => {
    const spectator = createService();
    const http = spectator.inject(HttpTestingController);
    const listing = { collection: 'My & collection', folder: 'in', defaultFolder: 'in', exists: true, files: [] };
    const next = vi.fn();
    spectator.service.listImportSources('My & collection').subscribe(next);
    const pending = http.expectOne((req) => req.url === '/api/imports/sources');
    expect(pending.request.method).toBe('GET');
    expect(pending.request.params.get('collection')).toBe('My & collection');
    expect(pending.request.params.has('folder')).toBe(false);
    pending.flush(listing);
    expect(next).toHaveBeenCalledWith(listing);
    http.verify();
  });

  it('passes a nonblank explicit folder as a query parameter', () => {
    const spectator = createService();
    const http = spectator.inject(HttpTestingController);
    for (const folder of ['vendor/a & b', ' vendor/fr ']) {
      spectator.service.listImportSources('main', folder).subscribe();
      const pending = http.expectOne((req) => req.url === '/api/imports/sources');
      expect(pending.request.params.get('collection')).toBe('main');
      expect(pending.request.params.get('folder')).toBe(folder);
      pending.flush({});
    }
    http.verify();
  });

  it('posts import dry runs with the DTO body', () => {
    const spectator = createService();
    const http = spectator.inject(HttpTestingController);
    spectator.service.dryRunImport(body).subscribe();
    const pending = http.expectOne('/api/imports/dry-run');
    expect(pending.request.method).toBe('POST');
    expect(pending.request.body).toEqual(body);
    pending.flush({});
    http.verify();
  });

  it('posts import jobs with the DTO body', () => {
    const spectator = createService();
    const http = spectator.inject(HttpTestingController);
    spectator.service.startImport(body).subscribe();
    const pending = http.expectOne('/api/imports');
    expect(pending.request.method).toBe('POST');
    expect(pending.request.body).toEqual(body);
    pending.flush({});
    http.verify();
  });

  it('encodes import job ids in the manifest route', () => {
    const spectator = createService();
    const http = spectator.inject(HttpTestingController);
    spectator.service.getImportJob('a/b c').subscribe();
    const pending = http.expectOne('/api/imports/jobs/a%2Fb%20c');
    expect(pending.request.method).toBe('GET');
    pending.flush({});
    http.verify();
  });

  it('builds an encoded summary download URL without an HTTP request', () => {
    const spectator = createService();
    const http = spectator.inject(HttpTestingController);
    expect(spectator.service.importSummaryUrl('a/b c')).toBe('/api/imports/jobs/a%2Fb%20c/summary');
    http.expectNone(() => true);
    http.verify();
  });
  it('omits empty and whitespace-only folders from the query', () => {
    const spectator = createService();
    const http = spectator.inject(HttpTestingController);
    for (const folder of ['', '   ', '\t\n']) {
      spectator.service.listImportSources('main', folder).subscribe();
      const pending = http.expectOne('/api/imports/sources?collection=main');
      expect(pending.request.params.has('folder')).toBe(false);
      pending.flush({});
    }
    http.verify();
  });
});
