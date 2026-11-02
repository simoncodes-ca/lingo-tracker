import { BadRequestException, Controller, Get, Post } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { object, string } from './schema';
import { type RootLabel, SchemaPipe, ValidBody, ValidQuery } from './valid-body';

const schema = object({ key: string() });
@Controller('stub')
class StubController {
  @Post()
  body(@ValidBody(schema) value: { key: string }): void {
    void value;
  }
  @Get()
  query(@ValidQuery(schema) value: { key: string }): void {
    void value;
  }
}

describe('SchemaPipe', () => {
  it('returns valid values unchanged', () => {
    const value = { key: 'a', extra: true };
    expect(new SchemaPipe(schema, 'request body').transform(value)).toBe(value);
  });

  it.each([
    ['request body', undefined, 'request body must be an object'],
    ['query', [], 'query must be an object'],
    ['request body', {}, 'key must be a string'],
    ['query', { key: null }, 'key must not be null'],
  ] as const)('maps %s failures to a plain 400', (root: RootLabel, value, message) => {
    try {
      new SchemaPipe(schema, root).transform(value);
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      if (error instanceof BadRequestException) {
        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toEqual({ statusCode: 400, message, error: 'Bad Request' });
      }
    }
  });

  it('propagates other errors unchanged', () => {
    const error = new Error('unexpected');
    const pipe = new SchemaPipe(() => {
      throw error;
    }, 'request body');
    expect(() => pipe.transform({})).toThrow(error);
  });

  it.each([
    ['body', RouteParamtypes.BODY, 'request body'],
    ['query', RouteParamtypes.QUERY, 'query'],
  ] as const)('attaches a SchemaPipe to %s metadata', (method, type, root) => {
    const args: Record<string, { pipes: unknown[] }> = Reflect.getMetadata(ROUTE_ARGS_METADATA, StubController, method);
    const pipe = args[`${type}:0`]?.pipes[0];
    expect(pipe).toBeInstanceOf(SchemaPipe);
    if (pipe instanceof SchemaPipe) {
      expect(pipe.schema).toBe(schema);
      expect(pipe.root).toBe(root);
    }
  });
});
