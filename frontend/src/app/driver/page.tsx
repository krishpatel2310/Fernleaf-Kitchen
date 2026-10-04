'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import {
  Truck,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Camera,
  Navigation,
  RefreshCw,
} from 'lucide-react';

export default function DriverDeliveriesPage() {
  const { user } = useAuth();
  const [deliveriesData, setDeliveriesData] = useState<any>(null);
  const [selectedDrop, setSelectedDrop] = useState<any>(null);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchDeliveries = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await api.getMyDeliveries();
      setDeliveriesData(res);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load driver deliveries', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
  }, []);

  const handleMarkDelivered = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDrop) return;
    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await api.markDropDelivered(selectedDrop.id, deliveryNote, photoUrl);
      setMessage({
        text: `Drop delivered successfully! Result: ${res.isOnTime ? 'ON TIME' : 'LATE'}`,
        type: 'success',
      });
      setSelectedDrop(null);
      setDeliveryNote('');
      setPhotoUrl('');
      await fetchDeliveries();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to complete delivery', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 sm:py-8">
        {/* Mobile Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
              <Navigation className="h-5 w-5 text-emerald-400" />
              <span>Today&apos;s Deliveries</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Assigned to: <strong className="text-white">{user?.name}</strong> ({user?.email})
            </p>
          </div>

          <button
            onClick={fetchDeliveries}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition"
            title="Refresh route"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
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

        {/* Deliveries Count Summary */}
        {deliveriesData && (
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="text-lg font-bold text-white">{deliveriesData.summary?.total || 0}</div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Total Stops</div>
            </div>
            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="text-lg font-bold text-blue-400">
                {(deliveriesData.summary?.outForDelivery || 0) + (deliveriesData.summary?.dispatchReady || 0)}
              </div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Pending</div>
            </div>
            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="text-lg font-bold text-emerald-400">{deliveriesData.summary?.delivered || 0}</div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Completed</div>
            </div>
          </div>
        )}

        {/* Deliveries List */}
        <div className="mt-6 space-y-4">
          {isLoading && !deliveriesData ? (
            <div className="py-24 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
          ) : deliveriesData && deliveriesData.drops?.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-slate-800">
              <Truck className="h-12 w-12 text-slate-600 mx-auto mb-2" />
              <div className="text-sm font-semibold text-slate-300">No Assigned Deliveries Today</div>
              <p className="text-xs text-slate-500 mt-1">You are all clear! Check back when new drops are dispatched.</p>
            </div>
          ) : deliveriesData ? (
            deliveriesData.drops.map((drop: any, idx: number) => {
              const isDelivered = drop.status === 'DELIVERED';
              const isOut = drop.status === 'OUT_FOR_DELIVERY';

              const addressLine = [
                drop.address.line1,
                drop.address.line2,
                drop.address.city,
                drop.address.postalCode,
              ]
                .filter(Boolean)
                .join(', ');

              return (
                <div
                  key={drop.id}
                  className={`bg-slate-900/90 border rounded-2xl p-5 shadow-sm transition ${
                    isDelivered
                      ? 'border-slate-800/60 opacity-60'
                      : isOut
                      ? 'border-emerald-500 shadow-emerald-950/20'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="h-6 w-6 rounded-full bg-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-white text-base">{drop.companyName}</span>
                      </div>

                      <div className="flex items-start space-x-1.5 text-xs text-slate-300 mt-2">
                        <MapPin className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span className="leading-snug">{addressLine}</span>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-bold text-emerald-400 flex items-center justify-end space-x-1">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{drop.deliveryTimeFormatted}</span>
                      </div>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          isDelivered
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : isOut
                            ? 'bg-blue-950 text-blue-300 border border-blue-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {drop.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {drop.standingInstructions && (
                    <div className="mt-3 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-amber-300/90 italic">
                      Driver Note: &ldquo;{drop.standingInstructions}&rdquo;
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <span>{drop.ordersCount} Meals in Drop</span>

                    {!isDelivered ? (
                      <button
                        onClick={() => setSelectedDrop(drop)}
                        className="py-1.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition shadow"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Mark Delivered</span>
                      </button>
                    ) : (
                      <div className="flex items-center space-x-1 text-emerald-400 font-semibold">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>
                          Delivered {drop.isOnTime !== undefined ? (drop.isOnTime ? '(On Time)' : '(Late)') : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : null}
        </div>

        {/* Delivery Completion Modal */}
        {selectedDrop && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <h3 className="text-base font-bold text-white flex items-center space-x-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span>Confirm Delivery</span>
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Delivery for <strong className="text-white">{selectedDrop.companyName}</strong> at{' '}
                <strong className="text-white">{selectedDrop.deliveryTimeFormatted}</strong>.
              </p>

              <form onSubmit={handleMarkDelivered} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Delivery Note (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={deliveryNote}
                    onChange={(e) => setDeliveryNote(e.target.value)}
                    placeholder="e.g. Left at reception with John"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Proof Photo URL (Optional)
                  </label>
                  <div className="relative">
                    <Camera className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                    <input
                      type="url"
                      value={photoUrl}
                      onChange={(e) => setPhotoUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDrop(null)}
                    disabled={isSubmitting}
                    className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition disabled:opacity-50"
                  >
                    {isSubmitting ? 'Recording...' : 'Complete Drop'}
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
