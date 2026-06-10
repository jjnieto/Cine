import { Router } from 'express';
import { z } from 'zod';
import { Issuance } from '../fabric/contracts.js';

export const portfolioRouter = Router();

interface BondSummary {
  id: string;
  filmTitle: string;
  productoraMsp: string;
  couponBps: number;
  termMonths: number;
  participationValueCents: number;
  numParticipations: number;
  totalSupply: number;
}

// Portfolio: por cada bono ACTIVO con balance > 0 para el inversor.
portfolioRouter.get('/:investorId', async (req, res, next) => {
  try {
    const investorId = z.string().min(1).parse(req.params.investorId);
    const bonds = (await Issuance.listBonds<BondSummary[]>()) ?? [];
    const out: Array<BondSummary & { balance: number }> = [];
    for (const b of bonds) {
      const bal = await Issuance.balanceOf(b.id, investorId);
      if (bal > 0n) out.push({ ...b, balance: Number(bal) });
    }
    res.json(out);
  } catch (e) { next(e); }
});
