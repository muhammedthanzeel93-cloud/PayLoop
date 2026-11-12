import { Router } from 'express';
import { paymentsController } from './payments.controller';

const router = Router();

router.get('/', paymentsController.getStatus);

export default router;
