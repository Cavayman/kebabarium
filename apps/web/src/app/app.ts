import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './auth/auth.store';
import { ToastComponent } from './ui/toast';

@Component({
  selector: 'kb-root',
  imports: [RouterOutlet, ToastComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><kb-toast />`,
  styles: `:host { display: block; height: 100%; }`,
})
export class App {
  constructor() {
    inject(AuthStore).load();
  }
}
