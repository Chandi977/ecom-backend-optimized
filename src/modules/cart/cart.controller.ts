import { Response } from 'express';
import mongoose from 'mongoose';
import Cart from '../cart/cart.model';
import Coupon from '../coupon/coupon.model';
import { commonResponse, returnjson } from '../../utils/response';
import Product from '../product/product.model';
import { processImages } from '../../utils/s3';
import { IAuthRequest } from '../../types';
import { calculateCartTotals } from '../../services/cart-calculation.service';
import { withLock } from '../../utils/concurrency/lock';

// Cart mutations read the whole products array, recompute, then overwrite it.
// Serialize per user so two concurrent requests can't lose each other's update.
const cartLockKey = (user: string): string[] => [`cart:${user}`];

// Server-side coupon validation before persisting a discount to the cart.
// Returns an error string, or null when the coupon is valid and usable.
const validateCouponForCart = async (
  couponCode: string,
  totalAmount: number,
): Promise<string | null> => {
  if (!couponCode) return null;
  const coupon = await Coupon.findOne({ couponCode: couponCode.toUpperCase() }).exec();
  if (!coupon) return 'Invalid coupon code';
  if (!coupon.isActive) return 'Coupon is not active';
  const now = new Date();
  if (coupon.validFrom && now < new Date(coupon.validFrom)) return 'Coupon is not active yet';
  if (coupon.validTo && now > new Date(coupon.validTo)) return 'Coupon has expired';
  if (totalAmount < (coupon.minOrderValue || 0)) return `Minimum order value is ${coupon.minOrderValue}`;
  return null;
};

// Cart line-items render small thumbnails — serve resized derivatives.
const IMAGE_SIGN_OPTIONS = { expiresIn: 86400, width: 400 };

type CartProductRecord = Record<string, any>;

const cartProductId = (item: CartProductRecord): string => {
  const product = item?.product;
  if (product && typeof product === 'object') {
    return String(product._id || product.id || '');
  }
  return product ? String(product) : '';
};

const isValidProductId = (id: string): boolean => Boolean(id && (mongoose.Types.ObjectId as any).isValid(id));

const cartProductsUpdate = (products: CartProductRecord[]) => {
  const { total_amount, totalPackWeight } = products.reduce(
    (acc: { total_amount: number; totalPackWeight: number }, curr: any) => ({
      total_amount: acc.total_amount + Number(curr.price) * Number(curr.quantity),
      totalPackWeight: acc.totalPackWeight + (Number(curr.totalPackWeight) || 0),
    }),
    { total_amount: 0, totalPackWeight: 0 },
  );

  return {
    products,
    total_amount,
    totalPackWeight,
    appliedCoupon: false,
    appliedCouponName: '',
    couponType: '',
    discount_amount: 0,
    $unset: {
      totalDiscountPercentage: '',
      maxCapDiscount: '',
      totalDiscountPrice: '',
      shippingDiscountPrice: '',
      shippingDiscountPercentage: '',
      couponUse: '',
    },
  };
};

const pruneMissingCartProducts = async (
  user: string,
  products: CartProductRecord[],
): Promise<{ products: CartProductRecord[]; removedCount: number }> => {
  const normalizedProducts = returnjson(products || []) as CartProductRecord[];
  if (normalizedProducts.length === 0) return { products: [], removedCount: 0 };

  const productIds = Array.from(new Set(normalizedProducts.map(cartProductId).filter(isValidProductId)));
  const existingProducts = productIds.length > 0
    ? await Product.find({ _id: { $in: productIds } }).select('_id').lean().exec()
    : [];
  const existingIds = new Set(existingProducts.map((product) => String(product._id)));
  const filtered = normalizedProducts.filter((item) => existingIds.has(cartProductId(item)));
  const removedCount = normalizedProducts.length - filtered.length;

  if (removedCount > 0) {
    await Cart.findOneAndUpdate(
      { user },
      cartProductsUpdate(filtered),
      { new: true },
    ).exec();
  }

  return { products: filtered, removedCount };
};

export const calculateCart = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { items, shippingCost, coupon } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json(commonResponse('Items required', false));
      return;
    }
    const result = await calculateCartTotals(items, Number(shippingCost) || 0, coupon || null);
    res.status(200).json(commonResponse('Cart calculated', true, result));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Calculation error';
    res.status(400).json(commonResponse(message, false));
  }
};

