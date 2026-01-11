import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AppHeader } from './header/app-header';

@Component({
  standalone: true,
  imports: [RouterModule, AppHeader],
  selector: 'lingo-tracker-app',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
