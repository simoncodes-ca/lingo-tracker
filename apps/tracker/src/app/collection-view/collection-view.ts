import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CollectionWithName } from '../common/types/collection-with-name';
import { applicationStore } from '../store/application-store';

@Component({
  selector: 'collection-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './collection-view.html',
  styleUrl: './collection-view.scss'
})
export class CollectionView implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private store = inject(applicationStore);

  collection = signal<CollectionWithName | null>(null);

  ngOnInit() {
    const encodedName = this.route.snapshot.paramMap.get('encodedName');
    if (encodedName) {
      const foundCollection = this.store.collections().find(c => c.encodedName === encodedName);
      if (foundCollection) {
        this.collection.set(foundCollection);
      } else {
        // Collection not found, redirect back to collections
        this.router.navigate(['/collections']);
      }
    } else {
      this.router.navigate(['/collections']);
    }
  }

  onBackClick() {
    this.router.navigate(['/collections']);
  }
}
