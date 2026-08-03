import { Router } from 'express';
import multer from 'multer';
import {
  createProduct, getProducts, getProduct, getProductById, updateProduct,
  deleteProduct, allProducts, searchProduct, searchMainProducts, countProducts,
  getSubCategoryAvailability, filterProducts, uploadImage, getImage, deleteProductImages,
  SingleProduct, filterBoppProducts, filterPolyProducts, filterLabelProducts,
  SingleProductWithImage, addRelatedProducts, addBuyItWithProducts,
} from './product.controller';
import { adminMiddleware, authorize, authorizeScoped, validate } from '../../middleware';
import { SEO_PRODUCT_FIELDS } from '../../config/rbac';
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

router.post('/product/create', adminMiddleware, authorize('product:create'), validate(createProductSchema), createProduct);
router.get('/product/get', getProducts);
router.get('/product/get/id/:id', getProductById);
router.get('/product/get/:slug', getProduct);
// The `seo` role has no `product:update`, so it falls through to the scoped grant
// and its body is reduced to SEO_PRODUCT_FIELDS before zod sees it — price, stock,
// GST, images and name are dropped rather than rejected.
router.put('/product/update', adminMiddleware, authorizeScoped(
  { permissions: ['product:update'] },
  { permissions: ['seo:write'], fields: SEO_PRODUCT_FIELDS },
), validate(updateProductSchema), updateProduct);
router.post('/product/:id/related/add', adminMiddleware, authorize('product:update'), validate(addRelatedProductsSchema), addRelatedProducts);
router.post('/product/:id/buy-it-with/add', adminMiddleware, authorize('product:update'), validate(addBuyItWithProductsSchema), addBuyItWithProducts);
router.post('/product/delete', adminMiddleware, authorize('product:delete'), validate(deleteProductSchema), deleteProduct);
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
router.post('/product/image/delete', adminMiddleware, authorize('product:update'), deleteProductImages);
router.get('/getImage', getImage);
router.get('/product/single/:id', SingleProduct);
router.get('/product/image/single/:id', SingleProductWithImage);

export default router;
