import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { QrCode, LayoutDashboard, List, LogOut, User as UserIcon } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="no-print bg-[#161616] text-white border-b border-[#393939] sticky top-0 z-30 font-['IBM_Plex_Sans',sans-serif]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-none bg-[#161616] border-2 border-[#0f62fe] flex items-center justify-center text-[#0f62fe] group-hover:bg-[#0f62fe] group-hover:text-white transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h3v3h-3v-3zm0 5h3v3h-3v-3zm-5-5h3v3h-3v-3zm0 5h3v3h-3v-3z" />
            </svg>
          </div>
          <div>
            <span className="font-extrabold tracking-wider text-white text-sm uppercase block font-['IBM_Plex_Sans',sans-serif]">
              Plant<span className="text-[#0f62fe]">Ops</span>
            </span>
            <span className="text-[9px] font-mono text-[#a8a8a8] uppercase tracking-widest leading-none block">
              Equipment Intelligence
            </span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center h-full">
          {isAuthenticated && (
            <>
              <Link
                to="/equipment"
                className={`flex items-center gap-2 px-4 h-14 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 ${
                  isActive('/equipment')
                    ? 'bg-[#262626] text-white border-[#0f62fe]'
                    : 'text-[#c6c6c6] hover:bg-[#262626] hover:text-white border-transparent'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                Equipment Register
              </Link>
              <Link
                to="/admin"
                className={`flex items-center gap-2 px-4 h-14 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 ${
                  isActive('/admin')
                    ? 'bg-[#262626] text-white border-[#0f62fe]'
                    : 'text-[#c6c6c6] hover:bg-[#262626] hover:text-white border-transparent'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Admin Portal
              </Link>
            </>
          )}

          <Link
            to="/demo"
            className={`flex items-center gap-2 px-4 h-14 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 ${
              isActive('/demo')
                ? 'bg-[#262626] text-white border-[#0f62fe]'
                : 'text-[#c6c6c6] hover:bg-[#262626] hover:text-white border-transparent'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            QR Label Lab
          </Link>
        </nav>

        {/* User Session Area */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <div className="flex items-center gap-3 pl-3 border-l border-[#393939]">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-bold text-[#f4f4f4]">{user?.name}</span>
                <span className="text-[10px] text-[#78a9ff] font-mono uppercase">{user?.role}</span>
              </div>
              <div className="w-7 h-7 rounded-none bg-[#393939] text-[#78a9ff] border border-[#525252] flex items-center justify-center font-bold font-mono text-xs">
                {user?.name
                  ? user.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()
                  : 'U'}
              </div>
              <button
                onClick={logout}
                title="Sign Out"
                className="p-1.5 text-[#a8a8a8] hover:text-[#ff8389] hover:bg-[#262626] rounded-none transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-2 bg-[#0f62fe] hover:bg-[#0353e9] text-white px-3.5 py-1.5 rounded-none text-xs font-medium transition-colors"
            >
              <UserIcon className="w-3.5 h-3.5" />
              Sign In
            </Link>
          )}
        </div>
      </div>

      {/* Mobile nav bar */}
      <div className="md:hidden flex items-center justify-around bg-[#262626] border-t border-[#393939] px-2 py-1.5 text-xs text-[#c6c6c6]">
        {isAuthenticated && (
          <>
            <Link
              to="/equipment"
              className={`flex flex-col items-center py-1 px-3 ${
                isActive('/equipment') ? 'text-[#78a9ff] font-bold' : ''
              }`}
            >
              <List className="w-4 h-4 mb-0.5" />
              Register
            </Link>
            <Link
              to="/admin"
              className={`flex flex-col items-center py-1 px-3 ${
                isActive('/admin') ? 'text-[#78a9ff] font-bold' : ''
              }`}
            >
              <LayoutDashboard className="w-4 h-4 mb-0.5" />
              Admin
            </Link>
          </>
        )}
        <Link
          to="/demo"
          className={`flex flex-col items-center py-1 px-3 ${
            isActive('/demo') ? 'text-[#78a9ff] font-bold' : ''
          }`}
        >
          <QrCode className="w-4 h-4 mb-0.5" />
          QR Lab
        </Link>
      </div>
    </header>
  );
};
