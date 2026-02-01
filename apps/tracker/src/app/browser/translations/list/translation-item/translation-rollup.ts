import {
  Component,
  ChangeDetectionStrategy,
  input,
  signal,
  computed,
  inject,
  viewChild,
  ElementRef,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Overlay, OverlayModule, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal, PortalModule } from '@angular/cdk/portal';
import { ViewContainerRef, TemplateRef } from '@angular/core';
import { TranslationStatus } from '@simoncodes-ca/data-transfer';

/** Locale state for rollup display */
export interface LocaleState {
  code: string;
  status: TranslationStatus;
}

/** Status configuration for display */
interface StatusConfig {
  label: string;
  icon: string;
  color: string;
  colorVar: string;
}

/** Close delay in ms */
const CLOSE_DELAY = 120;

/**
 * Displays a visual rollup of translation statuses across locales.
 * Shows a segmented ring with status colors and a tooltip with details.
 */
@Component({
  selector: 'app-translation-rollup',
  standalone: true,
  imports: [CommonModule, OverlayModule, PortalModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #trigger
      class="rollup"
      role="button"
      tabindex="0"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-expanded]="isOpen()"
      (mouseenter)="open()"
      (mouseleave)="closeSoon()"
      (focus)="open()"
      (blur)="close()"
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
          cx="20"
          cy="20"
          [attr.r]="radius"
          [attr.stroke]="seg.color"
          [attr.stroke-dasharray]="seg.dashArray"
          [attr.stroke-dashoffset]="seg.dashOffset"
        />
        }
      </svg>

      <!-- Center icon -->
      <div
        class="center"
        [class.center--issue]="hasIssues()"
        [class.center--ok]="!hasIssues()"
      >
        <mat-icon
          class="center-icon"
          [class.icon--issue]="hasIssues()"
          [class.icon--verified]="!hasIssues() && isAllVerified()"
          [class.icon--translated]="!hasIssues() && !isAllVerified()"
          aria-hidden="true"
        >
          {{ centerIcon() }}
        </mat-icon>
      </div>
    </div>

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
              [style.color]="row.color"
              aria-hidden="true"
              >{{ row.icon }}</mat-icon
            >
            <span class="label">{{ row.label }}</span>
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
        border-radius: var(--border-radius-lg);
        outline: none;
        cursor: default;
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

      .center--issue {
        border: 2px solid
          color-mix(in srgb, var(--color-warning) 45%, transparent);
      }

      .center-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }

      .icon--issue {
        color: var(--color-warning);
      }

      .icon--translated {
        color: var(--color-info);
      }

      .icon--verified {
        color: var(--color-success);
      }

      /* Tooltip panel - always dark for contrast in both themes */
      .tooltip {
        min-width: 200px;
        max-width: 360px;
        padding: var(--spacing-3);
        border-radius: var(--border-radius-xl);
        background: #18181b;
        color: #fafafa;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.1);
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
  /** Locale states to display */
  locales = input.required<LocaleState[]>();

  /** Base locale code (excluded from display) */
  baseLocale = input<string>('en');

  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);

  readonly trigger = viewChild.required<ElementRef<HTMLElement>>('trigger');
  readonly tooltipTpl = viewChild.required<TemplateRef<unknown>>('tooltipTpl');

  private overlayRef?: OverlayRef;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  /** SVG ring geometry */
  readonly radius = 14;
  private get circumference(): number {
    return 2 * Math.PI * this.radius;
  }

  /** Status configuration */
  private readonly statusConfig: Record<TranslationStatus, StatusConfig> = {
    new: {
      label: 'New',
      icon: 'add_circle',
      color: '#f97316',
      colorVar: '--color-warning',
    },
    stale: {
      label: 'Stale',
      icon: 'warning',
      color: '#eab308',
      colorVar: '--color-warning',
    },
    translated: {
      label: 'Translated',
      icon: 'language',
      color: '#3b82f6',
      colorVar: '--color-info',
    },
    verified: {
      label: 'Verified',
      icon: 'check_circle',
      color: '#10b981',
      colorVar: '--color-success',
    },
  };

  ngOnDestroy(): void {
    this.close();
  }

  /** Effective locales (excluding base locale) */
  private readonly effectiveLocales = computed(() => {
    const base = this.baseLocale().toLowerCase();
    return (this.locales() ?? []).filter((l) => (l?.code ?? '').toLowerCase() !== base);
  });

  /** Get locale codes by status */
  private codesBy(status: TranslationStatus): string[] {
    return this.effectiveLocales()
      .filter((l) => l.status === status)
      .map((l) => l.code)
      .sort((a, b) => a.localeCompare(b));
  }

  /** Status counts */
  readonly counts = computed(() => ({
    new: this.codesBy('new').length,
    stale: this.codesBy('stale').length,
    translated: this.codesBy('translated').length,
    verified: this.codesBy('verified').length,
  }));

  /** Total non-base locales */
  readonly total = computed(() => this.effectiveLocales().length);

  /** Count of translated + verified */
  private readonly translatedLike = computed(() => this.counts().translated + this.counts().verified);

  /** Whether there are issues (new or stale) */
  readonly hasIssues = computed(() => this.counts().new > 0 || this.counts().stale > 0);

  /** Whether all locales are verified */
  readonly isAllVerified = computed(() => this.total() > 0 && this.counts().verified === this.total());

  /** Whether all locales are translated (but not all verified) */
  readonly isAllTranslated = computed(
    () => this.total() > 0 && this.translatedLike() === this.total() && !this.isAllVerified(),
  );

  /** Center icon based on state */
  readonly centerIcon = computed(() => {
    if (this.hasIssues()) return 'priority_high';
    if (this.isAllVerified()) return 'check';
    return 'language';
  });

  /** Aria label for accessibility */
  readonly ariaLabel = computed(() => {
    const t = this.total();
    if (t === 0) return 'No locales';

    const parts: string[] = [];
    parts.push(`${this.translatedLike()} of ${t} translated`);

    const c = this.counts();
    if (c.new) parts.push(`${c.new} new`);
    if (c.stale) parts.push(`${c.stale} stale`);
    if (c.verified) parts.push(`${c.verified} verified`);

    return `Translation rollup: ${parts.join(', ')}`;
  });

  /** Ring segments for SVG */
  readonly ringSegments = computed(() => {
    const t = this.total() || 1;
    const c = this.counts();
    const circ = this.circumference;

    const order: TranslationStatus[] = ['verified', 'translated', 'stale', 'new'];

    let acc = 0;
    return order
      .map((st) => {
        const count = c[st] || 0;
        const frac = count / t;
        const len = frac * circ;
        const gap = circ - len;
        const seg = {
          status: st,
          color: this.statusConfig[st].color,
          dashArray: `${len} ${gap}`,
          dashOffset: -acc,
        };
        acc += len;
        return seg;
      })
      .filter((s) => {
        if (this.total() === 0) return false;
        const len = parseFloat(s.dashArray.split(' ')[0]);
        return len > 0.5;
      });
  });

  /** Tooltip rows - one row per locale, sorted by severity then locale code */
  readonly tooltipLocaleRows = computed(() => {
    const order: TranslationStatus[] = ['new', 'stale', 'translated', 'verified'];
    const orderIndex = (s: TranslationStatus) => order.indexOf(s);

    return this.effectiveLocales()
      .map((l) => ({
        code: l.code,
        status: l.status,
        label: this.statusConfig[l.status].label,
        icon: this.statusConfig[l.status].icon,
        color: this.statusConfig[l.status].color,
      }))
      .sort((a, b) => {
        const orderDiff = orderIndex(a.status) - orderIndex(b.status);
        if (orderDiff !== 0) return orderDiff;
        return a.code.localeCompare(b.code);
      });
  });

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

  /** Handle keyboard events */
  onKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.close();
      return;
    }
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      if (this.isOpen()) {
        this.close();
      } else {
        this.open();
      }
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
