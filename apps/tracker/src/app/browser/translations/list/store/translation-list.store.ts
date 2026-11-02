import { signalStore } from '@ngrx/signals';
import { withItemActions } from './with-item-actions.feature';
import { withItemUiState } from './with-item-ui-state.feature';

export const TranslationListStore = signalStore(withItemUiState(), withItemActions());
