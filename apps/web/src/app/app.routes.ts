import type { Routes } from '@angular/router';
import { NotFoundPage } from './pages/not-found/not-found.page';
import { PrivacyPage } from './pages/privacy/privacy.page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'lviv' },
  { path: 'privacy', component: PrivacyPage, title: 'Кебабаріум · Privacy' },
  { path: 'not-found', component: NotFoundPage },
  { path: ':city', loadComponent: () => import('./home/home.page').then((m) => m.HomePage), title: 'Кебабаріум' },
  { path: ':city/place/:id', loadComponent: () => import('./pages/place/place.page').then((m) => m.PlacePage) },
  { path: '**', component: NotFoundPage },
];
