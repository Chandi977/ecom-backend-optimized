import { Response } from 'express';
import { SearchQueryLog, ProductViewLog } from './demand-signal.model';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';
import { logger } from '../../utils/logger';

const windowFilter = (req: IAuthRequest) => {
  const days = parseInt(String(req.query.days ?? '30'), 10);
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30;
  return { createdAt: { $gte: new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000) } };
};

// POST /demand/track/search — public (optionalAuth). Fire-and-forget friendly.
export const trackSearch = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const query = String(req.body?.query ?? '').trim();
    if (!query) {
      res.status(400).json(commonResponse('query is required', false));
      return;
    }
    const resultsCount = Number(req.body?.resultsCount) || 0;

    await SearchQueryLog.create({
      query,
      resultsCount,
      zeroResults: resultsCount === 0,
      source: req.body?.source ? String(req.body.source) : undefined,
      userId: req.user,
    });

    res.status(201).json(commonResponse('ok', true));
  } catch (error) {
    logger.warn('trackSearch error', { error: error instanceof Error ? error.message : 'Unknown' });
    // Never fail the customer flow for a tracking call.
    res.status(200).json(commonResponse('ok', true));
  }
};

// POST /demand/track/view — public (optionalAuth).
export const trackProductView = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const productId = String(req.body?.productId ?? '').trim();
    if (!productId) {
      res.status(400).json(commonResponse('productId is required', false));
      return;
    }

    await ProductViewLog.create({
      productId,
      productName: req.body?.productName ? String(req.body.productName) : undefined,
      category: req.body?.category ? String(req.body.category) : undefined,
      source: req.body?.source ? String(req.body.source) : undefined,
      userId: req.user,
    });

    res.status(201).json(commonResponse('ok', true));
  } catch (error) {
    logger.warn('trackProductView error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(200).json(commonResponse('ok', true));
  }
};

// GET /demand/signals — admin-only aggregated view to drive stocking/featuring decisions.
export const getDemandSignals = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const match = windowFilter(req);

    const [topSearches, zeroResultSearches, topViewedProducts, trendingCategories] = await Promise.all([
      SearchQueryLog.aggregate([
        { $match: match },
        { $group: { _id: '$query', searches: { $sum: 1 }, avgResults: { $avg: '$resultsCount' } } },
        { $sort: { searches: -1 } },
        { $limit: 25 },
      ]),
      SearchQueryLog.aggregate([
        { $match: { ...match, zeroResults: true } },
        { $group: { _id: '$query', searches: { $sum: 1 } } },
        { $sort: { searches: -1 } },
        { $limit: 25 },
      ]),
      ProductViewLog.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$productId',
            views: { $sum: 1 },
            productName: { $first: '$productName' },
            category: { $first: '$category' },
          },
        },
        { $sort: { views: -1 } },
        { $limit: 25 },
      ]),
      ProductViewLog.aggregate([
        { $match: { ...match, category: { $ne: null } } },
        { $group: { _id: '$category', views: { $sum: 1 } } },
        { $sort: { views: -1 } },
        { $limit: 15 },
      ]),
    ]);

    res.status(200).json(
      commonResponse('Demand signals fetched', true, {
        topSearches,
        zeroResultSearches,
        topViewedProducts,
        trendingCategories,
      })
    );
  } catch (error) {
    logger.error('getDemandSignals error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal server error.', false));
  }
};
