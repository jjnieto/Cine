import { useEffect, useState } from 'react';
import { api, type Investor, type Proposal } from '../api/client.js';
import { dateFmt, eur, bps, shortId, timeUntil } from '../lib/format.js';

export function Admin() {
  const [productoras, setProductoras] = useState<string[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setError(null);
      const [p, pr, inv] = await Promise.all([
        api.listProductoras(), api.listProposals(), api.listInvestors(),
      ]);
      setProductoras(p ?? []);
      setProposals(pr ?? []);
      setInvestors(inv ?? []);
    } catch (e) { setError(String(e)); }
  };
  useEffect(() => { refresh(); }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };

  const addProductora = async (mspId: string) => {
    try { await api.addProductora(mspId); flash(`${mspId} añadida al censo`); refresh(); }
    catch (e) { setError(String(e)); }
  };
  const removeProductora = async (mspId: string) => {
    if (!confirm(`Quitar ${mspId} del censo?`)) return;
    try { await api.removeProductora(mspId); flash(`${mspId} quitada`); refresh(); }
    catch (e) { setError(String(e)); }
  };
  const close = async (id: string) => {
    try { await api.closeProposal(id); flash(`Propuesta ${id} cerrada`); refresh(); }
    catch (e) { setError(String(e)); }
  };
  const materialize = async (id: string) => {
    try { await api.materialize(id); flash(`Bono ${id} materializado`); refresh(); }
    catch (e) { setError(String(e)); }
  };
  const initGov = async () => {
    try { await api.initGovernance(); flash('Governance inicializada'); }
    catch (e) { setError(String(e)); }
  };

  const now = Math.floor(Date.now() / 1000);
  const closeables = proposals.filter((p) => p.status === 'OPEN' && p.votingEnd <= now);
  const approvedNoBond = proposals.filter((p) => p.status === 'APPROVED');

  return (
    <div className="space-y-8">
      {error && <Banner kind="error">{error}</Banner>}
      {msg && <Banner kind="ok">{msg}</Banner>}

      <Section title="Censo de productoras" subtitle="Solo AsociacionMSP puede modificarlo.">
        <div className="flex gap-2 flex-wrap">
          {productoras.map((m) => (
            <span key={m} className="inline-flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1 text-sm">
              <span className="mono">{m}</span>
              <button onClick={() => removeProductora(m)} className="text-slate-400 hover:text-red-500" title="Quitar">×</button>
            </span>
          ))}
          {productoras.length === 0 && <span className="text-slate-400 text-sm">Censo vacío. Iniciá governance y añadí productoras.</span>}
        </div>
        <AddProductoraForm onAdd={addProductora} existing={productoras} />
        <details className="mt-2 text-xs text-slate-500">
          <summary className="cursor-pointer">Operaciones avanzadas</summary>
          <div className="mt-2 space-y-2">
            <button onClick={initGov} className="px-3 py-1 bg-slate-200 rounded hover:bg-slate-300">
              Init governance (idempotente — solo se hace una vez por red nueva)
            </button>
            <ParamsForm />
          </div>
        </details>
      </Section>

      <Section title={`Propuestas pendientes de cerrar (${closeables.length})`} subtitle="Su votingEnd ya pasó.">
        {closeables.length === 0
          ? <Empty>Ninguna pendiente.</Empty>
          : <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr><th className="py-2">ID</th><th>Película</th><th>Sí</th><th>No</th><th>Censo</th><th></th></tr>
              </thead>
              <tbody>
                {closeables.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-2 mono">{shortId(p.id)}</td>
                    <td>{p.filmTitle}</td>
                    <td className="text-emerald-600">{p.yesVotes}</td>
                    <td className="text-rose-600">{p.noVotes}</td>
                    <td className="text-slate-500">{productoras.length}</td>
                    <td><button onClick={() => close(p.id)} className="btn-primary">Cerrar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </Section>

      <Section title={`Propuestas aprobadas sin materializar (${approvedNoBond.length})`} subtitle="Pasan a bono tokenizado tras tu acción.">
        {approvedNoBond.length === 0
          ? <Empty>Ninguna.</Empty>
          : <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr><th className="py-2">ID</th><th>Película</th><th>Principal</th><th>Cupón</th><th>Plazo</th><th>Particip.</th><th></th></tr>
              </thead>
              <tbody>
                {approvedNoBond.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-2 mono">{shortId(p.id)}</td>
                    <td>{p.filmTitle}</td>
                    <td>{eur(p.principalCents)}</td>
                    <td>{bps(p.couponBps)}</td>
                    <td>{p.termMonths} meses</td>
                    <td>{p.numParticipations}</td>
                    <td><button onClick={() => materialize(p.id)} className="btn-primary">Materializar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </Section>

      <Section title="Todas las propuestas">
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr><th className="py-2">ID</th><th>Película</th><th>Estado</th><th>Sí/No</th><th>VotingEnd</th></tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="py-2 mono">{shortId(p.id)}</td>
                <td>{p.filmTitle}</td>
                <td><StatusBadge status={p.status} /></td>
                <td>{p.yesVotes}/{p.noVotes}</td>
                <td className="text-slate-500">{p.status === 'OPEN' ? timeUntil(p.votingEnd) : dateFmt(p.votingEnd)}</td>
              </tr>
            ))}
            {proposals.length === 0 && <tr><td colSpan={5}><Empty>No hay propuestas.</Empty></td></tr>}
          </tbody>
        </table>
      </Section>

      <Section title={`Inversores onboardados (${investors.length})`}>
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr><th className="py-2">Nombre</th><th>Email</th><th>investorId</th><th>Alta</th></tr>
          </thead>
          <tbody>
            {investors.map((i) => (
              <tr key={i.investorId} className="border-t border-slate-100">
                <td className="py-2">{i.fullName}</td>
                <td className="text-slate-500">{i.email}</td>
                <td className="mono text-xs">{i.investorId}</td>
                <td className="text-slate-400 text-xs">{dateFmt(i.onboardedAt)}</td>
              </tr>
            ))}
            {investors.length === 0 && <tr><td colSpan={4}><Empty>Aún ninguno. El alta se hace en /inversores.</Empty></td></tr>}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function ParamsForm() {
  const [quorum, setQuorum] = useState('33');
  const [duration, setDuration] = useState('60');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api.getParams().then((p) => {
      setQuorum(String(p.quorumBps / 100));
      setDuration(String(p.votingDurationS));
    }).catch(() => {});
  }, []);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.setParams(Math.round(parseFloat(quorum) * 100), parseInt(duration));
      setMsg('Parámetros guardados');
      setTimeout(() => setMsg(null), 3000);
    } catch (e) { setMsg('Error: ' + e); }
  };
  return (
    <form onSubmit={save} className="flex gap-2 items-end text-xs">
      <label className="flex flex-col gap-1">
        <span>Quórum (%)</span>
        <input className="input" inputMode="decimal" value={quorum} onChange={(e) => setQuorum(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span>Duración votación (segundos)</span>
        <input className="input" type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} />
      </label>
      <button className="btn-ghost">Guardar parámetros</button>
      {msg && <span className="text-slate-500">{msg}</span>}
    </form>
  );
}

