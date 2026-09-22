import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import type { PreferredTermFinding, PreferredTermRule } from '@simoncodes-ca/domain';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';

/**
 * The amber notes under the base-locale value: one per preferred-terminology
 * rule the value breaks, each with a one-click fix.
 *
 * Advisory only. The host decides when findings change (after a typing pause),
 * and applies the rule itself; this component never touches the form.
 *
 * Deliberately not a live region: the host wires `advisoryId` into the field's
 * `aria-describedby`, so a screen reader hears the advice when it reads the
 * field rather than on every keystroke that changes it.
 */
@Component({
  selector: 'app-preferred-term-advisories',
  templateUrl: './preferred-term-advisories.html',
  styleUrl: './preferred-term-advisories.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, TranslocoPipe],
})
export class PreferredTermAdvisories {
  /** One finding per matched rule, in rule order. */
  readonly findings = input.required<readonly PreferredTermFinding[]>();
  /** Id of the container, referenced by the field's `aria-describedby`. */
  readonly advisoryId = input.required<string>();
  /** Hides the fix when the field cannot be edited. */
  readonly readOnly = input(false);

  /** The user asked to replace the rule's discouraged term with its preferred one. */
  readonly applyRule = output<PreferredTermRule>();

  readonly TOKENS = TRACKER_TOKENS;
}
