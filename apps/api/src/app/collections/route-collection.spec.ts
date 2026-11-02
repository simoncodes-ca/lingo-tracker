import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { LingoTrackerError, type LingoTrackerConfig } from '@simoncodes-ca/core';
import { CollectionIndex } from '../cache/collection-index.service';
import { ConfigService } from '../config/config.service';
import { toHttpException } from '../errors/lingo-tracker-exception.filter';
import { RouteCollectionPipe, routeCollectionRef } from './route-collection';

describe('RouteCollection', () => {
  const config: LingoTrackerConfig = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en'],
    collections: {
      vendor: { translationsFolder: 'node_modules/vendor', readOnly: true },
      'a%b': { translationsFolder: 'translations/percent' },
      'a%25b': { translationsFolder: 'translations/encoded' },
      'my collection': { translationsFolder: 'translations/space' },
      ünïcode: { translationsFolder: 'translations/unicode' },
    },
  };
  const getConfig = jest.fn(() => config);
  const sink = jest.fn();
  const pipe = new RouteCollectionPipe(
    { getConfig } as unknown as ConfigService,
    { sink } as unknown as CollectionIndex,
  );
  const open = (name: string, method: string, writable?: boolean) =>
    pipe.transform(
      routeCollectionRef(writable === undefined ? {} : { writable }, { method, params: { collectionName: name } }),
    );
  const httpErrorOf = (fn: () => unknown): HttpException => {
    try {
      fn();
    } catch (error) {
      if (error instanceof LingoTrackerError) return toHttpException(error);
      throw error;
    }
    throw new Error('expected an HTTP exception');
  };

  beforeEach(() => getConfig.mockClear());

  it('opens a read-only collection on GET and reads config once', () => {
    expect(open('vendor', 'GET').readOnly).toBe(true);
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('attaches the index sink only when opening a writable route collection', () => {
    expect(open('a%b', 'POST').onMutation).toBe(sink);
    const read = open('a%b', 'GET');
    expect(read.onMutation).not.toBe(sink);
    sink.mockClear();
    read.onMutation({ kind: 'reindex', translationsFolder: read.translationsFolder });
    expect(sink).not.toHaveBeenCalled();
  });

  it('refuses a write to a read-only collection with the core message', () => {
    const error = httpErrorOf(() => open('vendor', 'POST'));
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Collection "vendor" is read-only. Its resources cannot be modified.',
    });
  });

  it('answers 404 for a missing collection before read-only enforcement', () => {
    const error = httpErrorOf(() => open('missing', 'POST'));
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Collection "missing" not found',
    });
  });

  it('allows an explicit read on POST', () => {
    expect(open('vendor', 'POST', false).readOnly).toBe(true);
  });

  it('opens read-only registrations for updates with the index sink', () => {
    const current = pipe.transform(
      routeCollectionRef(
        { lifecycle: 'update' },
        {
          method: 'PUT',
          params: { collectionName: 'vendor' },
        },
      ),
    );
    expect(current.readOnly).toBe(true);
    expect(current.onMutation).toBe(sink);
  });

  it('opens malformed registrations for deletion with the index sink', () => {
    const broken = { ...config, collections: { broken: {} } } as unknown as LingoTrackerConfig;
    getConfig.mockReturnValueOnce(broken);
    const current = pipe.transform(
      routeCollectionRef({ lifecycle: 'delete' }, { method: 'DELETE', params: { collectionName: 'broken' } }),
    );
    expect(current.translationsFolder).toBe('');
    expect(current.onMutation).toBe(sink);
    expect(
      pipe.transform(
        routeCollectionRef({ lifecycle: 'delete' }, { method: 'DELETE', params: { collectionName: 'vendor' } }),
      ).readOnly,
    ).toBe(true);
  });

  it('answers 404 for an unknown update collection without inspecting the body', () => {
    const error = httpErrorOf(() =>
      pipe.transform(
        routeCollectionRef({ lifecycle: 'update' }, { method: 'PUT', params: { collectionName: 'missing' } }),
      ),
    );
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Collection "missing" not found',
    });
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it.each(['a%b', 'a%25b', 'my collection', 'ünïcode'])('uses the literal route name %s', (name) => {
    expect(open(name, 'GET').name).toBe(name);
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('defaults a missing parameter to an empty name', () => {
    expect(routeCollectionRef({}, { method: 'GET', params: {} })).toEqual({ name: '', writable: false });
  });
});
