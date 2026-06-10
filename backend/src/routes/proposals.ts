import { Router } from 'express';
import { z } from 'zod';
import { Governance } from '../fabric/contracts.js';

export const proposalsRouter = Router();

const CreateProposalBody = z.object({
  id: z.string().min(1),
  filmTitle: z.string().min(1),
  principalCents: z.string().regex(/^\d+$/),
  couponBps: z.number().int().min(0),
  termMonths: z.number().int().positive(),
  numParticipations: z.string().regex(/^\d+$/),
  whitepaperHash: z.string().min(1),
  whitepaperURL: z.string().url(),
});

proposalsRouter.post('/', async (req, res, next) => {
  try {
    const body = CreateProposalBody.parse(req.body);
    await Governance.createProposal(body);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

proposalsRouter.post('/:id/vote', async (req, res, next) => {
  try {
    const choice = z.boolean().parse(req.body?.choice);
    await Governance.castVote(req.params.id, choice);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

proposalsRouter.post('/:id/close', async (req, res, next) => {
  try {
    await Governance.closeProposal(req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

proposalsRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await Governance.listProposals());
  } catch (e) { next(e); }
});

proposalsRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await Governance.getProposal(req.params.id));
  } catch (e) { next(e); }
});
