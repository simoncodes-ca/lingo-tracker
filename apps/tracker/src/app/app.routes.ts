import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    redirectTo: '/collections',
    pathMatch: 'full',
  },
  {
    path: 'collections',
    loadComponent: () =>
      import('./collections/collections-manager').then(
        (m) => m.CollectionsManager,
      ),
    title: 'Collections',
  },
  {
    path: 'browser/:collectionName',
    loadComponent: () =>
      import('./browser/translation-browser').then((m) => m.TranslationBrowser),
    title: 'Translation Browser',
  },
];
