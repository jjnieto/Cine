import { Router } from 'express';
import { z } from 'zod';
import { Lifecycle } from '../fabric/contracts.js';

export const paymentsRouter = Router();

const ScheduleCouponBody = z.object({
  bondId: z.string().min(1),
  periodIndex: z.number().int().nonnegative(),
  dueAt: z.number().int().positive(),
  holders: z.record(z.string(), z.number().int().positive()),
  couponPerParticipationCents: z.string().regex(/^\d+$/),
});

paymentsRouter.post('/schedule-coupon', async (req, res, next) => {
  try {
    const body = ScheduleCouponBody.parse(req.body);
    await Lifecycle.scheduleCoupon(body);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

const ConfirmBody = z.object({
  bondId: z.string(),
  periodIndex: z.number().int().nonnegative(),
  investorId: z.string(),
  sepaRefHash: z.string().regex(/^[a-f0-9]{64}$/i),
});

paymentsRouter.post('/confirm', async (req, res, next) => {
  try {
    const body = ConfirmBody.parse(req.body);
    await Lifecycle.confirmPayment(body.bondId, body.periodIndex, body.investorId, body.sepaRefHash);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
