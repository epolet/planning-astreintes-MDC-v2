import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PeriodProvider } from './context/PeriodContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CalendarView from './pages/CalendarView';
import ListView from './pages/ListView';
import CadreManagement from './pages/CadreManagement';
import Settings from './pages/Settings';
import GeneratePlanning from './pages/GeneratePlanning';
import EquityRecap from './pages/EquityRecap';
import WishesEntry from './pages/WishesEntry';
import LoginPage from './pages/LoginPage';

export default function App() {
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem('museum_auth') === 'true'
  );

  if (!authenticated) {
    return <LoginPage onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <BrowserRouter>
      <PeriodProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/calendrier" element={<CalendarView />} />
            <Route path="/planning" element={<ListView />} />
            <Route path="/cadres" element={<CadreManagement />} />
            <Route path="/parametres" element={<Settings />} />
            <Route path="/generer" element={<GeneratePlanning />} />
            <Route path="/equite" element={<EquityRecap />} />
            <Route path="/voeux" element={<WishesEntry />} />
          </Route>
        </Routes>
      </PeriodProvider>
    </BrowserRouter>
  );
}
