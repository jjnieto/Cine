import { Link, NavLink, useLocation } from 'react-router-dom';
import { useActor, type ProductoraActor, mspIdOf } from '../state/ActorContext.js';
import { setCurrentActor } from '../api/client.js';
import { useEffect, type ReactNode } from 'react';

const ACTORS: { key: ProductoraActor; label: string }[] = [
  { key: 'asociacion',  label: 'Asociación' },
  { key: 'productora1', label: 'Productora 1' },
  { key: 'productora2', label: 'Productora 2' },
  { key: 'productora3', label: 'Productora 3' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { fabricActor, setFabricActor } = useActor();
  const { pathname } = useLocation();

  // Sincroniza el header HTTP con el actor activo.
  useEffect(() => { setCurrentActor(fabricActor); }, [fabricActor]);

  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="font-bold text-lg text-brand-600">Cine</Link>

          <nav className="flex gap-4 text-sm">
            <NavTab to="/productoras">Productoras</NavTab>
            <NavTab to="/inversores">Inversores</NavTab>
            <NavTab to="/admin">Admin</NavTab>
          </nav>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Actuando como</span>
            <select
              value={fabricActor}
              onChange={(e) => setFabricActor(e.target.value as ProductoraActor)}
              className="border border-slate-300 rounded-md px-2 py-1 bg-white"
            >
              {ACTORS.map((a) => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
            </select>
            <span className="text-xs text-slate-400 mono">{mspIdOf(fabricActor)}</span>
          </label>
        </div>
      </header>

      <main key={pathname} className="flex-1 max-w-6xl mx-auto px-4 py-6 w-full">
        {children}
      </main>

      <footer className="text-xs text-slate-400 text-center py-4">
        Hyperledger Fabric 2.5 · 3 chaincodes · este front es para pruebas, no producción.
      </footer>
    </div>
  );
}

function NavTab({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-md transition ${
          isActive ? 'bg-brand-100 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
        }`
      }
    >
      {children}
    </NavLink>
  );
}
