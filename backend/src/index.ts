import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { proposalsRouter } from './routes/proposals.js';
import { bondsRouter } from './routes/bonds.js';
import { investorsRouter } from './routes/investors.js';
import { paymentsRouter } from './routes/payments.js';
import { adminRouter } from './routes/admin.js';
import { ordersRouter } from './routes/orders.js';
import { portfolioRouter } from './routes/portfolio.js';
import { actorMiddleware } from './middleware/actor.js';

const app = express();
app.use(express.json());
app.use(actorMiddleware);

app.get('/health', (_req, res) => res.json({ ok: true, actor: _req.actor }));
app.use('/proposals', proposalsRouter);
app.use('/bonds', bondsRouter);
app.use('/investors', investorsRouter);
app.use('/payments', paymentsRouter);
app.use('/admin', adminRouter);
app.use('/orders', ordersRouter);
app.use('/portfolio', portfolioRouter);

// Error handler: extrae el mensaje del chaincode cuando viene en details[].message
// (formato de @hyperledger/fabric-gateway). Si no, devuelve el mensaje plano.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const e = err as { message?: string; details?: Array<{ message?: string }>; cause?: unknown };
  const ccMessages = (e.details ?? []).map((d) => d?.message).filter(Boolean);
  console.error('error:', e.message, ccMessages);
  res.status(500).json({
    error: e.message ?? String(err),
    chaincode: ccMessages.length ? ccMessages : undefined,
  });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`backend listening on :${port}`));
