import { Component, type OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { AppHeader } from './header/app-header';
import { CollectionsStore } from './collections/store/collections.store';
import { TRACKER_TOKENS } from '../i18n-types/tracker-resources';

@Component({
  standalone: true,
  imports: [RouterModule, AppHeader, MatIconModule, TranslocoPipe],
  selector: 'lingo-tracker-app',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly collectionsStore = inject(CollectionsStore);
  readonly TOKENS = TRACKER_TOKENS;

  ngOnInit(): void {
    this.collectionsStore.loadCollections();
  }
}
