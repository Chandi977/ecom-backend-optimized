import { Router } from 'express';
import {
  createAttribute,
  getAttributes,
  getAttribute,
  updateAttribute,
  deleteAttribute,
  getAllAttributes,
  getAttributesByCategory,
  getAttributesBySubCategory,
  countAttributes,
} from './attribute.controller';
import { adminMiddleware, authorize, validate } from '../../middleware';
import {
  createAttributeDefinitionSchema,
  updateAttributeDefinitionSchema,
  deleteAttributeDefinitionSchema,
} from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/attribute/create', adminMiddleware, authorize('attribute:write'), validate(createAttributeDefinitionSchema), createAttribute);
router.get('/attribute/get', getAttributes);
router.get('/attribute/all', getAllAttributes);
router.get('/attribute/count', countAttributes);
router.get('/attribute/by-category/:id', getAttributesByCategory);
router.get('/attribute/by-subcategory/:id', getAttributesBySubCategory);
router.get('/attribute/get/:id', getAttribute);
router.put('/attribute/update', adminMiddleware, authorize('attribute:write'), validate(updateAttributeDefinitionSchema), updateAttribute);
router.post('/attribute/delete', adminMiddleware, authorize('attribute:write'), validate(deleteAttributeDefinitionSchema), deleteAttribute);

export default router;
