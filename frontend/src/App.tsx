import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { TransfersPage } from './pages/TransfersPage';
import { NewTransferPage } from './pages/NewTransferPage';
import { TransferDetailPage } from './pages/TransferDetailPage';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/transfers" element={<TransfersPage />} />
          <Route path="/transfers/new" element={<NewTransferPage />} />
          <Route path="/transfers/:no" element={<TransferDetailPage />} />
        </Routes>
      </main>
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        SFG Transfer Tracker &copy; {new Date().getFullYear()} &bull; Simulated Multi-Plant Production Floor
      </footer>
    </div>
  );
};

export default App;
