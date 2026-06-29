import mongoose from 'mongoose';
import { config } from '../config';
import Product from '../modules/product/product.model';
import '../modules/brand/brand.model';
import '../modules/category/category.model';
import '../modules/subcategory/subcategory.model';

async function main() {
  console.log('Connecting to:', config.mongodb.uri);
  await mongoose.connect(config.mongodb.uri);
  console.log('Connected.');
  
  const product = await Product.findOne({ slug: 'flipkart-corrugated-box-d2' })
    .populate('brand category sub_category')
    .lean()
    .exec();
    
  if (!product) {
    console.log('Product not found!');
  } else {
    console.log('=== PRODUCT DETAILS ===');
    console.log('Name:', product.name);
    console.log('Slug:', product.slug);
    console.log('Brand (raw):', (product as any).brand);
    console.log('Category (raw):', (product as any).category);
    console.log('SubCategory (raw):', (product as any).sub_category);
    console.log('GST:', product.gst);
    console.log('HSN Code:', product.hsn_code);
    console.log('Overview Fields:', JSON.stringify(product.overview_fields, null, 2));
  }
  
  await mongoose.disconnect();
}

main().catch(console.error);
