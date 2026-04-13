// ═══════════════════════════════════════════════════════════════
// upload — multer multipart middlewares used by file-upload routes.
//
// Philosophy:
//   • multer.memoryStorage so the buffer stays in-process and we can
//     hand it directly to sharp / bunnyStorageService — no temp files.
//   • A thin wrapper translates multer's MulterError objects into
//     AppError(400, BAD_REQUEST) so they flow through the standard
//     error-handler envelope instead of leaking multer's shape.
//   • One factory per file-shape (size + MIME allowlist) so each
//     route gets a tuned, self-documenting middleware.
//
// To add a new upload shape (e.g. user avatar), call
//   `singleFileUpload({ field, maxBytes, mimeAllowlist })`
// and export the result.
// ═══════════════════════════════════════════════════════════════

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer, { MulterError } from 'multer';

import { AppError } from '../errors/app-error';

// ─── Internal helper ────────────────────────────────────────────

interface SingleFileUploadOptions {
  /**
   * Form-data field name(s) the file may arrive under.
   *
   * Pass a single string for the canonical field name, OR an array
   * whose first entry is the canonical name and whose remaining
   * entries are accepted aliases. The first matching file is promoted
   * to `req.file` so the downstream handler doesn't need to care
   * which alias the client used.
   */
  field: string | readonly [string, ...string[]];
  /** Hard upper bound on the upload, in bytes. */
  maxBytes: number;
  /** MIME types we accept; everything else gets rejected at the wire. */
  mimeAllowlist: readonly string[];
  /** Used in user-facing error messages — e.g. "Flag image". */
  label: string;
}

/**
 * Build a single-file multer middleware that:
 *   1. enforces a per-file size cap (in bytes),
 *   2. rejects MIME types outside the allowlist,
 *   3. converts every multer failure into a 400 AppError.
 */
const singleFileUpload = (opts: SingleFileUploadOptions): RequestHandler => {
  const { field, maxBytes, mimeAllowlist, label } = opts;

  // Normalize: a single canonical name OR an array [canonical, ...aliases].
  const fieldNames: readonly string[] =
    typeof field === 'string' ? [field] : field;
  const canonicalField = fieldNames[0];

  // Track MIME-filter rejections separately from unexpected-field
  // rejections so we can return distinct 400 messages at the end.
  // (multer collapses both failure shapes into LIMIT_UNEXPECTED_FILE,
  // which made the old error say "MIME wrong" even when the real
  // problem was the field name.)
  const MIME_FAIL_FLAG = Symbol('mimeFailed');
  interface FilterState { [MIME_FAIL_FLAG]?: boolean }

  const handler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (req, file, cb) => {
      if (!fieldNames.includes(file.fieldname)) {
        cb(new MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
        return;
      }
      if (!mimeAllowlist.includes(file.mimetype)) {
        (req as unknown as FilterState)[MIME_FAIL_FLAG] = true;
        cb(new MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
        return;
      }
      cb(null, true);
    }
    // .any() so multer will accept a file under any of our aliases.
    // Field-name enforcement happens in fileFilter above.
  }).any();

  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (err: unknown) => {
      if (!err) {
        // Promote the first file from `req.files` into `req.file` so
        // downstream handlers keep their existing shape. Only one file
        // is possible here (limits.files = 1).
        const files = req.files as Express.Multer.File[] | undefined;
        if (Array.isArray(files) && files.length > 0) {
          req.file = files[0];
        }
        next();
        return;
      }

      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          next(
            AppError.badRequest(
              `${label} must not exceed ${Math.round(maxBytes / 1024)} KB`,
              { field: canonicalField, maxBytes }
            )
          );
          return;
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          const mimeFailed =
            (req as unknown as FilterState)[MIME_FAIL_FLAG] === true;
          if (mimeFailed) {
            next(
              AppError.badRequest(
                `${label} must be one of: ${mimeAllowlist.join(', ')}`,
                { field: canonicalField, allowed: mimeAllowlist }
              )
            );
            return;
          }
          // Wrong field name (or extra file). Tell the caller exactly
          // which field name(s) are accepted — this is the common
          // "why is my upload 400'ing?" pitfall.
          const accepted =
            fieldNames.length === 1
              ? `"${canonicalField}"`
              : fieldNames.map((f) => `"${f}"`).join(' or ');
          next(
            AppError.badRequest(
              `${label} must be uploaded under form-data field ${accepted} (received field: "${err.field ?? 'unknown'}")`,
              {
                expectedField: canonicalField,
                acceptedFields: fieldNames,
                receivedField: err.field ?? null
              }
            )
          );
          return;
        }
        next(AppError.badRequest(`Upload failed: ${err.message}`, { code: err.code }));
        return;
      }

      next(err);
    });
  };
};

