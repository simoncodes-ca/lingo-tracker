import { EventEmitter } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import { BadRequestException, type ExecutionContext, HttpException, PayloadTooLargeException } from '@nestjs/common';
import { lastValueFrom, of, Subject, throwError } from 'rxjs';
import { ImportUploadInterceptor, mapImportUploadError } from './import-upload.interceptor';
import type { UploadedImportFile } from './import-upload.service';

async function parse(parts: string[], contentType = 'multipart/form-data'): Promise<UploadedImportFile[]> {
  const boundary = 'upload-test-boundary';
  const body = Buffer.from(`${parts.map((part) => `--${boundary}\r\n${part}\r\n`).join('')}--${boundary}--\r\n`);
  const request = Object.assign(Readable.from([body]), {
    headers: { 'content-type': `${contentType}; boundary=${boundary}`, 'content-length': String(body.length) },
    method: 'POST',
    files: [] as UploadedImportFile[],
  });
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => new EventEmitter() }),
  } as unknown as ExecutionContext;
  const result = await new ImportUploadInterceptor().intercept(context, { handle: () => of(null) });
  await lastValueFrom(result);
  return request.files;
}

function pendingRequest() {
  const request = Object.assign(new PassThrough(), {
    headers: { 'content-type': 'multipart/form-data; boundary=held-boundary', 'content-length': '1024' },
    method: 'POST',
    aborted: false,
  });
  const response = new EventEmitter();
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { request, response, context };
}

