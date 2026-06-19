import { Request, Response } from 'express';
import multer from 'multer';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';
import { processAndUploadImage, uploadRawFile } from '../../services/storage.service';

const TABLE = 'chat_attachments';

/** Memory-storage uploader with a 25 MB cap for standalone attachment uploads. */
export const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ── GET /chat-attachments/message/:messageId ──
export async function listByMessage(req: Request, res: Response) {
  const messageId = parseInt(req.params.messageId);
  if (!messageId) return err(res, 'messageId is required', 400);
  const { data, error: e } = await supabase
    .from(TABLE)
    .select('*')
    .eq('message_id', messageId)
    .order('id', { ascending: true });
  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}

// ── GET /chat-attachments/:id ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select('*').eq('id', req.params.id).maybeSingle();
  if (e) return err(res, e.message, 500);
  if (!data) return err(res, 'Attachment not found', 404);
  return ok(res, data);
}

// ── POST /chat-attachments ── (attach a file to an existing message)
export async function create(req: Request, res: Response) {
  const messageId = parseInt(req.body?.message_id);
  if (!messageId) return err(res, 'message_id is required', 400);
  if (!req.file) return err(res, 'No file uploaded (field "attachment")', 400);

  const { data: msg } = await supabase
    .from('chat_messages')
    .select('id, room_id')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg) return err(res, 'Message not found', 404);

  const isImage = (req.file.mimetype || '').startsWith('image/');
  const safeName = (req.file.originalname || 'file').replace(/[^\w.\-]+/g, '_');
  const path = `chat/attachments/${msg.room_id}/${Date.now()}-${safeName}`;

  let cdnUrl: string | null = null;
  try {
    cdnUrl = isImage
      ? await processAndUploadImage(req.file.buffer, path)
      : await uploadRawFile(req.file.buffer, path);
  } catch {
    return err(res, 'File upload failed', 502);
  }
  if (!cdnUrl) return err(res, 'File upload failed', 502);

  const { data, error: e } = await supabase
    .from(TABLE)
    .insert({
      message_id: messageId,
      file_name: req.file.originalname,
      file_url: cdnUrl,
      file_size: req.file.size,
      file_type: req.file.mimetype,
      uploaded_by: req.user!.id,
    })
    .select('*')
    .single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Attachment added', 201);
}

// ── DELETE /chat-attachments/:id ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: att } = await supabase.from(TABLE).select('id').eq('id', id).maybeSingle();
  if (!att) return err(res, 'Attachment not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);
  return ok(res, null, 'Attachment deleted');
}
