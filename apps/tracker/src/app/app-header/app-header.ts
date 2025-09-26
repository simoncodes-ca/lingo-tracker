import { Component, inject, OnInit, signal, ViewEncapsulation } from "@angular/core";
import { MatToolbarModule } from "@angular/material/toolbar";
import { ThemeService } from "../services/theme";
import { MatIconModule } from "@angular/material/icon";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { PillComponent } from "../common/components";

@Component({
  selector: 'app-header',
  imports: [MatToolbarModule, MatSlideToggleModule, MatIconModule, PillComponent],
  templateUrl: './app-header.html',
  styleUrls: ['./app-header.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class AppHeader implements OnInit {
  theme = inject(ThemeService);
  
  protected readonly appVersion = signal('0.0.0');
  protected readonly isDarkTheme = this.theme.isDark

  ngOnInit() { this.theme.init(); }

  protected toggleTheme(): void {
    this.theme.toggle();
  }
}