// ─── Phase-02 single-file upload defaults ───────────────────────
//
// Shared MIME / byte-cap constants reused by the remaining
// `POST /:id/icon` endpoints on learning-goals and social-medias
// (neither has been unified into PATCH yet) AND by the multi-slot
// factory below.

const PHASE2_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
const PHASE2_IMAGE_MAX_BYTES = 100 * 1024; // 100 KB

/** `POST /api/v1/learning-goals/:id/icon` */
export const uploadLearningGoalIcon = singleFileUpload({
  field: 'file',
  maxBytes: PHASE2_IMAGE_MAX_BYTES,
  mimeAllowlist: PHASE2_IMAGE_MIMES,
  label: 'Learning goal icon'
});

/** `POST /api/v1/social-medias/:id/icon` */
export const uploadSocialMediaIcon = singleFileUpload({
  field: 'file',
  maxBytes: PHASE2_IMAGE_MAX_BYTES,
  mimeAllowlist: PHASE2_IMAGE_MIMES,
  label: 'Social media icon'
});

// NOTE: The previously-exported single-file factories for countries,
// specializations, categories and sub-categories were deleted when
// their routes were unified into PATCH /:id. If you need to re-add a
// standalone icon/image endpoint for any of those resources, prefer
// adding it to the PATCH multi-slot factory instead.

// ─── Unified PATCH multi-slot upload ────────────────────────────
//
// Some PATCH routes (countries / categories / sub-categories /
// specializations) accept BOTH text field updates AND optional image
// uploads in a single multipart/form-data body. The single-file factory
// above is insufficient because:
//   • categories / sub-categories have two image slots (icon + image)
//     that must be distinguishable by field name,
//   • the middleware must accept `application/json` bodies unchanged
//     (multer is a no-op on non-multipart content-types),
//   • each slot may want its own MIME allowlist / byte cap / label.
//
// `multiSlotUpload` stores files grouped by slot on `req.slotFiles`
// (e.g. `{ icon: file | undefined, image: file | undefined }`) so the
// downstream handler can branch on presence without re-parsing field
// names. Use `getSlotFile(req, 'icon')` to read in a type-safe way.

interface SlotOptions {
  /** Canonical form-data field name, or [canonical, ...aliases]. */
  field: string | readonly [string, ...string[]];
  /** Hard upper bound on the uploaded bytes for THIS slot. */
  maxBytes: number;
  /** MIME types accepted for THIS slot. */
  mimeAllowlist: readonly string[];
  /** User-facing label — e.g. "Category icon". */
  label: string;
}

interface MultiSlotUploadOptions {
  slots: Readonly<Record<string, SlotOptions>>;
}

const MULTI_SLOT_STATE = Symbol('multiSlotState');
interface MultiSlotFilterState {
  mimeFailedField?: string;
  mimeFailedSlot?: string;
}

/**
 * Build a multi-slot multer middleware where each slot has its own
 * field-name aliases, MIME allowlist, size cap and label.
 *
 * On success: `req.slotFiles[<slotName>]` is the uploaded file (or
 * `undefined` if that slot was omitted). The middleware is a no-op
 * when the request is not multipart/form-data (so JSON PATCH bodies
 * flow through unchanged).
 */
