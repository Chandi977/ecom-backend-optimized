import mongoose from 'mongoose';
import { DBconnection } from '../database';
import Category from '../modules/category/category.model';
import Brand from '../modules/brand/brand.model';
import Product from '../modules/product/product.model';

const run = async () => {
  await DBconnection();
  
  const categories = await Category.find().lean().exec();
  console.log('=== CATEGORIES ===');
  categories.forEach(c => {
    console.log(`ID: ${c._id}, Name: ${c.name}, Slug: ${c.slug}`);
  });

  const brands = await Brand.find().lean().exec();
  console.log('\n=== BRANDS ===');
  brands.forEach(b => {
    console.log(`ID: ${b._id}, Name: ${b.name}, Slug: ${b.slug}`);
  });

  // Check how many products are in category 'Corrugated Box'
  const corrugatedCategory = categories.find(c => c.name.toLowerCase().includes('corrugated'));
  if (corrugatedCategory) {
    const count = await Product.countDocuments({ category: corrugatedCategory._id });
    console.log(`\nProducts in Corrugated category (${corrugatedCategory.name}): ${count}`);

    const sampleProducts = await Product.find({ category: corrugatedCategory._id }).limit(5).lean().exec();
    console.log('Sample products:');
    sampleProducts.forEach(p => {
      console.log(`- ID: ${p._id}, Name: ${p.name}, Slug: ${p.slug}`);
    });
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
