/**
 * Type definitions for Dayjs-like objects.
 *
 * @note These are minimal definitions for internal use only to prevent
 *       requiring the actual Dayjs library as a dependency.
 */
interface DayjsLike {
  isValid: () => boolean;
  format: (formatStr: string) => string;
}

/**
 * Type definition for Dayjs-like function.
 *
 * @note These are minimal definitions for internal use only to prevent
 *       requiring the actual Dayjs library as a dependency.
 */
interface DayjsFnLike {
  (date?: string | number | Date): DayjsLike;
  isDayjs: (arg: unknown) => boolean;
}

/**
 * Type definition for shared references.
 */
interface Refs {
  dayjs: DayjsFnLike | null;
}

/**
 * Shared references used in multiple places.
 */
export const refs: Refs = {
  /**
   * Reference to Dayjs-like library for date formatting in templates.
   * If `null`, a built-in limited date formatting fallback is used.
   */
  dayjs: null,
};

/**
 * Set or clear the Dayjs reference to use in the `dateformat` filter.
 * @param dayjsLib Reference to `dayjs` to set or `null` to clear.
 */
export function setDayjsTemplateReference (dayjsLib: DayjsFnLike | null): void {
  // simple check for Dayjs-like API
  if (dayjsLib !== null && (typeof dayjsLib !== 'function' || !('isDayjs' in dayjsLib))) {
    throw new TypeError('Invalid Dayjs reference');
  }

  refs.dayjs = dayjsLib;
}
