import { Overlay, OverlayModule, type OverlayRef } from '@angular/cdk/overlay';
import { PortalModule, TemplatePortal } from '@angular/cdk/portal';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  HostListener,
  inject,
  input,
  type OnDestroy,
  signal,
  type TemplateRef,
  ViewContainerRef,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { countByStatus } from '@simoncodes-ca/domain';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { injectActiveLang, injectStatusBreakdown } from '../../../../shared/i18n/status-breakdown';
import {
  rollupCenter,
  STATUS_PRESENTATION,
} from '../../../../shared/translation-status/translation-status-presentation';
import { ringSegments, sortLocaleRows } from './rollup-geometry';
import type { RollupLocale } from './row-view';

/** Close delay in ms */
const CLOSE_DELAY = 120;

/**
 * Displays a visual rollup of translation statuses across locales.
 * Shows a segmented ring with status colors and a tooltip with details.
 */
@Component({
  selector: 'app-translation-rollup',
  standalone: true,
  imports: [CommonModule, OverlayModule, PortalModule, MatIconModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- A real button, not a div with role="button": it is focusable, it toggles,
         and it must announce and behave like the control it looks like. -->
    <button
      #trigger
      class="rollup"
      [class.rollup--compact]="compact()"
      type="button"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-expanded]="isOpen()"
      (mouseenter)="open()"
      (mouseleave)="closeSoon()"
      (focus)="open()"
      (blur)="close()"
      (click)="toggle()"
      (keydown)="onKeydown($event)"
    >
      <!-- Segmented ring (SVG) -->
      <svg class="ring" viewBox="0 0 40 40" aria-hidden="true">
        <!-- base track -->
        <circle class="track" cx="20" cy="20" [attr.r]="radius" />

        <!-- segments (drawn in deterministic order) -->
        @for (seg of ringSegments(); track seg.status) {
        <circle
          class="seg"
          [ngClass]="'seg--' + seg.status"
          cx="20"
          cy="20"
          [attr.r]="radius"
          [attr.stroke-dasharray]="seg.dashArray"
          [attr.stroke-dashoffset]="seg.dashOffset"
        />
        }
      </svg>

      <!-- Center icon. The state class names the issue kind rather than the fact
           of an issue, so new and stale differ in shape as well as in hue. -->
      <div class="center" [ngClass]="'center--' + centerState()">
        <mat-icon
          class="center-icon"
          [ngClass]="'icon--' + centerState()"
          aria-hidden="true"
        >
          {{ centerIcon() }}
        </mat-icon>
      </div>
    </button>

    <!-- Tooltip overlay content -->
    <ng-template #tooltipTpl>
      <div
        class="tooltip"
        role="tooltip"
        (mouseenter)="cancelClose()"
        (mouseleave)="closeSoon()"
      >
        <div class="grid">
          @for (row of tooltipLocaleRows(); track row.code) {
          <div class="row">
            <mat-icon
              class="row-icon"
              [ngClass]="'row-icon--' + row.status"
              aria-hidden="true"
              >{{ row.icon }}</mat-icon
            >
            <span class="label">{{ row.labelToken | transloco }}</span>
            <span class="locale-code">{{ row.code }}</span>
          </div>
          }
        </div>
      </div>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }

      .rollup {
        width: 40px;
        height: 40px;
        position: relative;
        display: grid;
        place-items: center;
        padding: 0;
        border: none;
        border-radius: var(--border-radius-lg);
        background: none;
        color: inherit;
        font: inherit;
        outline: none;
        cursor: pointer;
        user-select: none;
      }

      .rollup:focus-visible {
        box-shadow: 0 0 0 3px
          color-mix(in srgb, var(--focus-ring-color) 35%, transparent);
        border-radius: var(--border-radius-lg);
      }

      .ring {
        width: 40px;
        height: 40px;
        display: block;
      }

      /* Compact renders this on a single-line row, where 40px would set the row
         height by itself. The ring is a graphic and scales cleanly. Declared after
         the defaults so it wins on order rather than on a specificity hack. */
      .rollup--compact,
      .rollup--compact .ring {
        width: 28px;
        height: 28px;
      }

      @media (pointer: coarse) {
        .rollup--compact {
          width: 44px;
          height: 44px;
        }
      }

      .track {
        fill: none;
        stroke: var(--color-border);
        stroke-width: 6;
      }

      .seg {
        fill: none;
        stroke-width: 6;
        stroke-linecap: butt;
        transform: rotate(-90deg);
        transform-origin: 20px 20px;
      }

      .center {
        position: absolute;
        width: 22px;
        height: 22px;
        border-radius: var(--border-radius-full);
        display: grid;
        place-items: center;
        background: var(--color-background);
        box-shadow: var(--shadow-sm);
      }

      /* The ring of the centre disc repeats the status hue, so the issue kinds
         differ twice over: once in the glyph, once in the border. */
      .center--stale,
      .center--mixed {
        border: 2px solid
          color-mix(in srgb, var(--color-status-stale) 45%, transparent);
      }

      .center--new {
        border: 2px solid
          color-mix(in srgb, var(--color-status-new) 45%, transparent);
      }

      .center-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }

      .icon--stale,
      .icon--mixed {
        color: var(--color-status-stale);
      }

      .icon--new {
        color: var(--color-status-new);
      }

      .icon--translated {
        color: var(--color-status-translated);
      }

      .icon--verified {
        color: var(--color-status-verified);
      }

      /* One source of truth per status, shared by the ring and the tooltip rows. */
      .seg--new {
        stroke: var(--color-status-new);
      }

      .seg--stale {
        stroke: var(--color-status-stale);
      }

      .seg--translated {
        stroke: var(--color-status-translated);
      }

      .seg--verified {
        stroke: var(--color-status-verified);
      }

      .row-icon--new {
        color: var(--color-status-new);
      }

      .row-icon--stale {
        color: var(--color-status-stale);
      }

      .row-icon--translated {
        color: var(--color-status-translated);
      }

      .row-icon--verified {
        color: var(--color-status-verified);
      }

      /* Tooltip panel - always dark for contrast in both themes */
      .tooltip {
        /* This surface is dark under either theme, so the status hues here always
           take their dark-surface values — the light-theme set is tuned for a
           parchment card and would sink into this panel. */
        --color-status-new: var(--status-new-on-dark);
        --color-status-stale: var(--status-stale-on-dark);
        --color-status-translated: var(--status-translated-on-dark);
        --color-status-verified: var(--status-verified-on-dark);

        min-width: 200px;
        max-width: 360px;
        padding: var(--spacing-3);
        border-radius: var(--border-radius-xl);
        background: var(--color-tooltip-surface);
        color: var(--color-tooltip-text);
        box-shadow: var(--shadow-lg);
        border: 1px solid var(--color-border-strong);
      }

      .grid {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-2);
      }

      .row {
        display: flex;
        align-items: center;
        gap: var(--spacing-2);
        font-size: var(--font-size-xs);
        line-height: 1.33;
      }

      .row-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
        flex-shrink: 0;
      }

      .label {
        flex-shrink: 0;
      }

      .locale-code {
        margin-left: auto;
        opacity: 0.85;
        font-weight: var(--font-weight-medium);
      }
    `,
  ],
  host: {
    class: 'translation-rollup',
  },
})
export class TranslationRollup implements OnDestroy {
  /** Target locales that carry a status (the base locale is never among them). */
  locales = input.required<readonly RollupLocale[]>();

  /** Renders at the smaller size compact's single-line row can afford. */
  compact = input<boolean>(false);

  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly transloco = inject(TranslocoService);
  private readonly activeLang = injectActiveLang();

  readonly trigger = viewChild.required<ElementRef<HTMLElement>>('trigger');
  readonly tooltipTpl = viewChild.required<TemplateRef<unknown>>('tooltipTpl');

  private overlayRef?: OverlayRef;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  /** SVG ring geometry */
  readonly radius = 14;

  ngOnDestroy(): void {
    this.close();
  }

  /** Status counts */
  readonly counts = computed(() => countByStatus(this.locales().map((l) => l.status)));

  /** Total target locales with a status */
  readonly total = computed(() => this.locales().length);

  /** What the centre reports: state and glyph, from `rollupCenter`. */
  private readonly center = computed(() => rollupCenter(this.counts()));

  /**
   * The single state the centre reports: the worst status, or `mixed` when new
   * and stale are both present — the two states a translator triages differently.
   */
  readonly centerState = computed(() => this.center().state);

  /**
   * Center icon. Shape carries the state, so the two issue kinds stay legible to
   * a reader who cannot separate the arcs by hue.
   */
  readonly centerIcon = computed(() => this.center().icon);

  /** Localized status breakdown, e.g. "2 stale, 1 new". */
  readonly breakdown = injectStatusBreakdown(this.counts);

  /**
   * Accessible name. Reads the breakdown rather than a "x of y" summary, because
   * the ring already carries the proportion and the counts are what a listener
   * cannot see. Depends on the active language so it survives a language switch.
   */
  readonly ariaLabel = computed(() => {
    const breakdown = this.breakdown();
    this.activeLang();

    if (this.total() === 0) return breakdown;

    return this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONITEM.ROLLUPARIALABELX, {
      breakdown,
    });
  });

  /** Ring segments for SVG */
  readonly ringSegments = computed(() => ringSegments(this.counts(), this.total(), this.radius));

  /** Tooltip rows - one row per locale, most urgent status first, then by locale code */
  readonly tooltipLocaleRows = computed(() =>
    sortLocaleRows(
      this.locales().map((l) => ({
        code: l.code,
        status: l.status,
        labelToken: STATUS_PRESENTATION[l.status].labelToken,
        icon: STATUS_PRESENTATION[l.status].icon,
      })),
    ),
  );

  /** Whether overlay is open */
  readonly isOpen = signal(false);

  /** Open the tooltip */
  open(): void {
    this.cancelClose();
    if (this.isOpen()) return;

    if (!this.overlayRef) {
      const positionStrategy = this.overlay
        .position()
        .flexibleConnectedTo(this.trigger())
        .withFlexibleDimensions(false)
        .withPush(true)
        .withPositions([
          {
            originX: 'start',
            originY: 'bottom',
            overlayX: 'start',
            overlayY: 'top',
            offsetY: 8,
          },
          {
            originX: 'start',
            originY: 'top',
            overlayX: 'start',
            overlayY: 'bottom',
            offsetY: -8,
          },
          {
            originX: 'end',
            originY: 'bottom',
            overlayX: 'end',
            overlayY: 'top',
            offsetY: 8,
          },
        ]);

      this.overlayRef = this.overlay.create({
        positionStrategy,
        scrollStrategy: this.overlay.scrollStrategies.reposition(),
        hasBackdrop: false,
        panelClass: 'translation-rollup-overlay',
      });
    }

    const portal = new TemplatePortal(this.tooltipTpl(), this.vcr);
    this.overlayRef.attach(portal);
    this.isOpen.set(true);
  }

  /** Close the tooltip immediately */
  close(): void {
    this.cancelClose();
    this.overlayRef?.detach();
    this.isOpen.set(false);
  }

  /** Close the tooltip after a delay */
  closeSoon(): void {
    this.cancelClose();
    this.closeTimer = setTimeout(() => this.close(), CLOSE_DELAY);
  }

  /** Cancel pending close */
  cancelClose(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  /** Toggle the tooltip. Enter and Space reach this through the button's click. */
  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  /** Escape closes; Enter and Space are handled natively by the button. */
  onKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.close();
    }
  }

  /** Close if user clicks outside */
  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(ev: MouseEvent): void {
    if (!this.isOpen()) return;

    const target = ev.target as Node | null;
    const triggerEl = this.trigger()?.nativeElement;
    const overlayEl = this.overlayRef?.overlayElement;

    if (target && triggerEl && overlayEl && !triggerEl.contains(target) && !overlayEl.contains(target)) {
      this.close();
    }
  }
}
