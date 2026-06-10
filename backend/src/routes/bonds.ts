import { Router } from 'express';
import { z } from 'zod';
import { Issuance } from '../fabric/contracts.js';

export const bondsRouter = Router();

const CreateBondBody = z.object({
  id: z.string().min(1),
  proposalId: z.string().min(1),
  filmTitle: z.string().min(1),
  productoraMSP: z.string().min(1),
  principalCents: z.string().regex(/^\d+$/),
  couponBps: z.number().int().min(0),
  termMonths: z.number().int().positive(),
  numParticipations: z.string().regex(/^\d+$/),
  whitepaperHash: z.string().min(1),
});

bondsRouter.post('/', async (req, res, next) => {
  try {
    const body = CreateBondBody.parse(req.body);
    await Issuance.createBond(body);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

bondsRouter.post('/:id/mint', async (req, res, next) => {
  try {
    const { investorId, amount } = z.object({
      investorId: z.string().min(1),
      amount: z.string().regex(/^\d+$/),
    }).parse(req.body);
    await Issuance.mint(req.params.id, investorId, amount);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

bondsRouter.get('/:id/balance/:investorId', async (req, res, next) => {
  try {
    const balance = await Issuance.balanceOf(req.params.id, req.params.investorId);
    res.json({ balance: balance.toString() });
  } catch (e) { next(e); }
});
