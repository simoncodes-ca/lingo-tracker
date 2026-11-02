import { describe, expect, it } from 'vitest';
import type { DragData } from '../types/drag-data';
import { folderDrop } from './folder-drop';

describe('folderDrop', () => {
  const cases: {
    name: string;
    drag: DragData | null;
    target: string;
    readOnly: boolean;
    canLand: boolean;
    noOp: ReturnType<typeof folderDrop>['noOp'];
  }[] = [
    {
      name: 'missing drag',
      drag: null,
      target: 'other',
      readOnly: false,
      canLand: false,
      noOp: null,
    },
    {
      name: 'read-only target',
      drag: { type: 'folder', path: 'a' },
      target: 'b',
      readOnly: true,
      canLand: false,
      noOp: null,
    },
    {
      name: 'folder onto itself',
      drag: { type: 'folder', path: 'a' },
      target: 'a',
      readOnly: false,
      canLand: false,
      noOp: 'same-folder',
    },
    {
      name: 'folder onto descendant',
      drag: { type: 'folder', path: 'a' },
      target: 'a.b',
      readOnly: false,
      canLand: false,
      noOp: null,
    },
    {
      name: 'folder onto current parent',
      drag: { type: 'folder', path: 'a.b' },
      target: 'a',
      readOnly: false,
      canLand: true,
      noOp: 'already-at-location',
    },
    {
      name: 'root folder onto root',
      drag: { type: 'folder', path: 'a' },
      target: '',
      readOnly: false,
      canLand: false,
      noOp: 'already-at-location',
    },
    {
      name: 'folder onto another folder',
      drag: { type: 'folder', path: 'a.b' },
      target: 'c',
      readOnly: false,
      canLand: true,
      noOp: null,
    },
    {
      name: 'nested folder onto root',
      drag: { type: 'folder', path: 'a.b' },
      target: '',
      readOnly: false,
      canLand: true,
      noOp: null,
    },
    {
      name: 'resource in current folder',
      drag: { type: 'resource', key: 'a.ok', folderPath: 'a' },
      target: 'a',
      readOnly: false,
      canLand: false,
      noOp: 'already-in-folder',
    },
    {
      name: 'resource in another folder',
      drag: { type: 'resource', key: 'a.ok', folderPath: 'a' },
      target: 'b',
      readOnly: false,
      canLand: true,
      noOp: null,
    },
    {
      name: 'root resource into folder',
      drag: { type: 'resource', key: 'ok', folderPath: '' },
      target: 'a',
      readOnly: false,
      canLand: true,
      noOp: null,
    },
    {
      name: 'root resource already at root',
      drag: { type: 'resource', key: 'ok', folderPath: '' },
      target: '',
      readOnly: false,
      canLand: false,
      noOp: 'already-in-folder',
    },
    {
      name: 'resource onto root row',
      drag: { type: 'resource', key: 'a.ok', folderPath: 'a' },
      target: '',
      readOnly: false,
      canLand: false,
      noOp: null,
    },
    {
      name: 'resource without address',
      drag: { type: 'resource', key: 'ok' },
      target: 'a',
      readOnly: false,
      canLand: false,
      noOp: null,
    },
  ];

  it('decides each folder and resource drop case', () => {
    for (const { name, drag, target, readOnly, canLand, noOp } of cases) {
      expect(folderDrop(drag, target, readOnly), name).toEqual({
        canLand,
        noOp,
      });
    }
  });
});
