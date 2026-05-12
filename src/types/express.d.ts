/**
 * Express type augmentation
 * ─────────────────────────
 * Narrows ParamsDictionary values from `string | string[]` to `string`.
 *
 * Express route params are always strings (never arrays) for named params
 * like `:id`, `:slug`, etc. The `string[]` type in the default definition
 * comes from Express 5 forward-compatibility but doesn't apply to our
 * Express 4 usage. This eliminates 635+ TS2345 errors across controllers.
 */

import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface ParamsDictionary {
    [key: string]: string;
  }
}
