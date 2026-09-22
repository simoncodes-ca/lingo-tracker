/** One preferred-terminology rule: a discouraged base-locale term and the term to use instead. */
export interface PreferredTermRuleDto {
  discouraged: string;
  preferred: string;
  reason?: string;
}

/** A defect in one row of a submitted rule list. Mirrors the domain `PreferredTermRuleError`. */
export interface PreferredTermRuleErrorDto {
  /** Row in the submitted `preferredTerminology` list (0-based). */
  index: number;
  field: 'discouraged' | 'preferred' | 'reason' | 'rule';
  code:
    | 'empty'
    | 'invalid-character'
    | 'self-mapping'
    | 'duplicate'
    | 'chain'
    | 'contains-discouraged'
    | 'cycle'
    | 'invalid-type';
  message: string;
}

/** Body of the 400 returned by `PUT /api/config` when the submitted rule list fails validation. */
export interface PreferredTermRulesErrorResponseDto {
  message: string;
  errors: PreferredTermRuleErrorDto[];
}
