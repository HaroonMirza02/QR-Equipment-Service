import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Lock, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('admin@meridian.example');
  const [password, setPassword] = useState('Admin1234!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/equipment';

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!email.trim()) errs.email = 'Email address is required';
    if (!password) errs.password = 'Password is required';

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validate()) {
      setError('Please provide valid login credentials.');
      return;
    }

    setLoading(true);

    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#f4f4f4] text-[#161616] flex flex-col justify-start pt-10 pb-16 px-4 sm:px-6 lg:px-8 font-['IBM_Plex_Sans',sans-serif]">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h2 className="text-2xl font-bold tracking-tight text-[#161616]">PlantOps Portal</h2>
        <p className="mt-1 text-xs text-[#525252]">
          Industrial Equipment Service &amp; QR Management System
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#ffffff] py-8 px-6 border border-[#e0e0e0] sm:px-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-[#fff0f1] border-l-4 border-[#da1e28] text-[#da1e28] text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1">
                Email Address <span className="text-[#da1e28]">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@meridian.example"
                className={`carbon-input w-full ${fieldErrors.email ? 'carbon-input-error' : ''}`}
              />
              {fieldErrors.email && (
                <span className="text-[11px] text-[#da1e28] font-semibold mt-1 block">{fieldErrors.email}</span>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#525252] uppercase tracking-wider mb-1">
                Password <span className="text-[#da1e28]">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`carbon-input w-full ${fieldErrors.password ? 'carbon-input-error' : ''}`}
              />
              {fieldErrors.password && (
                <span className="text-[11px] text-[#da1e28] font-semibold mt-1 block">{fieldErrors.password}</span>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 carbon-btn-primary text-sm font-semibold disabled:opacity-50 mt-2"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Sign In to PlantOps</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Credentials helper */}
          <div className="mt-6 pt-6 border-t border-[#e0e0e0]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0f62fe] mb-2 uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              Demo Credentials:
            </div>
            <div className="space-y-1.5 text-xs font-mono">
              <div
                onClick={() => {
                  setEmail('admin@meridian.example');
                  setPassword('Admin1234!');
                }}
                className="p-2 bg-[#f4f4f4] hover:bg-[#e5e5e5] border border-[#e0e0e0] cursor-pointer flex justify-between items-center transition-colors"
              >
                <span className="text-[#161616]">admin@meridian.example</span>
                <span className="text-[#0f62fe] font-sans font-bold text-[10px] uppercase">Admin</span>
              </div>
              <div
                onClick={() => {
                  setEmail('tech1@meridian.example');
                  setPassword('Tech1234!');
                }}
                className="p-2 bg-[#f4f4f4] hover:bg-[#e5e5e5] border border-[#e0e0e0] cursor-pointer flex justify-between items-center transition-colors"
              >
                <span className="text-[#161616]">tech1@meridian.example</span>
                <span className="text-[#b28600] font-sans font-bold text-[10px] uppercase">Technician</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
