import { computed, Injectable, inject, signal } from '@angular/core';
import type { ResourceTreeDto } from '@simoncodes-ca/data-transfer';
import { EMPTY, finalize, type Observable, of, shareReplay, tap } from 'rxjs';
import { BrowserStore } from '../store/browser.store';
import { captureSession, withinSession } from '../store/session-guard';
import { BrowserApiService } from './browser-api.service';

/** One editor's folder reads. Its cache ends when the editor drops this scope. */
export class FolderPeekScope {
  readonly #read: (collectionName: string, path: string) => Observable<ResourceTreeDto>;
  readonly #inSession: () => boolean;
  readonly #cached = signal<ReadonlyMap<string, ResourceTreeDto>>(new Map());
  readonly #pending = signal<ReadonlySet<string>>(new Set());
  readonly #inFlight = new Map<string, Observable<ResourceTreeDto>>();
  readonly #activeCollection = signal('');

  readonly folderEntries = computed<ReadonlyMap<string, readonly string[]>>(() => {
    if (!this.#inSession()) return new Map();
    const prefix = `${this.#activeCollection()}\u0000`;
    return new Map(
      [...this.#cached()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, tree]) => [key.slice(prefix.length), tree.resources.map((resource) => resource.entryKey)]),
    );
  });

  readonly loadingFolders = computed<ReadonlySet<string>>(() => {
    if (!this.#inSession()) return new Set();
    const prefix = `${this.#activeCollection()}\u0000`;
    return new Set([...this.#pending()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)));
  });

  constructor(read: (collectionName: string, path: string) => Observable<ResourceTreeDto>, inSession: () => boolean) {
    this.#read = read;
    this.#inSession = inSession;
  }

  /** Reads a folder without moving the List Scope; successful reads stay in this scope. */
  peekFolder(collectionName: string, path: string): Observable<ResourceTreeDto> {
    if (!this.#inSession()) return EMPTY;
    this.#activeCollection.set(collectionName);
    const key = `${collectionName}\u0000${path}`;
    const cached = this.#cached().get(key);
    if (cached) return of(cached);
    const pending = this.#inFlight.get(key);
    if (pending) return pending;

    const request = this.#read(collectionName, path).pipe(
      tap((tree) => {
        if (this.#inSession()) this.#cached.update((entries) => new Map(entries).set(key, tree));
      }),
      finalize(() => {
        this.#inFlight.delete(key);
        this.#pending.update((keys) => {
          const next = new Set(keys);
          next.delete(key);
          return next;
        });
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.#inFlight.set(key, request);
    this.#pending.update((keys) => new Set(keys).add(key));
    return request;
  }
}

/** Shares only in-flight reads across scopes; completed reads have no service cache. */
@Injectable({ providedIn: 'root' })
export class FolderPeek {
  readonly #api = inject(BrowserApiService);
  readonly #store = inject(BrowserStore);
  readonly #inFlight = new Map<string, Observable<ResourceTreeDto>>();

  openFolderPeek(): FolderPeekScope {
    const inSession = captureSession(this.#store);
    return new FolderPeekScope((collectionName, path) => this.#read(collectionName, path), inSession);
  }

  #read(collectionName: string, path: string): Observable<ResourceTreeDto> {
    const sessionId = this.#store.sessionId();
    const key = `${sessionId}\u0000${collectionName}\u0000${path}`;
    const pending = this.#inFlight.get(key);
    if (pending) return pending;

    const request = this.#api.getResourceTree(collectionName, path, false).pipe(
      withinSession(captureSession(this.#store)),
      finalize(() => this.#inFlight.delete(key)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.#inFlight.set(key, request);
    return request;
  }
}
