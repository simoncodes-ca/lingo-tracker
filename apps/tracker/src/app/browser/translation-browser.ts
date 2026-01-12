import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Translation Browser component for viewing and managing translations within a collection.
 *
 * This is currently a placeholder component that will be fully implemented in a future phase.
 *
 * Features (planned):
 * - Display all translation keys in the collection
 * - Filter and search translations
 * - Edit translation values
 * - View translation metadata and status
 * - Add new translation keys
 */
@Component({
  selector: 'app-translation-browser',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    TranslocoModule,
  ],
  templateUrl: './translation-browser.html',
  styleUrl: './translation-browser.scss',
})
export class TranslationBrowser implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /**
   * The name of the collection being browsed.
   */
  readonly collectionName = signal<string>('');

  ngOnInit(): void {
    // Read collection name from route params
    const name = this.route.snapshot.paramMap.get('collectionName');
    if (name) {
      this.collectionName.set(decodeURIComponent(name));
    }
  }

  /**
   * Navigates back to the collections manager.
   */
  navigateToCollections(): void {
    this.router.navigate(['/collections']);
  }
}
