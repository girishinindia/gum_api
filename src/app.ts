import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { activityLogger } from './middleware/activityLogger';

import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import roleRoutes from './modules/roles/role.routes';
import permissionRoutes from './modules/permissions/permission.routes';
import countryRoutes from './modules/countries/country.routes';
import activityLogRoutes from './modules/activity-logs/activityLog.routes';
import profileRoutes from './modules/profile/profile.routes';

const app = express();

// ── Security ──
app.use(helmet());
app.use(hpp());
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── CORS ──
app.use(cors({
  origin: config.cors.origins.includes('*') ? '*' : config.cors.origins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-recaptcha-token'],
}));

// ── Rate Limiting ──
app.use(rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max, standardHeaders: true, legacyHeaders: false }));

// ── Activity Logger ──
app.use(activityLogger);

// ── Health Check ──
app.get('/health', (_req, res) => res.json({ status: 'ok', app: config.appName, version: config.apiVersion, timestamp: new Date().toISOString() }));

// ── API Routes ──
const api = `/api/${config.apiVersion}`;
app.use(`${api}/auth`,         authRoutes);
app.use(`${api}/users`,        userRoutes);
app.use(`${api}/profile`,      profileRoutes);
app.use(`${api}/roles`,        roleRoutes);
app.use(`${api}/permissions`,  permissionRoutes);
app.use(`${api}/countries`,    countryRoutes);
app.use(`${api}/activity-logs`, activityLogRoutes);

// ── 404 ──
app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

// ── Global Error Handler ──
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status || 500;
  const message = config.env === 'production' ? 'Internal server error' : err.message;
  if (status >= 500) console.error('[ERROR]', err);
  res.status(status).json({ success: false, error: message });
});

export default app;
