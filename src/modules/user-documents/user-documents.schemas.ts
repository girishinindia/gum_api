// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/user-documents (phase 04).
//
// Mirrors:
//   • udf_get_user_documents
//   • udf_insert_user_document
//   • udf_update_user_document
//   • udf_delete_user_document  (soft-delete)
//   • udf_restore_user_document (admin+ un-soft-delete)
//
// Two schema lanes — the admin lane and the self /me lane — so we
// can lock down the verification workflow. Fields that ONLY an
// admin/verifier can set:
//
//     verificationStatus, verifiedBy, verifiedAt,
//     rejectionReason, adminNotes
//
// Students and instructors on /me can still set every other field,
// including documentNumber, fileUrl, issueDate, expiryDate,
// issuingAuthority, etc. When they do update a document, the UDF
// does NOT auto-reset verification_status to 'pending' — that's
// an explicit call the admin UI makes.
//
// user_documents is 1:M with users and has its own is_active +
// is_deleted columns (soft-delete model). Deleted rows hidden by
// default; admin+ can restore via POST /:id/restore.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  isDeletedFilterSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Enums (match the CHECK constraints in 01_table.sql) ────────

export const USER_DOCUMENT_VERIFICATION_STATUS = [
  'pending',
  'under_review',
  'verified',
  'rejected',
  'expired',
  'reupload'
] as const;
const verificationStatusSchema = z.enum(USER_DOCUMENT_VERIFICATION_STATUS);

// ─── Atoms ───────────────────────────────────────────────────────

const shortText = z.string().trim().min(1).max(255);
const longText = z.string().trim().min(1).max(8000);
const urlText = z.string().trim().min(1).max(2048);

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

const dateTimeSchema = z
  .string()
  .datetime({ message: 'must be an ISO-8601 datetime' });

// ─── Sort allowlist ──────────────────────────────────────────────
// Must stay in sync with udf_get_user_documents' CASE whitelist.

export const USER_DOCUMENT_SORT_TABLES = [
  'udoc',
  'document',
  'document_type',
  'user'
] as const;

export const USER_DOCUMENT_SORT_COLUMNS = [
  // udoc
  'id',
  'document_number',
  'file_format',
  'file_size_kb',
  'issue_date',
  'expiry_date',
  'verification_status',
  'is_active',
  'created_at',
  'updated_at',
  // document / document_type
  'name',
  // user
  'first_name',
  'last_name',
  'email',
  'role'
] as const;

const sortTableSchema = z.enum(USER_DOCUMENT_SORT_TABLES).default('udoc');
const sortColumnSchema = z.enum(USER_DOCUMENT_SORT_COLUMNS).default('id');
const sortDirectionSchema = z
  .enum(['asc', 'desc', 'ASC', 'DESC'])
  .default('DESC')
  .transform((v) => v.toUpperCase() as 'ASC' | 'DESC');

// ─── List query ──────────────────────────────────────────────────

export const listUserDocumentsQuerySchema = paginationSchema.extend({
  userId: bigintIdSchema.optional(),

  // user_document filters
  documentId: bigintIdSchema.optional(),
  documentTypeId: bigintIdSchema.optional(),
  verificationStatus: verificationStatusSchema.optional(),
  fileFormat: z.string().trim().min(1).max(32).optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),

  // User filters
  userRole: z.string().trim().min(2).max(64).optional(),
  userIsActive: queryBooleanSchema.optional(),

  searchTerm: searchTermSchema,
  sortTable: sortTableSchema,
  sortColumn: sortColumnSchema,
  sortDirection: sortDirectionSchema
});
export type ListUserDocumentsQuery = z.infer<typeof listUserDocumentsQuerySchema>;

// ─── Shared self-lane fields (student / instructor) ────────────
//
// These are the fields a user can set for their OWN documents.
// Notice the absence of verification_status / verified_by /
// verified_at / rejection_reason / admin_notes — those live in the
// admin-only field map further down.

