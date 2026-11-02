/**
 * Bundle definition DTOs. The wire shape is the domain Bundle Definition itself: one type,
 * declared once in `@simoncodes-ca/domain` and shared by core, the API, the CLI and the Tracker.
 */

import type { TokenCasing } from '@simoncodes-ca/domain';

export type {
  BundleDefinition as BundleDefinitionDto,
  CollectionBundleDefinition as CollectionBundleDefinitionDto,
  EntrySelectionRule as EntrySelectionRuleDto,
} from '@simoncodes-ca/domain';

/** Casing of generated TypeScript token property keys. Declared once, in domain. */
export type TokenCasingDto = TokenCasing;
