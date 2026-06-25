import { Router } from 'express';
import { createSubCategory, getSubCategories, getSubCategory, updateSubCategory, deleteSubCategory, searchSubCategory, countSubCategories, getAllSubCategories } from './subcategory.controller';
import { adminMiddleware, validate } from '../../middleware';
import { createSubCategorySchema, updateSubCategorySchema, deleteSubCategorySchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/subcategory/create', adminMiddleware, validate(createSubCategorySchema), createSubCategory);
router.get('/subcategory/get', getSubCategories);
router.get('/subcategory/get/:id', getSubCategory);
router.put('/subcategory/update', adminMiddleware, validate(updateSubCategorySchema), updateSubCategory);
router.post('/subcategory/delete', adminMiddleware, validate(deleteSubCategorySchema), deleteSubCategory);
router.get('/subcategory/all', getAllSubCategories);
router.get('/subcategory/search', searchSubCategory);
router.get('/subcategory/count', countSubCategories);

export default router;
