import { DomSanitizer } from '@angular/platform-browser';
import { createServiceFactory, type SpectatorService } from '@ngneat/spectator/vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { KeyMarkupPipe, hasKeyLeaf, keyLeafSplitIndex, type KeyMarkupPart } from './key-markup.pipe';

describe('KeyMarkupPipe', () => {
  let pipe: KeyMarkupPipe;
  let spectator: SpectatorService<KeyMarkupPipe>;
  let sanitizer: DomSanitizer;

  const createPipe = createServiceFactory({ service: KeyMarkupPipe });

  const render = (key: string | null | undefined, searchTerm?: string, part?: KeyMarkupPart): string => {
    const result = pipe.transform(key, searchTerm, part);
    return typeof result === 'string' ? result : (sanitizer.sanitize(1, result) ?? '');
  };

  beforeEach(() => {
    spectator = createPipe();
    pipe = spectator.service;
    sanitizer = spectator.inject(DomSanitizer);
  });

  it('should add a break opportunity after every key separator', () => {
    expect(render('apps.common.buttons.ok')).toBe('apps.<wbr>common.<wbr>buttons.<wbr>ok');
  });

  it('should add a break opportunity at each camelCase hump', () => {
    expect(render('grid.addCurrentSelection')).toBe('grid.<wbr>add<wbr>Current<wbr>Selection');
  });

  it('should return an empty string for a missing key', () => {
    expect(render('')).toBe('');
    expect(render(null)).toBe('');
  });

  it('should keep the truncation ellipsis intact', () => {
    expect(render('a.b')).toBe('a.<wbr>b');
    expect(render(`first.${'segment.'.repeat(8)}last`)).not.toContain('.<wbr>.');
  });

  it('should truncate a long key before marking it up', () => {
    const key = `first.${'segment.'.repeat(8)}last`;
    const output = render(key);

    expect(output).toContain('first...<wbr>');
    expect(output).toContain('last');
    expect(output).not.toContain('segment.<wbr>segment');
  });

  it('should highlight a search match without losing break opportunities', () => {
    const output = render('apps.common.buttons.ok', 'common');

    expect(output).toContain('<mark class="search-highlight">common</mark>');
    expect(output).toBe('apps.<wbr><mark class="search-highlight">common</mark>.<wbr>buttons.<wbr>ok');
  });

  it('should keep escaped entities intact across break points', () => {
    expect(render('a&b.cD')).toBe('a&amp;b.<wbr>c<wbr>D');
  });

  it('should keep a break opportunity that lands where a match begins', () => {
    expect(render('apps.common', 'common')).toBe('apps.<wbr><mark class="search-highlight">common</mark>');
  });

  it('should ignore a search term shorter than three characters', () => {
    expect(render('apps.common.ok', 'ok')).not.toContain('<mark');
  });

  it('should escape markup in the key even when a search term is present', () => {
    const output = render('apps.<img>.common', 'common');

    expect(output).not.toContain('<img>');
    expect(output).toContain('&lt;img&gt;');
  });

  /**
   * The single-line key chip elides the MIDDLE of a key, which CSS cannot do. The
   * pipe supplies the two halves it needs: a head that may be clipped and a tail
   * holding the leaf segment that must not be.
   */
  describe('head/tail split', () => {
    it('should put everything but the leaf segment in the head', () => {
      expect(render('browser.translationEditor.context.allUpToDate', undefined, 'head')).toBe(
        'browser.<wbr>translation<wbr>Editor.<wbr>context',
      );
    });

    it('should put the leaf segment, with its separator, in the tail', () => {
      expect(render('browser.translationEditor.context.allUpToDate', undefined, 'tail')).toBe(
        '.<wbr>all<wbr>Up<wbr>To<wbr>Date',
      );
    });

    it('should never shorten the split parts, unlike the full rendering', () => {
      const key = 'browser.translationEditor.context.someExtremelyLongLeafSegmentName.allUpToDate';

      expect(render(key, undefined, 'full')).toContain('...');
      const rejoined = `${render(key, undefined, 'head')}${render(key, undefined, 'tail')}`;
      expect(rejoined.replaceAll('<wbr>', '')).toBe(key);
    });

    it('should render a key with no separator as head only', () => {
      expect(render('standalone', undefined, 'head')).toBe('standalone');
      expect(render('standalone', undefined, 'tail')).toBe('');
    });

    it('should highlight a match that straddles the boundary on both sides of it', () => {
      const key = 'apps.common.buttons.ok';

      expect(render(key, 'buttons.o', 'head')).toContain('<mark class="search-highlight">buttons</mark>');
      expect(render(key, 'buttons.o', 'tail')).toContain('<mark class="search-highlight">.<wbr>o</mark>');
    });

    it('should highlight a match contained in one part only once', () => {
      expect(render('apps.common.buttons.ok', 'common', 'head')).toBe(
        'apps.<wbr><mark class="search-highlight">common</mark>.<wbr>buttons',
      );
    });

    it('should expose where the split falls', () => {
      expect(keyLeafSplitIndex('apps.common.ok')).toBe(11);
      expect(keyLeafSplitIndex('standalone')).toBe('standalone'.length);
      expect(hasKeyLeaf('apps.ok')).toBe(true);
      expect(hasKeyLeaf('standalone')).toBe(false);
    });
  });
});
