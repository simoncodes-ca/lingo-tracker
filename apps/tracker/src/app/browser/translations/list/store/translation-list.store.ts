import { signalStore } from '@ngrx/signals';
import { withItemUiState } from './with-item-ui-state.feature';
import { withItemActions } from './with-item-actions.feature';

export const TranslationListStore = signalStore(withItemUiState(), withItemActions());
