/**
 * A completed run succeeds when its operation's failure condition is absent and fails
 * when it is present, even if some files or resources were produced. Warnings and
 * intentional skips alone do not fail a run. Export exempts errors and conflicts in
 * dry runs; import still fails on errors or failed resources in dry runs. Other runs
 * use the same failure condition regardless of whether they write output.
 */
export type RunOutcome = 'succeeded' | 'failed';
