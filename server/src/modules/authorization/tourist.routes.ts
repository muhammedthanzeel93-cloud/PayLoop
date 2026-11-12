import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireAccountType } from '../../middlewares/authorization.middleware';
import { validateBody } from '../../middlewares/validateRequest';
import { updateTouristProfileSchema } from '@kerala-tourism/validation';
import { authorizationController } from './authorization.controller';
import { destinationsController } from '../destinations/destinations.controller';
import { touristCommentRoutes, touristFeedRoutes, touristPostRoutes } from '../posts';
import { touristReportRoutes } from '../moderation';
import { touristFollowRoutes } from '../users';
import { ACCOUNT_TYPES } from '@kerala-tourism/constants';

const router = Router();

// Tourist Profile: Self-Read
router.get(
  '/profile',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.TOURIST),
  authorizationController.getTouristProfile,
);

// Tourist Profile: Self-Update
router.patch(
  '/profile',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.TOURIST),
  validateBody(updateTouristProfileSchema),
  authorizationController.updateTouristProfile,
);

// Tourist Posts Management (Day 13) & Post Engagement (Day 14)
router.use('/posts', touristPostRoutes);
router.use('/comments', touristCommentRoutes);

// Personalized Following Feed (Day 16)
router.use('/feed', touristFeedRoutes);

// Tourist Content Reports (Day 18)
router.use('/reports', touristReportRoutes);

// Tourist Follow & Unfollow System (Day 15)
router.use('/users', touristFollowRoutes);

// Tourist Destination Submissions (Day 11)
router.post(
  '/destination-submissions',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.TOURIST),
  destinationsController.touristCreateSubmission,
);

router.get(
  '/destination-submissions',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.TOURIST),
  destinationsController.touristListSubmissions,
);

router.get(
  '/destination-submissions/:id',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.TOURIST),
  destinationsController.touristGetSubmission,
);

export default router;