const multiSlotUpload = (opts: MultiSlotUploadOptions): RequestHandler => {
  const { slots } = opts;
  const slotNames = Object.keys(slots);

  // fieldName → slotName (all aliases flattened)
  const fieldToSlot = new Map<string, string>();
  for (const [slotName, cfg] of Object.entries(slots)) {
    const names: readonly string[] =
      typeof cfg.field === 'string' ? [cfg.field] : cfg.field;
    for (const name of names) {
      if (fieldToSlot.has(name)) {
        throw new Error(
          `multiSlotUpload: field name "${name}" is reused across slots`
        );
      }
      fieldToSlot.set(name, slotName);
    }
  }
  const allFieldNames = Array.from(fieldToSlot.keys());

  // Global byte cap for multer — we re-check per slot after parsing.
  const globalMaxBytes = Math.max(
    ...Object.values(slots).map((s) => s.maxBytes)
  );

  const handler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: globalMaxBytes, files: slotNames.length },
    fileFilter: (req, file, cb) => {
      const slotName = fieldToSlot.get(file.fieldname);
      if (!slotName) {
        cb(new MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
        return;
      }
      const slot = slots[slotName];
      if (!slot.mimeAllowlist.includes(file.mimetype)) {
        const state = ((req as unknown as Record<symbol, MultiSlotFilterState>)[
          MULTI_SLOT_STATE
        ] ??= {});
        state.mimeFailedField = file.fieldname;
        state.mimeFailedSlot = slotName;
        cb(new MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
        return;
      }
      cb(null, true);
    }
  }).any();

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip multer entirely for non-multipart requests (e.g. plain JSON).
    // Without this guard multer throws "Multipart: Boundary not found".
    const ct = req.headers['content-type'] ?? '';
    if (!ct.startsWith('multipart/')) {
      // Still initialize empty slotFiles so handlers can safely read slots.
      (
        req as unknown as {
          slotFiles: Record<string, Express.Multer.File | undefined>;
        }
      ).slotFiles = Object.fromEntries(slotNames.map((s) => [s, undefined]));
      next();
      return;
    }

    handler(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof MulterError) {
          const state = (req as unknown as Record<symbol, MultiSlotFilterState>)[
            MULTI_SLOT_STATE
          ];
          if (err.code === 'LIMIT_FILE_SIZE') {
            const slotName = fieldToSlot.get(err.field ?? '');
            const slot = slotName ? slots[slotName] : undefined;
            const maxKb = Math.round(
              (slot?.maxBytes ?? globalMaxBytes) / 1024
            );
            const label = slot?.label ?? 'Upload';
            next(
              AppError.badRequest(`${label} must not exceed ${maxKb} KB`, {
                field: err.field ?? null,
                maxBytes: slot?.maxBytes ?? globalMaxBytes
              })
            );
            return;
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            if (state?.mimeFailedField === err.field && state.mimeFailedSlot) {
              const slot = slots[state.mimeFailedSlot];
              next(
                AppError.badRequest(
                  `${slot.label} must be one of: ${slot.mimeAllowlist.join(', ')}`,
                  { field: err.field, allowed: slot.mimeAllowlist }
                )
              );
              return;
            }
            const accepted = allFieldNames.map((f) => `"${f}"`).join(' or ');
            next(
              AppError.badRequest(
                `File upload must use form-data field ${accepted} (received field: "${err.field ?? 'unknown'}")`,
                {
                  acceptedFields: allFieldNames,
                  receivedField: err.field ?? null
                }
              )
            );
            return;
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            next(
              AppError.badRequest(
                `Too many files uploaded — at most ${slotNames.length} allowed`,
                { maxFiles: slotNames.length }
              )
            );
            return;
          }
          next(
            AppError.badRequest(`Upload failed: ${err.message}`, {
              code: err.code
            })
          );
          return;
        }
        next(err);
        return;
      }

      // Success path — organize files by slot. Requests that were not
      // multipart will have `req.files` undefined; we still set an empty
      // `req.slotFiles` so handlers can safely destructure.
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const slotFiles: Record<string, Express.Multer.File | undefined> = {};
      for (const slotName of slotNames) slotFiles[slotName] = undefined;

      for (const file of files) {
        const slotName = fieldToSlot.get(file.fieldname);
        if (!slotName) continue; // fileFilter would have rejected this
        const slot = slots[slotName];
        if (file.size > slot.maxBytes) {
          next(
            AppError.badRequest(
              `${slot.label} must not exceed ${Math.round(slot.maxBytes / 1024)} KB`,
              { field: file.fieldname, maxBytes: slot.maxBytes }
            )
          );
          return;
        }
        if (slotFiles[slotName]) {
          next(
            AppError.badRequest(
              `Only one file is allowed for ${slot.label}`,
              { field: file.fieldname }
            )
          );
          return;
        }
        slotFiles[slotName] = file;
      }

      (
        req as unknown as {
          slotFiles: Record<string, Express.Multer.File | undefined>;
        }
      ).slotFiles = slotFiles;
      next();
    });
  };
};

