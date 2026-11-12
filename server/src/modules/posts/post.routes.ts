import { Router } from 'express';
import { ACCOUNT_TYPES } from '@kerala-tourism/constants';
import { authenticate } from '../../middlewares/auth.middleware';
import {
  requireAccountType,
  requireActiveAccount,
} from '../../middlewares/authorization.middleware';
import {
  engagementRateLimiter,
  postCreationRateLimiter,
} from '../../middlewares/rateLimiter';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validateRequest';
import { postsController } from './post.controller';
import { postEngagementController } from './post-engagement.controller';
import {
  createPostSchema,
  followingFeedQuerySchema,
  postIdParamSchema,
  publicPostsFeedQuerySchema,
  touristOwnPostsQuerySchema,
  updatePostSchema,
} from './post.validation';
import {
  commentIdParamSchema,
  createCommentSchema,
  postCommentsQuerySchema,
  updateCommentSchema,
} from './post-engagement.validation';

/**
 * Public Social Feed & Single Public Post Routes (/api/v1/posts)
 */
const publicPostRouter = Router();

publicPostRouter.get(
  '/',
  validateQuery(publicPostsFeedQuerySchema),
  postsController.getPublicFeed,
);

publicPostRouter.get(
  '/:postId/comments',
  validateParams(postIdParamSchema),
  validateQuery(postCommentsQuerySchema),
  postEngagementController.listPostComments,
);

publicPostRouter.get(
  '/:postId',
  validateParams(postIdParamSchema),
  postsController.getPublicPostById,
);

/**
 * Authenticated Tourist Post Management Routes (/api/v1/tourist/posts)
 */
const touristPostRouter = Router();
const touristGuards = [
  authenticate,
  requireActiveAccount,
  requireAccountType(ACCOUNT_TYPES.TOURIST),
];

touristPostRouter.post(
  '/',
  postCreationRateLimiter,
  ...touristGuards,
  validateBody(createPostSchema),
  postsController.createPost,
);

touristPostRouter.get(
  '/',
  ...touristGuards,
  validateQuery(touristOwnPostsQuerySchema),
  postsController.listOwnPosts,
);

touristPostRouter.get(
  '/:postId',
  ...touristGuards,
  validateParams(postIdParamSchema),
  postsController.getOwnPostById,
);

touristPostRouter.patch(
  '/:postId',
  ...touristGuards,
  validateParams(postIdParamSchema),
  validateBody(updatePostSchema),
  postsController.updateOwnPost,
);

touristPostRouter.delete(
  '/:postId',
  ...touristGuards,
  validateParams(postIdParamSchema),
  postsController.deleteOwnPost,
);

// Day 14: Post Likes
touristPostRouter.post(
  '/:postId/likes',
  engagementRateLimiter,
  ...touristGuards,
  validateParams(postIdParamSchema),
  postEngagementController.likePost,
);

touristPostRouter.delete(
  '/:postId/likes',
  ...touristGuards,
  validateParams(postIdParamSchema),
  postEngagementController.unlikePost,
);

// Day 14: Post Comments (create scoped to post)
touristPostRouter.post(
  '/:postId/comments',
  engagementRateLimiter,
  ...touristGuards,
  validateParams(postIdParamSchema),
  validateBody(createCommentSchema),
  postEngagementController.createComment,
);

// Day 14: Post Reposts
touristPostRouter.post(
  '/:postId/reposts',
  engagementRateLimiter,
  ...touristGuards,
  validateParams(postIdParamSchema),
  postEngagementController.repostPost,
);

touristPostRouter.delete(
  '/:postId/reposts',
  ...touristGuards,
  validateParams(postIdParamSchema),
  postEngagementController.unrepostPost,
);

/**
 * Authenticated Tourist Comment Management Routes (/api/v1/tourist/comments)
 */
const touristCommentRouter = Router();

touristCommentRouter.patch(
  '/:commentId',
  ...touristGuards,
  validateParams(commentIdParamSchema),
  validateBody(updateCommentSchema),
  postEngagementController.updateComment,
);

touristCommentRouter.delete(
  '/:commentId',
  ...touristGuards,
  validateParams(commentIdParamSchema),
  postEngagementController.deleteComment,
);

/**
 * Authenticated Tourist Personalized Feed Routes (/api/v1/tourist/feed)
 */
const touristFeedRouter = Router();

touristFeedRouter.get(
  '/following',
  ...touristGuards,
  validateQuery(followingFeedQuerySchema),
  postsController.getFollowingFeed,
);

export const postRoutes = publicPostRouter;
export const touristPostRoutes = touristPostRouter;
export const touristCommentRoutes = touristCommentRouter;
export const touristFeedRoutes = touristFeedRouter;
