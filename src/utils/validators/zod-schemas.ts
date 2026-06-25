import { z } from 'zod';

// ─── Helpers ────────────────────────────────────────────────────────
const mongoId = z.string().min(1, 'ID is required');
const emailStr = z.string().email('Invalid email format');
const phoneStr = z.string().min(7, 'Phone too short').max(15, 'Phone too long').optional();
const coerceNum = z.coerce.number();
const coerceBool = z.coerce.boolean();
const stringOrStringArray = z.union([z.string(), z.array(z.string())]);
const numericRange = z.union([
  coerceNum,
  z.object({
    min: coerceNum.optional(),
    max: coerceNum.optional(),
  }),
]);

// ─── Auth ───────────────────────────────────────────────────────────
export const signupSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().optional(),
  email_address: emailStr,
  password: z.string().min(6, 'Password must be at least 6 characters'),
  mobile_number: z.string().optional(),
  role: z.string().optional(),
  gender: z.string().optional(),
  user_id: z.string().optional(),
});

export const signinSchema = z.object({
  email_address: emailStr,
  password: z.string().min(1, 'Password is required'),
});

export const googleAuthSchema = z.object({
  credential: z.string().min(1, 'Google credential is required'),
});

export const refreshAuthSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
  RefreshToken: z.string().optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
  RefreshToken: z.string().optional(),
});

export const deleteUserSchema = z.object({
  id: mongoId,
});

export const editUserSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email_address: emailStr.optional(),
  mobile_number: z.string().optional(),
  role: z.string().optional(),
  id: mongoId,
  user_id: z.string().optional(),
  contact_address: z.array(z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    town: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    landmark: z.string().optional(),
    isDefault: z.boolean().optional(),
  })).optional(),
});

export const changePasswordSchema = z.object({
  id: mongoId,
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Privacy toggles mirror the AccountPrivacy screen; all optional for partial updates.
export const updatePrivacyPreferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  personalizedRecommendations: z.boolean().optional(),
  usageAnalytics: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one preference must be provided',
});

export const verifyEmailSchema = z.object({
  email_address: emailStr,
  otp: z.string().min(1, 'OTP is required'),
});

export const reVerifyEmailSchema = z.object({
  email: emailStr,
});

export const updateVerifiedSchema = z.object({
  id: mongoId,
  isVerified: z.boolean().optional(),
  verification_token: z.string().optional(),
  verification_token_expiry: z.string().optional(),
});

export const addCouponToUserSchema = z.object({
  userId: mongoId,
  couponCode: z.string().min(1, 'Coupon code is required'),
});

// ─── Password Reset ─────────────────────────────────────────────────
export const forgotPasswordSchema = z.object({
  email: emailStr,
});

export const verifyOTPSchema = z.object({
  email: emailStr,
  otp: z.string().min(1, 'OTP is required'),
});

