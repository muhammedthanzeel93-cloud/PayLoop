import { Router } from 'express';
import { messagingController } from './messaging.controller';

const router = Router();

router.get('/', messagingController.getStatus);

export default router;
