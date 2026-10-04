'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import {
  Coffee,
  List,
  Layers,
  Thermometer,
  DollarSign,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

export default function AdminCataloguePage() {
  const [dishes, setDishes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'dishes' | 'categories'>('dishes');
  const [isLoading, setIsLoading] = useState(true);

  const fetchCatalogue = async () => {
    setIsLoading(true);
    try {
      const [dishRes, catRes] = await Promise.all([
        api.getDishes(),
        api.getMenuCategories().catch(() => []),
      ]);
      setDishes(dishRes || []);
      setCategories(catRes || []);
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalogue();
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
              <Coffee className="h-6 w-6 text-emerald-400" />
              <span>Catalogue & Menu Management</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Dishes with SKUs, temperature, stations, allergens, dietary tags, and company menu category organization.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs">
              <button
                onClick={() => setActiveTab('dishes')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  activeTab === 'dishes' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Dishes ({dishes.length})
              </button>
              <button
                onClick={() => setActiveTab('categories')}
                className={`px-3 py-1.5 rounded-md font-medium transition ${
                  activeTab === 'categories' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Menu Categories ({categories.length})
              </button>
            </div>

            <button
              onClick={fetchCatalogue}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="mt-8">
          {isLoading ? (
            <div className="py-24 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
          ) : activeTab === 'dishes' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dishes.map((dish) => (
                <div
                  key={dish.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-white text-base">{dish.name}</div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        SKU: {dish.sku} • {dish.temperature}
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        dish.isActive
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {dish.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </div>

                  {dish.description && (
                    <p className="text-xs text-slate-300 mt-2 line-clamp-2">{dish.description}</p>
                  )}

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Station:</span>
                    <span className="font-semibold text-slate-200">
                      {dish.kitchenStation?.name || 'Unassigned'}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Cost Price:</span>
                    <span className="font-mono text-slate-300">{formatCents(dish.costPriceCents)}</span>
                  </div>

                  {dish.minimumOrderQuantity && (
                    <div className="mt-1 flex items-center justify-between text-xs text-amber-300">
                      <span>Minimum Order Qty (MOQ):</span>
                      <span className="font-bold">{dish.minimumOrderQuantity} units</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-base">{cat.name}</span>
                        {cat.isSecret && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
                            Secret Category
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Display Order: {cat.displayOrder} • {cat.items?.length || 0} dishes listed
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        cat.isActive
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {cat.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
