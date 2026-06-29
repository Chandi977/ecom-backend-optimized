import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { isRedisReady } from '../../utils/redis';

const router = Router();

// Liveness — fast, dependency-free. Used by load balancers / PM2.
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).send('OK');
});

// Readiness — reports the status of backing services. Redis is treated as a
// soft dependency (cache degrades gracefully), so it does not fail readiness;
// MongoDB is required.
router.get('/health/ready', (_req: Request, res: Response) => {
  const mongoUp = mongoose.connection.readyState === 1;
  const redisUp = isRedisReady();
  res.status(mongoUp ? 200 : 503).json({
    status: mongoUp ? 'ready' : 'degraded',
    services: {
      mongo: mongoUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
