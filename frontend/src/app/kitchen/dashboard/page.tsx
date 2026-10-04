'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import {
  ChefHat,
  Clock,
  CheckCircle,
  AlertTriangle,
  Calendar,
  Layers,
  RefreshCw,
  ArrowRight,
  Flame,
} from 'lucide-react';

export default function KitchenDashboardOverviewPage() {
  const [data, setData] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboard = async (date?: string) => {
    setIsLoading(true);
    try {
      const res = await api.getKitchenDashboard(date);
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
              <ChefHat className="h-6 w-6 text-amber-400" />
              <span>Kitchen Operational Overview</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Station staffing workloads, preparation pace, and actionable late/at-risk unit triage.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/kitchen${selectedDate ? `?date=${selectedDate}` : ''}`}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition"
            >
              <span>Cooking Board</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>

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
              title="Refresh dashboard"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {data && (
          <div className="mt-8 space-y-8">
            {/* Summary Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                <div className="text-xs text-slate-400 uppercase font-semibold">Confirmed Orders</div>
                <div className="text-2xl font-bold text-white mt-1">{data.summary.totalConfirmedOrders ?? 0}</div>
              </div>
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                <div className="text-xs text-slate-400 uppercase font-semibold">Total Prep Units</div>
                <div className="text-2xl font-bold text-white mt-1">{data.summary.totalUnits}</div>
              </div>
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                <div className="text-xs text-slate-400 uppercase font-semibold">Not Started</div>
                <div className="text-2xl font-bold text-slate-300 mt-1">{data.summary.unitsNotStarted}</div>
              </div>
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                <div className="text-xs text-slate-400 uppercase font-semibold">In Progress</div>
                <div className="text-2xl font-bold text-amber-400 mt-1">{data.summary.unitsInProgress}</div>
              </div>
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                <div className="text-xs text-slate-400 uppercase font-semibold">At Risk (&le;15m)</div>
                <div className="text-2xl font-bold text-amber-400 mt-1">{data.summary.atRiskUnits}</div>
              </div>
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                <div className="text-xs text-slate-400 uppercase font-semibold">Late Workload</div>
                <div className="text-2xl font-bold text-rose-400 mt-1">{data.summary.lateUnits}</div>
              </div>
            </div>

            {/* Station Breakdown */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2 mb-4">
                <Layers className="h-4 w-4 text-emerald-400" />
                <span>Station-Level Workload</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.stationWorkload.map((st: any) => (
                  <div key={st.stationId || 'unassigned'} className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{st.stationName}</span>
                      <span className="text-xs text-slate-400 font-mono">{st.totalUnits} units</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-2 space-y-1">
                      <div className="flex justify-between">
                        <span>Total Units:</span>
                        <strong className="text-white">{st.totalUnits}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Remaining:</span>
                        <strong className="text-slate-300">{st.notStarted + st.inProgress}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Done:</span>
                        <strong className="text-emerald-400">{st.done}</strong>
                      </div>
                      {(st.late > 0 || st.atRisk > 0) && (
                        <div className="flex justify-between text-rose-400 font-semibold pt-1 border-t border-slate-800">
                          <span>Late / At Risk:</span>
                          <span>{st.late} late / {st.atRisk} at risk</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Urgent & At-Risk Triage Units */}
            {data.urgentUnits && data.urgentUnits.length > 0 && (
              <div className="bg-slate-900/80 border border-rose-900/60 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-rose-300 flex items-center space-x-2">
                    <Flame className="h-4 w-4 text-rose-400" />
                    <span>Urgent & At-Risk Units ({data.urgentUnits.length})</span>
                  </h2>
                  <Link
                    href={`/kitchen${selectedDate ? `?date=${selectedDate}` : ''}`}
                    className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center space-x-1"
                  >
                    <span>View all on board</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                        <th className="pb-2">Order</th>
                        <th className="pb-2">Company</th>
                        <th className="pb-2">Dish</th>
                        <th className="pb-2">Qty</th>
                        <th className="pb-2">Station</th>
                        <th className="pb-2">Delivery Time</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {data.urgentUnits.map((u: any) => (
                        <tr key={u.unitId} className="hover:bg-slate-800/30">
                          <td className="py-2.5 font-mono text-white font-semibold">{u.orderNumber}</td>
                          <td className="py-2.5 text-slate-300">{u.companyName}</td>
                          <td className="py-2.5 font-medium text-white">{u.dishName}</td>
                          <td className="py-2.5 font-bold text-amber-300">{u.quantity}</td>
                          <td className="py-2.5 text-slate-400">{u.stationName}</td>
                          <td className="py-2.5 text-slate-300">{u.formattedDeliveryTime}</td>
                          <td className="py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                u.timingStatus === 'LATE'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}
                            >
                              {u.timingStatus} {u.delayMinutes > 0 ? `+${u.delayMinutes}m` : ''}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
