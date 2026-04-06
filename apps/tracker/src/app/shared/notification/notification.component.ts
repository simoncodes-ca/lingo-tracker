import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { NOTIFICATION_ICONS, type NotificationData } from './notification.constants';

/**
 * Custom snackbar body rendered by `NotificationService`.
 *
 * Receives `{ severity, message }` via `MAT_SNACK_BAR_DATA` and exposes a
 * close button that dismisses the snackbar via the injected `MatSnackBarRef`.
 */
@Component({
  selector: 'app-notification',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatButtonModule, TranslocoPipe],
  templateUrl: './notification.component.html',
  styleUrl: './notification.component.scss',
  host: {
    class: 'notification',
    '[class.notification--success]': "data.severity === 'success'",
    '[class.notification--info]': "data.severity === 'info'",
    '[class.notification--warning]': "data.severity === 'warning'",
    '[class.notification--error]': "data.severity === 'error'",
    role: 'status',
    '[attr.aria-live]': "data.severity === 'error' ? 'assertive' : 'polite'",
  },
})
export class NotificationComponent {
  protected readonly data = inject<NotificationData>(MAT_SNACK_BAR_DATA);
  readonly #snackBarRef = inject<MatSnackBarRef<NotificationComponent>>(MatSnackBarRef);

  protected readonly TOKENS = TRACKER_TOKENS;

  protected readonly icon = NOTIFICATION_ICONS[this.data.severity];

  protected dismiss(): void {
    this.#snackBarRef.dismiss();
  }
}
