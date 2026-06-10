import { useEffect, useState } from 'react';
import { Route, Routes, Link, NavLink } from 'react-router-dom';
import { api, type Bond, type Investor, type Order, type PortfolioEntry } from '../api/client.js';
import { useActor } from '../state/ActorContext.js';
import { Banner, Empty, Section, StatusBadge } from './Admin.js';
import { bps, dateFmt, eur, shortId } from '../lib/format.js';

export function Inversores() {
  const { investorId, setInvestorId } = useActor();
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshInvestors = async () => {
    try { setInvestors(await api.listInvestors()); setError(null); }
    catch (e) { setError(String(e)); }
  };
  useEffect(() => { refreshInvestors(); }, []);

  // Si tenemos uno seleccionado pero no existe en la lista (p. ej. tras reset), lo limpiamos.
  useEffect(() => {
    if (investorId && investors.length && !investors.find((i) => i.investorId === investorId)) {
      setInvestorId(null);
    }
  }, [investors, investorId, setInvestorId]);

  return (
    <div className="space-y-6">
      {error && <Banner kind="error">{error}</Banner>}

      <InvestorPicker
        investors={investors}
        activeId={investorId}
        onPick={setInvestorId}
        onCreated={refreshInvestors}
        setError={setError}
      />

      {investorId ? (
        <>
          <SubNav />
          <Routes>
            <Route index element={<Marketplace investorId={investorId} setError={setError} />} />
            <Route path="portfolio" element={<Portfolio investorId={investorId} setError={setError} />} />
            <Route path="secondary" element={<Secondary investorId={investorId} setError={setError} />} />
          </Routes>
        </>
      ) : (
        <Section title="Selecciona o crea un inversor">
          <p className="text-sm text-slate-500">
            Para poder comprar, vender o ver tu cartera necesitas un inversor activo. Haz KYC arriba o elige uno existente.
          </p>
        </Section>
      )}
    </div>
  );
}

