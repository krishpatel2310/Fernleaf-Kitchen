'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import {
  DollarSign,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  RefreshCw,
  Building,
} from 'lucide-react';

export default function AdminBillingPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [uninvoicedOrders, setUninvoicedOrders] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchBillingData = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const [invRes, uninvRes, compRes] = await Promise.all([
        api.getInvoices(),
        api.getUninvoicedOrders(),
        api.getCompanies().catch(() => []),
      ]);
      setInvoices(invRes.invoices || []);
      setUninvoicedOrders(uninvRes || []);
      setCompanies(compRes || []);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load billing records', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, []);

  const handleToggleOrder = (orderId: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const handleCreateInvoice = async () => {
    if (!selectedCompanyId || selectedOrderIds.length === 0) {
      alert('Please select a company and at least one uninvoiced confirmed order.');
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      const res = await api.createInvoice(selectedCompanyId, selectedOrderIds);
      setMessage({ text: `Invoice ${res.invoiceNumber} created successfully!`, type: 'success' });
      setSelectedOrderIds([]);
      await fetchBillingData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create invoice', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkPaid = async (invoiceId: string) => {
    try {
      await api.markInvoicePaid(invoiceId);
      setMessage({ text: 'Invoice marked PAID', type: 'success' });
      await fetchBillingData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to mark invoice paid', type: 'error' });
    }
  };

  const formatCents = (cents: number = 0) => {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  const filteredUninvoiced = selectedCompanyId
    ? uninvoicedOrders.filter((o) => o.companyId === selectedCompanyId)
    : uninvoicedOrders;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-800 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
              <DollarSign className="h-6 w-6 text-emerald-400" />
              <span>Corporate Invoicing & Accounts Receivable</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Group confirmed orders into invoices, mark invoices paid, and audit post-issue price adjustments.
            </p>
          </div>

          <button
            onClick={fetchBillingData}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition"
            title="Refresh billing data"
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

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Invoices List */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
              <FileText className="h-4 w-4 text-emerald-400" />
              <span>Issued Invoices ({invoices.length})</span>
            </h2>

            <div className="space-y-3">
              {invoices.map((inv) => {
                const isPaid = inv.status === 'PAID';
                const hasAdj = inv.hasAdjustments;

                return (
                  <div
                    key={inv.id}
                    className={`bg-slate-900/80 border rounded-2xl p-5 transition ${
                      hasAdj
                        ? 'border-amber-600/80 shadow-lg shadow-amber-950/20'
                        : isPaid
                        ? 'border-slate-800 opacity-80'
                        : 'border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-white text-base">
                            {inv.invoiceNumber}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isPaid
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {inv.status}
                          </span>

                          {hasAdj && (
                            <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                              <AlertTriangle className="h-3 w-3" />
                              <span>Adjustment Required</span>
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-300 mt-1 flex items-center space-x-2">
                          <Building className="h-3.5 w-3.5 text-slate-500" />
                          <span>{inv.company?.name || 'Company'}</span>
                          <span className="text-slate-500">•</span>
                          <span>{inv.orders?.length || 0} orders</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="text-base font-bold text-emerald-400">
                            {formatCents(inv.totalCents)}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Issued: {new Date(inv.issuedAt).toLocaleDateString()}
                          </div>
                        </div>

                        {!isPaid && (
                          <button
                            onClick={() => handleMarkPaid(inv.id)}
                            className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-1 transition shadow"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Mark Paid</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Uninvoiced Orders Invoicing Tool */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 h-fit">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2 mb-4">
              <Plus className="h-4 w-4 text-emerald-400" />
              <span>Create New Invoice</span>
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Select Company</label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => {
                    setSelectedCompanyId(e.target.value);
                    setSelectedOrderIds([]);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="" className="bg-slate-900 text-white">Select a company...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCompanyId && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-medium text-slate-400">
                      Uninvoiced Confirmed Orders ({filteredUninvoiced.length})
                    </label>
                    <span className="text-[10px] text-emerald-400 font-semibold">
                      {selectedOrderIds.length} Selected
                    </span>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1.5 p-2 bg-slate-950 border border-slate-800 rounded-lg">
                    {filteredUninvoiced.length === 0 ? (
                      <div className="text-[11px] text-slate-500 text-center py-4">
                        No uninvoiced confirmed orders for this company.
                      </div>
                    ) : (
                      filteredUninvoiced.map((ord) => {
                        const isSelected = selectedOrderIds.includes(ord.id);
                        return (
                          <div
                            key={ord.id}
                            onClick={() => handleToggleOrder(ord.id)}
                            className={`p-2 rounded cursor-pointer text-xs flex justify-between items-center transition ${
                              isSelected
                                ? 'bg-emerald-950/80 border border-emerald-700 text-white'
                                : 'bg-slate-900/60 border border-transparent text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            <div>
                              <div className="font-mono font-semibold">{ord.id}</div>
                              <div className="text-[10px] text-slate-400">
                                {new Date(ord.deliveryDate).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="font-semibold text-emerald-400">
                              {formatCents(ord.totalCents)}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={handleCreateInvoice}
                disabled={isSubmitting || selectedOrderIds.length === 0}
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition disabled:opacity-50 shadow"
              >
                <span>Generate Corporate Invoice</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
