import { Router } from 'express';
import { agenciesController } from './agencies.controller';

const router = Router();

router.get('/', agenciesController.getStatus);

export default router;