export const resetPasswordSchema = z.object({
  email_address: emailStr,
  new_password: z.string().min(6, 'Password must be at least 6 characters'),
  confirm_password: z.string().min(6, 'Confirm password is required'),
}).refine((data) => data.new_password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

// ─── Product ────────────────────────────────────────────────────────
const priceListItemSchema = z.object({
  number: coerceNum,
  price: coerceNum,
  original_price: coerceNum.optional(),
  stock_quantity: coerceNum.default(0),
  discount: coerceNum.optional(),
  pack_weight: coerceNum.optional(),
});

const overviewFieldSchema = z.object({
  label: z.string().min(1),
  value: z.string().optional(),
  key: z.string().optional(),
  visible: z.boolean().optional(),
});

const productSpecificationInputSchema = z.object({
  material: z.string().optional(),
  color: z.string().optional(),
  colour: z.string().optional(),
  adhesive: z.string().optional(),
  print: z.string().optional(),
  length: coerceNum.optional(),
  width: coerceNum.optional(),
  height: coerceNum.optional(),
  length_inch: coerceNum.optional(),
  length_mm: coerceNum.optional(),
  breadth_inch: coerceNum.optional(),
  breadth_mm: coerceNum.optional(),
  height_inch: coerceNum.optional(),
  height_mm: coerceNum.optional(),
  size_inch: z.string().optional(),
  size_mm: z.string().optional(),
  flap_mm: coerceNum.optional(),
  thickness: coerceNum.optional(),
  thickness_micron: coerceNum.optional(),
  gusset: coerceNum.optional(),
  label_in_roll: z.string().optional(),
  core_size: coerceNum.optional(),
  pouch_weight: coerceNum.optional(),
  weight: coerceNum.optional(),
  size: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
}).partial();

const pricingInputSchema = z.object({
  basePrice: coerceNum.optional(),
  priceList: z.array(priceListItemSchema).optional(),
  discount: coerceNum.optional(),
  stockQuantity: coerceNum.optional(),
  packWeight: coerceNum.optional(),
}).partial();

const inventoryInputSchema = z.object({
  availableStock: coerceNum.optional(),
  reservedStock: coerceNum.optional(),
  minimumStock: coerceNum.optional(),
  warehouse: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).partial();

const mediaInputSchema = z.object({
  thumbnail: z.unknown().optional(),
  gallery: z.array(z.unknown()).optional(),
  videos: z.array(z.unknown()).optional(),
  documents: z.array(z.unknown()).optional(),
  images360: z.array(z.unknown()).optional(),
}).partial();

const seoInputSchema = z.object({
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  overview_fields: z.array(overviewFieldSchema).optional(),
  canonical: z.string().optional(),
  schema_markup: z.unknown().optional(),
  keywords: z.array(z.string()).optional(),
}).partial();

export const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  brand: z.string().optional(),
  model: z.string().optional(),
  category: z.string().optional(),
  sub_category: z.string().optional(),
  price: coerceNum.optional(),
  priceList: z.array(priceListItemSchema).optional(),
  gst: coerceNum.optional(),
  description: z.string().optional(),
  aboutItem: z.string().optional(),
  usage: z.string().optional(),
  material: z.string().optional(),
  color: z.string().optional(),
  hsn_code: z.string().optional(),
  delivery_time: z.string().optional(),
  length: coerceNum.optional(),
  width: coerceNum.optional(),
  height: coerceNum.optional(),
  length_inch: coerceNum.optional(),
  length_mm: coerceNum.optional(),
  breadth_inch: coerceNum.optional(),
  breadth_mm: coerceNum.optional(),
  height_inch: coerceNum.optional(),
  height_mm: coerceNum.optional(),
  size_inch: z.string().optional(),
  size_mm: z.string().optional(),
  flap_mm: coerceNum.optional(),
  thickness: coerceNum.optional(),
  thickness_micron: coerceNum.optional(),
  gusset: coerceNum.optional(),
  print: z.string().optional(),
  label_in_roll: z.string().optional(),
  label_in_role: z.string().optional(),
  core_size: coerceNum.optional(),
  pouch_weight: coerceNum.optional(),
  product_id: z.string().optional(),
  adhesive: z.string().optional(),
  top_product: coerceBool.optional(),
  deal_product: coerceBool.optional(),
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  slug: z.string().optional(),
  images: z.array(z.union([z.string(), z.object({ image: z.string().optional() })])).optional(),
  overview_fields: z.array(overviewFieldSchema).optional(),
  specification: productSpecificationInputSchema.optional(),
  pricing: pricingInputSchema.optional(),
  inventory: inventoryInputSchema.optional(),
  media: mediaInputSchema.optional(),
  seo: seoInputSchema.optional(),
  buyItWith: z.array(z.string()).optional(),
  relatedProducts: z.array(z.string()).optional(),
});

