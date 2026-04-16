import { Response } from 'express';

export const ok = (res: Response, data: any = null, message = 'Success', code = 200) => {
  const body: any = { success: true, message };
  if (data !== null) body.data = data;
  return res.status(code).json(body);
};

export const err = (res: Response, message = 'Something went wrong', code = 500, details?: any) => {
  const body: any = { success: false, error: message };
  if (details) body.details = details;
  return res.status(code).json(body);
};

export const paginated = (res: Response, data: any[], total: number, page: number, limit: number) =>
  res.status(200).json({ success: true, data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
