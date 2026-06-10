import { Link, Route, Routes } from 'react-router-dom';
import { Proposals } from './pages/Proposals.js';
import { Bonds } from './pages/Bonds.js';
import { Portfolio } from './pages/Portfolio.js';

export function App() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: '1rem', maxWidth: 960, margin: '0 auto' }}>
      <header style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #ddd', paddingBottom: '0.5rem' }}>
        <strong>Productoras</strong>
        <nav style={{ display: 'flex', gap: '0.75rem' }}>
          <Link to="/">Propuestas</Link>
          <Link to="/bonds">Bonos</Link>
          <Link to="/portfolio">Mi cartera</Link>
        </nav>
      </header>
      <main style={{ paddingTop: '1rem' }}>
        <Routes>
          <Route path="/" element={<Proposals />} />
          <Route path="/bonds" element={<Bonds />} />
          <Route path="/portfolio" element={<Portfolio />} />
        </Routes>
      </main>
    </div>
  );
}
