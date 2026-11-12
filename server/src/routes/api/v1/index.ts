import { Router } from 'express';
import { healthRoutes } from '../../../modules/health';
import { authRoutes } from '../../../modules/auth';
import { usersRoutes } from '../../../modules/users';
import { destinationsRoutes, destinationsController } from '../../../modules/destinations';
import { postRoutes } from '../../../modules/posts';
import { socialRoutes } from '../../../modules/social';
import { messagingRoutes } from '../../../modules/messaging';
import { agenciesRoutes } from '../../../modules/agencies';
import { propertiesRoutes } from '../../../modules/properties';
import { bookingsRoutes } from '../../../modules/bookings';
import { paymentsRoutes } from '../../../modules/payments';
import touristRoutes from '../../../modules/authorization/tourist.routes';
import businessRoutes from '../../../modules/authorization/business.routes';
import adminRoutes from '../../../modules/authorization/admin.routes';
import { mapRoutes } from '../../../modules/maps';

const router = Router();

// Mount all v1 feature modules
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/tourist', touristRoutes);
router.use('/business', businessRoutes);
router.use('/admin', adminRoutes);
router.use('/users', usersRoutes);
router.use('/destinations', destinationsRoutes);
router.get('/destination-categories', destinationsController.listCategories);
router.use('/maps', mapRoutes);
router.use('/posts', postRoutes);
router.use('/social', socialRoutes);
router.use('/messaging', messagingRoutes);
router.use('/agencies', agenciesRoutes);
router.use('/properties', propertiesRoutes);
router.use('/bookings', bookingsRoutes);
router.use('/payments', paymentsRoutes);

export default router;
