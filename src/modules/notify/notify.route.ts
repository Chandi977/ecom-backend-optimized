import { Router } from 'express';
import { createNotify, getNotify, countNotifies } from './notify.controller';
import { adminMiddleware, validate } from '../../middleware';
import { createNotifySchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/notify/create', validate(createNotifySchema), createNotify);
router.get('/notify/get', adminMiddleware, getNotify);
router.get('/notify/count', adminMiddleware, countNotifies);

export default router;
