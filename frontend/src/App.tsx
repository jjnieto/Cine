import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { Productoras } from './pages/Productoras.js';
import { Inversores } from './pages/Inversores.js';
import { Admin } from './pages/Admin.js';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/productoras" replace />} />
        <Route path="/productoras" element={<Productoras />} />
        <Route path="/inversores/*" element={<Inversores />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </Layout>
  );
}
