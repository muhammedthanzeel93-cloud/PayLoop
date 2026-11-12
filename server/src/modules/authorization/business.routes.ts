import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import {
  requireAccountType,
  requireVerifiedBusiness,
} from '../../middlewares/authorization.middleware';
import { validateBody } from '../../middlewares/validateRequest';
import {
  updateBusinessProfileSchema,
  createPropertySchema,
  createTourPackageSchema,
} from '@kerala-tourism/validation';
import { authorizationController } from './authorization.controller';
import { ACCOUNT_TYPES } from '@kerala-tourism/constants';

const router = Router();

// Business Profile: Self-Read
router.get(
  '/profile',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.BUSINESS),
  authorizationController.getBusinessProfile,
);

// Business Profile: Self-Update
router.patch(
  '/profile',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.BUSINESS),
  validateBody(updateBusinessProfileSchema),
  authorizationController.updateBusinessProfile,
);

// Business Dashboard: All Active Businesses
router.get(
  '/dashboard',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.BUSINESS),
  authorizationController.getBusinessDashboard,
);

// Property Creation: Restricted to VERIFIED Businesses
router.post(
  '/properties',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.BUSINESS),
  requireVerifiedBusiness,
  validateBody(createPropertySchema),
  authorizationController.createProperty,
);

// Package Creation: Restricted to VERIFIED Businesses
router.post(
  '/packages',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.BUSINESS),
  requireVerifiedBusiness,
  validateBody(createTourPackageSchema),
  authorizationController.createPackage,
);

// Property Update: Verified Business + Direct Ownership
router.patch(
  '/properties/:propertyId',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.BUSINESS),
  requireVerifiedBusiness,
  authorizationController.updateProperty,
);

// Package Update: Verified Business + Direct Ownership
router.patch(
  '/packages/:packageId',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.BUSINESS),
  requireVerifiedBusiness,
  authorizationController.updatePackage,
);

// Booking Inspection: Business Ownership
router.get(
  '/bookings/:bookingId',
  authenticate,
  requireAccountType(ACCOUNT_TYPES.BUSINESS),
  authorizationController.getBusinessBooking,
);

export default router;
