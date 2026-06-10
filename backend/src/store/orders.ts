import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export type OrderStatus = 'OPEN' | 'FILLED' | 'CANCELLED';

export interface Order {
  id: string;
  bondId: string;
  sellerInvestorId: string;
  amount: number;
  pricePerParticipationCents: number;
  status: OrderStatus;
  createdAt: number;
  filledBy?: string;
  filledAt?: number;
}

const FILE = process.env.ORDERS_FILE ?? '.data/orders.json';

function ensureDir(p: string) { mkdirSync(dirname(p), { recursive: true }); }
function load(): Order[] {
  if (!existsSync(FILE)) return [];
  return JSON.parse(readFileSync(FILE, 'utf8')) as Order[];
}
function persist(state: Order[]) {
  ensureDir(FILE);
  writeFileSync(FILE, JSON.stringify(state, null, 2));
}

let state = load();

export const OrdersStore = {
  create(input: Omit<Order, 'id' | 'status' | 'createdAt'>): Order {
    const o: Order = {
      id: randomUUID(),
      status: 'OPEN',
      createdAt: Math.floor(Date.now() / 1000),
      ...input,
    };
    state.push(o);
    persist(state);
    return o;
  },
  get(id: string): Order | undefined {
    return state.find((o) => o.id === id);
  },
  list(filter?: { bondId?: string; status?: OrderStatus; sellerInvestorId?: string }): Order[] {
    return state.filter((o) =>
      (!filter?.bondId || o.bondId === filter.bondId) &&
      (!filter?.status || o.status === filter.status) &&
      (!filter?.sellerInvestorId || o.sellerInvestorId === filter.sellerInvestorId),
    );
  },
  markFilled(id: string, buyerInvestorId: string): Order | undefined {
    const o = state.find((x) => x.id === id);
    if (!o) return undefined;
    o.status = 'FILLED';
    o.filledBy = buyerInvestorId;
    o.filledAt = Math.floor(Date.now() / 1000);
    persist(state);
    return o;
  },
  cancel(id: string): Order | undefined {
    const o = state.find((x) => x.id === id);
    if (!o) return undefined;
    o.status = 'CANCELLED';
    persist(state);
    return o;
  },
};
