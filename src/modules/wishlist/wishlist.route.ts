import { Router } from 'express';
import { addToWishlist, getWishlist, getWishlistCount, removeFromWishlist } from './wishlist.controller';
import { userMiddleware, validate } from '../../middleware';
import { addToWishlistSchema, removeFromWishlistSchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/AddtoWishlist', userMiddleware, validate(addToWishlistSchema), addToWishlist);
router.get('/wishlist/:id', userMiddleware, getWishlist);
router.get('/wishlist/count/:id', userMiddleware, getWishlistCount);
router.post('/removefromwishlist', userMiddleware, validate(removeFromWishlistSchema), removeFromWishlist);

export default router;