export const AddtoCart = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { product } = req.body;
  const user = req.user!;

  try {
    const productId = String(product?.product || '');
    if (!isValidProductId(productId) || !(await Product.exists({ _id: productId }))) {
      res.status(404).json(commonResponse('Product not found', false));
      return;
    }

    await withLock(cartLockKey(user), async () => {
    const cart = await Cart.findOne({ user }).exec();

    if (!cart) {
      const newCart = new Cart({
        products: [product], user,
        total_amount: Number(product?.price) * Number(product?.quantity),
        tax_amount: 0, discount_amount: 0,
        totalPackWeight: Number(product?.totalPackWeight) || 0,
        packSize: Number(product?.packSize),
      });
      const created = await newCart.save();
      res.status(201).json(commonResponse('Item added to cart', true, created));
    } else {
      const { products } = await pruneMissingCartProducts(user, cart.products as unknown as CartProductRecord[]);
      const idx = products.findIndex((x) => String(x.product) === String(product.product) && String(x.packSize) === String(product.packSize));

      if (idx === -1) {
        const temp = [...products, product];
        const total_amount = temp.reduce((acc: number, curr: any) => acc + Number(curr.price) * Number(curr.quantity), 0);
        const totalPackWeight = temp.reduce((acc: number, curr: any) => acc + (Number(curr.totalPackWeight) || 0), 0);

        const updated = await Cart.findOneAndUpdate(
          { user },
          {
            products: temp, total_amount, totalPackWeight, packSize: 0,
            discount_amount: 0, appliedCoupon: false, couponType: '', appliedCouponName: '',
            $unset: { totalDiscountPercentage: '', maxCapDiscount: '', totalDiscountPrice: '', shippingDiscountPrice: '', shippingDiscountPercentage: '' },
          },
          { new: true }
        ).exec();
        res.status(201).json(commonResponse('Item added to cart', true, updated));
      } else {
        const existing = products[idx];
        const newQty = Number(existing.quantity) + Number(product.quantity);
        if (newQty > Number(product.stock)) { res.status(400).json(commonResponse('Quantity exceeds stock', false)); return; }
        existing.quantity = newQty;
        existing.totalPackWeight = (Number(existing.totalPackWeight) || 0) + (Number(product.totalPackWeight) || 0);

        const total_amount = products.reduce((acc, curr) => acc + Number(curr.price) * Number(curr.quantity), 0);
        const totalPackWeight = products.reduce((acc, curr) => acc + (Number(curr.totalPackWeight) || 0), 0);

        const updated = await Cart.findOneAndUpdate(
          { user },
          {
            products, total_amount, totalPackWeight,
            discount_amount: 0, appliedCoupon: false, couponType: '', appliedCouponName: '',
            $unset: { totalDiscountPercentage: '', maxCapDiscount: '', totalDiscountPrice: '', shippingDiscountPrice: '', shippingDiscountPercentage: '' },
          },
          { new: true }
        ).exec();
        res.status(201).json(commonResponse('Item updated in cart', true, updated));
      }
    }
    });
  } catch (error) {
    res.status(500).json(commonResponse('Something went wrong', false));
  }
};

export const alterQuantity = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { product, quantity, packSize } = req.body;
  const user = req.user!;
  const nextQty = Math.max(1, Number(quantity) || 1);

  try {
    await withLock(cartLockKey(user), async () => {
    const cart = await Cart.findOne({ user }).exec();
    if (!cart) { res.status(404).json(commonResponse('Cart not found', false)); return; }

    const products = returnjson(cart.products) as Array<Record<string, unknown>>;
    const idx = products.findIndex((x) => String(x.product) === String(product) && String(x.packSize) === String(packSize));
    if (idx === -1) { res.status(403).json(commonResponse('Product not found', false)); return; }

    if (!isValidProductId(String(product))) {
      const filtered = products.filter((_, index) => index !== idx);
      const data = await Cart.findOneAndUpdate(
        { user },
        cartProductsUpdate(filtered),
        { new: true },
      ).exec();
      res.status(200).json(commonResponse('Product removed from cart because it no longer exists', true, data));
      return;
    }

    const selectedPrice = await Product.findById(product).select('priceList').lean().exec();
    if (!selectedPrice) {
      const filtered = products.filter((_, index) => index !== idx);
      const data = await Cart.findOneAndUpdate(
        { user },
        cartProductsUpdate(filtered),
        { new: true },
      ).exec();
      res.status(200).json(commonResponse('Product removed from cart because it no longer exists', true, data));
      return;
    }

    const stockQty = selectedPrice?.priceList?.find((p) => String(p.number) === String(products[idx].packSize))?.stock_quantity;
    if (stockQty !== undefined && nextQty > stockQty) { res.status(400).json(commonResponse('Quantity exceeds stock', false)); return; }

    products[idx].quantity = nextQty;
    const { total_amount, totalPackWeight } = products.reduce(
      (acc: { total_amount: number; totalPackWeight: number }, item: any) => ({ total_amount: acc.total_amount + Number(item.price) * Number(item.quantity), totalPackWeight: acc.totalPackWeight + (Number(item.totalPackWeight) || 0) }),
      { total_amount: 0, totalPackWeight: 0 }
    );

    const data = await Cart.findOneAndUpdate(
      { user },
      {
        products, total_amount, totalPackWeight,
      },
      { new: true }
    ).exec();
    res.status(201).json(commonResponse('Quantity updated', true, data));
    });
  } catch (error) {
    res.status(500).json(commonResponse('Error', false));
  }
};

