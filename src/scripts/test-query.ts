import mongoose from 'mongoose';
import { DBconnection } from '../database';

// Import models
import * as Models from '../models';
// Destructure the ones we need directly in the script, though Mongoose registers all of them upon import
const { Product, Brand, Category, SubCategory, ProductMedia } = Models;

import { PRODUCT_POPULATE_PATHS, flattenProductCatalogList } from '../modules/product/product-catalog.service';

const run = async () => {
  const b = Brand.modelName;
  const c = Category.modelName;
  const s = SubCategory.modelName;

  await DBconnection();

  const subCategories = await SubCategory.find().populate('category').lean().exec();
  console.log(`Found ${subCategories.length} subcategories.`);

  for (const subcat of subCategories) {
    let product = await Product.findOne({ sub_category: subcat._id })
      .populate('media')
      .select('name images media')
      .lean()
      .exec();
    
    let source = 'sub_category match';

    if (!product) {
      const parentCategory: any = subcat.category;
      const parentCategoryId = parentCategory?._id || subcat.category;
      const escapeRegex = (string: string) => string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
      const legacyCategory = await Category.findOne({
        _id: { $ne: parentCategoryId },
        $or: [
          { name: { $regex: new RegExp('^' + escapeRegex(subcat.name), 'i') } },
          { slug: { $regex: new RegExp('^' + escapeRegex(subcat.slug), 'i') } }
        ]
      }).lean().exec();

      if (legacyCategory) {
        product = await Product.findOne({ category: legacyCategory._id })
          .populate('media')
          .select('name images media')
          .lean()
          .exec();
        source = 'legacy category match';
      }
    }

    const media = product?.media as any;
    const firstImg = product?.images?.[0] as any;
    const productImage = media?.thumbnail || firstImg?.image || firstImg || null;

    console.log(`Subcategory: "${subcat.name}"`);
    console.log(`  Product Found: ${product ? `"${product.name}"` : 'None'} (source: ${source})`);
    if (product) {
      console.log(`  media:`, JSON.stringify(media));
      console.log(`  images:`, JSON.stringify(product.images));
      console.log(`  productImage resolved:`, productImage);
    }
    console.log('--------------------------------------------------');
  }
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
