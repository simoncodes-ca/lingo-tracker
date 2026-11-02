import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../i18n-types/tracker-resources';
import { CollectionsStore } from './collections/store/collections.store';
import { AppHeader } from './header/app-header';

@Component({
  standalone: true,
  imports: [RouterModule, AppHeader, MatIconModule, TranslocoPipe],
  selector: 'lingo-tracker-app',
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly collectionsStore = inject(CollectionsStore);
  readonly TOKENS = TRACKER_TOKENS;

  ngOnInit(): void {
    this.collectionsStore.loadCollections();
  }
}
