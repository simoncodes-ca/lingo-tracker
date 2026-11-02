import { type BundleTypeOutcome, type BundleWarning, bundleTypeOutcomeDetail } from './generate-bundle';

type BundleTypeFindings =
  | { readonly status: 'written'; readonly path: string; readonly keysCount: number }
  | { readonly status: 'failed'; readonly reason: string }
  | { readonly status: 'skipped'; readonly reason: string }
  | { readonly status: 'none' };

export interface BundleFindings {
  readonly messages: readonly string[];
  readonly byOrigin: Readonly<Record<BundleWarning['origin'], readonly string[]>>;
  readonly types: BundleTypeFindings;
}

/** Internal assembly step. Adapters receive the completed findings on core results. */
export function bundleFindings(warnings: readonly BundleWarning[], outcome?: BundleTypeOutcome): BundleFindings {
  const messages: string[] = [];
  const byOrigin: Record<BundleWarning['origin'], string[]> = { generation: [], config: [], type: [] };
  for (const warning of warnings) {
    messages.push(warning.message);
    byOrigin[warning.origin].push(warning.message);
  }
  let types: BundleTypeFindings = { status: 'none' };
  if (outcome) {
    switch (outcome.status) {
      case 'written':
      case 'failed':
        types = outcome;
        break;
      case 'skipped':
        types = { status: 'skipped', reason: bundleTypeOutcomeDetail(outcome) };
        break;
      case 'not-configured':
        break;
      default: {
        const unhandled: never = outcome;
        throw new Error(`Unknown bundle type outcome: ${unhandled}`);
      }
    }
  }
  return { messages, byOrigin, types };
}
