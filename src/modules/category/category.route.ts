import { Router } from 'express';
import { createCategory, getCategories, getCategory, updateCategory, deleteCategory, allCategories, searchCategories, countCategories } from './category.controller';
import { adminMiddleware, authorize, validate } from '../../middleware';
import { createCategorySchema, updateCategorySchema, deleteCategorySchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/category/create', adminMiddleware, authorize('category:create'), validate(createCategorySchema), createCategory);
router.get('/category/get', getCategories);
router.get('/category/get/:id', getCategory);
router.put('/category/update', adminMiddleware, authorize('category:update'), validate(updateCategorySchema), updateCategory);
router.post('/category/delete', adminMiddleware, authorize('category:delete'), validate(deleteCategorySchema), deleteCategory);
router.get('/category/all', allCategories);
router.get('/category/search', searchCategories);
router.get('/category/count', countCategories);

export default router;
