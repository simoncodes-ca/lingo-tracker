/**
 * Notification severity levels.
 *
 * Each severity maps to a specific icon, color, and display duration in the
 * NotificationComponent rendered by NotificationService.
 */
export type NotificationSeverity = 'success' | 'info' | 'warning' | 'error';

/**
 * Display duration (ms) per severity.
 *
 * Warnings and errors stay visible longer because they typically require
 * the user to read and act on them.
 */
export const NOTIFICATION_DURATIONS: Readonly<Record<NotificationSeverity, number>> = {
  success: 3000,
  info: 4000,
  warning: 6000,
  error: 6000,
};

/**
 * Material icon name per severity.
 */
export const NOTIFICATION_ICONS: Readonly<Record<NotificationSeverity, string>> = {
  success: 'check_circle',
  info: 'info',
  warning: 'warning',
  error: 'error',
};

/**
 * Data shape passed to NotificationComponent via MAT_SNACK_BAR_DATA.
 */
export interface NotificationData {
  readonly severity: NotificationSeverity;
  readonly message: string;
}