function SubNav() {
  const base = '/inversores';
  return (
    <nav className="flex gap-1 text-sm border-b border-slate-200">
      {[
        { to: base,                  label: 'Marketplace primario', end: true },
        { to: `${base}/portfolio`,   label: 'Mi cartera' },
        { to: `${base}/secondary`,   label: 'Mercado secundario' },
      ].map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={(t as any).end}
          className={({ isActive }) =>
            `px-3 py-2 -mb-px border-b-2 ${
              isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
        >{t.label}</NavLink>
      ))}
    </nav>
  );
}

function InvestorPicker({
  investors, activeId, onPick, onCreated, setError,
}: {
  investors: Investor[]; activeId: string | null;
  onPick: (id: string | null) => void; onCreated: () => void;
  setError: (s: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const active = investors.find((i) => i.investorId === activeId);
  return (
    <Section title="Inversor activo" subtitle="Todas las acciones de esta sección actúan en su nombre (custodia centralizada).">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Inversor</span>
          <select
            value={activeId ?? ''}
            onChange={(e) => onPick(e.target.value || null)}
            className="input min-w-[260px]"
          >
            <option value="">— Ninguno —</option>
            {investors.map((i) => (
              <option key={i.investorId} value={i.investorId}>
                {i.fullName} ({i.email})
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => setShowForm((s) => !s)} className="btn-ghost">
          {showForm ? 'Cerrar formulario' : '+ Nuevo inversor (KYC)'}
        </button>
        {active && (
          <span className="text-xs text-slate-500 ml-2">
            investorId <span className="mono">{shortId(active.investorId, 18)}</span>
          </span>
        )}
      </div>

      {showForm && <KycForm onCreated={(inv) => { onPick(inv.investorId); setShowForm(false); onCreated(); }} setError={setError} />}
    </Section>
  );
}

function KycForm({ onCreated, setError }: { onCreated: (inv: Investor) => void; setError: (s: string) => void; }) {
  const [email, setEmail] = useState('');
  const [fullName, setName] = useState('');
  const [documentId, setDoc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const inv = await api.onboard({ email, fullName, documentId });
      onCreated(inv);
      setEmail(''); setName(''); setDoc('');
    } catch (e) { setError(String(e)); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
      <input className="input" placeholder="Nombre completo" value={fullName} onChange={(e) => setName(e.target.value)} required />
      <input className="input" placeholder="email@dominio.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="input" placeholder="DNI / Documento" value={documentId} onChange={(e) => setDoc(e.target.value)} required />
      <div className="sm:col-span-3 text-xs text-slate-500">
        Proveedor KYC: <strong>stub</strong>. En producción se valida con Onfido/Veriff antes de emitir el cert.
      </div>
      <div className="sm:col-span-3">
        <button className="btn-primary" disabled={submitting}>{submitting ? 'Procesando…' : 'Hacer KYC + alta'}</button>
      </div>
    </form>
  );
}

// --- Primario ---

function Marketplace({ investorId, setError }: { investorId: string; setError: (s: string) => void; }) {
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    try { setBonds(await api.listBonds() ?? []); }
    catch (e) { setError(String(e)); }
  };
  useEffect(() => { refresh(); }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };

  const purchase = async (b: Bond, amount: number) => {
    if (amount <= 0) return;
    try {
      await api.purchase(b.id, investorId, String(amount));
      flash(`Comprado ${amount} × ${b.filmTitle}. Pago SEPA simulado.`);
      refresh();
    } catch (e) { setError(String(e)); }
  };

  return (
    <div className="space-y-4">
      {msg && <Banner kind="ok">{msg}</Banner>}
      <Section title="Bonos en colocación" subtitle="Mercado primario: compras nuevas participaciones; se mintean en tu cuenta.">
        {bonds.length === 0
          ? <Empty>No hay bonos materializados todavía. Una propuesta aprobada se materializa desde /admin.</Empty>
          : <div className="grid gap-3 sm:grid-cols-2">
              {bonds.filter((b) => b.status === 'ACTIVE').map((b) => (
                <BondCard key={b.id} bond={b} onBuy={(n) => purchase(b, n)} />
              ))}
            </div>}
      </Section>
    </div>
  );
}

function BondCard({ bond, onBuy }: { bond: Bond; onBuy: (n: number) => void }) {
  const [amount, setAmount] = useState('1');
  const remaining = bond.numParticipations - bond.totalSupply;
  const n = Math.max(0, parseInt(amount || '0'));
  const totalCents = n * bond.participationValueCents;
  return (
    <div className="rounded-lg border border-slate-200 p-4 bg-white">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{bond.filmTitle}</div>
          <div className="text-xs text-slate-500 mono">{shortId(bond.id, 16)} · {bond.productoraMsp}</div>
        </div>
        <StatusBadge status={bond.status} />
      </div>
      <dl className="grid grid-cols-2 gap-y-1 text-sm mt-3">
        <dt className="text-slate-500">Principal</dt><dd>{eur(bond.principalCents)}</dd>
        <dt className="text-slate-500">Cupón anual</dt><dd>{bps(bond.couponBps)}</dd>
        <dt className="text-slate-500">Plazo</dt><dd>{bond.termMonths} meses</dd>
        <dt className="text-slate-500">Participación</dt><dd>{eur(bond.participationValueCents)}</dd>
        <dt className="text-slate-500">Disponibles</dt><dd>{remaining} / {bond.numParticipations}</dd>
      </dl>
      <div className="mt-4 flex gap-2 items-center">
        <input
          type="number" min="1" max={remaining}
          value={amount} onChange={(e) => setAmount(e.target.value)}
          className="input w-24"
        />
        <button
          onClick={() => onBuy(n)}
          disabled={n <= 0 || n > remaining}
          className="btn-primary"
        >
          Comprar
        </button>
        <span className="text-sm text-slate-500 ml-auto">
          Total: <strong>{eur(totalCents)}</strong>
        </span>
      </div>
    </div>
  );
}

// --- Cartera ---

function Portfolio({ investorId, setError }: { investorId: string; setError: (s: string) => void; }) {
  const [entries, setEntries] = useState<PortfolioEntry[]>([]);
  const [orderForm, setOrderForm] = useState<{ bondId: string; amount: string; price: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    try { setEntries(await api.portfolio(investorId)); }
    catch (e) { setError(String(e)); }
  };
  useEffect(() => { refresh(); }, [investorId]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };
  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderForm) return;
    try {
      const amount = parseInt(orderForm.amount);
      const priceCents = Math.round(parseFloat(orderForm.price) * 100);
      await api.createOrder({
        bondId: orderForm.bondId,
        sellerInvestorId: investorId,
        amount,
        pricePerParticipationCents: priceCents,
      });
      flash('Orden publicada en el secundario.');
      setOrderForm(null);
      refresh();
    } catch (e) { setError(String(e)); }
  };

  return (
    <div className="space-y-4">
      {msg && <Banner kind="ok">{msg}</Banner>}
      <Section title="Mis tenencias" subtitle="Bonos en los que tengo balance > 0.">
        {entries.length === 0
          ? <Empty>Aún no tienes participaciones. Compra en el marketplace primario.</Empty>
          : <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2">Película</th><th>Mi balance</th><th>Valor nominal</th>
                  <th>Cupón</th><th>Plazo</th><th></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="py-2">
                      <div className="font-medium">{e.filmTitle}</div>
                      <div className="mono text-xs text-slate-400">{shortId(e.id, 18)}</div>
                    </td>
                    <td><strong>{e.balance}</strong> <span className="text-slate-400 text-xs">participaciones</span></td>
                    <td>{eur(BigInt(e.balance) * BigInt(e.participationValueCents))}</td>
                    <td>{bps(e.couponBps)}</td>
                    <td>{e.termMonths}m</td>
                    <td>
                      <button
                        onClick={() => setOrderForm({ bondId: e.id, amount: String(e.balance), price: (e.participationValueCents / 100).toFixed(2) })}
                        className="btn-ghost"
                      >Vender en secundario…</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </Section>

      {orderForm && (
        <Section title="Publicar orden de venta">
          <form onSubmit={submitOrder} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <Labeled label="Bono"><input className="input mono w-full" value={orderForm.bondId} disabled /></Labeled>
            <Labeled label="Cantidad">
              <input className="input w-full" type="number" min="1" value={orderForm.amount}
                onChange={(e) => setOrderForm({ ...orderForm, amount: e.target.value })} />
            </Labeled>
            <Labeled label="Precio por participación (€)">
              <input className="input w-full" inputMode="decimal" value={orderForm.price}
                onChange={(e) => setOrderForm({ ...orderForm, price: e.target.value })} />
            </Labeled>
            <div className="flex gap-2">
              <button className="btn-primary">Publicar</button>
              <button type="button" onClick={() => setOrderForm(null)} className="btn-ghost">Cancelar</button>
            </div>
          </form>
        </Section>
      )}
    </div>
  );
}

// --- Secundario ---

function Secondary({ investorId, setError }: { investorId: string; setError: (s: string) => void; }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [bonds, setBonds] = useState<Record<string, Bond>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [all, bondList] = await Promise.all([
        api.listOrders({ status: 'OPEN' }),
        api.listBonds(),
      ]);
      setOrders(all);
      const map: Record<string, Bond> = {};
      (bondList ?? []).forEach((b) => { map[b.id] = b; });
      setBonds(map);
    } catch (e) { setError(String(e)); }
  };
  useEffect(() => { refresh(); }, [investorId]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };

  const fill = async (o: Order) => {
    try {
      await api.fillOrder(o.id, investorId);
      flash(`Compradas ${o.amount} participaciones.`);
      refresh();
    } catch (e) { setError(String(e)); }
  };
  const cancel = async (o: Order) => {
    if (!confirm('Cancelar tu orden?')) return;
    try { await api.cancelOrder(o.id); flash('Orden cancelada.'); refresh(); }
    catch (e) { setError(String(e)); }
  };

  const mine = orders.filter((o) => o.sellerInvestorId === investorId);
  const others = orders.filter((o) => o.sellerInvestorId !== investorId);

  return (
    <div className="space-y-4">
      {msg && <Banner kind="ok">{msg}</Banner>}

      <Section title={`Órdenes abiertas (${others.length})`} subtitle="Otros inversores ofrecen sus participaciones.">
        {others.length === 0
          ? <Empty>Sin órdenes activas de terceros.</Empty>
          : <OrderTable orders={others} bonds={bonds} action={(o) => <button onClick={() => fill(o)} className="btn-primary">Comprar</button>} />}
      </Section>

      <Section title={`Mis órdenes (${mine.length})`}>
        {mine.length === 0
          ? <Empty>Aún no tienes órdenes publicadas. Hazlo desde "Mi cartera".</Empty>
          : <OrderTable orders={mine} bonds={bonds} action={(o) => <button onClick={() => cancel(o)} className="btn-ghost">Cancelar</button>} />}
      </Section>
    </div>
  );
}

function OrderTable({ orders, bonds, action }: { orders: Order[]; bonds: Record<string, Bond>; action: (o: Order) => React.ReactNode }) {
  return (
    <table className="min-w-full text-sm">
      <thead className="text-left text-slate-500">
        <tr>
          <th className="py-2">Película</th><th>Cantidad</th><th>Precio / participación</th>
          <th>Total</th><th>Publicada</th><th></th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => {
          const b = bonds[o.bondId];
          return (
            <tr key={o.id} className="border-t border-slate-100">
              <td className="py-2">
                <div className="font-medium">{b?.filmTitle ?? <span className="text-slate-400">desconocido</span>}</div>
                <div className="mono text-xs text-slate-400">{shortId(o.bondId, 16)}</div>
              </td>
              <td>{o.amount}</td>
              <td>{eur(o.pricePerParticipationCents)}</td>
              <td><strong>{eur(o.pricePerParticipationCents * o.amount)}</strong></td>
              <td className="text-slate-400 text-xs">{dateFmt(o.createdAt)}</td>
              <td>{action(o)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600">{label}</span>
      {children}
    </label>
  );
}
