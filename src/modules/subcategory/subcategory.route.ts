import { Router } from 'express';
import { createSubCategory, getSubCategories, getSubCategory, updateSubCategory, deleteSubCategory, searchSubCategory, countSubCategories, getAllSubCategories } from './subcategory.controller';
import { adminMiddleware, authorize, authorizeScoped, validate } from '../../middleware';
import { SEO_SUBCATEGORY_FIELDS } from '../../config/rbac';
import { createSubCategorySchema, updateSubCategorySchema, deleteSubCategorySchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/subcategory/create', adminMiddleware, authorize('subcategory:create'), validate(createSubCategorySchema), createSubCategory);
router.get('/subcategory/get', getSubCategories);
router.get('/subcategory/get/:id', getSubCategory);
// `seo` lacks subcategory:update, so it is admitted via the scoped grant with its
// body reduced to SEO_SUBCATEGORY_FIELDS — i.e. the authored seo_content copy + FAQ
// block only, never pack_sizes / gst / name.
router.put('/subcategory/update', adminMiddleware, authorizeScoped(
  { permissions: ['subcategory:update'] },
  { permissions: ['seo:write'], fields: SEO_SUBCATEGORY_FIELDS },
), validate(updateSubCategorySchema), updateSubCategory);
router.post('/subcategory/delete', adminMiddleware, authorize('subcategory:delete'), validate(deleteSubCategorySchema), deleteSubCategory);
router.get('/subcategory/all', getAllSubCategories);
router.get('/subcategory/search', searchSubCategory);
router.get('/subcategory/count', countSubCategories);

export default router;
