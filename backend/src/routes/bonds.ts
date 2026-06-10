import { Router } from 'express';
import { z } from 'zod';
import { Issuance } from '../fabric/contracts.js';
import { InvestorsStore } from '../store/investors.js';

export const bondsRouter = Router();

bondsRouter.get('/', async (_req, res, next) => {
  try { res.json(await Issuance.listBonds() ?? []); } catch (e) { next(e); }
});

bondsRouter.get('/:id', async (req, res, next) => {
  try { res.json(await Issuance.getBond(req.params.id)); } catch (e) { next(e); }
});

// Tenedores actuales (investorId → balance).
bondsRouter.get('/:id/holders', async (req, res, next) => {
  try {
    const holders = await Issuance.getHolders(req.params.id);
    const enriched = Object.entries(holders).map(([investorId, amount]) => ({
      investorId, amount,
      email: InvestorsStore.get(investorId)?.email,
      fullName: InvestorsStore.get(investorId)?.fullName,
    }));
    res.json(enriched);
  } catch (e) { next(e); }
});

bondsRouter.get('/:id/balance/:investorId', async (req, res, next) => {
  try {
    const balance = await Issuance.balanceOf(req.params.id, req.params.investorId);
    res.json({ balance: balance.toString() });
  } catch (e) { next(e); }
});

// Compra en mercado PRIMARIO: simula el pago SEPA y mintea contra el inversor.
// En producción este endpoint sería un webhook del banco confirmando el ingreso.
const PurchaseBody = z.object({
  investorId: z.string().min(1),
  amount: z.string().regex(/^\d+$/),
});

bondsRouter.post('/:id/purchase', async (req, res, next) => {
  try {
    const { investorId, amount } = PurchaseBody.parse(req.body);
    if (!InvestorsStore.get(investorId)) {
      return res.status(404).json({ error: 'investor not found' });
    }
    await Issuance.mint(req.params.id, investorId, amount);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});
