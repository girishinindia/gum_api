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
  /** Form-data field name (multipart) the file arrives under. */
  field: string;
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

  const handler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!mimeAllowlist.includes(file.mimetype)) {
        cb(
          new MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname)
        );
        return;
      }
      cb(null, true);
    }
  }).single(field);

  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }

      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          next(
            AppError.badRequest(
              `${label} must not exceed ${Math.round(maxBytes / 1024)} KB`,
              { field, maxBytes }
            )
          );
          return;
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          // Either the field name is wrong OR the MIME failed the allowlist
          // (we re-use this code from fileFilter above for a single 400 path).
          next(
            AppError.badRequest(
              `${label} must be one of: ${mimeAllowlist.join(', ')}`,
              { field, allowed: mimeAllowlist }
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

// ─── Country flag upload ────────────────────────────────────────

/**
 * `POST /api/v1/countries/:id/flag`
 *
 * Hard limits enforced here (before sharp ever runs):
 *   • field name:   `file`
 *   • max size:     25 KB
 *   • MIME allowed: PNG / JPEG / WebP / SVG
 *
 * The 90×90 dimension check is enforced *inside* the service, after
 * sharp has actually decoded the buffer — multer cannot inspect pixels.
 */
export const uploadCountryFlag = singleFileUpload({
  field: 'file',
  maxBytes: 25 * 1024, // 25 KB
  mimeAllowlist: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  label: 'Flag image'
});

// ─── Specialization icon upload ─────────────────────────────────

/**
 * `POST /api/v1/specializations/:id/icon`
 *
 * Hard limits enforced here (before sharp ever runs):
 *   • field name:   `file`
 *   • max size:     100 KB (final WebP is re-checked in the service)
 *   • MIME allowed: PNG / JPEG / WebP / SVG
 *
 * Unlike country flags there is no enforced pixel dimension — instructor
 * icons are expected to be square-ish but the service only resizes to fit
 * 256×256 and enforces the 100 KB byte cap on the re-encoded WebP.
 */
export const uploadSpecializationIcon = singleFileUpload({
  field: 'file',
  maxBytes: 100 * 1024, // 100 KB hard upper bound on the uploaded bytes
  mimeAllowlist: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  label: 'Specialization icon'
});

// ─── Phase-02 batch-3 uploads (WebP + ≤100 KB via bunny-image-pipeline) ──
//
// All six middlewares below share the same contract as
// uploadSpecializationIcon:
//   • field name:   `file`
//   • max raw size: 100 KB (service re-checks the final WebP)
//   • MIME allowed: PNG / JPEG / WebP / SVG
//
// Icons resize into a 256×256 box; images resize into a 512×512 box.
// That policy lives in the service layer (`bunny-image-pipeline`), so
// the multer layer only enforces the upload-time guarantees above.

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

/** `POST /api/v1/categories/:id/icon` */
export const uploadCategoryIcon = singleFileUpload({
  field: 'file',
  maxBytes: PHASE2_IMAGE_MAX_BYTES,
  mimeAllowlist: PHASE2_IMAGE_MIMES,
  label: 'Category icon'
});

/** `POST /api/v1/categories/:id/image` */
export const uploadCategoryImage = singleFileUpload({
  field: 'file',
  maxBytes: PHASE2_IMAGE_MAX_BYTES,
  mimeAllowlist: PHASE2_IMAGE_MIMES,
  label: 'Category image'
});

/** `POST /api/v1/sub-categories/:id/icon` */
export const uploadSubCategoryIcon = singleFileUpload({
  field: 'file',
  maxBytes: PHASE2_IMAGE_MAX_BYTES,
  mimeAllowlist: PHASE2_IMAGE_MIMES,
  label: 'Sub-category icon'
});

/** `POST /api/v1/sub-categories/:id/image` */
export const uploadSubCategoryImage = singleFileUpload({
  field: 'file',
  maxBytes: PHASE2_IMAGE_MAX_BYTES,
  mimeAllowlist: PHASE2_IMAGE_MIMES,
  label: 'Sub-category image'
});
