export interface ConfirmationDialogData {
  /** Dialog header text */
  title: string;

  /** Main confirmation message */
  message: string;

  /** Optional confirm button text, defaults to "OK" */
  confirmButtonText?: string;

  /** Optional cancel button text, defaults to "Cancel" */
  cancelButtonText?: string;

  /** Optional action type for styling, defaults to "standard" */
  actionType?: 'standard' | 'destructive';
}
