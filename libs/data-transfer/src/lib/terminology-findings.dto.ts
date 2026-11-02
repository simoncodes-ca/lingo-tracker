/** A discouraged base-locale term found in a value a write stored, with the rule that flagged it. */
export interface TerminologyFindingDto {
  /** The full key of the resource whose base value was checked. */
  key: string;
  /** The discouraged term, as spelled in the rule. */
  discouraged: string;
  /** The suggested replacement, as spelled in the rule. */
  preferred: string;
  /** Why the preferred term is preferred, when the rule says. */
  reason?: string;
  /** The suggestion as one line, e.g. `consider "Investment" instead of "Expenditure"`. */
  message: string;
}

/**
 * The advisory terminology outcome of a resource write (create or update). The value is stored
 * either way. Omitted from a response when there is nothing to report.
 */
export interface TerminologyFindingsDto {
  /** One per rule a stored base value breaks, however often the term occurs. */
  findings: TerminologyFindingDto[];
  /** Rule-file problems that limited the check (the check ran against no rules), ready to show. */
  problems: string[];
}
