import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';

/**
 * FolderSidebarHeader component displays collection context in the sidebar.
 *
 * Shows the collection name prominently with a back button, and displays
 * the translations folder path as secondary information.
 *
 * @example
 * <app-sidebar-header
 *   [collectionName]="collectionName()"
 *   [translationsFolder]="translationsFolder()"
 *   (backClick)="navigateToCollections()"
 * />
 */
@Component({
  selector: 'app-sidebar-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    TranslocoModule,
  ],
  templateUrl: './folder-sidebar-header.html',
  styleUrl: './folder-sidebar-header.scss',
})
export class FolderSidebarHeader {
  readonly TOKENS = TRACKER_TOKENS;

  /** Name of the collection */
  collectionName = input.required<string>();

  /** Path to the translations folder */
  translationsFolder = input.required<string>();

  /** Emitted when the back button is clicked */
  backClick = output<void>();

  onBackButtonClick(): void {
    this.backClick.emit();
  }
}
