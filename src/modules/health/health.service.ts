import { env } from '../../config/env';

class HealthService {
  getSnapshot() {
    return {
      app: env.APP_NAME,
      env: env.NODE_ENV,
      apiVersion: env.API_VERSION,
      timezone: env.TIMEZONE,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime())
    };
  }
}

export const healthService = new HealthService();
