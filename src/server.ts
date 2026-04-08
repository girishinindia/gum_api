import { app } from './app';
import { env } from './config/env';
import { logger } from './core/logger/logger';

app.listen(env.PORT, () => {
  logger.info(`${env.APP_NAME} is running on port ${env.PORT}`);
  logger.info(`Base URL: ${env.APP_URL}`);
});
