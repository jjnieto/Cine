import { Router } from 'express';
import { z } from 'zod';
import { OrdersStore } from '../store/orders.js';
import { InvestorsStore } from '../store/investors.js';
import { Issuance } from '../fabric/contracts.js';

export const ordersRouter = Router();

const CreateBody = z.object({
  bondId: z.string().min(1),
  sellerInvestorId: z.string().min(1),
  amount: z.number().int().positive(),
  pricePerParticipationCents: z.number().int().nonnegative(),
});

// Crear orden de venta en el mercado SECUNDARIO. Off-chain. La transferencia
// on-chain ocurre cuando otro inversor acepta (POST /orders/:id/fill).
ordersRouter.post('/', async (req, res, next) => {
  try {
    const body = CreateBody.parse(req.body);
    if (!InvestorsStore.get(body.sellerInvestorId)) {
      return res.status(404).json({ error: 'seller investor not found' });
    }
    // Verifica que el vendedor tiene balance suficiente.
    const balance = await Issuance.balanceOf(body.bondId, body.sellerInvestorId);
    if (balance < BigInt(body.amount)) {
      return res.status(400).json({ error: `insufficient balance: have ${balance}, want to sell ${body.amount}` });
    }
    const order = OrdersStore.create(body);
    res.status(201).json(order);
  } catch (e) { next(e); }
});

ordersRouter.get('/', (req, res) => {
  const status = z.enum(['OPEN', 'FILLED', 'CANCELLED']).optional().parse(req.query.status);
  const bondId = z.string().optional().parse(req.query.bondId);
  const sellerInvestorId = z.string().optional().parse(req.query.sellerInvestorId);
  res.json(OrdersStore.list({ status, bondId, sellerInvestorId }));
});

ordersRouter.post('/:id/fill', async (req, res, next) => {
  try {
    const { buyerInvestorId } = z.object({ buyerInvestorId: z.string().min(1) }).parse(req.body);
    const order = OrdersStore.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'order not found' });
    if (order.status !== 'OPEN') return res.status(400).json({ error: `order is ${order.status}` });
    if (order.sellerInvestorId === buyerInvestorId) return res.status(400).json({ error: 'cannot buy your own order' });
    if (!InvestorsStore.get(buyerInvestorId)) return res.status(404).json({ error: 'buyer investor not found' });

    // Transfer on-chain. La asociación firma por cuenta de ambos (custodia Modelo A).
    await Issuance.transfer(order.bondId, order.sellerInvestorId, buyerInvestorId, String(order.amount));
    const filled = OrdersStore.markFilled(req.params.id, buyerInvestorId);
    res.json(filled);
  } catch (e) { next(e); }
});

ordersRouter.delete('/:id', (req, res) => {
  const cancelled = OrdersStore.cancel(req.params.id);
  if (!cancelled) return res.status(404).json({ error: 'order not found' });
  res.json(cancelled);
});
