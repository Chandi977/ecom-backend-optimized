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
  PAID_ORDER_STATUSES: ['Payment Processed'],
  default: {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    aggregate: jest.fn(),
  },
}));
jest.mock('../order/order.model', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../product/product.model', () => ({ __esModule: true, default: { updateOne: jest.fn() } }));
jest.mock('../auth/auth.model', () => ({ __esModule: true, default: { findById: jest.fn() } }));

import { createReview, recomputeProductRating } from './review.controller';
import Review from './review.model';
import Order from '../order/order.model';
import Product from '../product/product.model';
import User from '../auth/auth.model';

const mockReview = Review as unknown as Record<string, jest.Mock>;
const mockOrder = Order as unknown as { findOne: jest.Mock };
const mockProduct = Product as unknown as { updateOne: jest.Mock };
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
  [mockReview.findOne, mockReview.findById, mockReview.create, mockReview.aggregate,
    mockOrder.findOne, mockProduct.updateOne, mockUser.findById].forEach((m) => m.mockReset());
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
