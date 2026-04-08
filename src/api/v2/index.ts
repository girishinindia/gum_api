import { Router } from 'express';

const v2Router = Router();

v2Router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'API v2 is available',
    data: {
      version: 'v2',
      note: 'Add new controllers/routes here while reusing services from modules/.'
    }
  });
});

export { v2Router };
