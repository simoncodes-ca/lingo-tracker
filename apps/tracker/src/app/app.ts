import { Component, inject, OnInit, effect } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AppHeader } from './app-header/app-header';
import { applicationStore } from './store/application-store';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  imports: [
    RouterModule,
    CommonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    AppHeader,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  selector: 'lingo-tracker-app',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  readonly title = 'Lingo Tracker';
  readonly store = inject(applicationStore);
  readonly initCommand = 'lingo-tracker init';

  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  constructor() {
    // Navigate to collections route when collections are loaded
    effect(() => {
      if (this.store.hasLoadedCollections()) {
        this.router.navigate(['/collections']);
      }
    });
  }

  ngOnInit() {
    this.store.loadCollections();
  }

  async copyToClipboard() {
    try {
      await navigator.clipboard.writeText(this.initCommand);
      this.snackBar.open('Command copied to clipboard!', 'Close', {
        duration: 2000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      });
    } catch (err) {
      console.error('Failed to copy command to clipboard:', err);
      this.snackBar.open('Failed to copy command', 'Close', {
        duration: 2000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      });
    }
  }
}
