import { BadRequestException, Body, type PipeTransform, Query } from '@nestjs/common';
import { type Schema, SchemaError } from './schema';

export type RootLabel = 'request body' | 'query';

export class SchemaPipe<T> implements PipeTransform<unknown, T> {
  constructor(
    readonly schema: Schema<T>,
    readonly root: RootLabel,
  ) {}

  transform(value: unknown): T {
    try {
      return this.schema(value, '');
    } catch (error) {
      if (error instanceof SchemaError) {
        throw new BadRequestException(`${error.path || this.root} must ${error.requirement}`);
      }
      throw error;
    }
  }
}

export function ValidBody<T>(schema: Schema<T>): ParameterDecorator {
  return Body(new SchemaPipe(schema, 'request body'));
}

export function ValidQuery<T>(schema: Schema<T>): ParameterDecorator {
  return Query(new SchemaPipe(schema, 'query'));
}