/**
 * Type-safe reader for a slot file set by `multiSlotUpload`. Returns
 * `undefined` if the middleware wasn't used or the slot was omitted.
 */
export const getSlotFile = (
  req: Request,
  slot: string
): Express.Multer.File | undefined => {
  const bag = (
    req as unknown as {
      slotFiles?: Record<string, Express.Multer.File | undefined>;
    }
  ).slotFiles;
  return bag?.[slot];
};

// ─── Per-resource PATCH upload middlewares ──────────────────────
//
// Each of the four resources below has a PATCH handler that accepts
// text-field updates AND optional image uploads in the same request.
// On JSON requests these middlewares no-op; on multipart they populate
// `req.slotFiles`.

/** `PATCH /api/v1/countries/:id` — optional flag slot (25 KB). */
export const patchCountryFiles = multiSlotUpload({
  slots: {
    flag: {
      field: ['flag', 'flagImage', 'file'],
      maxBytes: 25 * 1024,
      mimeAllowlist: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
      label: 'Country flag'
    }
  }
});

/** `PATCH /api/v1/categories/:id` — optional icon + image slots. */
export const patchCategoryFiles = multiSlotUpload({
  slots: {
    icon: {
      field: ['icon', 'iconImage'],
      maxBytes: PHASE2_IMAGE_MAX_BYTES,
      mimeAllowlist: PHASE2_IMAGE_MIMES,
      label: 'Category icon'
    },
    image: {
      field: ['image', 'categoryImage'],
      maxBytes: PHASE2_IMAGE_MAX_BYTES,
      mimeAllowlist: PHASE2_IMAGE_MIMES,
      label: 'Category image'
    }
  }
});

/** `PATCH /api/v1/sub-categories/:id` — optional icon + image slots. */
export const patchSubCategoryFiles = multiSlotUpload({
  slots: {
    icon: {
      field: ['icon', 'iconImage'],
      maxBytes: PHASE2_IMAGE_MAX_BYTES,
      mimeAllowlist: PHASE2_IMAGE_MIMES,
      label: 'Sub-category icon'
    },
    image: {
      field: ['image', 'subCategoryImage'],
      maxBytes: PHASE2_IMAGE_MAX_BYTES,
      mimeAllowlist: PHASE2_IMAGE_MIMES,
      label: 'Sub-category image'
    }
  }
});

/** `PATCH /api/v1/specializations/:id` — optional icon slot only. */
export const patchSpecializationFiles = multiSlotUpload({
  slots: {
    icon: {
      field: ['icon', 'iconImage', 'file'],
      maxBytes: PHASE2_IMAGE_MAX_BYTES,
      mimeAllowlist: PHASE2_IMAGE_MIMES,
      label: 'Specialization icon'
    }
  }
});
