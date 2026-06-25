import { Router } from 'express';
import multer from 'multer';
import {
  createProduct, getProducts, getProduct, getProductById, updateProduct,
  deleteProduct, allProducts, searchProduct, searchMainProducts, countProducts,
  getSubCategoryAvailability, filterProducts, uploadImage, getImage,
  SingleProduct, filterBoppProducts, filterPolyProducts, filterLabelProducts,
  SingleProductWithImage, addRelatedProducts, addBuyItWithProducts,
} from './product.controller';
import { adminMiddleware, validate } from '../../middleware';
import {
  createProductSchema, updateProductSchema, deleteProductSchema,
  addRelatedProductsSchema, searchMainProductsSchema,
  filterProductsSchema, getSubCategoryAvailabilitySchema,
  boppFilterSchema, polyFilterSchema, labelFilterSchema,
  addBuyItWithProductsSchema,
} from '../../utils/validators/zod-schemas';

const router = Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/product/create', adminMiddleware, validate(createProductSchema), createProduct);
router.get('/product/get', getProducts);
router.get('/product/get/id/:id', getProductById);
router.get('/product/get/:slug', getProduct);
router.put('/product/update', adminMiddleware, validate(updateProductSchema), updateProduct);
router.post('/product/:id/related/add', adminMiddleware, validate(addRelatedProductsSchema), addRelatedProducts);
router.post('/product/:id/buy-it-with/add', adminMiddleware, validate(addBuyItWithProductsSchema), addBuyItWithProducts);
router.post('/product/delete', adminMiddleware, validate(deleteProductSchema), deleteProduct);
router.get('/product/all', allProducts);
router.get('/product/search', searchProduct);
router.post('/product/main/search', validate(searchMainProductsSchema), searchMainProducts);
router.get('/product/count', countProducts);
router.post('/product/subcategory-availability', validate(getSubCategoryAvailabilitySchema), getSubCategoryAvailability);
router.post('/product/filter', validate(filterProductsSchema), filterProducts);
router.post('/bopp/filter', validate(boppFilterSchema), filterBoppProducts);
router.post('/poly/filter', validate(polyFilterSchema), filterPolyProducts);
router.post('/label/filter', validate(labelFilterSchema), filterLabelProducts);
router.post('/uploadImage', upload.single('image'), uploadImage);
router.get('/getImage', getImage);
router.get('/product/single/:id', SingleProduct);
router.get('/product/image/single/:id', SingleProductWithImage);

export default router;