function AddProductoraForm({ onAdd, existing }: { onAdd: (mspId: string) => void; existing: string[] }) {
  const [mspId, setMspId] = useState('');
  const candidates = ['Productora1MSP', 'Productora2MSP', 'Productora3MSP', 'AsociacionMSP'].filter((c) => !existing.includes(c));
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (mspId) { onAdd(mspId); setMspId(''); } }}
      className="flex gap-2 items-center mt-3"
    >
      <input
        value={mspId} onChange={(e) => setMspId(e.target.value)}
        list="msp-suggest"
        placeholder="Productora1MSP"
        className="border border-slate-300 rounded-md px-3 py-1.5 text-sm mono w-72"
      />
      <datalist id="msp-suggest">
        {candidates.map((c) => <option key={c} value={c} />)}
      </datalist>
      <button type="submit" className="btn-primary">Añadir al censo</button>
    </form>
  );
}

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Banner({ kind, children }: { kind: 'error' | 'ok'; children: React.ReactNode }) {
  return (
    <div className={`rounded-md px-4 py-2 text-sm border ${
      kind === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
    }`}>{children}</div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls = ({
    OPEN:     'bg-amber-100 text-amber-700',
    APPROVED: 'bg-emerald-100 text-emerald-700',
    REJECTED: 'bg-rose-100 text-rose-700',
    ACTIVE:   'bg-emerald-100 text-emerald-700',
    AMORTIZED:'bg-slate-200 text-slate-700',
    DEFAULTED:'bg-rose-100 text-rose-700',
  } as Record<string, string>)[status] ?? 'bg-slate-100 text-slate-600';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${cls}`}>{status}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-center text-slate-400 text-sm py-4">{children}</div>;
}