function jsonContext(response = new EventEmitter()) {
  const request = Object.assign(Readable.from(['{}']), {
    headers: { 'content-type': 'application/json', 'content-length': '2' },
    method: 'POST',
    aborted: false,
  });
  return {
    request,
    response,
    context: {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext,
  };
}

const part = (name: string, field = 'files') =>
  `Content-Disposition: form-data; name="${field}"; filename="${name}"\r\nContent-Type: application/json\r\n\r\n{}`;

describe('ImportUploadInterceptor', () => {
  it('decodes real multipart UTF-8 filenames without a listening socket', async () => {
    expect(await parse([part('café.json')])).toMatchObject([{ originalname: 'café.json', buffer: Buffer.from('{}') }]);
  });

  it.each(['../x.json', 'a/b.json', 'a\\b.json'])('preserves raw filename %p for service validation', async (name) => {
    // Quoted multipart parameters escape backslashes.
    expect(await parse([part(name.split('\\').join('\\\\'))])).toMatchObject([{ originalname: name }]);
  });

  it('maps the installed multer wrong-field error to sanitized 400', async () => {
    await expect(parse([part('fr.json', 'wrong/path')])).rejects.toMatchObject({
      response: {
        statusCode: 400,
        message: 'Invalid upload',
        error: 'Bad Request',
        errors: ['Invalid multipart fields or limits exceeded.'],
      },
    });
  });

  it('preserves the 415 response for an unsupported multipart content type', async () => {
    await expect(parse([part('fr.json')], 'multipart/mixed')).rejects.toMatchObject({
      status: 415,
      response: { message: 'Unsupported content type', error: 'Unsupported Media Type', statusCode: 415 },
    });
  });

  it('rejects text fields before accepting uploads', async () => {
    await expect(
      parse(['Content-Disposition: form-data; name="collection"\r\n\r\napp', part('fr.json')]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bounds the total multipart part count', async () => {
    await expect(parse(Array.from({ length: 11 }, (_, index) => part(`${index}.json`)))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([
    'LIMIT_FILE_COUNT',
    'LIMIT_UNEXPECTED_FILE',
    'LIMIT_FIELD_KEY',
    'LIMIT_FIELD_VALUE',
    'LIMIT_FIELD_COUNT',
    'LIMIT_FIELD_NESTING',
    'LIMIT_PART_COUNT',
    'MISSING_FIELD_NAME',
  ])('maps %s without exposing internal paths or field names', (code) => {
    const error = mapImportUploadError(
      Object.assign(new Error('/secret/internal/path'), { code, field: '/secret/field' }),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    if (error instanceof HttpException)
      expect(error.getResponse()).toEqual({
        statusCode: 400,
        message: 'Invalid upload',
        error: 'Bad Request',
        errors: ['Invalid multipart fields or limits exceeded.'],
      });
  });

  it('maps LIMIT_FILE_SIZE and already transformed Nest errors to sanitized bodies', () => {
    for (const original of [
      Object.assign(new Error('/secret/path'), { code: 'LIMIT_FILE_SIZE' }),
      new PayloadTooLargeException('/secret/path'),
    ]) {
      const error = mapImportUploadError(original);
      expect(error).toBeInstanceOf(PayloadTooLargeException);
      if (error instanceof HttpException)
        expect(error.getResponse()).toEqual({
          statusCode: 413,
          message: 'Invalid upload',
          error: 'Payload Too Large',
          errors: ['File too large.'],
        });
    }
    const error = mapImportUploadError(new BadRequestException('/secret/path'));
    expect(error).toBeInstanceOf(BadRequestException);
    if (error instanceof HttpException) expect(JSON.stringify(error.getResponse())).not.toContain('/secret');
  });

  it('preserves unrelated errors', () => {
    const error = new Error('unexpected');
    expect(mapImportUploadError(error)).toBe(error);
  });
  it('rejects a second upload process-wide before multer reads its body, then releases on completion', async () => {
    const first = pendingRequest();
    const pending = new ImportUploadInterceptor().intercept(first.context, { handle: () => of(null) });
    const second = pendingRequest();
    const pipe = jest.spyOn(second.request, 'pipe');
    try {
      await expect(
        new ImportUploadInterceptor().intercept(second.context, { handle: () => of(null) }),
      ).rejects.toMatchObject({
        response: { statusCode: 429, message: 'Another upload is in progress', error: 'Too Many Requests' },
      });
      expect(pipe).not.toHaveBeenCalled();
    } finally {
      first.request.end('--held-boundary--\r\n');
      await lastValueFrom(await pending);
      second.request.destroy();
      pipe.mockRestore();
    }
    expect(await parse([part('fr.json')])).toHaveLength(1);
  });

  it('releases the upload slot after a multer error', async () => {
    await expect(parse([part('fr.json', 'wrong')])).rejects.toBeInstanceOf(BadRequestException);
    expect(await parse([part('fr.json')])).toHaveLength(1);
  });

  it('keeps the slot through handler completion and releases it after handler errors or cancellation', async () => {
    const output = new Subject<string>();
    const context = jsonContext();
    const result = await new ImportUploadInterceptor().intercept(context.context, { handle: () => output });
    const subscription = result.subscribe();
    try {
      await expect(parse([part('fr.json')])).rejects.toMatchObject({ response: { statusCode: 429 } });
    } finally {
      subscription.unsubscribe();
    }
    expect(await parse([part('fr.json')])).toHaveLength(1);
    const error = new Error('Handler failed');
    const failed = await new ImportUploadInterceptor().intercept(jsonContext().context, {
      handle: () => throwError(() => error),
    });
    await expect(lastValueFrom(failed)).rejects.toBe(error);
    expect(await parse([part('fr.json')])).toHaveLength(1);
    expect(context.request.listenerCount('aborted')).toBe(0);
    expect(context.response.listenerCount('close')).toBe(0);
  });

  it('releases on a client abort during buffering and an old finally cannot unlock a newer request', async () => {
    const first = pendingRequest();
    const handler = jest.fn(() => of(null));
    const pending = new ImportUploadInterceptor()
      .intercept(first.context, { handle: handler })
      .catch((error: unknown) => error);
    first.request.aborted = true;
    first.request.emit('aborted');
    first.request.destroy();
    const output = new Subject<string>();
    const held = await new ImportUploadInterceptor().intercept(jsonContext().context, { handle: () => output });
    const subscription = held.subscribe();
    try {
      expect(await pending).toBeInstanceOf(Error);
      expect(handler).not.toHaveBeenCalled();
      await expect(parse([part('fr.json')])).rejects.toMatchObject({ response: { statusCode: 429 } });
    } finally {
      subscription.unsubscribe();
    }
    expect(await parse([part('fr.json')])).toHaveLength(1);
  });

  it('releases on response closure after parsing, without an old finalizer unlocking another upload', async () => {
    const first = jsonContext();
    const firstOutput = new Subject<string>();
    const firstResult = await new ImportUploadInterceptor().intercept(first.context, { handle: () => firstOutput });
    const firstSubscription = firstResult.subscribe();
    first.response.emit('close');
    const secondOutput = new Subject<string>();
    const secondResult = await new ImportUploadInterceptor().intercept(jsonContext().context, {
      handle: () => secondOutput,
    });
    const secondSubscription = secondResult.subscribe();
    try {
      firstSubscription.unsubscribe();
      await expect(parse([part('fr.json')])).rejects.toMatchObject({ response: { statusCode: 429 } });
    } finally {
      firstSubscription.unsubscribe();
      secondSubscription.unsubscribe();
    }
    expect(await parse([part('fr.json')])).toHaveLength(1);
  });
});
