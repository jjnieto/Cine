import 'dotenv/config';
import express from 'express';
import { proposalsRouter } from './routes/proposals.js';
import { bondsRouter } from './routes/bonds.js';
import { investorsRouter } from './routes/investors.js';
import { paymentsRouter } from './routes/payments.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/proposals', proposalsRouter);
app.use('/bonds', bondsRouter);
app.use('/investors', investorsRouter);
app.use('/payments', paymentsRouter);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`backend listening on :${port}`));
