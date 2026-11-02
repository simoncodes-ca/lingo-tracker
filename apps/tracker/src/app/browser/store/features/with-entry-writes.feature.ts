import { inject } from '@angular/core';
import { signalStoreFeature, type, withMethods } from '@ngrx/signals';
import type {
  CreateResourceDto,
  CreateResourceResponseDto,
  UpdateResourceDto,
  UpdateResourceResponseDto,
} from '@simoncodes-ca/data-transfer';
import type { Observable } from 'rxjs';
import { BrowserApiService } from '../../services/browser-api.service';
import type { BrowserWriteResult } from '../browser-mirror';
import { doesUpdateMoveEntry } from '../does-update-move-entry';
import {
  type DeleteResourceOutcome,
  type DeleteResourceResult,
  decideDeleteResource,
  decideRequestedEntryDelete,
  decideTranslateResource,
  deleteOutcome,
  type RequestedEntryDeleteOutcome,
  type TranslateResourceOutcome,
  type TranslateResourceResult,
  translateOutcome,
} from '../resource-write-outcome';
import { confirmThenWrite, editorWrite, writeRun } from '../write-run';

/**
 * Entry Writes owns the read-only rule, session validity and decided feedback for delete/translate.
 * Calls are cold. Create/update are pass-through for the editor's API response and error contract,
 * including 409 conflicts; Editor Submit enforces read-only for those writes.
 * They only update caches in their original Browser Session.
 * Both the folder list and search results are addressed by the entry's full key.
 */
export function withEntryWritesFeature<_>() {
  return signalStoreFeature(
    {
      state: type<{
        sessionId: number;
        selectedCollection: string | null;
        isReadOnly: boolean;
      }>(),
      methods: type<{
        mirrorWrite(result: BrowserWriteResult): void;
      }>(),
    },
    withMethods((store) => {
      const api = inject(BrowserApiService);

      function deleteResource<Outcome>(
        fullKey: string,
        decide: (result: DeleteResourceResult) => Outcome,
      ): Observable<Outcome> {
        return writeRun<DeleteResourceResult, Outcome>(
          store,
          ({ collection, respond }) =>
            respond(api.deleteResource(collection, [fullKey]), (response) => {
              if (response.entriesDeleted > 0) store.mirrorWrite({ kind: 'entry-removed', key: fullKey });
              return deleteOutcome(response);
            }),
          decide,
        );
      }

      return {
        /** Creates an entry, then reloads the List Scope so the list shows it in place. */
        createResource(collectionName: string, dto: CreateResourceDto): Observable<CreateResourceResponseDto> {
          return editorWrite(
            store,
            () => api.createResource(collectionName, dto),
            () => store.mirrorWrite({ kind: 'entry-created' }),
          );
        },

        /**
         * Updates the entry `dto.key` names. A DTO with a `moveTo` (the collection
         * root included) moves the entry, so it leaves the caches. A DTO without
         * one is patched in place.
         */
        updateResource(collectionName: string, dto: UpdateResourceDto): Observable<UpdateResourceResponseDto> {
          return editorWrite(
            store,
            () => api.updateResource(collectionName, dto),
            (response) => {
              if (doesUpdateMoveEntry(dto)) {
                store.mirrorWrite({ kind: 'entry-removed', key: dto.key });
              } else if (response.resource) {
                store.mirrorWrite({ kind: 'entry-replaced', key: dto.key, resource: response.resource });
              }
            },
          );
        },

        /** Deletes one entry and returns its decided feedback, without an error channel. */
        deleteResource(fullKey: string): Observable<DeleteResourceOutcome> {
          return deleteResource(fullKey, decideDeleteResource);
        },

        /** The caller presents confirmation; the store owns guards and the eventual write. */
        requestEntryDelete(
          fullKey: string,
          confirm: (inSession: () => boolean) => Promise<boolean>,
        ): Observable<RequestedEntryDeleteOutcome> {
          return writeRun<DeleteResourceResult | { kind: 'cancelled' }, RequestedEntryDeleteOutcome>(
            store,
            ({ inSession }) => confirmThenWrite(inSession, confirm, () => deleteResource(fullKey, (result) => result)),
            decideRequestedEntryDelete,
          );
        },

        /** Auto-translates one entry and returns the decided toasts in their existing order. */
        translateResource(fullKey: string): Observable<TranslateResourceOutcome> {
          return writeRun<TranslateResourceResult, TranslateResourceOutcome>(
            store,
            ({ collection, respond }) =>
              respond(api.translateResource(collection, fullKey), (response) => {
                store.mirrorWrite({ kind: 'entry-replaced', key: fullKey, resource: response.resource });
                return translateOutcome(response);
              }),
            decideTranslateResource,
          );
        },
      };
    }),
  );
}
