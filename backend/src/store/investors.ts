import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Investor {
  investorId: string;
  email: string;
  fullName: string;
  documentId: string;
  enrollmentRef: string;
  onboardedAt: number;
}

// Persistencia en JSON para sobrevivir reinicios del dev server.
// En producción esto va a una BD relacional con el resto del KYC.
const FILE = process.env.INVESTORS_FILE ?? '.data/investors.json';

function ensureDir(p: string) {
  mkdirSync(dirname(p), { recursive: true });
}

function load(): Map<string, Investor> {
  if (!existsSync(FILE)) return new Map();
  const raw = JSON.parse(readFileSync(FILE, 'utf8')) as Investor[];
  return new Map(raw.map((i) => [i.investorId, i]));
}

function persist(state: Map<string, Investor>) {
  ensureDir(FILE);
  writeFileSync(FILE, JSON.stringify([...state.values()], null, 2));
}

const state = load();

export const InvestorsStore = {
  put(inv: Investor): Investor {
    state.set(inv.investorId, inv);
    persist(state);
    return inv;
  },
  get(investorId: string): Investor | undefined {
    return state.get(investorId);
  },
  list(): Investor[] {
    return [...state.values()].sort((a, b) => a.onboardedAt - b.onboardedAt);
  },
};
