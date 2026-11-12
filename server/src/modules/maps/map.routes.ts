import { Router } from 'express';
import { mapController } from './map.controller';

const router = Router();

router.get('/config', mapController.getConfig);

export default router;
