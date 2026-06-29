import mongoose from 'mongoose';
import { DBconnection } from '../database';

// Import models
import Product from '../modules/product/product.model';
import Brand from '../modules/brand/brand.model';
import Category from '../modules/category/category.model';
import SubCategory from '../modules/subcategory/subcategory.model';

import { PRODUCT_POPULATE_PATHS, flattenProductCatalogList } from '../modules/product/product-catalog.service';

const run = async () => {
  // Use the models so the TS transpiler does not strip their imports
  const b = Brand.modelName;
  const c = Category.modelName;
  const s = SubCategory.modelName;

  await DBconnection();
  
  // Find the specific product
  const product = await Product.findOne({ slug: /flipkart-corrugated-box-d2/i }).populate(PRODUCT_POPULATE_PATHS).lean().exec();
  
  if (!product) {
    console.log('Product not found in DB');
    return;
  }
  
  console.log('--- Raw MongoDB Product ---');
  console.log(JSON.stringify(product, null, 2));

  console.log('--- Flattened Product ---');
  const flattened = flattenProductCatalogList([product as any])[0];
  console.log(JSON.stringify(flattened, null, 2));
};

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
  });
