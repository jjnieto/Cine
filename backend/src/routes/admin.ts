import { Router } from 'express';
import { z } from 'zod';
import { Governance, Issuance } from '../fabric/contracts.js';

export const adminRouter = Router();

// Lista del censo de productoras
adminRouter.get('/productoras', async (_req, res, next) => {
  try { res.json(await Governance.listProductoras()); } catch (e) { next(e); }
});

// Alta en el censo (AsociacionMSP admin)
adminRouter.post('/productoras', async (req, res, next) => {
  try {
    const { mspId } = z.object({ mspId: z.string().min(1) }).parse(req.body);
    await Governance.addProductora(mspId);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

adminRouter.delete('/productoras/:mspId', async (req, res, next) => {
  try {
    await Governance.removeProductora(req.params.mspId);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Inicializa governance (idempotente solo a primer arranque).
adminRouter.post('/init-governance', async (_req, res, next) => {
  try {
    await Governance.init();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Parámetros (quórum, duración votación). GET evalua, POST muta.
adminRouter.get('/params', async (_req, res, next) => {
  try { res.json(await Governance.getParams()); } catch (e) { next(e); }
});
adminRouter.post('/params', async (req, res, next) => {
  try {
    const { quorumBps, votingDurationS } = z.object({
      quorumBps: z.number().int().min(0).max(10000),
      votingDurationS: z.number().int().positive(),
    }).parse(req.body);
    await Governance.setParams(quorumBps, votingDurationS);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Materializa el bono de una propuesta aprobada. Lee la propuesta, comprueba
// que está APPROVED y aún no tiene bono, y llama a CreateBond con su mismo id.
adminRouter.post('/proposals/:id/materialize', async (req, res, next) => {
  try {
    const proposal = await Governance.getProposal<{
      id: string; filmTitle: string; proposerMsp: string; principalCents: number;
      couponBps: number; termMonths: number; numParticipations: number;
      whitepaperHash: string; status: string;
    }>(req.params.id);
    if (proposal.status !== 'APPROVED') {
      return res.status(400).json({ error: `proposal status is ${proposal.status}, expected APPROVED` });
    }
    await Issuance.createBond({
      id: proposal.id,
      proposalId: proposal.id,
      filmTitle: proposal.filmTitle,
      productoraMSP: proposal.proposerMsp,
      principalCents: String(proposal.principalCents),
      couponBps: proposal.couponBps,
      termMonths: proposal.termMonths,
      numParticipations: String(proposal.numParticipations),
      whitepaperHash: proposal.whitepaperHash,
    });
    res.status(201).json({ ok: true, bondId: proposal.id });
  } catch (e) { next(e); }
});
