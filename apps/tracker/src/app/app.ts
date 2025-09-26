import {Component, inject, OnInit, signal} from '@angular/core';
import {RouterModule} from '@angular/router';
import { AppHeader } from "./app-header/app-header";
import { ApiService } from './services/api';

@Component({
  imports: [RouterModule, AppHeader],
  selector: 'lingo-tracker-app',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  readonly #apiService = inject(ApiService);
  
  protected title = 'Lingo Tracker';

  health = signal<string>('');

  ngOnInit() {
    this.#apiService.getHealth().subscribe((health) => {
      this.health.set(health.status ?? '');
    });
  }
}
