import { Router } from 'express';
import { socialController } from './social.controller';

const router = Router();

router.get('/', socialController.getStatus);

export default router;
