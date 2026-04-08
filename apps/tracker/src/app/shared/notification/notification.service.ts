import { inject, Injectable } from '@angular/core';
import { MatSnackBar, type MatSnackBarConfig } from '@angular/material/snack-bar';
import { NotificationComponent } from './notification.component';
import { NOTIFICATION_DURATIONS, type NotificationData, type NotificationSeverity } from './notification.constants';

/**
 * Centralized notification API for the Tracker UI.
 *
 * All callsites use the four severity-specific methods which open a custom
 * snackbar (`NotificationComponent`) with consistent styling, icon, color,
 * and duration. Callers handle their own translation lookup and pass the
 * resulting string in directly so this service has no Transloco dependency.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly #snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.#open('success', message);
  }

  info(message: string): void {
    this.#open('info', message);
  }

  warning(message: string): void {
    this.#open('warning', message);
  }

  error(message: string): void {
    this.#open('error', message);
  }

  #open(severity: NotificationSeverity, message: string): void {
    const config: MatSnackBarConfig<NotificationData> = {
      data: { severity, message },
      duration: NOTIFICATION_DURATIONS[severity],
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    };

    this.#snackBar.openFromComponent(NotificationComponent, config);
  }
}
