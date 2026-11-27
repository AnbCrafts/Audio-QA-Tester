import React, { useEffect, useState } from 'react';
import { ShieldCheck, Mail, Lock, Building2, User, Loader2, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '@/config';
import { UserProfile } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  onClose: () => void;
  onAuthenticated: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  onClose,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
    }
  }, [isOpen, initialMode]);

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
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div className="flex items-center gap-3 mb-5 pr-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent border border-accent/30">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <DialogTitle>
              {mode === 'login' ? 'Sign In to Workspace' : 'Create Tenant Workspace'}
            </DialogTitle>
            <DialogDescription>
              Multi-tenant call auditing with isolated data &amp; daily token quotas
            </DialogDescription>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-xl border border-subtle bg-canvas p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`rounded-lg py-2 font-bold transition-all cursor-pointer ${
              mode === 'login'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'text-ink-muted hover:text-ink'
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
              mode === 'register'
                ? 'bg-accent text-accent-fg shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            New Workspace
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-ink-muted font-semibold mb-1.5">
                  Workspace / Company Name
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
                  <Input
                    type="text"
                    required
                    placeholder="Acme Sales Ops"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div>
                <label className="block text-ink-muted font-semibold mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
                  <Input
                    type="text"
                    placeholder="Anubhaw Gupta"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-ink-muted font-semibold mb-1.5">Work Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
              <Input
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div>
            <label className="block text-ink-muted font-semibold mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
              <Input
                type="password"
                required
                minLength={6}
                placeholder="Min 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-status-red/35 bg-status-red-soft p-2.5 text-status-red font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" disabled={isLoading} className="w-full h-10">
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'login' ? 'Sign In' : 'Create Workspace & Sign In'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
