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

      // busboy throws a plain Error when Content-Type says multipart
      // but the body has no boundary (e.g. manual header override).
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('Boundary not found')) {
        next(
          AppError.badRequest(
            'Content-Type is multipart/form-data but no valid boundary was found. ' +
            'Send JSON with Content-Type: application/json, or use proper form-data encoding.'
          )
        );
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

// ─── Phase-02 shared image constants ────────────────────────────

const PHASE2_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
const PHASE2_IMAGE_MAX_BYTES = 100 * 1024; // 100 KB

// Phase 4 — user profile photos / cover photos.
// Larger cap (500 KB) since these are larger user-facing images.
const PHASE4_PHOTO_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const PHASE4_PHOTO_MAX_BYTES = 500 * 1024; // 500 KB

// Phase 4 / 6 — user document file uploads (resumes, certificates, IDs).
// Accepts PDF and common image formats.
const PHASE4_DOC_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] as const;
const PHASE4_DOC_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

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

  // Helper: initialize empty slotFiles so downstream handlers can
  // safely call `getSlotFile(req, ...)` without null-checks.
  const initEmptySlots = (req: Request): void => {
    (
      req as unknown as {
        slotFiles: Record<string, Express.Multer.File | undefined>;
      }
    ).slotFiles = Object.fromEntries(slotNames.map((s) => [s, undefined]));
  };

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip multer entirely for non-multipart requests (plain JSON, urlencoded, etc.).
    const ct = req.headers['content-type'] ?? '';
    if (!ct.startsWith('multipart/')) {
      initEmptySlots(req);
      next();
      return;
    }

    handler(req, res, (err: unknown) => {
      if (err) {
        // busboy throws a plain Error (not MulterError) when the
        // Content-Type header says multipart but the body has no
        // boundary — e.g. a client that manually sets the header
        // to "multipart/form-data" while sending raw JSON.
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('Boundary not found')) {
          initEmptySlots(req);
          next(
            AppError.badRequest(
              'Content-Type is multipart/form-data but no valid boundary was found. ' +
              'Send JSON with Content-Type: application/json, or use proper form-data encoding.'
            )
          );
          return;
        }

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

// ─── Per-resource upload middlewares (POST + PATCH) ─────────────
//
// Reused by both POST (create with optional file) and PATCH (update
// with optional file) handlers. On JSON requests these middlewares
// no-op; on multipart they populate `req.slotFiles`.
//
// Alias convention: every icon slot accepts ['icon', 'iconImage', 'file'].
// Image slots accept ['image', '<resource>Image']. The `file` alias is
// deliberately reserved for the icon slot only (single-image resources).

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
      field: ['icon', 'iconImage', 'file'],
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
      field: ['icon', 'iconImage', 'file'],
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

/** `PATCH /api/v1/skills/:id` — optional icon slot only. */
export const patchSkillFiles = multiSlotUpload({
  slots: {
    icon: {
      field: ['icon', 'iconImage', 'file'],
      maxBytes: PHASE2_IMAGE_MAX_BYTES,
      mimeAllowlist: PHASE2_IMAGE_MIMES,
      label: 'Skill icon'
    }
  }
});

/** `PATCH /api/v1/learning-goals/:id` — optional icon slot only. */
export const patchLearningGoalFiles = multiSlotUpload({
  slots: {
    icon: {
      field: ['icon', 'iconImage', 'file'],
      maxBytes: PHASE2_IMAGE_MAX_BYTES,
      mimeAllowlist: PHASE2_IMAGE_MIMES,
      label: 'Learning goal icon'
    }
  }
});

/** `PATCH /api/v1/social-medias/:id` — optional icon slot only. */
export const patchSocialMediaFiles = multiSlotUpload({
  slots: {
    icon: {
      field: ['icon', 'iconImage', 'file'],
      maxBytes: PHASE2_IMAGE_MAX_BYTES,
      mimeAllowlist: PHASE2_IMAGE_MIMES,
      label: 'Social media icon'
    }
  }
});

// ─── Phase 04 — user profile upload middlewares ────────────────

/**
 * `POST/PATCH /api/v1/user-profiles` and `/me` — accepts text fields
 * plus optional `profilePhoto` and `coverPhoto` slots.
 */
export const patchUserProfileFiles = multiSlotUpload({
  slots: {
    profilePhoto: {
      field: ['profilePhoto', 'profilePhotoImage', 'avatar'],
      maxBytes: PHASE4_PHOTO_MAX_BYTES,
      mimeAllowlist: PHASE4_PHOTO_MIMES,
      label: 'Profile photo'
    },
    coverPhoto: {
      field: ['coverPhoto', 'coverPhotoImage', 'cover'],
      maxBytes: PHASE4_PHOTO_MAX_BYTES,
      mimeAllowlist: PHASE4_PHOTO_MIMES,
      label: 'Cover photo'
    }
  }
});

/**
 * `POST/PATCH /api/v1/user-documents` — accepts text fields plus
 * an optional `file` slot (PDF or image, up to 5 MB).
 */
export const patchUserDocumentFiles = multiSlotUpload({
  slots: {
    file: {
      field: ['file', 'document', 'attachment'],
      maxBytes: PHASE4_DOC_MAX_BYTES,
      mimeAllowlist: PHASE4_DOC_MIMES,
      label: 'Document file'
    }
  }
});

/**
 * `POST/PATCH /api/v1/student-profiles` and `/me` — accepts text
 * fields plus an optional `resume` slot (PDF or image, up to 5 MB).
 */
export const patchStudentProfileFiles = multiSlotUpload({
  slots: {
    resume: {
      field: ['resume', 'resumeFile', 'file'],
      maxBytes: PHASE4_DOC_MAX_BYTES,
      mimeAllowlist: PHASE4_DOC_MIMES,
      label: 'Resume file'
    }
  }
});

// ─── Phase 08 — material management translation images ─────────
//
// Subject / chapter / topic / sub-topic translations each carry four
// image slots (icon, image, ogImage, twitterImage). Same allowlist as
// phase-02 images; same 100 KB cap (IMAGE_MAX_BYTES in bunny-image-pipeline).
// All four slots are optional — POST/PATCH bodies can omit any or all.

const PHASE8_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
const PHASE8_IMAGE_MAX_BYTES = 200 * 1024; // 200 KB on the raw upload; sharp re-encodes to ≤100 KB

const phase8TranslationSlots = (resourceLabel: string) => ({
  icon: {
    field: ['icon', 'iconImage'] as const,
    maxBytes: PHASE8_IMAGE_MAX_BYTES,
    mimeAllowlist: PHASE8_IMAGE_MIMES,
    label: `${resourceLabel} translation icon`
  },
  image: {
    field: ['image', 'heroImage'] as const,
    maxBytes: PHASE8_IMAGE_MAX_BYTES,
    mimeAllowlist: PHASE8_IMAGE_MIMES,
    label: `${resourceLabel} translation image`
  },
  ogImage: {
    field: ['ogImage', 'og_image'] as const,
    maxBytes: PHASE8_IMAGE_MAX_BYTES,
    mimeAllowlist: PHASE8_IMAGE_MIMES,
    label: `${resourceLabel} translation OG image`
  },
  twitterImage: {
    field: ['twitterImage', 'twitter_image'] as const,
    maxBytes: PHASE8_IMAGE_MAX_BYTES,
    mimeAllowlist: PHASE8_IMAGE_MIMES,
    label: `${resourceLabel} translation Twitter image`
  }
});

/** `POST/PATCH /api/v1/subjects/:id/translations[/:tid]` — 4 image slots. */
export const patchSubjectTranslationFiles = multiSlotUpload({
  slots: phase8TranslationSlots('Subject')
});

/** `POST/PATCH /api/v1/chapters/:id/translations[/:tid]` — 4 image slots. */
export const patchChapterTranslationFiles = multiSlotUpload({
  slots: phase8TranslationSlots('Chapter')
});

/** `POST/PATCH /api/v1/topics/:id/translations[/:tid]` — 4 image slots. */
export const patchTopicTranslationFiles = multiSlotUpload({
  slots: phase8TranslationSlots('Topic')
});

/** `POST/PATCH /api/v1/sub-topics/:id/translations[/:tid]` — 4 image slots. */
export const patchSubTopicTranslationFiles = multiSlotUpload({
  slots: phase8TranslationSlots('Sub-topic')
});
