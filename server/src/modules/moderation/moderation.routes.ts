import { Router } from 'express';
import { ACCOUNT_TYPES, ADMIN_PERMISSIONS } from '@kerala-tourism/constants';
import { authenticate } from '../../middlewares/auth.middleware';
import {
  requireAccountType,
  requireActiveAccount,
  requireAnyPermission,
  requirePermission,
} from '../../middlewares/authorization.middleware';
import {
  moderationRateLimiter,
  reportRateLimiter,
} from '../../middlewares/rateLimiter';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validateRequest';
import { moderationController } from './moderation.controller';
import {
  adminReportsQuerySchema,
  approveDestinationModerationSchema,
  approvePostModerationSchema,
  createContentReportSchema,
  moderationCommentIdParamSchema,
  moderationCommentsQuerySchema,
  moderationDestinationsQuerySchema,
  moderationPostIdParamSchema,
  moderationPostsQuerySchema,
  moderationQueueQuerySchema,
  rejectDestinationModerationSchema,
  rejectPostModerationSchema,
  removeCommentModerationSchema,
  removePostModerationSchema,
  reportIdParamSchema,
  restoreCommentModerationSchema,
  reviewReportSchema,
  submissionIdParamSchema,
  touristReportsQuerySchema,
} from './moderation.validation';

// ==============================================================================
// ADMIN MODERATION ROUTES (/api/v1/admin/moderation)
// ==============================================================================

export const adminModerationRoutes = Router();

adminModerationRoutes.use(
  authenticate,
  requireActiveAccount,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
);

adminModerationRoutes.get(
  '/queue',
  requirePermission(ADMIN_PERMISSIONS.VIEW_MODERATION_QUEUE),
  validateQuery(moderationQueueQuerySchema),
  moderationController.getModerationQueue,
);

adminModerationRoutes.get(
  '/destinations',
  requireAnyPermission([
    ADMIN_PERMISSIONS.VIEW_MODERATION_QUEUE,
    ADMIN_PERMISSIONS.MODERATE_DESTINATIONS,
  ]),
  validateQuery(moderationDestinationsQuerySchema),
  moderationController.listDestinations,
);

adminModerationRoutes.patch(
  '/destinations/:submissionId/approve',
  requirePermission(ADMIN_PERMISSIONS.MODERATE_DESTINATIONS),
  moderationRateLimiter,
  validateParams(submissionIdParamSchema),
  validateBody(approveDestinationModerationSchema),
  moderationController.approveDestination,
);

adminModerationRoutes.patch(
  '/destinations/:submissionId/reject',
  requirePermission(ADMIN_PERMISSIONS.MODERATE_DESTINATIONS),
  moderationRateLimiter,
  validateParams(submissionIdParamSchema),
  validateBody(rejectDestinationModerationSchema),
  moderationController.rejectDestination,
);

adminModerationRoutes.get(
  '/posts',
  requireAnyPermission([
    ADMIN_PERMISSIONS.VIEW_MODERATION_QUEUE,
    ADMIN_PERMISSIONS.MODERATE_POSTS,
  ]),
  validateQuery(moderationPostsQuerySchema),
  moderationController.listPosts,
);

adminModerationRoutes.patch(
  '/posts/:postId/approve',
  requirePermission(ADMIN_PERMISSIONS.MODERATE_POSTS),
  moderationRateLimiter,
  validateParams(moderationPostIdParamSchema),
  validateBody(approvePostModerationSchema),
  moderationController.approvePost,
);

adminModerationRoutes.patch(
  '/posts/:postId/reject',
  requirePermission(ADMIN_PERMISSIONS.MODERATE_POSTS),
  moderationRateLimiter,
  validateParams(moderationPostIdParamSchema),
  validateBody(rejectPostModerationSchema),
  moderationController.rejectPost,
);

adminModerationRoutes.patch(
  '/posts/:postId/remove',
  requirePermission(ADMIN_PERMISSIONS.MODERATE_POSTS),
  moderationRateLimiter,
  validateParams(moderationPostIdParamSchema),
  validateBody(removePostModerationSchema),
  moderationController.removePost,
);

adminModerationRoutes.get(
  '/comments',
  requireAnyPermission([
    ADMIN_PERMISSIONS.VIEW_MODERATION_QUEUE,
    ADMIN_PERMISSIONS.MODERATE_COMMENTS,
  ]),
  validateQuery(moderationCommentsQuerySchema),
  moderationController.listComments,
);

adminModerationRoutes.patch(
  '/comments/:commentId/remove',
  requirePermission(ADMIN_PERMISSIONS.MODERATE_COMMENTS),
  moderationRateLimiter,
  validateParams(moderationCommentIdParamSchema),
  validateBody(removeCommentModerationSchema),
  moderationController.removeComment,
);

adminModerationRoutes.patch(
  '/comments/:commentId/restore',
  requirePermission(ADMIN_PERMISSIONS.MODERATE_COMMENTS),
  moderationRateLimiter,
  validateParams(moderationCommentIdParamSchema),
  validateBody(restoreCommentModerationSchema),
  moderationController.restoreComment,
);

adminModerationRoutes.get(
  '/reports',
  requireAnyPermission([
    ADMIN_PERMISSIONS.VIEW_MODERATION_QUEUE,
    ADMIN_PERMISSIONS.REVIEW_REPORTS,
  ]),
  validateQuery(adminReportsQuerySchema),
  moderationController.listAdminReports,
);

adminModerationRoutes.patch(
  '/reports/:reportId/review',
  requirePermission(ADMIN_PERMISSIONS.REVIEW_REPORTS),
  moderationRateLimiter,
  validateParams(reportIdParamSchema),
  validateBody(reviewReportSchema),
  moderationController.reviewReport,
);

// ==============================================================================
// TOURIST REPORT ROUTES (/api/v1/tourist/reports)
// ==============================================================================

export const touristReportRoutes = Router();

touristReportRoutes.use(
  authenticate,
  requireActiveAccount,
  requireAccountType(ACCOUNT_TYPES.TOURIST),
);

touristReportRoutes.post(
  '/',
  reportRateLimiter,
  validateBody(createContentReportSchema),
  moderationController.createTouristReport,
);

touristReportRoutes.get(
  '/',
  validateQuery(touristReportsQuerySchema),
  moderationController.listTouristReports,
);