export const updateProductSchema = z.object({
  id: mongoId,
  name: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  category: z.string().optional(),
  sub_category: z.string().optional(),
  price: coerceNum.optional(),
  priceList: z.array(priceListItemSchema).optional(),
  gst: coerceNum.optional(),
  description: z.string().optional(),
  aboutItem: z.string().optional(),
  usage: z.string().optional(),
  material: z.string().optional(),
  color: z.string().optional(),
  hsn_code: z.string().optional(),
  delivery_time: z.string().optional(),
  length: coerceNum.optional(),
  width: coerceNum.optional(),
  height: coerceNum.optional(),
  length_inch: coerceNum.optional(),
  length_mm: coerceNum.optional(),
  breadth_inch: coerceNum.optional(),
  breadth_mm: coerceNum.optional(),
  height_inch: coerceNum.optional(),
  height_mm: coerceNum.optional(),
  size_inch: z.string().optional(),
  size_mm: z.string().optional(),
  flap_mm: coerceNum.optional(),
  thickness: coerceNum.optional(),
  thickness_micron: coerceNum.optional(),
  gusset: coerceNum.optional(),
  print: z.string().optional(),
  label_in_roll: z.string().optional(),
  label_in_role: z.string().optional(),
  core_size: coerceNum.optional(),
  pouch_weight: coerceNum.optional(),
  product_id: z.string().optional(),
  adhesive: z.string().optional(),
  top_product: coerceBool.optional(),
  deal_product: coerceBool.optional(),
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  slug: z.string().optional(),
  images: z.array(z.union([z.string(), z.object({ image: z.string().optional() })])).optional(),
  overview_fields: z.array(overviewFieldSchema).optional(),
  specification: productSpecificationInputSchema.optional(),
  pricing: pricingInputSchema.optional(),
  inventory: inventoryInputSchema.optional(),
  media: mediaInputSchema.optional(),
  seo: seoInputSchema.optional(),
  buyItWith: z.array(z.string()).optional(),
  relatedProducts: z.array(z.string()).optional(),
});

export const deleteProductSchema = z.object({
  id: z.union([mongoId, z.array(mongoId)]),
});

export const addRelatedProductsSchema = z.object({
  productIds: z.array(z.string()).optional(),
});

export const searchMainProductsSchema = z.object({
  search: z.string().min(1, 'Search term is required'),
});

export const filterProductsSchema = z.object({
  length: numericRange.optional(),
  breadth: numericRange.optional(),
  height: numericRange.optional(),
  width: numericRange.optional(),
  flap: numericRange.optional(),
  gusset: numericRange.optional(),
  thickness: numericRange.optional(),
  category: stringOrStringArray.optional(),
  brand: stringOrStringArray.optional(),
  subcategory: stringOrStringArray.optional(),
  q: z.string().optional(),
  unit: z.string().optional(),
  skip: coerceNum.optional(),
  limit: coerceNum.optional(),
  includeMeta: coerceBool.optional(),
});

export const getSubCategoryAvailabilitySchema = z.object({
  category: stringOrStringArray.optional(),
  brand: stringOrStringArray.optional(),
  subcategory: stringOrStringArray.optional(),
  q: z.string().optional(),
});

export const boppFilterSchema = filterProductsSchema;
export const polyFilterSchema = filterProductsSchema;
export const labelFilterSchema = filterProductsSchema;

export const addBuyItWithProductsSchema = z.object({
  productIds: z.array(z.string()).optional(),
});

// ─── Category ───────────────────────────────────────────────────────
// A single spec-field definition on a category's spec_schema. Kept permissive
// (label/type optional, default_value unknown) — the controller's
// sanitizeSpecSchema fills gaps and enforces the canonical shape.
const specSchemaFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  type: z.enum(['number', 'select', 'text']).optional(),
  options: z.array(z.string()).optional(),
  required: coerceBool.optional(),
  unit: z.string().optional(),
  default_value: z.unknown().optional(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  category_id: z.string().optional(),
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  overview_fields: z.array(z.object({ label: z.string().min(1) })).optional(),
  gst: coerceNum.optional(),
  field_visibility: z.record(z.string(), z.unknown()).optional(),
  common_attributes: z.record(z.string(), z.unknown()).optional(),
  spec_schema: z.array(specSchemaFieldSchema).optional(),
});