const selfFields = {
  documentTypeId: bigintIdSchema,
  documentId: bigintIdSchema,

  documentNumber: shortText.optional(),
  fileName: shortText.optional(),
  fileSizeKb: z.number().int().min(0).max(100_000).optional(),
  fileFormat: z.string().trim().min(1).max(32).optional(),
  issueDate: dateSchema.optional(),
  expiryDate: dateSchema.optional(),
  issuingAuthority: shortText.optional(),
  isActive: z.boolean().optional()
};

// ─── Admin-only field map (verification workflow) ──────────────

const adminOnlyFields = {
  verificationStatus: verificationStatusSchema.optional(),
  verifiedBy: bigintIdSchema.optional(),
  verifiedAt: dateTimeSchema.optional(),
  rejectionReason: longText.optional(),
  adminNotes: longText.optional()
};

// ─── Create body (admin — targets any userId, may set workflow) ─

export const createUserDocumentBodySchema = z
  .object({
    userId: bigintIdSchema,
    ...selfFields,
    ...adminOnlyFields
  })
  .refine(
    (v) => !v.expiryDate || !v.issueDate || new Date(v.expiryDate) >= new Date(v.issueDate),
    { message: 'expiryDate cannot be before issueDate', path: ['expiryDate'] }
  );
export type CreateUserDocumentBody = z.infer<typeof createUserDocumentBodySchema>;

// ─── Create body (/me — userId derived from req.user.id) ───────
// Verification workflow fields are absent from this lane — Zod's
// strict mode would reject them if present. Students and instructors
// cannot self-verify their own documents.

export const createMyUserDocumentBodySchema = z
  .object({ ...selfFields })
  .strict()
  .refine(
    (v) => !v.expiryDate || !v.issueDate || new Date(v.expiryDate) >= new Date(v.issueDate),
    { message: 'expiryDate cannot be before issueDate', path: ['expiryDate'] }
  );
export type CreateMyUserDocumentBody = z.infer<typeof createMyUserDocumentBodySchema>;

// ─── Update body — admin lane (all fields, partial) ────────────

export const updateUserDocumentBodySchema = z.object({
  documentTypeId: bigintIdSchema.optional(),
  documentId: bigintIdSchema.optional(),
  documentNumber: shortText.optional(),
  fileName: shortText.optional(),
  fileSizeKb: z.number().int().min(0).max(100_000).optional(),
  fileFormat: z.string().trim().min(1).max(32).optional(),
  issueDate: dateSchema.optional(),
  expiryDate: dateSchema.optional(),
  issuingAuthority: shortText.optional(),
  isActive: z.boolean().optional(),
  // admin-only workflow fields
  verificationStatus: verificationStatusSchema.optional(),
  verifiedBy: bigintIdSchema.optional(),
  verifiedAt: dateTimeSchema.optional(),
  rejectionReason: longText.optional(),
  adminNotes: longText.optional()
});
// NOTE: No "at-least-one-field" refine here. PATCH /:id accepts
// multipart/form-data with an optional `file` slot, so an empty body is
// legitimate when the caller is only replacing the stored document file.
// The route handler performs the combined `hasTextChange || hasFile`
// check and throws 400 if both are missing.
export type UpdateUserDocumentBody = z.infer<typeof updateUserDocumentBodySchema>;

// ─── Update body — self /me lane (workflow fields blocked) ─────
// .strict() makes Zod reject unknown keys with a clean 400 rather
// than silently dropping them — so a student can't smuggle
// verificationStatus into PATCH /me/:id.

export const updateMyUserDocumentBodySchema = z
  .object({
    documentTypeId: bigintIdSchema.optional(),
    documentId: bigintIdSchema.optional(),
    documentNumber: shortText.optional(),
    fileName: shortText.optional(),
    fileSizeKb: z.number().int().min(0).max(100_000).optional(),
    fileFormat: z.string().trim().min(1).max(32).optional(),
    issueDate: dateSchema.optional(),
    expiryDate: dateSchema.optional(),
    issuingAuthority: shortText.optional(),
    isActive: z.boolean().optional()
  })
  .strict();
// Same rationale as above — PATCH /me/:id accepts `file` slot; the
// route handler enforces `hasTextChange || hasFile`.
export type UpdateMyUserDocumentBody = z.infer<typeof updateMyUserDocumentBodySchema>;
