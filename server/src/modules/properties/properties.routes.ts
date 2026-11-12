import { Router } from 'express';
import { propertiesController } from './properties.controller';

const router = Router();

router.get('/', propertiesController.getStatus);

export default router;