export const updateCategorySchema = z.object({
  id: mongoId,
  name: z.string().optional(),
  category_id: z.string().optional(),
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  overview_fields: z.array(z.object({ label: z.string().min(1) })).optional(),
  gst: coerceNum.optional(),
  field_visibility: z.record(z.string(), z.unknown()).optional(),
  common_attributes: z.record(z.string(), z.unknown()).optional(),
  spec_schema: z.array(specSchemaFieldSchema).optional(),
});

export const deleteCategorySchema = z.object({
  id: mongoId,
});

// ─── SubCategory ────────────────────────────────────────────────────
export const createSubCategorySchema = z.object({
  name: z.string().min(1, 'Subcategory name is required'),
  category: z.string().optional(),
  sub_category_id: z.string().optional(),
  gst: coerceNum.optional(),
});

export const updateSubCategorySchema = z.object({
  id: mongoId,
  name: z.string().optional(),
  category: z.string().optional(),
  sub_category_id: z.string().optional(),
  gst: coerceNum.optional(),
});

export const deleteSubCategorySchema = z.object({
  id: mongoId,
});

// ─── Brand ──────────────────────────────────────────────────────────
export const createBrandSchema = z.object({
  name: z.string().min(1, 'Brand name is required'),
  brand_id: z.string().optional(),
  image: z.string().optional(),
});

export const updateBrandSchema = z.object({
  id: mongoId,
  name: z.string().optional(),
  brand_id: z.string().optional(),
  image: z.string().optional(),
});

export const deleteBrandSchema = z.object({
  id: mongoId,
});

// ─── Cart ───────────────────────────────────────────────────────────
const cartItemSchema = z.object({
  product: z.string().min(1, 'Product ID is required'),
  quantity: coerceNum.min(1, 'Quantity must be at least 1'),
  price: coerceNum,
  packSize: coerceNum,
  discountPrice: coerceNum.optional(),
  totalPackWeight: coerceNum.optional(),
  stock: coerceNum.optional(),
});

export const addToCartSchema = z.object({
  product: cartItemSchema,
});

export const alterQuantitySchema = z.object({
  product: z.string().min(1, 'Product ID is required'),
  quantity: coerceNum,
  packSize: coerceNum.optional(),
});

export const removeFromCartSchema = z.object({
  product: z.string().min(1, 'Product ID is required'),
});

export const emptyCartSchema = z.object({});

export const updateCartSchema = z.object({
  products: z.array(z.object({
    product: z.string().optional(),
    quantity: coerceNum.optional(),
    price: coerceNum.optional(),
    packSize: coerceNum.optional(),
    discountPrice: coerceNum.optional(),
    totalPackWeight: coerceNum.optional(),
  })).optional(),
  appliedCoupon: coerceBool.optional(),
  appliedCouponName: z.string().optional(),
  couponType: z.string().optional(),
  maxCapDiscount: coerceNum.optional(),
  couponUse: z.string().optional(),
});

export const updateShippingCouponSchema = z.object({
  appliedCoupon: coerceBool.optional(),
  shippingDiscountPrice: coerceNum.optional(),
  shippingDiscountPercentage: coerceNum.optional(),
  appliedCouponName: z.string().optional(),
  couponType: z.string().optional(),
  maxCapDiscount: coerceNum.optional(),
  couponUse: z.string().optional(),
});

export const updateAllDiscountSchema = z.object({
  appliedCoupon: coerceBool.optional(),
  totalDiscountPrice: coerceNum.optional(),
  totalDiscountPercentage: coerceNum.optional(),
  appliedCouponName: z.string().optional(),
  maxCapDiscount: coerceNum.optional(),
  couponType: z.string().optional(),
  couponUse: z.string().optional(),
});

