import { Router } from 'express';
import { ACCOUNT_TYPES } from '@kerala-tourism/constants';
import { authenticate } from '../../middlewares/auth.middleware';
import {
  requireAccountType,
  requireActiveAccount,
} from '../../middlewares/authorization.middleware';
import { followRateLimiter } from '../../middlewares/rateLimiter';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validateRequest';
import { followController } from './follow.controller';
import {
  followActionBodySchema,
  followListQuerySchema,
  userIdParamSchema,
} from './follow.validation';
import { usersController } from './users.controller';

const router = Router();

router.get('/', usersController.getStatus);

// Public Follow Lists (Day 15) — active TOURIST accounts only, with anti-enumeration 404
router.get(
  '/:userId/followers',
  validateParams(userIdParamSchema),
  validateQuery(followListQuerySchema),
  followController.listFollowers,
);

router.get(
  '/:userId/following',
  validateParams(userIdParamSchema),
  validateQuery(followListQuerySchema),
  followController.listFollowing,
);

export const touristFollowRoutes = Router();

touristFollowRoutes.post(
  '/:userId/follow',
  followRateLimiter,
  authenticate,
  requireActiveAccount,
  requireAccountType(ACCOUNT_TYPES.TOURIST),
  validateParams(userIdParamSchema),
  validateBody(followActionBodySchema),
  followController.followUser,
);

touristFollowRoutes.delete(
  '/:userId/follow',
  followRateLimiter,
  authenticate,
  requireActiveAccount,
  requireAccountType(ACCOUNT_TYPES.TOURIST),
  validateParams(userIdParamSchema),
  validateBody(followActionBodySchema),
  followController.unfollowUser,
);

export default router;
