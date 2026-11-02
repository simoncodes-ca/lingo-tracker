import {
  anyObject,
  array,
  boolean,
  childPath,
  fail,
  indexPath,
  integer,
  integerString,
  nonEmptyArray,
  nonEmptyString,
  object,
  oneOrMany,
  optional,
  record,
  SchemaError,
  string,
  unknown,
} from './schema';

describe('string', () => {
  const schema = string();
  it.each([
    ['empty', ''],
    ['text', ' a '],
  ])('accepts %s unchanged', (_label, value) => {
    expect(schema(value, '')).toBe(value);
  });
  it.each([
    ['number', 7, 'be a string'],
    ['missing', undefined, 'be a string'],
    ['null', null, 'not be null'],
  ])('rejects %s', (_label, value, requirement) => {
    expect(() => schema(value, '')).toThrow(`<root> must ${requirement}`);
  });
});

describe('nonEmptyString', () => {
  const schema = nonEmptyString();
  it.each([['text', ' a ']])('accepts %s unchanged', (_label, value) => {
    expect(schema(value, '')).toBe(value);
  });
  it.each([
    ['empty', '', 'be a non-empty string'],
    ['blank', '  ', 'be a non-empty string'],
    ['number', 7, 'be a non-empty string'],
    ['null', null, 'not be null'],
  ])('rejects %s', (_label, value, requirement) => {
    expect(() => schema(value, '')).toThrow(`<root> must ${requirement}`);
  });
});

describe('boolean', () => {
  const schema = boolean();
  it.each([
    ['true', true],
    ['false', false],
  ])('accepts %s unchanged', (_label, value) => {
    expect(schema(value, '')).toBe(value);
  });
  it.each([
    ['string', 'true', 'be a boolean'],
    ['null', null, 'not be null'],
  ])('rejects %s', (_label, value, requirement) => {
    expect(() => schema(value, '')).toThrow(`<root> must ${requirement}`);
  });
});

describe('integer', () => {
  const schema = integer();
  it.each([
    ['zero', 0],
    ['negative', -2],
    ['positive', 7],
  ])('accepts %s unchanged', (_label, value) => {
    expect(schema(value, '')).toBe(value);
  });
  it.each([
    ['fraction', 1.5, 'be an integer'],
    ['string', '7', 'be an integer'],
    ['NaN', Number.NaN, 'be an integer'],
    ['infinity', Infinity, 'be an integer'],
    ['null', null, 'not be null'],
  ])('rejects %s', (_label, value, requirement) => {
    expect(() => schema(value, '')).toThrow(`<root> must ${requirement}`);
  });
});

describe('integerString', () => {
  const schema = integerString();
  it.each([['seven', '7']])('accepts %s unchanged', (_label, value) => {
    expect(schema(value, '')).toBe(value);
  });
  it.each([
    ['zero', '0', 'be a positive integer'],
    ['letters', 'abc', 'be a positive integer'],
    ['number', 7, 'be a positive integer'],
    ['negative', '-1', 'be a positive integer'],
    ['fraction', '1.5', 'be a positive integer'],
    ['empty', '', 'be a positive integer'],
    ['null', null, 'not be null'],
  ])('rejects %s', (_label, value, requirement) => {
    expect(() => schema(value, '')).toThrow(`<root> must ${requirement}`);
  });
});

describe('unknown', () => {
  const schema = unknown();
  it.each([
    ['missing', undefined],
    ['null', null],
    ['object', {}],
    ['array', []],
    ['number', 7],
  ])('accepts %s unchanged', (_label, value) => {
    expect(schema(value, '')).toBe(value);
  });
});

describe('anyObject', () => {
  const schema = anyObject();
  it.each([
    ['object', {}],
    ['null prototype', Object.create(null)],
  ])('accepts %s unchanged', (_label, value) => {
    expect(schema(value, '')).toBe(value);
  });
  it.each([
    ['array', [], 'be an object'],
    ['number', 7, 'be an object'],
    ['date', new Date(), 'be an object'],
    ['null', null, 'not be null'],
  ])('rejects %s', (_label, value, requirement) => {
    expect(() => schema(value, '')).toThrow(`<root> must ${requirement}`);
  });
});

