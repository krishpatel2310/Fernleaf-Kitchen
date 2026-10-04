'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import {
  Navigation,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  MapPin,
  RefreshCw,
} from 'lucide-react';

export default function DriverDashboardOverviewPage() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboard = async () => {
    setIsLoading(true);
    try {
      const res = await api.getDriverDashboard();
      setData(res);
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

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8">
        <div className="flex items-center justify-between pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
              <Navigation className="h-5 w-5 text-emerald-400" />
              <span>Driver Performance & Route Summary</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Assigned driver: <strong className="text-white">{data?.driver?.name}</strong> ({data?.driver?.email})
            </p>
          </div>

          <button
            onClick={fetchDashboard}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {data && (
          <div className="mt-6 space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl text-center">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Assigned Today</div>
                <div className="text-2xl font-bold text-white mt-1">{data.summary.todayAssignedDrops}</div>
              </div>
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl text-center">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Pending Stops</div>
                <div className="text-2xl font-bold text-blue-400 mt-1">{data.summary.pendingDeliveries}</div>
              </div>
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl text-center">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">On-Time Deliveries</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">{data.summary.onTimeCount}</div>
              </div>
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl text-center">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Late Deliveries</div>
                <div className="text-2xl font-bold text-rose-400 mt-1">{data.summary.lateCount}</div>
              </div>
            </div>

            {/* Next Delivery Stop */}
            {data.nextDelivery ? (
              <div className="bg-slate-900/90 border-2 border-emerald-500/80 rounded-2xl p-6 shadow-xl shadow-emerald-950/20">
                <div className="flex justify-between items-center mb-3">
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Immediate Next Stop
                  </span>
                  <div className="text-xs font-bold text-emerald-400 flex items-center space-x-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{data.nextDelivery.formattedDeliveryTime}</span>
                  </div>
                </div>

                <div className="font-bold text-white text-lg">{data.nextDelivery.companyName}</div>
                <div className="flex items-start space-x-1.5 text-xs text-slate-300 mt-2">
                  <MapPin className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>{data.nextDelivery.deliveryAddress}</span>
                </div>

                {data.nextDelivery.driverInstructions && (
                  <div className="mt-3 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-amber-300/90 italic">
                    Note: &ldquo;{data.nextDelivery.driverInstructions}&rdquo;
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-2xl text-center text-xs text-slate-400">
                All assigned deliveries for today are completed! Great work.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
