import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import {
  requireAccountType,
  requirePermission,
} from '../../middlewares/authorization.middleware';
import { validateBody } from '../../middlewares/validateRequest';
import { verifyBusinessActionSchema } from '@kerala-tourism/validation';
import { authorizationController } from './authorization.controller';
import { destinationsController } from '../destinations/destinations.controller';
import { ACCOUNT_TYPES, ADMIN_PERMISSIONS } from '@kerala-tourism/constants';

const router = Router();

// Admin Dashboard: Requires VIEW_ANALYTICS
router.get(
  '/dashboard',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requirePermission(ADMIN_PERMISSIONS.VIEW_ANALYTICS),
  authorizationController.getAdminDashboard,
);

// Admin User Management: Requires MANAGE_USERS
router.get(
  '/users',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.ADMIN),
  requirePermission(ADMIN_PERMISSIONS.MANAGE_USERS),
  authorizationController.getAdminUsers,
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

export default router;
