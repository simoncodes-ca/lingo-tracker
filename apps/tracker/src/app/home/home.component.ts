import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="home-container">
      <h1>Welcome to LingoTracker</h1>
      <p>Translation management made simple.</p>
    </div>
  `,
  styles: [`
    .home-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 400px;
      text-align: center;

      h1 {
        font-size: var(--font-size-3xl);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        margin-bottom: var(--spacing-4);
      }

      p {
        font-size: var(--font-size-lg);
        color: var(--color-text-secondary);
      }
    }
  `]
})
export class HomeComponent {}
