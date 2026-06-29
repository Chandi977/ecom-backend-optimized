import { Router } from 'express';
import {
  createVariant,
  getVariant,
  updateVariant,
  deleteVariant,
  getVariantsByProduct,
  getAllVariants,
  countVariants,
} from './product-variant.controller';
import { adminMiddleware, authorize, validate } from '../../middleware';
import {
  createProductVariantSchema,
  updateProductVariantSchema,
  deleteProductVariantSchema,
} from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/product-variant/create', adminMiddleware, authorize('variant:create'), validate(createProductVariantSchema), createVariant);
router.get('/product-variant/all', getAllVariants);
router.get('/product-variant/count', countVariants);
router.get('/product-variant/by-product/:id', getVariantsByProduct);
router.get('/product-variant/get/:id', getVariant);
router.put('/product-variant/update', adminMiddleware, authorize('variant:update'), validate(updateProductVariantSchema), updateVariant);
router.post('/product-variant/delete', adminMiddleware, authorize('variant:delete'), validate(deleteProductVariantSchema), deleteVariant);

export default router;
