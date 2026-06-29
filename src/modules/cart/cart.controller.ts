import { Response } from 'express';
import Cart from '../cart/cart.model';
import { commonResponse, returnjson } from '../../utils/response';
import Product from '../product/product.model';
import { processImages } from '../../utils/s3';
import { IAuthRequest } from '../../types';
import { calculateCartTotals } from '../../services/cart-calculation.service';

// Cart line-items render small thumbnails — serve resized derivatives.
const IMAGE_SIGN_OPTIONS = { expiresIn: 86400, width: 400 };

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
      const products = returnjson(cart.products) as Array<Record<string, unknown>>;
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
  } catch (error) {
    res.status(500).json(commonResponse('Something went wrong', false));
  }
};

export const alterQuantity = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { product, quantity, packSize } = req.body;
  const user = req.user!;
  const nextQty = Math.max(1, Number(quantity) || 1);

  try {
    const cart = await Cart.findOne({ user }).exec();
    if (!cart) { res.status(404).json(commonResponse('Cart not found', false)); return; }

    const products = returnjson(cart.products) as Array<Record<string, unknown>>;
    const idx = products.findIndex((x) => String(x.product) === String(product) && String(x.packSize) === String(packSize));
    if (idx === -1) { res.status(403).json(commonResponse('Product not found', false)); return; }

    const selectedPrice = await Product.findById(product).select('priceList').lean().exec();
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
        discount_amount: 0, appliedCoupon: false, couponType: '', appliedCouponName: '',
        $unset: { totalDiscountPercentage: '', maxCapDiscount: '', totalDiscountPrice: '', shippingDiscountPrice: '', shippingDiscountPercentage: '', couponUse: '' },
      },
      { new: true }
    ).exec();
    res.status(201).json(commonResponse('Quantity updated', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Error', false));
  }
};

export const updateCart = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { products: updates, appliedCoupon, appliedCouponName, couponType, maxCapDiscount, couponUse } = req.body;
    const user = req.user!;
    if (!user || !Array.isArray(updates)) { res.status(400).json(commonResponse('Invalid request', false)); return; }

    const cart = await Cart.findOne({ user }).exec();
    if (!cart) { res.status(403).json(commonResponse('Cart not found', false)); return; }

    for (const update of updates) {
        const idx = cart.products.findIndex((p: any) => String(p.product) === String(update.product));
      if (idx !== -1) cart.products[idx].discountPrice = update.discountPrice;
    }

    const total_amount = cart.products.reduce((sum: number, p: any) => sum + (Number(p.discountPrice) && Number(p.discountPrice) > 0 ? Number(p.discountPrice) : Number(p.price)) * Number(p.quantity), 0);
    const updated = await Cart.findOneAndUpdate(
      { user },
      { products: cart.products, total_amount, appliedCoupon, appliedCouponName, couponType, maxCapDiscount, couponUse },
      { new: true }
    ).exec();
    res.status(201).json(commonResponse('Cart updated', true, updated));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const updateShippingCoupon = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { appliedCoupon, shippingDiscountPrice, shippingDiscountPercentage, appliedCouponName, couponType, maxCapDiscount, couponUse } = req.body;
    const user = req.user!;
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
    const data = await Cart.findOneAndUpdate(
      { user },
      { appliedCoupon, appliedCouponName, discount_amount, maxCapDiscount, couponUse, allDiscountPercentage, allDiscountPrice },
      { new: true }
    ).exec();
    res.status(201).json(commonResponse('Cart updated', true, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const getCart = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (String(id) !== String(req.user)) { res.status(403).json(commonResponse('Forbidden', false)); return; }

  try {
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
      res.status(200).json(commonResponse('Cart fetched', true, data));
    } else {
      res.status(404).json(commonResponse('Cart not found', false));
    }
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const getCartCount = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (String(id) !== String(req.user)) { res.status(403).json(commonResponse('Forbidden', false)); return; }

  try {
    const data = await Cart.findOne({ user: id }).exec();
    const count = data?.products?.length ?? 0;
    res.status(200).json(commonResponse('Count fetched', true, { count }));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const removeFromCart = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { product } = req.body;
  const user = req.user!;
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
      appliedCoupon: false, appliedCouponName: '', couponType: '', discount_amount: 0,
      $unset: { totalDiscountPercentage: '', maxCapDiscount: '', totalDiscountPrice: '', shippingDiscountPrice: '', shippingDiscountPercentage: '', couponUse: '' },
    },
    { new: true }
  ).exec();
  res.status(201).json(commonResponse('Product removed', true, data));
};

export const emptyCart = async (req: IAuthRequest, res: Response): Promise<void> => {
  const data = await Cart.findOneAndDelete({ user: req.user }).exec();
  res.status(201).json(commonResponse('Cart emptied', true, data));
};

export const removeCoupon = async (req: IAuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
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
      $unset: { totalDiscountPercentage: '', maxCapDiscount: '', totalDiscountPrice: '', shippingDiscountPrice: '', shippingDiscountPercentage: '', couponUse: '' },
    },
    { new: true }
  ).exec();
  res.status(201).json(commonResponse('Coupon removed', true, data));
};
