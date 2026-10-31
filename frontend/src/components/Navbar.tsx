import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IdentitySwitcher } from './IdentitySwitcher';

export const Navbar: React.FC = () => {
  const location = useLocation();

  const navLinks = [
    { label: 'Dashboard', path: '/' },
    { label: 'All Transfers', path: '/transfers' },
    { label: '+ New Transfer', path: '/transfers/new' }
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg text-white tracking-tight">
            <span className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-base shadow">
              SFG
            </span>
            <span>Transfer Tracker</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-blue-400'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <IdentitySwitcher />
        </div>
      </div>
    </header>
  );
};
