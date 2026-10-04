'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Truck,
  FileText,
  DollarSign,
  Calendar,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async (date?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getAdminDashboard(date);
      setData(res);
      if (!selectedDate && res.date) {
        setSelectedDate(res.date);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Admin dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value;
    setSelectedDate(d);
    fetchDashboard(d);
  };

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
        {/* Title Bar & Date Filter */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-800 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
              <span>Admin Operational Overview</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-normal">
                Asia/Kolkata
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Live executive monitoring of confirmed orders, production risks, fleet dispatch, and billing receivables.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
              <Calendar className="h-4 w-4 text-emerald-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                className="bg-transparent text-white focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={() => fetchDashboard(selectedDate)}
              title="Refresh live metrics"
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 p-4 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-sm">
            {error}
          </div>
        )}

        {isLoading && !data ? (
          <div className="py-24 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : data ? (
          <div className="mt-8 space-y-8">
            {/* Section A: Orders Overview */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <Link
                  href="/admin/orders"
                  className="text-sm font-semibold uppercase tracking-wider text-slate-300 hover:text-white flex items-center space-x-2 group transition"
                >
                  <Package className="h-4 w-4 text-emerald-400 group-hover:scale-110 transition" />
                  <span>Orders Today ({data.date})</span>
                  <span className="text-[11px] text-emerald-400 font-normal underline ml-2">View Orders &rarr;</span>
                </Link>
                <span className="text-xs text-slate-400">Total Recorded: {data.orders.totalOrdersToday}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* 1. Operational Orders Today */}
                <Link
                  href="/admin/orders"
                  className="bg-slate-900/90 border-2 border-emerald-500/60 rounded-xl p-4 shadow-lg shadow-emerald-950/30 hover:bg-slate-800/80 transition block"
                >
                  <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                    Operational Orders
                  </div>
                  <div className="text-3xl font-extrabold text-white mt-1">
                    {data.orders.operationalOrdersToday}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Active Confirmed Demand</div>
                </Link>

                {/* 2. Delivered Orders Today */}
                <Link
                  href="/admin/orders"
                  className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 hover:bg-slate-800/80 transition block"
                >
                  <div className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">
                    Delivered Today
                  </div>
                  <div className="text-3xl font-bold text-white mt-1">
                    {data.orders.deliveredOrdersToday}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Completed Deliveries</div>
                </Link>

                {/* 3. Confirmed Orders */}
                <Link
                  href="/admin/orders"
                  className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 hover:bg-slate-800/80 transition block"
                >
                  <div className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider">
                    Confirmed
                  </div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {data.orders.confirmedOrdersToday}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">In Production Cycle</div>
                </Link>

                {/* 4. Placed Orders */}
                <Link
                  href="/admin/orders"
                  className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 hover:bg-slate-800/80 transition block"
                >
                  <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                    Placed (Pre-Cutoff)
                  </div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {data.orders.placedOrdersToday}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Awaiting Cutoff</div>
                </Link>

                {/* 5. Draft Orders */}
                <Link
                  href="/admin/orders"
                  className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 hover:bg-slate-800/80 transition block"
                >
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Drafts / Carts
                  </div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {data.orders.draftOrdersToday}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Incomplete Carts</div>
                </Link>

                {/* 6. Cancelled / Rejected */}
                <Link
                  href="/admin/orders"
                  className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 hover:bg-slate-800/80 transition block"
                >
                  <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">
                    Cancelled / Rejected
                  </div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {data.orders.cancelledOrdersToday + data.orders.rejectedOrdersToday}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {data.orders.cancelledOrdersToday} Can / {data.orders.rejectedOrdersToday} Rej
                  </div>
                </Link>
              </div>
            </div>

            {/* Section B: Kitchen & Dispatch Throughput */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Kitchen Risk */}
              <Link
                href="/kitchen"
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition block group"
              >
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2 group-hover:text-amber-300 transition">
                    <Clock className="h-4 w-4 text-amber-400" />
                    <span>Kitchen Production Risk</span>
                    <span className="text-[10px] text-amber-400 font-normal underline ml-2">Open Station &rarr;</span>
                  </h3>
                  <span
                    className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                      data.kitchenRisk.overallKitchenStatus === 'LATE'
                        ? 'bg-rose-950 text-rose-300 border border-rose-700'
                        : data.kitchenRisk.overallKitchenStatus === 'AT_RISK'
                        ? 'bg-amber-950 text-amber-300 border border-amber-700'
                        : data.kitchenRisk.overallKitchenStatus === 'COMPLETED'
                        ? 'bg-blue-950 text-blue-300 border border-blue-700'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                    }`}
                  >
                    {data.kitchenRisk.overallKitchenStatus}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-3 mt-4 text-center">
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <div className="text-xl font-bold text-white">{data.kitchenRisk.totalKitchenUnits}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Total Units</div>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <div className="text-xl font-bold text-slate-300">{data.kitchenRisk.kitchenUnitsRemaining}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Remaining</div>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <div className={`text-xl font-bold ${data.kitchenRisk.atRiskUnitsCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                      {data.kitchenRisk.atRiskUnitsCount}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">At Risk (&le;15m)</div>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <div className={`text-xl font-bold ${data.kitchenRisk.lateUnitsCount > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                      {data.kitchenRisk.lateUnitsCount}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Late Units</div>
                  </div>
                </div>
              </Link>

              {/* Dispatch Logistics */}
              <Link
                href="/dispatch"
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 hover:border-blue-500/50 transition block group"
              >
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2 group-hover:text-blue-300 transition">
                    <Truck className="h-4 w-4 text-blue-400" />
                    <span>Dispatch & Delivery Status</span>
                    <span className="text-[10px] text-blue-400 font-normal underline ml-2">Open Dispatch &rarr;</span>
                  </h3>
                  <span className="text-xs text-slate-400">{data.dispatch.totalDropsToday} Total Drops</span>
                </div>

                <div className="grid grid-cols-4 gap-3 mt-4 text-center">
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <div className="text-xl font-bold text-teal-400">{data.dispatch.dispatchReadyDrops}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Ready to Dispatch</div>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <div className="text-xl font-bold text-blue-400">{data.dispatch.outForDeliveryDrops}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">En Route</div>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <div className="text-xl font-bold text-emerald-400">{data.dispatch.deliveredDrops}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Delivered</div>
                  </div>
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <div className={`text-xl font-bold ${data.dispatch.unassignedDropsCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                      {data.dispatch.unassignedDropsCount}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Needs Driver</div>
                  </div>
                </div>
              </Link>
            </div>

            {/* Section C: Billing Overview */}
            <Link
              href="/admin/billing"
              className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 hover:border-emerald-500/50 transition block group"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2 group-hover:text-emerald-300 transition">
                  <DollarSign className="h-4 w-4 text-emerald-400" />
                  <span>Corporate Billing & Revenue Snapshot (Integer Cents)</span>
                  <span className="text-[10px] text-emerald-400 font-normal underline ml-2">Open Billing &rarr;</span>
                </h3>
                {data.billing.invoicesWithAdjustmentsCount > 0 && (
                  <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-950 border border-amber-800 text-amber-300 text-xs font-semibold">
                    <AlertTriangle className="h-3 w-3" />
                    <span>{data.billing.invoicesWithAdjustmentsCount} Invoices Require Adjustment</span>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                <div className="p-4 bg-slate-950/70 border border-slate-800/90 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Uninvoiced Confirmed Workload</div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {formatCents(data.billing.uninvoicedConfirmedTotalCents)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {data.billing.uninvoicedConfirmedOrderCount} billable orders awaiting invoice
                  </div>
                </div>

                <div className="p-4 bg-slate-950/70 border border-slate-800/90 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Issued Invoices (Receivable)</div>
                  <div className="text-2xl font-bold text-amber-400 mt-1">
                    {formatCents(data.billing.issuedInvoiceTotalCents)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {data.billing.issuedInvoiceCount} outstanding unpaid invoices
                  </div>
                </div>

                <div className="p-4 bg-slate-950/70 border border-slate-800/90 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Paid Invoices (Collected)</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">
                    {formatCents(data.billing.paidInvoiceTotalCents)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {data.billing.paidInvoiceCount} invoices settled
                  </div>
                </div>

                <div className="p-4 bg-slate-950/70 border border-slate-800/90 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Post-Issue Order Adjustments</div>
                  <div className="text-2xl font-bold text-rose-400 mt-1">
                    {data.billing.invoicesWithAdjustmentsCount}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Orders altered or cancelled post-issuance
                  </div>
                </div>
              </div>
            </Link>

            {/* Section D: Operational Configuration Health */}
            <Link
              href="/admin/settings"
              className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 hover:border-purple-500/50 transition block group"
            >
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 mb-4 flex items-center space-x-2 group-hover:text-purple-300 transition">
                <TrendingUp className="h-4 w-4 text-purple-400" />
                <span>Configuration & Production Rules</span>
                <span className="text-[10px] text-purple-400 font-normal underline ml-2">Edit Settings &rarr;</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-400">Order Cutoff Time:</span>
                  <div className="font-semibold text-white mt-0.5">{data.configuration.cutoffTime} (IST)</div>
                </div>
                <div>
                  <span className="text-slate-400">Cutoff Lead Time:</span>
                  <div className="font-semibold text-white mt-0.5">
                    {data.configuration.cutoffWorkingDaysCount} Kitchen Working Days
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">Upcoming Holidays:</span>
                  <div className="font-semibold text-white mt-0.5">
                    {data.configuration.upcomingHolidaysCount} Scheduled
                  </div>
                </div>
                <div>
                  <span className="text-slate-400">Active Companies:</span>
                  <div className="font-semibold text-white mt-0.5">
                    {data.configuration.activeCompaniesCount} Corporate Clients
                  </div>
                </div>
              </div>
            </Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}
