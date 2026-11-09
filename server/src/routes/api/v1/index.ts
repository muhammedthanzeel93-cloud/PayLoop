import { Router } from 'express';
import healthRoutes from './health.routes';

const router = Router();

// Mount modules under /api/v1
router.use('/health', healthRoutes);

export default router;
