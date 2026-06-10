import { Router } from 'express';
import { z } from 'zod';
import { Issuance } from '../fabric/contracts.js';
import { onboardInvestor } from '../identity/kyc.js';

export const investorsRouter = Router();

const OnboardBody = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  documentId: z.string().min(5),
});

// Stub de onboarding: KYC + emisión de cert + alta en allowlist.
// En producción el KYC va contra un proveedor externo (Onfido, Veriff, etc.).
investorsRouter.post('/onboard', async (req, res, next) => {
  try {
    const body = OnboardBody.parse(req.body);
    const investor = await onboardInvestor(body);
    await Issuance.allowInvestor(investor.investorId);
    res.status(201).json(investor);
  } catch (e) { next(e); }
});
