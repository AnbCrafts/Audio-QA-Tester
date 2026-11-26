import React, { useState } from 'react';
import { ShieldCheck, Mail, Lock, Building2, User, Loader2, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { UserProfile } from '../types';

interface AuthModalProps {
  onAuthenticated: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        mode === 'login'
          ? { email, password }
          : { email, password, fullName, workspaceName };

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `Authentication failed (${res.status})`);
      }

      onAuthenticated(data as UserProfile);
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              {mode === 'login' ? 'Sign In to Workspace' : 'Create Tenant Workspace'}
            </h2>
            <p className="text-xs text-slate-400">
              Multi-tenant call auditing with isolated data &amp; daily token quotas
            </p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-xl border border-slate-800 bg-slate-950/70 p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`rounded-lg py-2 font-bold transition-all cursor-pointer ${
              mode === 'login' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`rounded-lg py-2 font-bold transition-all cursor-pointer ${
              mode === 'register' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            New Workspace
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">Workspace / Company Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    placeholder="Acme Sales Ops"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-slate-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Anubhaw Gupta"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-slate-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-slate-400 font-semibold mb-1.5">Work Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Min 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 py-2.5 text-xs font-bold text-slate-950 hover:from-amber-400 hover:to-amber-300 transition-all cursor-pointer disabled:opacity-60"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'login' ? 'Sign In' : 'Create Workspace & Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
