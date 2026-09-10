import { Response } from 'express';
import Coupon from '../coupon/coupon.model';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';

export const createCoupon = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { couponCode, description, discountType, discountValue, maxDiscount, minOrderValue, validFrom, validTo, usageLimit, appliesTo, scopeValue, couponUse } = req.body;
    if (!couponCode || !discountType || discountValue === undefined || !validFrom || !validTo) {
      res.status(400).json(commonResponse('Invalid fields', false)); return;
    }
    const coupon = new Coupon({ couponCode: couponCode?.toUpperCase(), description, discountType, discountValue, maxDiscount, minOrderValue, validFrom, validTo, usageLimit, appliesTo, scopeValue, couponUse: couponUse || 'single' });
    const data = await coupon.save();
    res.status(data ? 201 : 400).json(commonResponse(data ? 'Coupon created successfully' : 'Coupon not created', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getCoupon = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit = '10' } = req.query;
    const data = await Coupon.find().skip(parseInt(skip as string, 10)).limit(parseInt(limit as string, 10)).exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Coupons found' : 'Coupons not found', data.length > 0, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const countCoupon = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const count = await Coupon.countDocuments();
    res.status(200).json(commonResponse('Coupon count', true, count));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getSingleCoupon = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data = await Coupon.findOne({ _id: id }).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Coupon found' : 'Coupon not found', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getCouponByCouponCode = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { couponCode } = req.params;
    const data = await Coupon.findOne({ couponCode: couponCode?.toUpperCase() }).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Coupon found' : 'Coupon not found', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const updateCoupon = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { _id, couponCode, description, discountType, discountValue, maxDiscount, minOrderValue, validFrom, validTo, usageLimit, appliesTo, isActive, scopeValue, couponUse } = req.body;
    const update: Record<string, unknown> = {};
    if (couponCode !== undefined) update.couponCode = couponCode?.toUpperCase?.() || couponCode;
    if (description !== undefined) update.description = description;
    if (discountType !== undefined) update.discountType = discountType;
    if (discountValue !== undefined) update.discountValue = discountValue;
    if (maxDiscount !== undefined) update.maxDiscount = maxDiscount;
    if (minOrderValue !== undefined) update.minOrderValue = minOrderValue;
    if (validFrom !== undefined) update.validFrom = validFrom;
    if (validTo !== undefined) update.validTo = validTo;
    if (usageLimit !== undefined) update.usageLimit = usageLimit;
    if (appliesTo !== undefined) update.appliesTo = appliesTo;
    if (isActive !== undefined) update.isActive = isActive;
    if (scopeValue !== undefined) update.scopeValue = scopeValue;
    if (couponUse !== undefined) update.couponUse = couponUse;

    const updatedCoupon = await Coupon.findOneAndUpdate({ _id }, update, { new: true }).exec();
    res.status(updatedCoupon ? 200 : 404).json(commonResponse(updatedCoupon ? 'Coupon updated successfully' : 'Coupon not found', !!updatedCoupon, updatedCoupon || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const deleteCoupon = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    const result = await Coupon.deleteMany({ _id: { $in: id } }).exec();
    res.status(result.deletedCount > 0 ? 200 : 404).json(commonResponse(result.deletedCount > 0 ? 'Coupon(s) deleted successfully' : 'Coupon(s) not found', result.deletedCount > 0));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};
