import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { IMPORT_UPLOAD_MAX_BYTES, IMPORT_UPLOAD_MAX_FILES } from '@simoncodes-ca/data-transfer';
import { defer, finalize, type Observable } from 'rxjs';

const uploadOptions: MulterOptions = {
  preservePath: true,
  defParamCharset: 'utf8',
  limits: {
    fileSize: IMPORT_UPLOAD_MAX_BYTES,
    files: IMPORT_UPLOAD_MAX_FILES,
    fields: 0,
    parts: IMPORT_UPLOAD_MAX_FILES,
    fieldSize: 1024,
    fieldNameSize: 100,
  },
};

export function mapImportUploadError(error: unknown): unknown {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  const status = error instanceof HttpException ? error.getStatus() : undefined;
  if (code === 'LIMIT_FILE_SIZE' || status === 413)
    return new PayloadTooLargeException({
      statusCode: 413,
      message: 'Invalid upload',
      error: 'Payload Too Large',
      errors: ['File too large.'],
    });
  if (
    status === 400 ||
    (typeof code === 'string' &&
      (code === 'LIMIT_FILE_COUNT' ||
        code === 'LIMIT_UNEXPECTED_FILE' ||
        code.startsWith('LIMIT_FIELD_') ||
        code === 'LIMIT_PART_COUNT' ||
        code === 'MISSING_FIELD_NAME'))
  )
    return new BadRequestException({
      statusCode: 400,
      message: 'Invalid upload',
      error: 'Bad Request',
      errors: ['Invalid multipart fields or limits exceeded.'],
    });
  return error;
}

// Shared across interceptor instances and Nest application contexts in this process.
let uploadOwner: symbol | undefined;

@Injectable()
export class ImportUploadInterceptor extends FilesInterceptor('files', IMPORT_UPLOAD_MAX_FILES, uploadOptions) {
  override async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (uploadOwner !== undefined)
      throw new HttpException(
        { statusCode: 429, message: 'Another upload is in progress', error: 'Too Many Requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const owner = Symbol('upload');
    uploadOwner = owner;
    const http = context.switchToHttp();
    const request = http.getRequest<IncomingMessage>();
    const response = http.getResponse<ServerResponse>();
    let aborted = request.aborted;
    const release = () => {
      request.off('aborted', onAbort);
      response.off('close', onAbort);
      if (uploadOwner === owner) uploadOwner = undefined;
    };
    const onAbort = () => {
      aborted = true;
      release();
    };
    const assertConnected = () => {
      if (aborted)
        throw new BadRequestException({
          statusCode: 400,
          message: 'Invalid upload',
          error: 'Bad Request',
          errors: ['Upload was aborted.'],
        });
    };
    request.once('aborted', onAbort);
    response.once('close', onAbort);
    let handedOff = false;
    try {
      assertConnected();
      const result = await super.intercept(context, next);
      assertConnected();
      handedOff = true;
      return defer(() => {
        assertConnected();
        return result;
      }).pipe(finalize(release));
    } catch (error) {
      throw mapImportUploadError(error);
    } finally {
      if (handedOff === false) release();
    }
  }
}
