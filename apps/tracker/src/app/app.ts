import { Component, type OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AppHeader } from './header/app-header';
import { CollectionsStore } from './collections/store/collections.store';

@Component({
  standalone: true,
  imports: [RouterModule, AppHeader, MatIconModule],
  selector: 'lingo-tracker-app',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly collectionsStore = inject(CollectionsStore);

  ngOnInit(): void {
    this.collectionsStore.loadCollections();
  }
}
