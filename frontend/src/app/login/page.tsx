'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, getRoleDefaultPath } from '@/context/auth-context';
import { Lock, Mail, ArrowRight, ShieldCheck, ChefHat, Truck, Navigation } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const user = await login(email, password);
      const targetPath = getRoleDefaultPath(user.roleName);
      if (typeof window !== 'undefined') {
        window.location.href = targetPath;
      } else {
        router.push(targetPath);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify your credentials.');
      setIsLoading(false);
    }
  };

  const fillAndSubmit = async (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
    setIsLoading(true);
    try {
      const user = await login(demoEmail, demoPass);
      const targetPath = getRoleDefaultPath(user.roleName);
      if (typeof window !== 'undefined') {
        window.location.href = targetPath;
      } else {
        router.push(targetPath);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify your credentials.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-8 backdrop-blur-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 items-center justify-center shadow-lg shadow-emerald-500/20 mb-4">
            <span className="text-2xl">🌿</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Fernleaf Kitchen</h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold">
            Commercial Operations Admin Panel
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-300 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@test.com"
                className="w-full bg-slate-950/70 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950/70 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium py-2.5 rounded-lg text-sm transition shadow-lg shadow-emerald-700/20 flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <span>{isLoading ? 'Signing in...' : 'Sign in to Dashboard'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {/* Demo Accounts Quick-Select */}
        <div className="mt-8 pt-6 border-t border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center mb-3">
            Quick 1-Click Role Login (Demo Accounts)
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => fillAndSubmit('admin@test.com', 'Test@1234')}
              className="flex items-center space-x-2 p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800 border border-slate-800 text-slate-200 transition text-left"
            >
              <ShieldCheck className="h-4 w-4 text-purple-400 flex-shrink-0" />
              <div className="truncate">
                <div className="font-semibold text-white">Admin</div>
                <div className="text-[10px] text-slate-400 truncate">admin@test.com</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => fillAndSubmit('kitchen@test.com', 'Test@1234')}
              className="flex items-center space-x-2 p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800 border border-slate-800 text-slate-200 transition text-left"
            >
              <ChefHat className="h-4 w-4 text-amber-400 flex-shrink-0" />
              <div className="truncate">
                <div className="font-semibold text-white">Kitchen</div>
                <div className="text-[10px] text-slate-400 truncate">kitchen@test.com</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => fillAndSubmit('dispatch@test.com', 'Test@1234')}
              className="flex items-center space-x-2 p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800 border border-slate-800 text-slate-200 transition text-left"
            >
              <Truck className="h-4 w-4 text-blue-400 flex-shrink-0" />
              <div className="truncate">
                <div className="font-semibold text-white">Dispatch</div>
                <div className="text-[10px] text-slate-400 truncate">dispatch@test.com</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => fillAndSubmit('driver@test.com', 'Test@1234')}
              className="flex items-center space-x-2 p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800 border border-slate-800 text-slate-200 transition text-left"
            >
              <Navigation className="h-4 w-4 text-emerald-400 flex-shrink-0" />
              <div className="truncate">
                <div className="font-semibold text-white">Driver</div>
                <div className="text-[10px] text-slate-400 truncate">driver@test.com</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
