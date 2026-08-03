import { Router } from 'express';
import { createCategory, getCategories, getCategory, updateCategory, deleteCategory, allCategories, searchCategories, countCategories } from './category.controller';
import { adminMiddleware, authorize, authorizeScoped, validate } from '../../middleware';
import { SEO_CATEGORY_FIELDS } from '../../config/rbac';
import { createCategorySchema, updateCategorySchema, deleteCategorySchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/category/create', adminMiddleware, authorize('category:create'), validate(createCategorySchema), createCategory);
router.get('/category/get', getCategories);
router.get('/category/get/:id', getCategory);
// `seo` lacks category:update, so it is admitted via the scoped grant with its body
// reduced to SEO_CATEGORY_FIELDS (no gst / hsn / spec_schema / name edits).
router.put('/category/update', adminMiddleware, authorizeScoped(
  { permissions: ['category:update'] },
  { permissions: ['seo:write'], fields: SEO_CATEGORY_FIELDS },
), validate(updateCategorySchema), updateCategory);
router.post('/category/delete', adminMiddleware, authorize('category:delete'), validate(deleteCategorySchema), deleteCategory);
router.get('/category/all', allCategories);
router.get('/category/search', searchCategories);
router.get('/category/count', countCategories);

export default router;