describe('optional', () => {
  it.each([undefined, null, 'a'])('delegates %p to the wrapped unknown schema', (value) => {
    expect(optional(unknown())(value, '')).toBe(value);
  });
  const schema = optional(string());
  it.each([
    ['missing', undefined],
    ['text', 'a'],
  ])('accepts %s unchanged', (_label, value) => {
    expect(schema(value, '')).toBe(value);
  });
  it.each([
    ['number', 7, 'be a string'],
    ['null', null, 'not be null'],
  ])('rejects %s', (_label, value, requirement) => {
    expect(() => schema(value, '')).toThrow(`<root> must ${requirement}`);
  });
});

describe('array', () => {
  const schema = array(string());
  it.each([
    ['empty', []],
    ['items', ['a', 'b']],
  ])('accepts %s unchanged', (_label, value) => {
    expect(schema(value, '')).toBe(value);
  });
  it.each([
    ['object', {}, 'be an array'],
    ['null', null, 'not be null'],
  ])('rejects %s', (_label, value, requirement) => {
    expect(() => schema(value, '')).toThrow(`<root> must ${requirement}`);
  });
});

describe('nonEmptyArray', () => {
  const schema = nonEmptyArray(string());
  it.each([['items', ['a']]])('accepts %s unchanged', (_label, value) => {
    expect(schema(value, '')).toBe(value);
  });
  it.each([
    ['empty', [], 'be a non-empty array'],
    ['object', {}, 'be a non-empty array'],
    ['null', null, 'not be null'],
  ])('rejects %s', (_label, value, requirement) => {
    expect(() => schema(value, '')).toThrow(`<root> must ${requirement}`);
  });
});

describe('record', () => {
  const schema = record(string());
  it.each([
    ['empty', {}],
    ['entries', { fr: 'bonjour' }],
  ])('accepts %s unchanged', (_label, value) => {
    expect(schema(value, '')).toBe(value);
  });
  it.each([
    ['array', [], 'be an object'],
    ['null', null, 'not be null'],
  ])('rejects %s', (_label, value, requirement) => {
    expect(() => schema(value, '')).toThrow(`<root> must ${requirement}`);
  });
});

describe('object', () => {
  const schema = object<{ key: string }>({ key: string() });
  it.each([
    ['object', { key: 'a' }],
    ['unknown keys', { key: 'a', extra: null }],
  ])('accepts %s unchanged', (_label, value) => {
    expect(schema(value, '')).toBe(value);
  });
  it.each([
    ['array', [], 'be an object'],
    ['null', null, 'not be null'],
  ])('rejects %s', (_label, value, requirement) => {
    expect(() => schema(value, '')).toThrow(`<root> must ${requirement}`);
  });
});

describe('oneOrMany', () => {
  const schema = oneOrMany(object<{ key: string }>({ key: string() }));
  it.each([
    ['object', { key: 'a' }],
    ['array', [{ key: 'a' }]],
  ])('accepts %s unchanged', (_label, value) => {
    expect(schema(value, '')).toBe(value);
  });
  it.each([
    ['empty', [], 'be a non-empty array'],
    ['number', 5, 'be an object or a non-empty array'],
    ['null', null, 'not be null'],
  ])('rejects %s', (_label, value, requirement) => {
    expect(() => schema(value, '')).toThrow(`<root> must ${requirement}`);
  });
});

describe('paths and declaration order', () => {
  it.each([
    ['root field', childPath('', 'key'), 'key'],
    ['nested field', childPath('a', 'b'), 'a.b'],
    ['root index', indexPath('', 0), '[0]'],
    ['nested index', indexPath('moves', 0), 'moves[0]'],
  ])('formats %s', (_label, actual, expected) => {
    expect(actual).toBe(expected);
  });

  it.each([
    ['optional non-nullable value', optional(string()), null, '<root> must not be null'],
    ['first declared field', object({ b: string(), a: string() }), { a: 1, b: 2 }, 'b must be a string'],
    [
      'nested',
      object({ collection: object({ tags: array(string()) }) }),
      { collection: { tags: [5] } },
      'collection.tags[0] must be a string',
    ],
    ['array', array(object({ key: string() })), [{}], '[0].key must be a string'],
    ['one or many', oneOrMany(object({ key: string() })), [{}], '[0].key must be a string'],
    ['record', record(object({ value: string() })), { fr: { value: 5 } }, 'fr.value must be a string'],
  ] as const)('reports %s', (_label, schema, value, message) => {
    expect(() => schema(value, '')).toThrow(message);
  });

  it('throws a SchemaError with its path and requirement', () => {
    try {
      fail('key', 'be a string');
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaError);
      expect(error).toMatchObject({ path: 'key', requirement: 'be a string', message: 'key must be a string' });
    }
  });
});
