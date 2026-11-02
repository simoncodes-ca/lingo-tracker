import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPanels } from './editor-panels';

const focus = { request: vi.fn() };

function setup(options: { readOnly?: boolean; hasOtherLocales?: boolean } = {}) {
  const { readOnly = false, hasOtherLocales = true } = options;
  return new EditorPanels({
    editorFocus: focus,
    canOpenFolderPopover: () => !readOnly,
    canOpenLocalesDrawer: () => hasOtherLocales,
  });
}

describe('EditorPanels', () => {
  beforeEach(() => focus.request.mockClear());
  describe('folder popover', () => {
    it('starts closed with nothing staged, filtered or requested', () => {
      const panels = setup();

      expect(panels.isFolderPopoverOpen()).toBe(false);
      expect(panels.stagedFolderPath()).toBeNull();
      expect(panels.folderFilter()).toBe('');
      expect(focus.request).not.toHaveBeenCalled();
    });

    it('opens, resets staging and filter, and asks for the filter input', () => {
      const panels = setup();
      panels.openFolderPopover();
      panels.stageFolder('a.b');
      panels.setFolderFilter('err');
      panels.closeFolderPopover();

      panels.openFolderPopover();

      expect(panels.isFolderPopoverOpen()).toBe(true);
      expect(panels.stagedFolderPath()).toBeNull();
      expect(panels.folderFilter()).toBe('');
      expect(focus.request).toHaveBeenLastCalledWith('folder-filter');
    });

    it('keeps a restaged folder and filter until the popover is reopened', () => {
      const panels = setup();
      panels.openFolderPopover();
      panels.stageFolder('a');
      panels.stageFolder('a.b');
      panels.setFolderFilter('b');

      expect(panels.stagedFolderPath()).toBe('a.b');
      expect(panels.folderFilter()).toBe('b');
    });

    it('toggles shut on a second use', () => {
      const panels = setup();

      panels.toggleFolderPopover();
      expect(panels.isFolderPopoverOpen()).toBe(true);
      panels.toggleFolderPopover();
      expect(panels.isFolderPopoverOpen()).toBe(false);
    });

    it('does not open when the editor is view-only', () => {
      const panels = setup({ readOnly: true });

      panels.toggleFolderPopover();
      panels.openFolderPopover();

      expect(panels.isFolderPopoverOpen()).toBe(false);
      expect(focus.request).not.toHaveBeenCalled();
    });

    it('stages a folder and hands it back on confirm, closing and returning focus to the pill', () => {
      const panels = setup();
      panels.openFolderPopover();
      panels.stageFolder('common.errors');
      expect(panels.stagedFolderPath()).toBe('common.errors');

      expect(panels.confirmStagedFolder()).toBe('common.errors');

      expect(panels.isFolderPopoverOpen()).toBe(false);
      expect(panels.stagedFolderPath()).toBeNull();
      expect(focus.request).toHaveBeenLastCalledWith('location-pill');
    });

    it('confirms nothing when no folder was staged', () => {
      const panels = setup();
      panels.openFolderPopover();

      expect(panels.confirmStagedFolder()).toBeNull();
      expect(panels.isFolderPopoverOpen()).toBe(false);
    });

    it('does not steal focus when a second close arrives after it is already closed', () => {
      const panels = setup();
      panels.openFolderPopover();
      panels.closeFolderPopover();
      expect(focus.request).toHaveBeenLastCalledWith('location-pill');
      focus.request('comment');
      const requests = focus.request.mock.calls.length;

      panels.closeFolderPopover();

      expect(focus.request).toHaveBeenCalledTimes(requests);
      expect(focus.request).toHaveBeenLastCalledWith('comment');
    });
  });

  describe('locales drawer', () => {
    it('opens and asks for its first control', () => {
      const panels = setup();

      panels.openLocalesDrawer();

      expect(panels.isLocalesDrawerOpen()).toBe(true);
      expect(focus.request).toHaveBeenLastCalledWith('drawer-first-control');
    });

    it('does not open when there is no other locale', () => {
      const panels = setup({ hasOtherLocales: false });

      panels.openLocalesDrawer();

      expect(panels.isLocalesDrawerOpen()).toBe(false);
      expect(focus.request).not.toHaveBeenCalled();
    });

    it('hands focus back to the row on close, but only when it was open', () => {
      const panels = setup();
      panels.closeLocalesDrawer();
      expect(focus.request).not.toHaveBeenCalled();

      panels.openLocalesDrawer();
      panels.closeLocalesDrawer();

      expect(panels.isLocalesDrawerOpen()).toBe(false);
      expect(focus.request).toHaveBeenLastCalledWith('locales-row');
    });
  });

  describe('context disclosure', () => {
    it('toggles without asking for focus', () => {
      const panels = setup();

      panels.toggleContext();
      expect(panels.isContextOpen()).toBe(true);
      panels.toggleContext();
      expect(panels.isContextOpen()).toBe(false);
      expect(focus.request).not.toHaveBeenCalled();
    });
  });

  describe('dismissal', () => {
    it('reports nothing consumed when no panel is open', () => {
      expect(setup().dismissNearest()).toBe(false);
    });

    it('closes the popover first, then the drawer, then lets the dialog go', () => {
      const panels = setup();
      panels.openLocalesDrawer();
      panels.openFolderPopover();

      expect(panels.dismissNearest()).toBe(true);
      expect(panels.isFolderPopoverOpen()).toBe(false);
      expect(panels.isLocalesDrawerOpen()).toBe(true);
      expect(focus.request).toHaveBeenLastCalledWith('location-pill');

      expect(panels.dismissNearest()).toBe(true);
      expect(panels.isLocalesDrawerOpen()).toBe(false);
      expect(focus.request).toHaveBeenLastCalledWith('locales-row');

      expect(panels.dismissNearest()).toBe(false);
    });

    it('does not treat the context disclosure as dismissible', () => {
      const panels = setup();
      panels.toggleContext();

      expect(panels.dismissNearest()).toBe(false);
      expect(panels.isContextOpen()).toBe(true);
    });
  });

  describe('closing for a validation failure', () => {
    it('closes both panels without restoring focus to either opener', () => {
      const panels = setup();
      panels.openLocalesDrawer();
      panels.openFolderPopover();
      panels.stageFolder('a');
      const requests = focus.request.mock.calls.length;

      panels.closeAll();

      expect(panels.isFolderPopoverOpen()).toBe(false);
      expect(panels.isLocalesDrawerOpen()).toBe(false);
      expect(panels.stagedFolderPath()).toBeNull();
      expect(focus.request).toHaveBeenCalledTimes(requests);
    });
  });

  describe('focus requests', () => {
    it('issues a new request each time, even for the same target', () => {
      const panels = setup();

      panels.openLocalesDrawer();
      panels.openLocalesDrawer();

      expect(focus.request).toHaveBeenCalledTimes(2);
      expect(focus.request).toHaveBeenNthCalledWith(1, 'drawer-first-control');
      expect(focus.request).toHaveBeenNthCalledWith(2, 'drawer-first-control');
    });
  });
});
