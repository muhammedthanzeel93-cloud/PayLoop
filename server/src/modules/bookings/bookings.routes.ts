import { Router } from 'express';
import { bookingsController } from './bookings.controller';

const router = Router();

router.get('/', bookingsController.getStatus);

export default router;