export const updateProductTypeAllCouponSchema = z.object({
  appliedCoupon: coerceBool.optional(),
  appliedCouponName: z.string().optional(),
  discount_amount: coerceNum.optional(),
  couponType: z.string().optional(),
  maxCapDiscount: coerceNum.optional(),
  couponUse: z.string().optional(),
});

export const removeCouponSchema = z.object({});

// ─── Order ──────────────────────────────────────────────────────────
const orderItemSchema = z.object({
  product: z.string().min(1, 'Product ID is required'),
  quantity: coerceNum.min(1, 'Quantity must be at least 1'),
  price: coerceNum,
  packSize: coerceNum,
  gst: coerceNum.optional(),
  gstAmount: coerceNum.optional(),
  totalPrice: coerceNum.optional(),
});

export const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  mobile: z.string().optional(),
  email: emailStr,
  address: z.string().min(1, 'Address is required'),
  town: z.string().min(1, 'Town is required'),
  state: z.string().min(1, 'State is required'),
  pincode: z.string().min(1, 'Pincode is required'),
  landmark: z.string().optional(),
  gstin: z.string().optional(),
  total: coerceNum.optional(),
  totalPackWeight: coerceNum.optional(),
  shippingCost: coerceNum.optional(),
  totalOrderValue: coerceNum,
  totalCartValue: coerceNum.optional(),
  utrNumber: z.string().optional(),
  couponCode: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export const updateOrderSchema = z.object({
  status: z.string().min(1),
  id: mongoId,
});

export const updateOrderShippingSchema = z.object({
  shippingDate: z.string().min(1),
  id: mongoId,
  status: z.string().optional(),
});

export const updateOrderTrackingSchema = z.object({
  trackingId: z.string().min(1),
  id: mongoId,
  deliveryPartner: z.string().optional(),
});

export const updateOrderDeliveredSchema = z.object({
  deliveredDate: z.string().min(1),
  id: mongoId,
  status: z.string().optional(),
});

export const updateUtrSchema = z.object({
  _id: mongoId,
  utrNumber: z.string().min(1, 'UTR number is required'),
});

export const updatePaymentStatusSchema = z.object({
  _id: mongoId,
  paymentStatus: z.string().min(1),
  paymentProvider: z.string().optional(),
  razorpayPaymentId: z.string().optional(),
  razorpayOrderId: z.string().optional(),
  razorpaySignature: z.string().optional(),
  guestToken: z.string().optional(),
  error: z.string().optional(),
});

export const createPaymentSchema = z.object({
  _id: mongoId,
  amount: coerceNum,
});

export const markPaymentAbandonedSchema = z.object({
  _id: mongoId,
});

export const markPaymentFailedSchema = z.object({
  _id: mongoId,
  error: z.string().optional(),
});

export const cancelUnpaidOrderSchema = z.object({
  _id: mongoId,
});

// ─── Coupon ─────────────────────────────────────────────────────────
export const createCouponSchema = z.object({
  couponCode: z.string().min(1, 'Coupon code is required'),
  description: z.string().optional(),
  discountType: z.enum(['percentage', 'fixed'], {
    message: 'Discount type must be "percentage" or "fixed"',
  }),
  discountValue: coerceNum.min(0, 'Discount value must be non-negative'),
  maxDiscount: coerceNum.optional(),
  minOrderValue: coerceNum.optional(),
  validFrom: z.string().min(1, 'Valid from date is required'),
  validTo: z.string().min(1, 'Valid to date is required'),
  usageLimit: coerceNum.optional(),
  appliesTo: z.string().optional(),
});

export const updateCouponSchema = z.object({
  _id: mongoId,
  couponCode: z.string().optional(),
  description: z.string().optional(),
  discountType: z.enum(['percentage', 'fixed']).optional(),
  discountValue: coerceNum.min(0).optional(),
  maxDiscount: coerceNum.optional(),
  minOrderValue: coerceNum.optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  usageLimit: coerceNum.optional(),
  appliesTo: z.string().optional(),
  isActive: coerceBool.optional(),
});

