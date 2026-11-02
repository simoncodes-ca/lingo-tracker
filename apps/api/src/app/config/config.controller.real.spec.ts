import { mkdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { HttpProject } from '../testing/http-project';

describe('ConfigController HTTP (real project)', () => {
  let project: HttpProject;
  const terms = '.lingo-tracker-protected-terms.json';
  const terminology = '.lingo-tracker-preferred-terminology.json';
  const rules = [
    { discouraged: 'Expenditure', preferred: 'Investment' },
    { discouraged: 'E-mail', preferred: 'email', reason: 'House style.' },
  ];
  const get = () => project.request('GET', '/config');
  const put = (body: unknown) => project.request('PUT', '/config', body);
  beforeEach(async () => {
    project = new HttpProject();
    project.config.locales = ['en'];
    project.config.collections = {};
    await project.start();
  });
  afterEach(async () => {
    await project.close();
  });

  it('refuses the first broken collection file before a broken global file with the same HTTP status', async () => {
    project.config.protectedTermsFile = 'protected.json';
    project.config.collections = {
      first: { translationsFolder: 'i18n', protectedTermsFile: 'first.json' },
      second: { translationsFolder: 'other', protectedTermsFile: 'second.json' },
    };
    project.configure();
    for (const path of ['protected.json', 'first.json', 'second.json']) project.write(path, '{bad');
    expect(await get()).toMatchObject({
      status: 500,
      body: { message: expect.stringContaining(join(project.root, 'first.json')) },
    });
  });
  it('keeps GET config JSON byte-identical for the existing terms and rule fixtures', async () => {
    project.config.protectedTermsFile = 'protected.json';
    project.config.collections = { app: { translationsFolder: './i18n', protectedTermsFile: 'own.json' } };
    project.configure();
    project.write('protected.json', '["SimonCodes"]');
    project.write('own.json', '["iPhone"]');
    const fixtureRules = [
      { discouraged: 'Expenditure', preferred: 'Investment', reason: 'Planning term.' },
      { discouraged: 'E-mail', preferred: 'email' },
    ];
    project.write(terminology, JSON.stringify(fixtureRules));
    const response = await get();
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toBe(
      JSON.stringify({
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        baseLocale: 'en',
        locales: ['en'],
        collections: {
          app: {
            translationsFolder: './i18n',
            protectedTermsFile: 'own.json',
            protectedTerms: ['iPhone'],
            protectedTermsFilePath: join(project.root, 'own.json'),
          },
        },
        protectedTerms: ['SimonCodes'],
        protectedTermsFilePath: join(project.root, 'protected.json'),
        preferredTerminology: fixtureRules,
        preferredTerminologyFilePath: join(project.root, terminology),
        projectName: basename(project.root),
      }),
    );
  });
  it('keeps GET config JSON byte-identical when default term files are absent', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).toBe(
      JSON.stringify({
        exportFolder: 'dist/export',
        importFolder: 'dist/import',
        baseLocale: 'en',
        locales: ['en'],
        collections: {},
        protectedTermsFilePath: join(project.root, terms),
        preferredTerminologyFilePath: join(project.root, terminology),
        projectName: basename(project.root),
      }),
    );
  });
  it('exposes the resolved terms and their file path on the DTO', async () => {
    project.write(terms, '["iPhone"]');
    expect(await get()).toMatchObject({
      status: 200,
      body: { protectedTerms: ['iPhone'], protectedTermsFilePath: join(project.root, terms) },
    });
  });
  it('exposes a broken terminology file as preferredTerminologyError', async () => {
    project.write(terminology, '{bad');
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('preferredTerminology');
    let detail = '';
    try {
      JSON.parse('{bad');
    } catch (error) {
      if (error instanceof Error) detail = error.message;
    }
    expect(response.body.preferredTerminologyError).toBe(
      `Preferred terminology file is not valid JSON: ${join(project.root, terminology)} (${detail})`,
    );
  });
  it('answers invalid rows with 400 and submitted-row details without changing the file', async () => {
    const original = '[{"discouraged":"Login","preferred":"Sign in"}]\n';
    project.write(terminology, original);
    const response = await put({
      preferredTerminology: [
        { discouraged: 'Cost', preferred: 'Price' },
        { discouraged: 'cost', preferred: 'Expense' },
        { discouraged: 'Email', preferred: '' },
      ],
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid preferred terminology rules');
    const errors = response.body.errors as Array<{ index: number; code: string }>;
    expect(errors.map(({ index, code }) => ({ index, code }))).toEqual([
      { index: 1, code: 'duplicate' },
      { index: 2, code: 'empty' },
    ]);
    expect(project.read(terminology)).toBe(original);
  });
  it('reports invalid rows before a malformed file pointer', async () => {
    project.write('.lingo-tracker.json', JSON.stringify({ ...project.config, preferredTerminologyFile: 42 }));
    expect(await put({ preferredTerminology: [{ discouraged: 'Email', preferred: 'email' }] })).toMatchObject({
      status: 400,
      body: { errors: [expect.objectContaining({ index: 0, code: 'self-mapping' })] },
    });
  });
  it('writes a valid replacement through core', async () => {
    const config = project.read('.lingo-tracker.json');
    expect(await put({ preferredTerminology: rules })).toEqual({
      status: 200,
      body: { message: 'Configuration updated successfully' },
    });
    expect(project.json(terminology)).toEqual([rules[1], rules[0]]);
    expect(project.read('.lingo-tracker.json')).toBe(config);
    expect((await get()).body).toMatchObject({
      preferredTerminology: [rules[1], rules[0]],
      preferredTerminologyFilePath: join(project.root, terminology),
    });
    expect((await get()).body).not.toHaveProperty('preferredTerminologyError');
  });
  it('leaves the first file untouched when the second file write fails', async () => {
    project.config.protectedTermsFile = 'protected.json';
    project.configure();
    const original = '[{"discouraged":"Login","preferred":"Sign in"}]\n';
    project.write(terminology, original);
    mkdirSync(join(project.root, 'protected.json'));
    expect(
      (
        await put({
          protectedTerms: ['Changed'],
          preferredTerminology: [{ discouraged: 'Spend', preferred: 'Invest' }],
        })
      ).status,
    ).toBe(500);
    expect(project.read(terminology)).toBe(original);
  });
  it('answers a missing config for a protected-terms-only update with 404', async () => {
    rmSync(join(project.root, '.lingo-tracker.json'));
    expect(await put({ protectedTerms: ['Changed'] })).toEqual({
      status: 404,
      body: { message: 'Configuration file not found', error: 'Not Found', statusCode: 404 },
    });
  });
  it('answers malformed config with the standard config-read message', async () => {
    project.write('.lingo-tracker.json', '{bad');
    expect(await put({ protectedTerms: ['Changed'] })).toEqual({
      status: 500,
      body: { message: 'Invalid configuration file format', error: 'Internal Server Error', statusCode: 500 },
    });
  });
  it('updates the global protected-terms list and returns a message', async () => {
    project.write(terminology, JSON.stringify(rules));
    const before = project.read(terminology);
    const config = project.read('.lingo-tracker.json');
    expect(await put({ protectedTerms: ['iPhone'] })).toEqual({
      status: 200,
      body: { message: 'Configuration updated successfully' },
    });
    expect(project.json(terms)).toEqual(['iPhone']);
    expect(project.read(terminology)).toBe(before);
    expect(project.read('.lingo-tracker.json')).toBe(config);
  });
  it('is a no-op when the body carries no writable fields', async () => {
    const before = project.read('.lingo-tracker.json');
    expect(await put({})).toEqual({ status: 200, body: { message: 'Configuration updated successfully' } });
    expect(project.read('.lingo-tracker.json')).toBe(before);
    expect(project.exists(terms)).toBe(false);
    expect(project.exists(terminology)).toBe(false);
  });
  it('ignores unsupported config fields alongside a writable list', async () => {
    const before = project.read('.lingo-tracker.json');
    expect(await put({ protectedTerms: [], collections: {}, locales: ['de'], baseLocale: 'de' })).toEqual({
      status: 200,
      body: { message: 'Configuration updated successfully' },
    });
    expect(project.read('.lingo-tracker.json')).toBe(before);
    expect(project.json(terms)).toEqual([]);
  });
  it('throws 400 when protectedTerms is not a string array', async () => {
    expect(await put({ protectedTerms: 'iPhone' })).toEqual({
      status: 400,
      body: { statusCode: 400, error: 'Bad Request', message: 'protectedTerms must be an array' },
    });
    expect(project.exists(terms)).toBe(false);
  });
  it('writes an empty list, clearing the file', async () => {
    project.write(terminology, JSON.stringify(rules));
    expect(await put({ preferredTerminology: [] })).toEqual({
      status: 200,
      body: { message: 'Configuration updated successfully' },
    });
    expect(project.json(terminology)).toEqual([]);
  });
  it('writes both lists when both are sent', async () => {
    expect(await put({ protectedTerms: ['iPhone'], preferredTerminology: rules })).toEqual({
      status: 200,
      body: { message: 'Configuration updated successfully' },
    });
    expect(project.json(terms)).toEqual(['iPhone']);
    expect(project.json(terminology)).toEqual([rules[1], rules[0]]);
  });
  it('rejects a non-array payload with 400', async () => {
    expect(await put({ preferredTerminology: { discouraged: 'a', preferred: 'b' } })).toEqual({
      status: 400,
      body: { statusCode: 400, error: 'Bad Request', message: 'preferredTerminology must be an array' },
    });
  });
  it('writes neither list when the rules are invalid, even with valid protected terms', async () => {
    project.write(terms, '["Original"]\n');
    project.write(terminology, JSON.stringify(rules));
    const before = project.read(terminology);
    expect(
      (await put({ protectedTerms: ['iPhone'], preferredTerminology: [{ discouraged: 'Email', preferred: 'email' }] }))
        .status,
    ).toBe(400);
    expect(project.read(terms)).toBe('["Original"]\n');
    expect(project.read(terminology)).toBe(before);
  });
  it('writes neither list when protected terms are malformed', async () => {
    expect((await put({ protectedTerms: 'iPhone', preferredTerminology: rules })).status).toBe(400);
    expect(project.exists(terms)).toBe(false);
    expect(project.exists(terminology)).toBe(false);
  });
  it('rejects rows of the wrong type as invalid-type', async () => {
    expect(await put({ preferredTerminology: ['Expenditure'] })).toMatchObject({
      status: 400,
      body: { errors: [expect.objectContaining({ index: 0, field: 'rule', code: 'invalid-type' })] },
    });
  });
  it('maps a validation error thrown by the writer to the same 400 body', async () => {
    expect(
      await put({
        preferredTerminology: [
          { discouraged: 'Cost', preferred: 'Price' },
          { discouraged: 'Price', preferred: 'Value' },
        ],
      }),
    ).toEqual({
      status: 400,
      body: {
        message: 'Invalid preferred terminology rules',
        errors: [
          {
            index: 0,
            field: 'preferred',
            code: 'chain',
            message: '"Price" is itself discouraged (row 2); map "Cost" to its final preferred term instead.',
          },
        ],
        error: 'Bad Request',
        statusCode: 400,
      },
    });
    expect(project.exists(terminology)).toBe(false);
  });
  it('answers a missing directory (ParentDirectoryMissingError) with 400 and the message', async () => {
    project.config.preferredTerminologyFile = 'nope/terms.json';
    project.configure();
    expect(await put({ preferredTerminology: rules })).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: `Cannot write preferred terminology file — directory does not exist: ${join(project.root, 'nope')}`,
      },
    });
    expect(project.exists('nope')).toBe(false);
  });
  it('answers a malformed file pointer in the config (InvalidConfigError) with 500, its message, and writes nothing', async () => {
    project.write('.lingo-tracker.json', JSON.stringify({ ...project.config, preferredTerminologyFile: 42 }));
    expect(await put({ preferredTerminology: rules })).toEqual({
      status: 500,
      body: {
        statusCode: 500,
        error: 'Internal Server Error',
        message: '"preferredTerminologyFile" in .lingo-tracker.json must be a string path (got number)',
      },
    });
    expect(project.exists(terminology)).toBe(false);
  });
  it('lets an unexpected error propagate (the filter answers 500)', async () => {
    mkdirSync(join(project.root, terms));
    expect((await put({ protectedTerms: ['iPhone'] })).status).toBe(500);
  });
});
