import { Router } from 'express';
import { destinationsController } from './destinations.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireActiveAccount } from '../../middlewares/authorization.middleware';

const router = Router();

// Public destination discovery endpoints
router.get('/', destinationsController.listPublished);
router.get('/nearby', destinationsController.getNearby);
router.get('/search', destinationsController.searchPublished);
router.get('/categories', destinationsController.listCategories);
router.get('/:slug', destinationsController.getBySlug);

// Destination Media Endpoints
router.get('/:id/media', destinationsController.listMedia);
router.post(
  '/:id/media',
  authenticate,
  requireActiveAccount,
  destinationsController.attachMedia,
);
router.patch(
  '/:id/media/:mediaId',
  authenticate,
  requireActiveAccount,
  destinationsController.updateMedia,
);
router.delete(
  '/:id/media/:mediaId',
  authenticate,
  requireActiveAccount,
  destinationsController.deleteMedia,
);

export default router;
