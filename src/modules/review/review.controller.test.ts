// Locks in the verified-purchase gate and the denormalized rating recompute that
// the customer review system depends on.
const makeQuery = (result: unknown) => {
  const q: Record<string, jest.Mock> = {};
  q.select = jest.fn(() => q);
  q.lean = jest.fn(() => q);
  q.populate = jest.fn(() => q);
  q.sort = jest.fn(() => q);
  q.skip = jest.fn(() => q);
  q.limit = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(result);
  return q;
};

jest.mock('./review.model', () => ({
  __esModule: true,
  REVIEW_STATUSES: ['pending', 'approved', 'rejected'],
  PAID_ORDER_STATUSES: ['Payment Processed', 'Paid', 'Payment Verified'],
  default: {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    aggregate: jest.fn(),
  },
}));
jest.mock('../order/order.model', () => ({ __esModule: true, default: { find: jest.fn(), findOne: jest.fn() } }));
jest.mock('../product/product.model', () => ({ __esModule: true, default: { find: jest.fn(), updateOne: jest.fn() } }));
jest.mock('../auth/auth.model', () => ({ __esModule: true, default: { findById: jest.fn() } }));

import { createReview, getReviewableProducts, recomputeProductRating } from './review.controller';
import Review from './review.model';
import Order from '../order/order.model';
import Product from '../product/product.model';
import User from '../auth/auth.model';

const mockReview = Review as unknown as Record<string, jest.Mock>;
const mockOrder = Order as unknown as { find: jest.Mock; findOne: jest.Mock };
const mockProduct = Product as unknown as { find: jest.Mock; updateOne: jest.Mock };
const mockUser = User as unknown as { findById: jest.Mock };

const PRODUCT_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f191e810c19729de860ea';

const makeRes = () => {
  const res: Record<string, jest.Mock> = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

beforeEach(() => {
  [mockReview.find, mockReview.findOne, mockReview.findById, mockReview.create, mockReview.aggregate,
    mockOrder.find, mockOrder.findOne, mockProduct.find, mockProduct.updateOne,
    mockUser.findById].forEach((m) => m.mockReset());
});

describe('createReview — verified-purchase gate', () => {
  it('rejects a user with no qualifying paid order (403)', async () => {
    mockOrder.findOne.mockReturnValue(makeQuery(null)); // no paid order
    const res = makeRes();
    await createReview(
      { user: USER_ID, body: { productId: PRODUCT_ID, rating: 5, comment: 'Great' } } as any,
      res as any,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockReview.create).not.toHaveBeenCalled();
  });

  it('blocks a second review for the same product (409)', async () => {
    mockOrder.findOne.mockReturnValue(makeQuery({ _id: 'order1' }));
    mockReview.findOne.mockReturnValue(makeQuery({ _id: 'existing' }));
    const res = makeRes();
    await createReview(
      { user: USER_ID, body: { productId: PRODUCT_ID, rating: 4, comment: 'Nice' } } as any,
      res as any,
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockReview.create).not.toHaveBeenCalled();
  });

  it('creates a pending review for a verified purchaser (201)', async () => {
    mockOrder.findOne.mockReturnValue(makeQuery({ _id: 'order1' }));
    mockReview.findOne.mockReturnValue(makeQuery(null));
    mockUser.findById.mockReturnValue(makeQuery({ first_name: 'Asha', last_name: 'K' }));
    mockReview.create.mockResolvedValue({
      toObject: () => ({ _id: 'r1', product: PRODUCT_ID, rating: 5, comment: 'Great', status: 'pending' }),
    });
    const res = makeRes();
    await createReview(
      { user: USER_ID, body: { productId: PRODUCT_ID, rating: 5, comment: 'Great', title: 'Loved it' } } as any,
      res as any,
    );
    expect(mockOrder.findOne).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.anything(),
      'items.product': expect.anything(),
      paymentStatus: { $in: ['Payment Processed', 'Paid', 'Payment Verified'] },
      status: { $ne: 'Cancelled' },
    }));
    expect(mockReview.create).toHaveBeenCalledWith(expect.objectContaining({
      product: PRODUCT_ID,
      user: USER_ID,
      order: 'order1',
      status: 'pending',
      reviewerName: 'Asha K',
      verifiedPurchase: true,
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('getReviewableProducts — review prompt source', () => {
  const order = {
    orderId: 'PI-10001',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    items: [{ product: PRODUCT_ID }],
  };

  it('returns purchased products that have not been reviewed yet', async () => {
    mockOrder.find.mockReturnValue(makeQuery([order]));
    mockReview.find.mockReturnValue(makeQuery([]));
    mockProduct.find.mockReturnValue(makeQuery([{ _id: PRODUCT_ID, name: 'Box', slug: 'box', images: [] }]));
    const res = makeRes();
    await getReviewableProducts({ user: USER_ID } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: [expect.objectContaining({
        orderId: 'PI-10001',
        product: expect.objectContaining({ _id: PRODUCT_ID, name: 'Box', slug: 'box' }),
      })],
    }));
  });

  it('omits products the customer already reviewed', async () => {
    mockOrder.find.mockReturnValue(makeQuery([order]));
    mockReview.find.mockReturnValue(makeQuery([{ product: PRODUCT_ID }]));
    mockProduct.find.mockReturnValue(makeQuery([{ _id: PRODUCT_ID, name: 'Box', slug: 'box', images: [] }]));
    const res = makeRes();
    await getReviewableProducts({ user: USER_ID } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: [] }));
  });

  it('rejects an unauthenticated caller (401)', async () => {
    const res = makeRes();
    await getReviewableProducts({} as any, res as any);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockOrder.find).not.toHaveBeenCalled();
  });
});

describe('recomputeProductRating', () => {
  it('writes the rounded average and count from approved reviews', async () => {
    mockReview.aggregate.mockResolvedValue([{ avg: 4.333333, count: 3 }]);
    mockProduct.updateOne.mockReturnValue(makeQuery({}));
    await recomputeProductRating(PRODUCT_ID);
    expect(mockProduct.updateOne).toHaveBeenCalledWith(
      { _id: PRODUCT_ID },
      { $set: { ratingAverage: 4.3, ratingCount: 3 } },
    );
  });

  it('resets to zero when there are no approved reviews', async () => {
    mockReview.aggregate.mockResolvedValue([]);
    mockProduct.updateOne.mockReturnValue(makeQuery({}));
    await recomputeProductRating(PRODUCT_ID);
    expect(mockProduct.updateOne).toHaveBeenCalledWith(
      { _id: PRODUCT_ID },
      { $set: { ratingAverage: 0, ratingCount: 0 } },
    );
  });
});
