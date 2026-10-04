'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import {
  Package,
  Search,
  Filter,
  Calendar,
  Clock,
  MapPin,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  FastForward,
} from 'lucide-react';

export default function AdminOrdersPage() {
  const [ordersData, setOrdersData] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchOrders = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const [res, compRes] = await Promise.all([
        api.getOrders({
          page,
          limit: 15,
          companyId: selectedCompany || undefined,
          status: selectedStatus || undefined,
        }),
        api.getCompanies().catch(() => []),
      ]);
      setOrdersData(res);
      setCompanies(compRes);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load orders', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [page, selectedCompany, selectedStatus]);

  const handleTriggerCutoff = async () => {
    if (!confirm('Run cutoff processing for today? Placed orders will confirm and drafts will cancel.')) return;
    try {
      const res = await api.processCutoffs();
      setMessage({
        text: `Cutoff processed successfully! Confirmed: ${res.confirmedOrdersCount}, Cancelled: ${res.cancelledDraftsCount}`,
        type: 'success',
      });
      await fetchOrders();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to process cutoff', type: 'error' });
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    const reason = prompt('Enter cancellation reason:');
    if (!reason) return;
    try {
      await api.cancelOrder(orderId, reason);
      setMessage({ text: `Order ${orderId} cancelled`, type: 'success' });
      await fetchOrders();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(null);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to cancel order', type: 'error' });
    }
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-800 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
              <Package className="h-6 w-6 text-emerald-400" />
              <span>Orders Management</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Search, filter, inspect immutable snapshots, and exercise manual cutoff or administrative overrides.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleTriggerCutoff}
              className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center space-x-1.5 transition shadow"
            >
              <FastForward className="h-3.5 w-3.5" />
              <span>Process Cutoffs</span>
            </button>

            <button
              onClick={fetchOrders}
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

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-white focus:outline-none cursor-pointer"
            >
              <option value="" className="bg-slate-900 text-white">All Statuses</option>
              <option value="DRAFT" className="bg-slate-900 text-white">DRAFT</option>
              <option value="PLACED" className="bg-slate-900 text-white">PLACED</option>
              <option value="CONFIRMED" className="bg-slate-900 text-white">CONFIRMED</option>
              <option value="DELIVERED" className="bg-slate-900 text-white">DELIVERED</option>
              <option value="CANCELLED" className="bg-slate-900 text-white">CANCELLED</option>
              <option value="REJECTED" className="bg-slate-900 text-white">REJECTED</option>
            </select>
          </div>

          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
            <span className="text-slate-400">Company:</span>
            <select
              value={selectedCompany}
              onChange={(e) => {
                setSelectedCompany(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-white focus:outline-none cursor-pointer max-w-[200px] truncate"
            >
              <option value="" className="bg-slate-900 text-white">All Companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Orders Table */}
        <div className="mt-6 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow">
          {isLoading && !ordersData ? (
            <div className="py-24 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
            </div>
          ) : ordersData && ordersData.orders?.length === 0 ? (
            <div className="text-center py-16">
              <Package className="h-10 w-10 text-slate-600 mx-auto mb-2" />
              <div className="text-sm font-semibold text-slate-300">No Orders Found</div>
              <p className="text-xs text-slate-500 mt-1">Try adjusting the filter criteria.</p>
            </div>
          ) : ordersData ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Order ID</th>
                    <th className="py-3 px-4">Delivery Date & Time</th>
                    <th className="py-3 px-4">Company & Employee</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {ordersData.orders.map((ord: any) => {
                    const isConfirmed = ord.status === 'CONFIRMED';
                    const isDelivered = ord.status === 'DELIVERED';
                    const isDraft = ord.status === 'DRAFT';
                    const isPlaced = ord.status === 'PLACED';
                    const isCancelled = ord.status === 'CANCELLED';

                    return (
                      <tr key={ord.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-mono font-semibold text-white">
                          {ord.id}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          <div>{new Date(ord.deliveryDate).toLocaleDateString()}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {ord.deliveryTimeMinutes ? `${Math.floor(ord.deliveryTimeMinutes / 60).toString().padStart(2, '0')}:${(ord.deliveryTimeMinutes % 60).toString().padStart(2, '0')} IST` : '-'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          <div className="font-medium text-white">{ord.company?.name || 'Company'}</div>
                          <div className="text-[11px] text-slate-400">{ord.employee?.name}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isConfirmed
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : isDelivered
                                ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                : isPlaced
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : isCancelled
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {ord.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-emerald-400">
                          {formatCents(ord.totalCents)}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => setSelectedOrder(ord)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-medium"
                          >
                            Detail
                          </button>
                          {!isCancelled && !isDelivered && (
                            <button
                              onClick={() => handleCancelOrder(ord.id)}
                              className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 transition font-medium"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {/* Order Detail Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white font-mono">{selectedOrder.id}</h3>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Placed for: {selectedOrder.employee?.name} ({selectedOrder.company?.name})
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              {/* Order Lines */}
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Order Items</h4>
                <div className="space-y-2">
                  {selectedOrder.lines?.map((line: any) => (
                    <div key={line.id} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs">
                      <div className="flex justify-between font-semibold text-white">
                        <span>{line.quantity}× {line.dishNameSnapshot}</span>
                        <span className="text-emerald-400">{formatCents(line.lineTotalCents)}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">SKU: {line.dishSkuSnapshot}</div>

                      {line.combinations && line.combinations.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-1">
                          {line.combinations.map((c: any, i: number) => (
                            <div key={i} className="text-[11px] text-slate-300 flex justify-between">
                              <span>• {c.quantity} unit(s)</span>
                              <span className="text-slate-400 font-mono">{formatCents(c.combinationTotalCents)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between items-center text-sm font-bold">
                <span className="text-slate-300">Total Order Amount:</span>
                <span className="text-emerald-400 text-lg">{formatCents(selectedOrder.totalCents)}</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
