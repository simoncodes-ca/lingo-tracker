import { CollectionIndexNotReadyError } from '../services/index-readiness';

/** What a failed read does to the screen. */
export interface LoadFailure {
  /** Whatever the failed load would have replaced is on screen already (a tree or list that loaded). */
  hasContentOnScreen: boolean;
  /** Settles the busy flag and leaves the content on screen untouched or restored. Followed by a toast. */
  keepContent: () => void;
  /** Settles the busy flag and records `message` as the error state, which replaces the content. */
  showError: (message: string) => void;
  /** Raises the toast. */
  toast: (message: string) => void;
}

/**
 * The one load-failure rule of the Browser stores. The index can go not-ready mid-session
 * (reindex, outside change, eviction). When a read gives up for that reason and there is
 * content on screen, keep it and toast: the error state would replace it. Any other
 * failure, and a not-ready one with nothing on screen yet, becomes the error state.
 */
export function handleLoadFailure(error: unknown, message: string, failure: LoadFailure): void {
  if (error instanceof CollectionIndexNotReadyError && failure.hasContentOnScreen) {
    failure.keepContent();
    failure.toast(message);
    return;
  }
  failure.showError(message);
}
