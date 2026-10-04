'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import {
  Truck,
  MapPin,
  Clock,
  AlertTriangle,
  Calendar,
  RefreshCw,
  Building,
} from 'lucide-react';

export default function DispatchDashboardOverviewPage() {
  const [data, setData] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboard = async (date?: string) => {
    setIsLoading(true);
    try {
      const res = await api.getDispatchDashboard(date);
      setData(res);
      if (!selectedDate && res.date) setSelectedDate(res.date);
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-800 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
              <Truck className="h-6 w-6 text-blue-400" />
              <span>Dispatch Operational Overview</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Active transit tracking, unassigned delivery action list, and fleet readiness.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
              <Calendar className="h-4 w-4 text-emerald-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  fetchDashboard(e.target.value);
                }}
                className="bg-transparent text-white focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={() => fetchDashboard(selectedDate)}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {data && (
          <div className="mt-8 space-y-8">
            {/* Summary Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                <div className="text-xs text-slate-400 uppercase font-semibold">Total Drops Today</div>
                <div className="text-2xl font-bold text-white mt-1">{data.summary.totalDrops}</div>
              </div>
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                <div className="text-xs text-slate-400 uppercase font-semibold">Dispatch Ready</div>
                <div className="text-2xl font-bold text-teal-400 mt-1">{data.summary.dispatchReadyDrops}</div>
              </div>
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                <div className="text-xs text-slate-400 uppercase font-semibold">Out For Delivery</div>
                <div className="text-2xl font-bold text-blue-400 mt-1">{data.summary.outForDeliveryDrops}</div>
              </div>
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                <div className="text-xs text-slate-400 uppercase font-semibold">Unassigned Drops</div>
                <div className={`text-2xl font-bold ${data.summary.unassignedDropsCount > 0 ? 'text-amber-400' : 'text-slate-300'} mt-1`}>
                  {data.summary.unassignedDropsCount}
                </div>
              </div>
            </div>

            {/* Unassigned Drops Action List */}
            {data.unassignedActionList && data.unassignedActionList.length > 0 && (
              <div className="bg-slate-900/80 border border-amber-600/60 rounded-2xl p-6 shadow-lg shadow-amber-950/20">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300 flex items-center space-x-2 mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Unassigned Drops Action List (Immediate Driver Assignment Required)</span>
                </h2>

                <div className="space-y-3">
                  {data.unassignedActionList.map((item: any) => (
                    <div key={item.dropId} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex justify-between items-center text-xs">
                      <div>
                        <div className="font-bold text-white flex items-center space-x-1.5">
                          <Building className="h-3.5 w-3.5 text-slate-400" />
                          <span>{item.companyName}</span>
                          <span className="text-slate-400 font-normal">({item.orderCount} meals)</span>
                        </div>
                        <div className="text-slate-400 mt-0.5">{item.deliveryAddress}</div>
                      </div>

                      <div className="text-right">
                        <div className="font-semibold text-emerald-400">{item.formattedDeliveryTime}</div>
                        <div className="text-[10px] text-amber-400 font-bold uppercase">{item.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active En Route Deliveries */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2 mb-4">
                <Truck className="h-4 w-4 text-blue-400" />
                <span>Active Deliveries En Route ({data.activeDeliveries?.length || 0})</span>
              </h2>

              {data.activeDeliveries?.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">No drivers currently on the road for this date.</div>
              ) : (
                <div className="space-y-3">
                  {data.activeDeliveries?.map((del: any) => (
                    <div key={del.dropId} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex justify-between items-center text-xs">
                      <div>
                        <div className="font-bold text-white">{del.companyName}</div>
                        <div className="text-slate-400 mt-0.5">Driver: <strong className="text-slate-200">{del.driverName}</strong></div>
                      </div>
                      <div className="text-right font-semibold text-blue-400">
                        Scheduled: {del.formattedDeliveryTime}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
