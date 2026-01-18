/**
 * Plain text node: rendered verbatim.
 */
export interface TplTextNode {
  type: 'text';
  value: string;
}

/**
 * Interpolation node for inserting values from scope.
 * - key: Identifier or dot-path (e.g. "user.name").
 * - mode:
 *   - 'escape': HTML-escape the string value (default)
 *   - 'raw': insert the string value as-is (use with caution)
 * - fallbackChain: optional chain of `||` and `??` operators; evaluated left-to-right
 *   - `||` replaces empty-ish values (undefined, null, '', [], {})
 *   - `??` replaces nullish values only (undefined, null)
 * - filters: optional pipeline applied after fallback resolution and before final escaping
 *   - Filters run in order. Their output is then stringified and escaped (unless mode === 'raw').
 */
export interface TplInterpNode {
  type: 'interp';
  key: string;
  mode: 'escape' | 'raw';
  /** Optional fallback chain evaluated left-to-right. */
  fallbackChain?: TplFallbackLink[];
  /** Optional filter pipeline applied after fallback resolution. */
  filters?: TplFilter[];
}

export interface TplFallbackLink {
  op: 'or' | 'nullish';
  right: TplIfTestCompareRight;
}

export interface TplFilter {
  /**
   * Name of the filter to apply.
   * - upper(): toUpperCase
   * - lower(): toLowerCase
   * - trim(): trim whitespace at both ends
   * - number(decimals[, decimalSep[, thousandsSep]]):
   *     Format numeric values with fixed decimals. With 1 arg, just fixed decimals using '.' as decimal separator.
   *     With 2 args, set the decimal separator (no thousands grouping).
   *     With 3 args, set decimal and thousands separators with grouping.
   *     Examples: number(2) -> 1337.42; number(2, ',') -> 1337,42; number(2, ',', '.') -> 1.337,42
   * - json(): JSON.stringify(value) or '' if value is undefined
   * - urlencode(): encodeURIComponent(stringified value)
   * - attr(): pass-through for readability; relies on default HTML escaping later
   * - replace(old, new): literal, global replacement (no regex); empty `old` is a no-op
   */
  name: 'upper' | 'lower' | 'trim' | 'number' | 'json' | 'urlencode' | 'attr' | 'replace';
  /** Optional filter arguments; see the filter descriptions for accepted types and arity. */
  args?: (string | number | boolean | null)[];
}

/**
 * Condition descriptor for if/elseif checks.
 * - Truthy checks: identifier/dot-path optionally negated via '!' or 'not '
 * - Comparison checks: <ident> <op> <value> where value is a literal or another key
 */
export type TplCompareOp = '==' | '!=' | '>' | '<' | '>=' | '<=';

/**
 * Truthy/boolean-style condition test for if/elseif.
 */
export interface TplIfTestTruth {
  type: 'truthy';
  key: string;
  negated: boolean;
}

/**
 * Right-hand side variant: compare against another key.
 */
export interface TplIfTestCompareRightKey {
  kind: 'key';
  key: string;
}

/**
 * Right-hand side variant: compare against a literal value.
 */
export interface TplIfTestCompareRightLiteral {
  kind: 'literal';
  value: string | number | boolean | null; // quoted strings support \\ and \"/\' escaping
}

export type TplIfTestCompareRight = TplIfTestCompareRightKey | TplIfTestCompareRightLiteral;

/**
 * Generic expression for comparisons: either a key (identifier/dot-path) or a literal.
 */
export type TplIfTestExpr = TplIfTestCompareRight;

/**
 * Comparison style condition test for if/elseif, e.g. var == 'foo', num > 42.
 */
export interface TplIfTestCompare {
  type: 'compare';
  left: TplIfTestExpr; // key or literal
  op: TplCompareOp;
  right: TplIfTestExpr; // key or literal (string/number/boolean/null)
  negated: boolean;
}

/**
 * Literal-only truthy test, e.g. {% if 'fixed' %} or {% if 0 %}.
 */
export interface TplIfTestTruthLiteral {
  type: 'truthy-literal';
  value: string | number | boolean | null;
  negated: boolean;
}

/**
 * Logical AND node combining child tests.
 */
export interface TplIfTestAnd {
  type: 'and';
  nodes: TplIfTest[];
}

/**
 * Logical OR node combining child tests.
 */
export interface TplIfTestOr {
  type: 'or';
  nodes: TplIfTest[];
}

/**
 * Logical NOT applied to a child test.
 */
export interface TplIfTestNot {
  type: 'not';
  node: TplIfTest;
}

export type TplIfTest = TplIfTestTruth | TplIfTestTruthLiteral | TplIfTestCompare | TplIfTestAnd | TplIfTestOr | TplIfTestNot;

/**
 * A single elseif branch: test + its child nodes.
 */
export interface TplIfElseIfBranch {
  test: TplIfTest;
  nodes: TplNode[];
}

/**
 * If control node with optional elseif branches and optional else branch.
 */
export interface TplIfNode {
  type: 'if';
  test: TplIfTest;
  consequent: TplNode[];
  elseIfs?: TplIfElseIfBranch[];
  alternate?: TplNode[];
}

/**
 * Each control node used to iterate over arrays in scope.
 * - listExpr: Identifier/dot-path to array
 * - varName: Name of the loop variable introduced in inner scope
 */
export interface TplEachNode {
  type: 'each';
  /** Identifier/dot-path resolving to an Array or an Object. */
  listExpr: string;
  /** Name of the loop variable introduced in the inner scope.
   *  - For arrays: this is the item value
   *  - For objects: this is an object of shape { key, value }
   */
  varName: string;
  /** Optional name for the zero-based index (arrays only). */
  indexVarName?: string;
  children: TplNode[];
}

/** Union of all AST node types. */
export type TplNode = TplTextNode | TplInterpNode | TplIfNode | TplEachNode;

/**
 * Internal base frame while parsing nested structures.
 */
export interface FrameBase {
  parentNodes: TplNode[];
}

/**
 * Parser frame for an if block.
 */
export interface IfFrame extends FrameBase {
  kind: 'if';
  node: TplIfNode;
  inAlternate: boolean;
}

/**
 * Parser frame for an each block.
 */
export interface EachFrame extends FrameBase {
  kind: 'each';
  node: TplEachNode;
}

export type Frame = IfFrame | EachFrame;
