import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export function createContextLogger(context: {
  projectId?: string;
  sceneId?: string;
  jobId?: string;
  userId?: string;
  provider?: string;
}) {
  return logger.child(context);
}

