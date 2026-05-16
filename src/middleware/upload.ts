import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf', 'text/html'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type ${file.mimetype} not allowed`));
  },
});

// ──────────────────────────────────────────────────────────────────
// coerceNullStrings
// ──────────────────────────────────────────────────────────────────
// multipart/form-data has no native null type, so the web + Flutter
// clients ship the literal string "null" to mean "explicitly clear this
// field". Without this middleware, the "null" string is forwarded into
// Zod and then into Postgres, where nullable date / numeric / enum
// columns reject it with errors like:
//
//   invalid input syntax for type date: "null"
//
// Mount this AFTER multer's upload.* call on any multipart route whose
// body fields can include nullable scalars. It walks req.body (one
// level deep — multipart bodies are flat by construction) and replaces
// every value that is exactly the string "null" with real null. Empty
// strings are LEFT ALONE because they are legitimate values for text
// columns. Existing file uploads on req.file / req.files are untouched.
//
// JSON routes don't need this — they can already send native null.
export function coerceNullStrings(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    for (const key of Object.keys(req.body)) {
      if (req.body[key] === 'null') req.body[key] = null;
    }
  }
  next();
}
