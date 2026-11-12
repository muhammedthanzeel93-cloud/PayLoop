import { Router } from 'express';
import { authController } from './auth.controller';
import { validateBody } from '../../middlewares/validateRequest';
import {
  registrationRateLimiter,
  loginRateLimiter,
  refreshRateLimiter,
} from '../../middlewares/rateLimiter';
import { authenticate } from '../../middlewares/auth.middleware';
import {
  touristRegistrationSchema,
  businessRegistrationSchema,
  loginSchema,
  refreshTokenSchema,
} from '@kerala-tourism/validation';

const router = Router();

// Status Check
router.get('/', authController.getStatus);

// Tourist Registration
router.post(
  '/register/tourist',
  registrationRateLimiter,
  validateBody(touristRegistrationSchema),
  authController.registerTourist,
);

// Business Registration
router.post(
  '/register/business',
  registrationRateLimiter,
  validateBody(businessRegistrationSchema),
  authController.registerBusiness,
);

// Account Login
router.post(
  '/login',
  loginRateLimiter,
  validateBody(loginSchema),
  authController.login,
);

// Token Refresh & Rotation
router.post(
  '/refresh',
  refreshRateLimiter,
  validateBody(refreshTokenSchema),
  authController.refreshToken,
);

// Current Account Details & Profile
router.get(
  '/me',
  authenticate,
  authController.getMe,
);

// Single Device Logout
router.post(
  '/logout',
  authController.logout,
);

// Logout from All Devices
router.post(
  '/logout-all',
  authenticate,
  authController.logoutAll,
);

export default router;
