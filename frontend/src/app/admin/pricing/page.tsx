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
  Plus,
  Edit2,
  CheckCircle,
  AlertTriangle,
  Star,
  Check,
} from 'lucide-react';

export default function AdminPricingPage() {
  const [tiers, setTiers] = useState<any[]>([]);
  const [selectedTier, setSelectedTier] = useState<any>(null);
  const [matrix, setMatrix] = useState<any>(null);
  const [missingPrices, setMissingPrices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals state
  const [isCreateTierOpen, setIsCreateTierOpen] = useState(false);
  const [isEditTierOpen, setIsEditTierOpen] = useState(false);

  // Tier form states
  const [tierName, setTierName] = useState('');
  const [tierDescription, setTierDescription] = useState('');
  const [tierRuleType, setTierRuleType] = useState<'NONE' | 'COST_MULTIPLIER' | 'BASE_TIER_PERCENTAGE'>('NONE');
  const [tierRuleValueBps, setTierRuleValueBps] = useState('0');
  const [tierDerivedFromId, setTierDerivedFromId] = useState('');

  // Explicit price edit state
  const [editingPriceDishId, setEditingPriceDishId] = useState<string | null>(null);
  const [explicitPriceDollars, setExplicitPriceDollars] = useState('');
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  const fetchTiers = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await api.getPriceTiers();
      const list = res || [];
      setTiers(list);

      const current = selectedTier ? list.find((t: any) => t.id === selectedTier.id) || list[0] : list[0];
      if (current) {
        setSelectedTier(current);
        await loadMatrix(current.id);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load price tiers', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadMatrix = async (tierId: string) => {
    try {
      const [m, missing] = await Promise.all([
        api.getPriceTierMatrix(tierId),
        api.getMissingPricesForTier(tierId).catch(() => []),
      ]);
      setMatrix(m);
      setMissingPrices(missing || []);
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

  // ---------------------------------------------------------------------------
  // TIER ACTIONS
  // ---------------------------------------------------------------------------
  const openCreateTier = () => {
    setTierName('');
    setTierDescription('');
    setTierRuleType('NONE');
    setTierRuleValueBps('0');
    setTierDerivedFromId('');
    setIsCreateTierOpen(true);
  };

  const openEditTier = (tier: any) => {
    setTierName(tier.name || '');
    setTierDescription(tier.description || '');
    setTierRuleType(tier.ruleType || tier.derivationType || 'NONE');
    setTierRuleValueBps(String(tier.ruleValueBps || 0));
    setTierDerivedFromId(tier.derivedFromTierId || '');
    setIsEditTierOpen(true);
  };

  const handleCreateTier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        name: tierName.trim(),
        description: tierDescription.trim() || undefined,
        ruleType: tierRuleType,
        ruleValueBps: parseInt(tierRuleValueBps, 10) || 0,
        derivedFromTierId: tierDerivedFromId || undefined,
      };

      const res = await api.createPriceTier(payload);
      setMessage({ text: `Price tier '${payload.name}' created!`, type: 'success' });
      setIsCreateTierOpen(false);
      await fetchTiers();
      if (res?.id) {
        setSelectedTier(res);
        await loadMatrix(res.id);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create tier', type: 'error' });
    }
  };

  const handleUpdateTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTier) return;
    try {
      const payload: any = {
        name: tierName.trim(),
        description: tierDescription.trim() || undefined,
        ruleType: tierRuleType,
        ruleValueBps: parseInt(tierRuleValueBps, 10) || 0,
        derivedFromTierId: tierDerivedFromId || undefined,
      };

      await api.updatePriceTier(selectedTier.id, payload);
      setMessage({ text: `Price tier '${payload.name}' updated!`, type: 'success' });
      setIsEditTierOpen(false);
      await fetchTiers();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update tier', type: 'error' });
    }
  };

  const handleSetDefaultTier = async (tierId: string) => {
    try {
      await api.setDefaultPriceTier(tierId);
      setMessage({ text: 'Default pricing tier updated successfully!', type: 'success' });
      await fetchTiers();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to set default tier', type: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // PRICE OVERRIDE ACTIONS
  // ---------------------------------------------------------------------------
  const handleStartPriceEdit = (dish: any) => {
    setEditingPriceDishId(dish.dishId || dish.id);
    const existingCents = dish.explicitPriceCents || dish.priceCents;
    setExplicitPriceDollars(existingCents ? (existingCents / 100).toFixed(2) : '');
  };

  const handleSavePriceOverride = async (dishId: string) => {
    if (!selectedTier) return;
    setIsSavingPrice(true);
    try {
      const cents = Math.round(parseFloat(explicitPriceDollars || '0') * 100);
      await api.bulkUpdateDishPrices(selectedTier.id, [
        {
          dishId,
          priceCents: cents,
        },
      ]);
      setMessage({ text: 'Explicit price override updated and persisted!', type: 'success' });
      setEditingPriceDishId(null);
      await loadMatrix(selectedTier.id);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update price', type: 'error' });
    } finally {
      setIsSavingPrice(false);
    }
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
              Named tiers, rule derivations, default tier designation, explicit dish overrides, and $0.05 ceiling rounding.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={openCreateTier}
              className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition shadow"
            >
              <Plus className="h-4 w-4" />
              <span>Create Price Tier</span>
            </button>

            <button
              onClick={fetchTiers}
              title="Refresh pricing"
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`mt-4 p-3 rounded-xl border text-xs font-medium ${
              message.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                : 'bg-red-950/60 border-red-800 text-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Tiers Grid */}
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
                className={`p-5 rounded-2xl cursor-pointer border transition flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-900 border-emerald-500 shadow-lg shadow-emerald-950/20'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-white text-base">{tier.name}</div>
                    {tier.isDefault ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center space-x-1">
                        <Star className="h-3 w-3 fill-emerald-400 text-emerald-400" />
                        <span>Default Tier</span>
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetDefaultTier(tier.id);
                        }}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                      >
                        Set Default
                      </button>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 mt-2 space-y-1">
                    <div>Rule: <strong className="text-slate-200">{tier.ruleType || tier.derivationType || 'NONE'}</strong></div>
                    {tier.ruleValueBps > 0 && (
                      <div className="text-emerald-400">
                        Adjustment: {(tier.ruleValueBps / 100).toFixed(2)}% / multiplier
                      </div>
                    )}
                    {tier.description && (
                      <div className="text-slate-500 text-[11px] line-clamp-1">{tier.description}</div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-between items-center text-xs">
                  <span className="text-slate-500 text-[11px]">
                    {isSelected ? 'Currently Viewing Matrix' : 'Click to View Matrix'}
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditTier(tier);
                    }}
                    className="py-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center space-x-1 transition"
                  >
                    <Edit2 className="h-3 w-3" />
                    <span>Edit Tier</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Matrix View & Missing Prices Alert */}
        {selectedTier && matrix && (
          <div className="mt-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-800 gap-2 mb-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2">
                  <Layers className="h-4 w-4 text-emerald-400" />
                  <span>Resolved Prices for &ldquo;{selectedTier.name}&rdquo;</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Showing resolved prices with automatic $0.05 ceiling rounding. Click &ldquo;Override&rdquo; to lock an explicit price.
                </p>
              </div>

              {missingPrices.length > 0 && (
                <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-950 border border-amber-800 text-amber-300 text-xs font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>{missingPrices.length} Unpriced Dishes (Unavailable)</span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                    <th className="py-2.5 px-3">Item / SKU</th>
                    <th className="py-2.5 px-3">Base Cost</th>
                    <th className="py-2.5 px-3">Price Source</th>
                    <th className="py-2.5 px-3">Resolved Price ($0.05 Ceiling)</th>
                    <th className="py-2.5 px-3 text-right">Explicit Override</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {matrix.dishes?.map((d: any) => {
                    const dishId = d.dishId || d.id;
                    const isEditing = editingPriceDishId === dishId;

                    return (
                      <tr key={dishId} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 font-medium text-white">
                          {d.dishName || d.name}{' '}
                          <span className="text-slate-500 font-mono text-[11px]">({d.sku})</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono">{formatCents(d.costPriceCents)}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              d.source === 'EXPLICIT'
                                ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                : d.source === 'DERIVED'
                                ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {d.source || 'UNPRICED'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-emerald-400">
                          {d.priceCents ? formatCents(d.priceCents) : (
                            <span className="text-rose-400 font-normal">Unavailable</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end space-x-1.5">
                              <span className="text-slate-400">$</span>
                              <input
                                type="number"
                                step="0.05"
                                min="0"
                                value={explicitPriceDollars}
                                onChange={(e) => setExplicitPriceDollars(e.target.value)}
                                className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                              <button
                                onClick={() => handleSavePriceOverride(dishId)}
                                disabled={isSavingPrice}
                                className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition"
                                title="Save price override"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingPriceDishId(null)}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                                title="Cancel"
                              >
                                &times;
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleStartPriceEdit(d)}
                              className="py-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition"
                            >
                              {d.source === 'EXPLICIT' ? 'Edit Override' : 'Set Override'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: CREATE PRICE TIER */}
        {/* ========================================================================= */}
        {isCreateTierOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">Create Price Tier</h3>
                <button
                  onClick={() => setIsCreateTierOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleCreateTier} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tier Name *</label>
                  <input
                    type="text"
                    required
                    value={tierName}
                    onChange={(e) => setTierName(e.target.value)}
                    placeholder="e.g. Corporate Platinum Tier"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={tierDescription}
                    onChange={(e) => setTierDescription(e.target.value)}
                    placeholder="Tier criteria and rules..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Derivation Rule</label>
                    <select
                      value={tierRuleType}
                      onChange={(e) => setTierRuleType(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="NONE">NONE (Manual / Base)</option>
                      <option value="COST_MULTIPLIER">COST_MULTIPLIER</option>
                      <option value="BASE_TIER_PERCENTAGE">BASE_TIER_PERCENTAGE</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Rule Value (Basis Points)</label>
                    <input
                      type="number"
                      min="0"
                      value={tierRuleValueBps}
                      onChange={(e) => setTierRuleValueBps(e.target.value)}
                      placeholder="e.g. 1500 (= 15%)"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {tierRuleType === 'BASE_TIER_PERCENTAGE' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Derive From Tier</label>
                    <select
                      value={tierDerivedFromId}
                      onChange={(e) => setTierDerivedFromId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">Select Base Tier...</option>
                      {tiers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateTierOpen(false)}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                  >
                    Create Tier
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: EDIT PRICE TIER */}
        {/* ========================================================================= */}
        {isEditTierOpen && selectedTier && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">Edit Tier: {selectedTier.name}</h3>
                <button
                  onClick={() => setIsEditTierOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleUpdateTier} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tier Name *</label>
                  <input
                    type="text"
                    required
                    value={tierName}
                    onChange={(e) => setTierName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={tierDescription}
                    onChange={(e) => setTierDescription(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Derivation Rule</label>
                    <select
                      value={tierRuleType}
                      onChange={(e) => setTierRuleType(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="NONE">NONE (Manual / Base)</option>
                      <option value="COST_MULTIPLIER">COST_MULTIPLIER</option>
                      <option value="BASE_TIER_PERCENTAGE">BASE_TIER_PERCENTAGE</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Rule Value (Basis Points)</label>
                    <input
                      type="number"
                      min="0"
                      value={tierRuleValueBps}
                      onChange={(e) => setTierRuleValueBps(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsEditTierOpen(false)}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
