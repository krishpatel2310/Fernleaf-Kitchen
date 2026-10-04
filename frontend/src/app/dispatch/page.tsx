'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import {
  Truck,
  UserCheck,
  Clock,
  MapPin,
  Calendar,
  RefreshCw,
  Play,
  CheckCircle,
  AlertCircle,
  Building,
} from 'lucide-react';

export default function DispatchBoardPage() {
  const [dropsData, setDropsData] = useState<any>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchDrops = async (date?: string) => {
    setIsLoading(true);
    setMessage(null);
    try {
      const [res, driversRes] = await Promise.all([
        api.getDrops(date),
        api.getDrivers().catch(() => []),
      ]);
      setDropsData(res);
      setDrivers(driversRes);
      if (!selectedDate && res.date) {
        setSelectedDate(res.date);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load dispatch drops', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDrops();
  }, []);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value;
    setSelectedDate(d);
    fetchDrops(d);
  };

  const handleAssignDriver = async (dropId: string, driverId: string) => {
    if (!driverId) return;
    setActionLoading(dropId);
    try {
      await api.assignDriver(dropId, driverId);
      setMessage({ text: 'Driver assigned successfully', type: 'success' });
      await fetchDrops(selectedDate);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to assign driver', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDispatchReady = async (dropId: string) => {
    setActionLoading(dropId);
    try {
      await api.markDispatchReady(dropId);
      setMessage({ text: 'Drop marked DISPATCH_READY', type: 'success' });
      await fetchDrops(selectedDate);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed transition', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleOutForDelivery = async (dropId: string) => {
    setActionLoading(dropId);
    try {
      await api.markOutForDelivery(dropId);
      setMessage({ text: 'Drop marked OUT_FOR_DELIVERY', type: 'success' });
      await fetchDrops(selectedDate);
    } catch (err: any) {
      setMessage({ text: err.message || 'Driver required before marking out-for-delivery', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Title Bar & Filters */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-800 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
              <Truck className="h-6 w-6 text-blue-400" />
              <span>Dispatch Board & Delivery Drops</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Orders automatically grouped by Company + Address + Delivery Time into single delivery stops.
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
              onClick={() => fetchDrops(selectedDate)}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition"
              title="Refresh drops"
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

        {/* Drops Summary */}
        {dropsData && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Drops</span>
              <div className="text-xl font-bold text-white mt-0.5">{dropsData.drops?.length || 0}</div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Kitchen Ready</span>
              <div className="text-xl font-bold text-amber-400 mt-0.5">
                {dropsData.drops?.filter((d: any) => d.status === 'KITCHEN_READY').length || 0}
              </div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Dispatch Ready</span>
              <div className="text-xl font-bold text-teal-400 mt-0.5">
                {dropsData.drops?.filter((d: any) => d.status === 'DISPATCH_READY').length || 0}
              </div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Out For Delivery</span>
              <div className="text-xl font-bold text-blue-400 mt-0.5">
                {dropsData.drops?.filter((d: any) => d.status === 'OUT_FOR_DELIVERY').length || 0}
              </div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Delivered</span>
              <div className="text-xl font-bold text-emerald-400 mt-0.5">
                {dropsData.drops?.filter((d: any) => d.status === 'DELIVERED').length || 0}
              </div>
            </div>
          </div>
        )}

        {/* Drops List */}
        <div className="mt-8 space-y-4">
          {isLoading && !dropsData ? (
            <div className="py-24 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : dropsData && dropsData.drops?.length === 0 ? (
            <div className="text-center py-20 bg-slate-900/40 rounded-2xl border border-slate-800">
              <Truck className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <div className="text-sm font-semibold text-slate-300">No Delivery Drops</div>
              <p className="text-xs text-slate-500 mt-1">
                No orders are scheduled for delivery on {selectedDate || 'this date'}.
              </p>
            </div>
          ) : dropsData ? (
            dropsData.drops.map((drop: any) => {
              const isDelivered = drop.status === 'DELIVERED';
              const isOut = drop.status === 'OUT_FOR_DELIVERY';
              const isDispatchReady = drop.status === 'DISPATCH_READY';
              const isKitchenReady = drop.status === 'KITCHEN_READY';

              const addressLine = [
                drop.addressLine1Snapshot,
                drop.addressLine2Snapshot,
                drop.citySnapshot,
                drop.postalCodeSnapshot,
              ]
                .filter(Boolean)
                .join(', ');

              return (
                <div
                  key={drop.id}
                  className={`bg-slate-900/80 border rounded-2xl p-6 transition-all ${
                    isDelivered
                      ? 'border-slate-800/60 opacity-60'
                      : isOut
                      ? 'border-blue-500/80 shadow-lg shadow-blue-950/20'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    {/* Left: Info */}
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-base flex items-center space-x-1.5">
                          <Building className="h-4 w-4 text-slate-400" />
                          <span>{drop.company?.name || 'Company'}</span>
                        </span>

                        <span
                          className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isDelivered
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : isOut
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : isDispatchReady
                              ? 'bg-teal-950 text-teal-300 border border-teal-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {drop.status.replace('_', ' ')}
                        </span>

                        <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-medium">
                          {drop.orders?.length || 1} {drop.orders?.length === 1 ? 'Order' : 'Orders'} in Drop
                        </span>
                      </div>

                      <div className="flex items-center text-xs text-slate-300 space-x-1 pt-1">
                        <MapPin className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                        <span className="truncate">{addressLine || 'Company Default Address'}</span>
                      </div>

                      <div className="flex items-center space-x-4 text-xs text-slate-400 pt-1">
                        <span className="flex items-center space-x-1">
                          <Clock className="h-3.5 w-3.5 text-slate-500" />
                          <span>
                            Delivery Time: <strong className="text-white">{drop.formattedDeliveryTime || drop.deliveryTimeMinutes}</strong>
                          </span>
                        </span>

                        {drop.driverInstructions && (
                          <span className="text-amber-400 italic">
                            &ldquo;{drop.driverInstructions}&rdquo;
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Driver Assignment & Lifecycle Actions */}
                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                      {/* Driver select */}
                      {!isDelivered && (
                        <div className="flex items-center space-x-1.5 bg-slate-950/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs">
                          <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                          <select
                            value={drop.driverId || ''}
                            onChange={(e) => handleAssignDriver(drop.id, e.target.value)}
                            disabled={actionLoading === drop.id}
                            className="bg-transparent text-white focus:outline-none cursor-pointer"
                          >
                            <option value="" className="bg-slate-900 text-white">Select Driver...</option>
                            {drivers.map((drv) => (
                              <option key={drv.id} value={drv.id} className="bg-slate-900 text-white">
                                {drv.name} ({drv.email})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Transition button */}
                      {isKitchenReady && (
                        <button
                          onClick={() => handleDispatchReady(drop.id)}
                          disabled={actionLoading === drop.id}
                          className="py-1.5 px-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs flex items-center space-x-1 transition disabled:opacity-50"
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span>Mark Dispatch Ready</span>
                        </button>
                      )}

                      {isDispatchReady && (
                        <button
                          onClick={() => handleOutForDelivery(drop.id)}
                          disabled={actionLoading === drop.id || !drop.driverId}
                          title={!drop.driverId ? 'Assign driver first' : 'Send out for delivery'}
                          className="py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center space-x-1 transition disabled:opacity-50"
                        >
                          <Truck className="h-3.5 w-3.5" />
                          <span>Send Out For Delivery</span>
                        </button>
                      )}

                      {isOut && (
                        <div className="flex items-center space-x-1.5 text-xs text-blue-400 font-semibold px-3 py-1.5 bg-blue-950/60 border border-blue-800 rounded-lg">
                          <Truck className="h-4 w-4 animate-bounce" />
                          <span>En Route to Office</span>
                        </div>
                      )}

                      {isDelivered && (
                        <div className="flex items-center space-x-1 text-xs text-emerald-400 font-medium">
                          <CheckCircle className="h-4 w-4" />
                          <span>Delivered</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : null}
        </div>
      </main>
    </div>
  );
}