export const updateCart = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { products: updates, appliedCoupon, appliedCouponName, couponType, maxCapDiscount, couponUse } = req.body;
    const user = req.user!;
    if (!user || !Array.isArray(updates)) { res.status(400).json(commonResponse('Invalid request', false)); return; }

    await withLock(cartLockKey(user), async () => {
    const cart = await Cart.findOne({ user }).exec();
    if (!cart) { res.status(403).json(commonResponse('Cart not found', false)); return; }
    const { products } = await pruneMissingCartProducts(user, cart.products as unknown as CartProductRecord[]);

    if (appliedCoupon && appliedCouponName) {
      const total = products.reduce((s, p: any) => s + (Number(p.price) || 0) * (Number(p.quantity) || 0), 0);
      const err = await validateCouponForCart(appliedCouponName, total);
      if (err) { res.status(400).json(commonResponse(err, false)); return; }
    }

    for (const update of updates) {
        const idx = products.findIndex((p: any) => String(p.product) === String(update.product));
      if (idx !== -1) products[idx].discountPrice = update.discountPrice;
    }

    const total_amount = products.reduce((sum: number, p: any) => sum + (Number(p.discountPrice) && Number(p.discountPrice) > 0 ? Number(p.discountPrice) : Number(p.price)) * Number(p.quantity), 0);
    const updated = await Cart.findOneAndUpdate(
      { user },
      { products, total_amount, appliedCoupon, appliedCouponName, couponType, maxCapDiscount, couponUse },
      { new: true }
    ).exec();
    res.status(201).json(commonResponse('Cart updated', true, updated));
    });
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const updateShippingCoupon = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { appliedCoupon, shippingDiscountPrice, shippingDiscountPercentage, appliedCouponName, couponType, maxCapDiscount, couponUse } = req.body;
    const user = req.user!;
    if (appliedCoupon && appliedCouponName) {
      const cart = await Cart.findOne({ user }).lean().exec();
      const total = (cart?.products || []).reduce(
        (s: number, p: any) => s + (Number(p.price) || 0) * (Number(p.quantity) || 0),
        0,
      );
      const err = await validateCouponForCart(appliedCouponName, total);
      if (err) { res.status(400).json(commonResponse(err, false)); return; }
    }
    const data = await Cart.findOneAndUpdate(
      { user },
      { shippingDiscountPercentage, shippingDiscountPrice, appliedCoupon, appliedCouponName, couponType, maxCapDiscount, couponUse },
      { new: true }
    ).exec();
    res.status(201).json(commonResponse('Cart updated', true, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const updateAllDiscount = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { appliedCoupon, totalDiscountPrice, totalDiscountPercentage, appliedCouponName, maxCapDiscount, couponType, couponUse } = req.body;
    const user = req.user!;
    if (appliedCoupon && appliedCouponName) {
      const cart = await Cart.findOne({ user }).lean().exec();
      const total = (cart?.products || []).reduce(
        (s: number, p: any) => s + (Number(p.price) || 0) * (Number(p.quantity) || 0),
        0,
      );
      const err = await validateCouponForCart(appliedCouponName, total);
      if (err) { res.status(400).json(commonResponse(err, false)); return; }
    }
    const data = await Cart.findOneAndUpdate(
      { user },
      { totalDiscountPrice, totalDiscountPercentage, appliedCoupon, appliedCouponName, maxCapDiscount, couponType, couponUse },
      { new: true }
    ).exec();
    res.status(201).json(commonResponse('Cart updated', true, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const updateProductTypeAllCoupon = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { appliedCoupon, appliedCouponName, discount_amount, couponType, maxCapDiscount, couponUse, allDiscountPercentage, allDiscountPrice } = req.body;
    const user = req.user!;
    if (appliedCoupon && appliedCouponName) {
      const cart = await Cart.findOne({ user }).lean().exec();
      const total = (cart?.products || []).reduce(
        (s: number, p: any) => s + (Number(p.price) || 0) * (Number(p.quantity) || 0),
        0,
      );
      const err = await validateCouponForCart(appliedCouponName, total);
      if (err) { res.status(400).json(commonResponse(err, false)); return; }
    }
    const data = await Cart.findOneAndUpdate(
      { user },
      { appliedCoupon, appliedCouponName, discount_amount, couponType: couponType || 'all', maxCapDiscount, couponUse, allDiscountPercentage, allDiscountPrice },
      { new: true }
    ).exec();
    res.status(201).json(commonResponse('Cart updated', true, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const getCart = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (String(id) !== String(req.user)) { res.status(403).json(commonResponse('Forbidden', false)); return; }

  try {
    await withLock(cartLockKey(String(id)), async () => {
    const rawCart = await Cart.findOne({ user: id }).lean().exec();
    if (!rawCart) {
      res.status(404).json(commonResponse('Cart not found', false));
      return;
    }

    const { removedCount } = await pruneMissingCartProducts(
      String(id),
      rawCart.products as unknown as CartProductRecord[],
    );

    const data = await Cart.findOne({ user: id })
      .populate({
        path: 'products.product',
        populate: [
          { path: 'category', select: 'name slug gst' },
          { path: 'sub_category', select: 'name slug gst category' },
        ],
      })
      .lean()
      .exec();
    if (data) {
      data.products = (data.products || []).filter((item: any) => Boolean(item.product));
      const processed = new Set();
      await Promise.all(
        data.products.map(async (item: any) => {
          const prod = item.product as Record<string, unknown> | undefined;
          if (!prod || !Array.isArray(prod.images) || prod.images.length === 0) return;
          const pid = (prod._id as string)?.toString();
          if (pid && processed.has(pid)) return;
          prod.images = await processImages(prod.images as string[], IMAGE_SIGN_OPTIONS);
          if (pid) processed.add(pid);
        })
      );
      (data as any).removedMissingProducts = removedCount;
      res.status(200).json(commonResponse('Cart fetched', true, data));
    } else {
      res.status(404).json(commonResponse('Cart not found', false));
    }
    });
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const getCartCount = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (String(id) !== String(req.user)) { res.status(403).json(commonResponse('Forbidden', false)); return; }

  try {
    let count = 0;
    await withLock(cartLockKey(String(id)), async () => {
    const data = await Cart.findOne({ user: id }).lean().exec();
    const { products } = data
      ? await pruneMissingCartProducts(String(id), data.products as unknown as CartProductRecord[])
      : { products: [] };
    count = products.length;
    });
    res.status(200).json(commonResponse('Count fetched', true, { count }));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const removeFromCart = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { product } = req.body;
  const user = req.user!;
  await withLock(cartLockKey(user), async () => {
  const cart = await Cart.findOne({ user }).exec();
  if (!cart) { res.status(404).json(commonResponse('Cart not found', false, { products: [] })); return; }

  const products = returnjson(cart.products) as Array<Record<string, unknown>>;
  const filtered = products.filter((x) => {
    const pid = x.product && typeof x.product === 'object'
      ? ((x.product as Record<string, unknown>)._id || x.product)?.toString()
      : String(x.product);
    return pid !== String(product) && String(x._id || x.id) !== String(product);
  });

    const { total_amount, totalPackWeight } = filtered.length > 0
    ? filtered.reduce((acc: { total_amount: number; totalPackWeight: number }, curr: any) => ({ total_amount: acc.total_amount + Number(curr.price) * Number(curr.quantity), totalPackWeight: acc.totalPackWeight + (Number(curr.totalPackWeight) || 0) }), { total_amount: 0, totalPackWeight: 0 })
    : { total_amount: 0, totalPackWeight: 0 };

  const data = await Cart.findOneAndUpdate(
    { user },
    {
      products: filtered, total_amount, totalPackWeight,
    },
    { new: true }
  ).exec();
  res.status(201).json(commonResponse('Product removed', true, data));
  });
};

export const emptyCart = async (req: IAuthRequest, res: Response): Promise<void> => {
  const data = await Cart.findOneAndDelete({ user: req.user }).exec();
  res.status(201).json(commonResponse('Cart emptied', true, data));
};

export const removeCoupon = async (req: IAuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  await withLock(cartLockKey(user), async () => {
  const cart = await Cart.findOne({ user }).exec();
  if (!cart) { res.status(404).json(commonResponse('Cart not found', false)); return; }

  const products = returnjson(cart.products) as Array<Record<string, unknown>>;
  const restored = products.map((p) => {
    const { discountPrice, ...rest } = p;
    return rest;
  });
  const total_amount = restored.reduce(
    (acc: number, curr: any) => acc + Number(curr.price) * Number(curr.quantity), 0,
  );

  const data = await Cart.findOneAndUpdate(
    { user },
    {
      products: restored,
      total_amount,
      appliedCoupon: false, appliedCouponName: '', couponType: '', discount_amount: 0,
      $unset: { totalDiscountPercentage: '', maxCapDiscount: '', totalDiscountPrice: '', shippingDiscountPrice: '', shippingDiscountPercentage: '', couponUse: '', allDiscountPercentage: '', allDiscountPrice: '' },
    },
    { new: true }
  ).exec();
  res.status(201).json(commonResponse('Coupon removed', true, data));
  });
};
