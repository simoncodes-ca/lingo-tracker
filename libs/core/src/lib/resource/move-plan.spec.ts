import { describe, expect, it } from 'vitest';
import { testCollection } from '../../testing/temp-dir.spec-helpers';
import { FolderMoveIntoDescendantError } from '../errors/lingo-tracker-error';
import { type MoveSelection, planMove } from './move-plan';

describe('Move Plan', () => {
  const source = testCollection('/collections/main');
  const other = testCollection('/collections/other');
  const cases: readonly {
    name: string;
    selection: MoveSelection & { readonly keys?: readonly string[] };
    crossCollection?: boolean;
    destination: string;
    expected: readonly { from: string; to: string }[];
  }[] = [
    {
      name: 'nests same-depth folders when requested',
      selection: { kind: 'folder', path: 'testdata', keys: ['testdata.foo'], nestUnderDestination: true },
      destination: 'common',
      expected: [{ from: 'testdata.foo', to: 'common.testdata.foo' }],
    },
    {
      name: 'nests different-depth folders when requested',
      selection: { kind: 'folder', path: 'data.testdata', keys: ['data.testdata.foo'], nestUnderDestination: true },
      destination: 'common',
      expected: [{ from: 'data.testdata.foo', to: 'common.testdata.foo' }],
    },
    {
      name: 'nests a folder at the collection root',
      selection: { kind: 'folder', path: 'common.testdata', keys: ['common.testdata.foo'], nestUnderDestination: true },
      destination: '',
      expected: [{ from: 'common.testdata.foo', to: 'testdata.foo' }],
    },
    {
      name: 'nests at the root even when legacy rename mode is requested',
      selection: {
        kind: 'folder',
        path: 'common.testdata',
        keys: ['common.testdata.foo'],
        nestUnderDestination: false,
      },
      destination: '',
      expected: [{ from: 'common.testdata.foo', to: 'testdata.foo' }],
    },
    {
      name: 'preserves nested resource suffixes',
      selection: { kind: 'folder', path: 'testdata', keys: ['testdata.foo.bar'], nestUnderDestination: true },
      destination: 'common',
      expected: [{ from: 'testdata.foo.bar', to: 'common.testdata.foo.bar' }],
    },
    {
      name: 'uses the legacy same-depth rename heuristic',
      selection: { kind: 'folder', path: 'testdata', keys: ['testdata.foo'], nestUnderDestination: false },
      destination: 'common',
      expected: [{ from: 'testdata.foo', to: 'common.foo' }],
    },
    {
      name: 'uses the legacy different-depth nesting heuristic',
      selection: { kind: 'folder', path: 'data.testdata', keys: ['data.testdata.foo'], nestUnderDestination: false },
      destination: 'common',
      expected: [{ from: 'data.testdata.foo', to: 'common.testdata.foo' }],
    },
    {
      name: 'preserves the legacy nested folder mapping',
      selection: {
        kind: 'folder',
        path: 'apps.common.buttons',
        keys: ['apps.common.buttons.ok'],
        nestUnderDestination: false,
      },
      destination: 'apps.shared',
      expected: [{ from: 'apps.common.buttons.ok', to: 'apps.shared.buttons.ok' }],
    },
    {
      name: 'defaults to nesting',
      selection: { kind: 'folder', path: 'testdata', keys: ['testdata.foo'] },
      destination: 'common',
      expected: [{ from: 'testdata.foo', to: 'common.testdata.foo' }],
    },
    {
      name: 'plans every key in a folder',
      selection: { kind: 'folder', path: 'apps.buttons', keys: ['apps.buttons.ok', 'apps.buttons.nested.cancel'] },
      destination: 'shared',
      expected: [
        { from: 'apps.buttons.ok', to: 'shared.buttons.ok' },
        { from: 'apps.buttons.nested.cancel', to: 'shared.buttons.nested.cancel' },
      ],
    },
    {
      name: 'renames to the same path in another collection',
      crossCollection: true,
      selection: {
        kind: 'folder',
        path: 'apps.buttons',
        keys: ['apps.buttons.ok'],
        nestUnderDestination: false,
      },
      destination: 'apps.buttons',
      expected: [{ from: 'apps.buttons.ok', to: 'apps.buttons.ok' }],
    },
    {
      name: 'moves one resource key',
      selection: { kind: 'key', key: 'common.ok' },
      destination: 'shared.ok',
      expected: [{ from: 'common.ok', to: 'shared.ok' }],
    },
    {
      name: 'expands a resource pattern under the destination',
      selection: { kind: 'pattern', prefix: 'common', keys: ['common.ok', 'common.nested.cancel'] },
      destination: 'shared',
      expected: [
        { from: 'common.ok', to: 'shared.ok' },
        { from: 'common.nested.cancel', to: 'shared.nested.cancel' },
      ],
    },
    {
      name: 'expands a root resource pattern',
      selection: { kind: 'pattern', prefix: '', keys: ['common.ok'] },
      destination: '',
      expected: [{ from: 'common.ok', to: 'common.ok' }],
    },
    {
      name: 'moves a root resource pattern under a prefix',
      selection: { kind: 'pattern', prefix: '', keys: ['common.ok'] },
      destination: 'shared',
      expected: [{ from: 'common.ok', to: 'shared.common.ok' }],
    },
    {
      name: 'moves a prefixed resource pattern to the root',
      selection: { kind: 'pattern', prefix: 'common', keys: ['common.ok'] },
      destination: '',
      expected: [{ from: 'common.ok', to: 'ok' }],
    },
    {
      name: 'moves an edited entry to another folder',
      selection: { kind: 'entry', key: 'common.save' },
      destination: 'dialogs.actions',
      expected: [{ from: 'common.save', to: 'dialogs.actions.save' }],
    },
    {
      name: 'moves an edited entry to the root',
      selection: { kind: 'entry', key: 'common.save' },
      destination: '',
      expected: [{ from: 'common.save', to: 'save' }],
    },
    {
      name: 'moves an edited entry to the root for a blank destination',
      selection: { kind: 'entry', key: 'common.save' },
      destination: '   ',
      expected: [{ from: 'common.save', to: 'save' }],
    },
  ];

  it.each(cases)('$name', ({ selection, destination, expected, crossCollection }) => {
    const target = crossCollection ? other : source;
    const plan = planMove({ source, destination: target, selection, destinationPath: destination });
    expect(plan.kind).toBe(selection.kind === 'folder' ? 'folder' : 'entries');
    if (plan.kind === 'refused') throw new Error('Expected a move plan');
    const entries = plan.kind === 'folder' ? plan.forKeys(selection.keys ?? []) : plan;
    expect(entries).toMatchObject({
      kind: 'entries',
      relocations: expected,
      sameCollection: !crossCollection,
    });
    expect(entries.source).toBe(source);
    expect(entries.destination).toBe(target);
  });

  it('warns for a same-folder move in the same collection', () => {
    const plan = planMove({
      source,
      destination: source,
      selection: { kind: 'folder', path: 'apps.buttons' },
      destinationPath: 'apps.buttons',
    });
    expect(plan).toMatchObject({ kind: 'refused', reason: 'same-location' });
    if (plan.kind !== 'refused') throw new Error('Expected a refusal');
    expect(plan.warning()).toBe('Source and destination are the same. No move performed.');
  });

  it('warns for nesting a folder under its own parent', () => {
    const plan = planMove({
      source,
      destination: source,
      selection: { kind: 'folder', path: 'apps.buttons' },
      destinationPath: 'apps',
    });
    expect(plan).toMatchObject({ kind: 'refused', reason: 'already-there' });
    if (plan.kind !== 'refused') throw new Error('Expected a refusal');
    expect(plan.warning()).toBe('Folder is already at this location. No move performed.');
  });

  it('warns for moving a top-level folder to the root', () => {
    const plan = planMove({
      source,
      destination: source,
      selection: { kind: 'folder', path: 'apps' },
      destinationPath: '',
    });
    expect(plan).toMatchObject({ kind: 'refused', reason: 'already-there' });
    if (plan.kind !== 'refused') throw new Error('Expected a refusal');
    expect(plan.warning()).toBe('Folder is already at this location. No move performed.');
  });

  it('refuses a folder destination inside its source with the existing message', () => {
    const plan = planMove({
      source,
      destination: source,
      selection: { kind: 'folder', path: 'apps.buttons' },
      destinationPath: 'apps.buttons.child',
    });
    expect(plan).toMatchObject({ kind: 'refused', reason: 'descendant' });
    if (plan.kind !== 'refused') throw new Error('Expected a refusal');
    expect(() => plan.warning()).toThrow(FolderMoveIntoDescendantError);
    expect(() => plan.warning()).toThrow(
      'Cannot move folder "apps.buttons" into its own descendant "apps.buttons.child"',
    );
  });

  it('treats normalized collection paths as the same collection', () => {
    const alias = testCollection('/collections/main/../main');
    expect(
      planMove({ source, destination: alias, selection: { kind: 'key', key: 'apps.ok' }, destinationPath: 'shared.ok' })
        .sameCollection,
    ).toBe(true);
    expect(
      planMove({ source, destination: alias, selection: { kind: 'folder', path: 'apps' }, destinationPath: 'apps' }),
    ).toMatchObject({
      kind: 'refused',
      reason: 'same-location',
    });
  });

  it('marks different collection roots as different collections', () => {
    expect(
      planMove({ source, destination: other, selection: { kind: 'key', key: 'apps.ok' }, destinationPath: 'shared.ok' })
        .sameCollection,
    ).toBe(false);
  });

  it('allows every folder refusal location in another collection', () => {
    for (const destinationPath of ['apps.buttons.child', 'apps.buttons', 'apps']) {
      const plan = planMove({
        source,
        destination: other,
        selection: { kind: 'folder', path: 'apps.buttons' },
        destinationPath,
      });
      expect(plan.kind).toBe('folder');
      if (plan.kind !== 'folder') throw new Error('Expected a folder plan');
      expect(plan.forKeys(['apps.buttons.ok']).sameCollection).toBe(false);
    }
  });

  it('does not confuse a shared folder prefix with a descendant', () => {
    const plan = planMove({
      source,
      destination: source,
      selection: { kind: 'folder', path: 'apps' },
      destinationPath: 'appsExtra',
    });
    expect(plan.kind).toBe('folder');
    if (plan.kind !== 'folder') throw new Error('Expected a folder plan');
    expect(plan.forKeys(['apps.ok']).sameCollection).toBe(true);
  });

  it('maps keys enumerated after the folder decision using the same plan', () => {
    const plan = planMove({
      source,
      destination: other,
      selection: { kind: 'folder', path: 'apps.buttons' },
      destinationPath: 'shared',
    });
    expect(plan.kind).toBe('folder');
    expect(plan).not.toHaveProperty('relocations');
    if (plan.kind !== 'folder') throw new Error('Expected a folder plan');
    expect(plan.forKeys(['apps.buttons.ok', 'apps.buttons.nested.cancel'])).toEqual({
      kind: 'entries',
      source,
      destination: other,
      sameCollection: false,
      relocations: [
        { from: 'apps.buttons.ok', to: 'shared.buttons.ok' },
        { from: 'apps.buttons.nested.cancel', to: 'shared.buttons.nested.cancel' },
      ],
    });
  });
});
