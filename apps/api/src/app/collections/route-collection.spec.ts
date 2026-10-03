import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import { CollectionIndex } from '../cache/collection-index.service';
import { ConfigService } from '../config/config.service';
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
      if (error instanceof HttpException) return error;
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
    expect(open('a%b', 'GET').onMutation).toBeUndefined();
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

  it.each(['a%b', 'a%25b', 'my collection', 'ünïcode'])('uses the literal route name %s', (name) => {
    expect(open(name, 'GET').name).toBe(name);
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('defaults a missing parameter to an empty name', () => {
    expect(routeCollectionRef({}, { method: 'GET', params: {} })).toEqual({ name: '', writable: false });
  });
});
