import { Router } from 'express';
import v1Routes from './api/v1';

const router = Router();

// Mount API versions
router.use('/api/v1', v1Routes);

export default router;
