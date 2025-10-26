import {Route} from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: 'collections',
    loadComponent: () => import('./collection-selector/collection-selector').then(m => m.CollectionSelector)
  },
  {
    path: 'collections/:encodedName',
    loadComponent: () => import('./collection-view/collection-view').then(m => m.CollectionView)
  },
  {
    path: '',
    redirectTo: '/collections',
    pathMatch: 'full'
  }
];
