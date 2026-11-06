import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './auth/auth.store';
import { ToastComponent } from './ui/toast';
import { AuthDialogsComponent } from './auth/auth-dialogs.component';

@Component({
  selector: 'kb-root',
  imports: [RouterOutlet, ToastComponent, AuthDialogsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><kb-toast /><kb-auth-dialogs />`,
  styles: `:host { display: block; height: 100%; }`,
})
export class App {
  constructor() {
    inject(AuthStore).load();
  }
}
