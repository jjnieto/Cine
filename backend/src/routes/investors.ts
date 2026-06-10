import { Router } from 'express';
import { z } from 'zod';
import { Issuance } from '../fabric/contracts.js';
import { InvestorsStore, type Investor } from '../store/investors.js';
import { createHash, randomUUID } from 'node:crypto';

export const investorsRouter = Router();

const OnboardBody = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  documentId: z.string().min(5),
});

// Alta de inversor: KYC stub + alta on-chain en allowlist + persiste localmente.
investorsRouter.post('/onboard', async (req, res, next) => {
  try {
    const body = OnboardBody.parse(req.body);
    const investorId = createHash('sha256').update(body.documentId).digest('hex').slice(0, 32);
    const investor: Investor = {
      investorId,
      email: body.email,
      fullName: body.fullName,
      documentId: body.documentId,
      enrollmentRef: randomUUID(),
      onboardedAt: Math.floor(Date.now() / 1000),
    };
    await Issuance.allowInvestor(investorId);
    InvestorsStore.put(investor);
    res.status(201).json(investor);
  } catch (e) { next(e); }
});

investorsRouter.get('/', (_req, res) => {
  res.json(InvestorsStore.list());
});

investorsRouter.get('/:investorId', (req, res) => {
  const inv = InvestorsStore.get(req.params.investorId);
  if (!inv) return res.status(404).json({ error: 'investor not found' });
  res.json(inv);
});