export const deleteCouponSchema = z.object({
  id: mongoId,
});

// ─── Deal ───────────────────────────────────────────────────────────
export const createDealSchema = z.object({
  title: z.string().min(1, 'Deal title is required'),
  description: z.string().optional(),
  discountPercentage: coerceNum.optional(),
  products: z.array(z.string()).optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
});

export const updateDealSchema = z.object({
  id: mongoId,
  title: z.string().optional(),
  description: z.string().optional(),
  discountPercentage: coerceNum.optional(),
  products: z.array(z.string()).optional(),
  isActive: coerceBool.optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
});

export const deleteDealSchema = z.object({
  id: mongoId,
});

// ─── Pincode / Freight ──────────────────────────────────────────────
export const createFreightSchema = z.object({
  pincode: z.string().min(1, 'Pincode is required'),
  deliveryAvailable: coerceBool.optional(),
  codAvailable: coerceBool.optional(),
  estimatedDays: coerceNum.optional(),
  freight: coerceNum.optional(),
});

export const fetchOneFreightSchema = z.object({
  pincode: z.string().min(1, 'Pincode is required'),
  packweight: coerceNum.optional(),
});

export const updatePincodeSchema = z.object({
  _id: mongoId,
  pincode: z.string().optional(),
  deliveryAvailable: coerceBool.optional(),
  codAvailable: coerceBool.optional(),
  estimatedDays: coerceNum.optional(),
  freight: coerceNum.optional(),
});

// ─── Wishlist ───────────────────────────────────────────────────────
export const addToWishlistSchema = z.object({
  product: z.union([
    z.string(),
    z.object({ product: z.string() }),
  ]),
});

export const removeFromWishlistSchema = z.object({
  product: z.union([
    z.string(),
    z.object({ product: z.string() }),
  ]),
});

// ─── Customer ───────────────────────────────────────────────────────
export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: emailStr,
  phone: phoneStr,
  message: z.string().optional(),
});

// ─── Contact Form ───────────────────────────────────────────────────
const contactCategoryEnum = z.enum(['Bug', 'Order', 'Payment', 'Feedback', 'Other']);
const contactStatusEnum = z.enum(['open', 'in_progress', 'resolved', 'closed']);

export const createContactFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: emailStr,
  phone: phoneStr,
  category: contactCategoryEnum.optional(),
  message: z.string().min(1, 'Message is required'),
});

export const updateContactStatusSchema = z.object({
  status: contactStatusEnum,
});

// ─── Custom Packaging ───────────────────────────────────────────────
export const createCustomPackageSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: emailStr,
  phone: z.string().min(1, 'Phone is required'),
  description: z.string().min(1, 'Description is required'),
});

// ─── Notify ─────────────────────────────────────────────────────────
export const createNotifySchema = z.object({
  product_id: z.string().min(1, 'Product ID is required'),
  email_address: emailStr,
});

// ─── Subscription Order ─────────────────────────────────────────────
export const createSubscriptionOrderSchema = z.object({
  email: emailStr,
  product: z.string().min(1, 'Product ID is required'),
  quantity: coerceNum.min(1, 'Quantity must be at least 1'),
  frequency: z.string().min(1, 'Frequency is required'),
});

// ─── App Version ────────────────────────────────────────────────────
export const createAppVersionSchema = z.object({
  platform: z.enum(['android', 'ios'], {
    message: 'Platform must be "android" or "ios"',
  }),
  version: z.string().min(1, 'Version is required'),
  forceUpdate: coerceBool.optional(),
  updateMessage: z.string().optional(),
});

export const updateAppVersionSchema = z.object({
  platform: z.enum(['android', 'ios']).optional(),
  version: z.string().optional(),
  forceUpdate: coerceBool.optional(),
  updateMessage: z.string().optional(),
});
