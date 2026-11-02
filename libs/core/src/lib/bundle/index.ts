// The bundle module: plan or generate bundles, and edit the bundle definitions in config.

export {
  addBundleDefinition,
  deleteBundleDefinition,
  type UpdateBundleDefinitionOptions,
  updateBundleDefinition,
} from './bundle-definition-operations';
export {
  type BundleProgressEvent,
  type GenerateBundleParams,
  type GenerateBundleResult,
  generatePreparedBundle,
} from './generate-bundle';
export {
  type BundleRunOutcome,
  type GenerateBundlesOptions,
  type GenerateBundlesResult,
  generateBundles,
} from './generate-bundles';
export {
  type BundlePlan,
  type BundlePlanExampleKey,
  type BundlePlanFile,
  type PlanBundleParams,
  planBundle,
} from './plan-bundle';
export {
  type PrepareBundleRunParams,
  type PreparedBundleRun,
  prepareBundleRun,
} from './prepare-bundle-run';
