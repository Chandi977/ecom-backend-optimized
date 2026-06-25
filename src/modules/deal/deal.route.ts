import { Router } from 'express';
import { createDeal, getAllDeals, getDeal, updateDeal, deleteDeal, allDeals, countDeals, searchDeals } from './deal.controller';
import { adminMiddleware, validate } from '../../middleware';
import { createDealSchema, updateDealSchema, deleteDealSchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/deal/create', adminMiddleware, validate(createDealSchema), createDeal);
router.get('/deal/get', getAllDeals);
router.get('/deal/get/:id', getDeal);
router.put('/deal/update', adminMiddleware, validate(updateDealSchema), updateDeal);
router.post('/deal/delete', adminMiddleware, validate(deleteDealSchema), deleteDeal);
router.get('/deal/all', allDeals);
router.get('/deal/search', searchDeals);
router.get('/deal/count', countDeals);

export default router;
