import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import {
  requireAccountType,
  requireActiveAccount,
  requireAnyPermission,
  requirePermission,
} from '../../middlewares/authorization.middleware';
import { adminMutationRateLimiter } from '../../middlewares/rateLimiter';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validateRequest';
import {
  adminUserIdParamSchema,
  adminUsersQuerySchema,
  reactivateUserSchema,
  suspendUserSchema,
  verifyBusinessActionSchema,
} from '@kerala-tourism/validation';
import { adminController } from '../admin';
import { adminModerationRoutes } from '../moderation';
import { authorizationController } from './authorization.controller';
import { destinationsController } from '../destinations/destinations.controller';
import { ACCOUNT_TYPES, ADMIN_PERMISSIONS } from '@kerala-tourism/constants';

const router = Router();

// Admin Dashboard (Day 10 compatibility): Requires VIEW_ANALYTICS
router.get(
  '/dashboard',
  authenticate,
  requireActiveAccount,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requirePermission(ADMIN_PERMISSIONS.VIEW_ANALYTICS),
  authorizationController.getAdminDashboard,
);

// Admin Dashboard Overview (Day 17): Requires VIEW_DASHBOARD
router.get(
  '/dashboard/overview',
  authenticate,
  requireActiveAccount,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requirePermission(ADMIN_PERMISSIONS.VIEW_DASHBOARD),
  adminController.getDashboardOverview,
);

// Admin User Management Directory (Day 17): Requires VIEW_USERS or MANAGE_USERS
router.get(
  '/users',
  authenticate,
  requireActiveAccount,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requireAnyPermission([ADMIN_PERMISSIONS.VIEW_USERS, ADMIN_PERMISSIONS.MANAGE_USERS]),
  validateQuery(adminUsersQuerySchema),
  adminController.listUsers,
);

// Admin User Details (Day 17): Requires VIEW_USERS or MANAGE_USERS
router.get(
  '/users/:userId',
  authenticate,
  requireActiveAccount,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requireAnyPermission([ADMIN_PERMISSIONS.VIEW_USERS, ADMIN_PERMISSIONS.MANAGE_USERS]),
  validateParams(adminUserIdParamSchema),
  adminController.getUserDetails,
);

// Admin Suspend User (Day 17): Requires SUSPEND_USERS
router.patch(
  '/users/:userId/suspend',
  authenticate,
  requireActiveAccount,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requirePermission(ADMIN_PERMISSIONS.SUSPEND_USERS),
  adminMutationRateLimiter,
  validateParams(adminUserIdParamSchema),
  validateBody(suspendUserSchema),
  adminController.suspendUser,
);

// Admin Reactivate User (Day 17): Requires MANAGE_USERS
router.patch(
  '/users/:userId/reactivate',
  authenticate,
  requireActiveAccount,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requirePermission(ADMIN_PERMISSIONS.MANAGE_USERS),
  adminMutationRateLimiter,
  validateParams(adminUserIdParamSchema),
  validateBody(reactivateUserSchema),
  adminController.reactivateUser,
);

// Admin Business Verification: Requires VERIFY_BUSINESSES
router.patch(
  '/businesses/:businessId/verify',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requirePermission(ADMIN_PERMISSIONS.VERIFY_BUSINESSES),
  validateBody(verifyBusinessActionSchema),
  authorizationController.verifyBusinessAction,
);

// Admin Destination Management (Day 11)
router.post(
  '/destinations',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requirePermission(ADMIN_PERMISSIONS.MANAGE_DESTINATIONS),
  destinationsController.adminCreateDestination,
);

router.patch(
  '/destinations/:id',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requirePermission(ADMIN_PERMISSIONS.MANAGE_DESTINATIONS),
  destinationsController.adminUpdateDestination,
);

router.patch(
  '/destinations/:id/publish',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requirePermission(ADMIN_PERMISSIONS.MANAGE_DESTINATIONS),
  destinationsController.adminPublishDestination,
);

router.patch(
  '/destinations/:id/archive',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requirePermission(ADMIN_PERMISSIONS.MANAGE_DESTINATIONS),
  destinationsController.adminArchiveDestination,
);

router.get(
  '/destination-submissions',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requirePermission(ADMIN_PERMISSIONS.VERIFY_DESTINATIONS),
  destinationsController.adminListSubmissions,
);

router.patch(
  '/destination-submissions/:id/review',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requirePermission(ADMIN_PERMISSIONS.VERIFY_DESTINATIONS),
  destinationsController.adminReviewSubmission,
);

// Admin Content Moderation System (Day 18)
router.use('/moderation', adminModerationRoutes);

export default router;
