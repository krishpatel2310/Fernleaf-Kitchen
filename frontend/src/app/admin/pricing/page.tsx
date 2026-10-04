'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import {
  DollarSign,
  Layers,
  ArrowRight,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';

export default function AdminPricingPage() {
  const [tiers, setTiers] = useState<any[]>([]);
  const [selectedTier, setSelectedTier] = useState<any>(null);
  const [matrix, setMatrix] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTiers = async () => {
    setIsLoading(true);
    try {
      const res = await api.getPriceTiers();
      setTiers(res || []);
      if (res && res.length > 0 && !selectedTier) {
        setSelectedTier(res[0]);
        loadMatrix(res[0].id);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  };

  const loadMatrix = async (tierId: string) => {
    try {
      const m = await api.getPriceTierMatrix(tierId);
      setMatrix(m);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchTiers();
  }, []);

  const formatCents = (cents: number = 0) => {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-800 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
              <DollarSign className="h-6 w-6 text-emerald-400" />
              <span>Corporate Pricing Tiers</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Configure named tiers, base cost multipliers, percentage derivations, explicit overrides, and $0.05 ceiling rounding.
            </p>
          </div>

          <button
            onClick={fetchTiers}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Tiers List */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          {tiers.map((tier) => {
            const isSelected = selectedTier?.id === tier.id;
            return (
              <div
                key={tier.id}
                onClick={() => {
                  setSelectedTier(tier);
                  loadMatrix(tier.id);
                }}
                className={`p-5 rounded-2xl cursor-pointer border transition ${
                  isSelected
                    ? 'bg-slate-900 border-emerald-500 shadow-lg shadow-emerald-950/20'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="font-bold text-white text-base">{tier.name}</div>
                  {tier.isDefault && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                      Default Tier
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-400 mt-2 space-y-1">
                  <div>Type: <strong className="text-slate-200">{tier.type}</strong></div>
                  {tier.derivationType && (
                    <div className="text-emerald-400">
                      Derivation: {tier.derivationType} ({tier.ruleValueBps / 100}%)
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Matrix View */}
        {matrix && (
          <div className="mt-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 mb-4 flex items-center space-x-2">
              <Layers className="h-4 w-4 text-emerald-400" />
              <span>Resolved Prices for &ldquo;{selectedTier?.name}&rdquo;</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                    <th className="py-2.5 px-3">Item / SKU</th>
                    <th className="py-2.5 px-3">Base Cost</th>
                    <th className="py-2.5 px-3">Price Status</th>
                    <th className="py-2.5 px-3 text-right">Resolved Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {matrix.dishes?.map((d: any) => (
                    <tr key={d.dishId} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-medium text-white">
                        {d.dishName} <span className="text-slate-500 font-mono text-[11px]">({d.sku})</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono">{formatCents(d.costPriceCents)}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            d.source === 'EXPLICIT'
                              ? 'bg-purple-950 text-purple-300'
                              : d.source === 'DERIVED'
                              ? 'bg-blue-950 text-blue-300'
                              : 'bg-emerald-950 text-emerald-300'
                          }`}
                        >
                          {d.source}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                        {d.priceCents ? formatCents(d.priceCents) : 'Unavailable'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
