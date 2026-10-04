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
  Eye,
  X,
  CreditCard,
  Mail,
  Calendar,
  AlertCircle,
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

  // Filter state for Invoices
  const [invoiceFilterStatus, setInvoiceFilterStatus] = useState<'ALL' | 'PENDING' | 'PAID' | 'ADJUSTMENT'>('ALL');
  const [filterCompanyId, setFilterCompanyId] = useState('');

  // Invoice Detail Modal State
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedInvoiceDetail, setSelectedInvoiceDetail] = useState<any>(null);

  const fetchBillingData = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const [invRes, uninvRes, compRes] = await Promise.all([
        api.getInvoices(),
        api.getUninvoicedOrders(),
        api.getCompanies().catch(() => []),
      ]);
      const invoiceList = Array.isArray(invRes) ? invRes : invRes?.data || invRes?.invoices || [];
      const uninvoicedList = Array.isArray(uninvRes) ? uninvRes : (uninvRes as any)?.data || [];
      const companyList = Array.isArray(compRes) ? compRes : (compRes as any)?.data || [];
      setInvoices(invoiceList);
      setUninvoicedOrders(uninvoicedList);
      setCompanies(companyList);
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

  const handleSelectAllOrders = () => {
    if (selectedOrderIds.length === filteredUninvoiced.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredUninvoiced.map((o) => o.id));
    }
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
      setMessage({ text: 'Invoice marked PAID successfully', type: 'success' });
      if (selectedInvoiceDetail && selectedInvoiceDetail.id === invoiceId) {
        const updated = await api.getInvoiceDetail(invoiceId);
        setSelectedInvoiceDetail(updated);
      }
      await fetchBillingData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to mark invoice paid', type: 'error' });
    }
  };

  const openInvoiceDetail = async (invoiceId: string) => {
    setDetailModalOpen(true);
    setLoadingDetail(true);
    try {
      const detail = await api.getInvoiceDetail(invoiceId);
      setSelectedInvoiceDetail(detail);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch invoice details');
      setDetailModalOpen(false);
    } finally {
      setLoadingDetail(false);
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

  const filteredInvoices = invoices.filter((inv) => {
    if (filterCompanyId && inv.companyId !== filterCompanyId) return false;
    if (invoiceFilterStatus === 'PENDING' && inv.status !== 'PENDING') return false;
    if (invoiceFilterStatus === 'PAID' && inv.status !== 'PAID') return false;
    if (invoiceFilterStatus === 'ADJUSTMENT' && !inv.hasAdjustments) return false;
    return true;
  });

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
              Group confirmed orders into invoices, inspect invoice itemization, mark invoices paid, and audit post-issue price adjustments.
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
                <FileText className="h-4 w-4 text-emerald-400" />
                <span>Issued Invoices ({filteredInvoices.length})</span>
              </h2>

              <div className="flex items-center gap-2">
                <select
                  value={filterCompanyId}
                  onChange={(e) => setFilterCompanyId(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
                >
                  <option value="">All Companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select
                  value={invoiceFilterStatus}
                  onChange={(e) => setInvoiceFilterStatus(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="PAID">Paid</option>
                  <option value="ADJUSTMENT">Adjustment Req.</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {filteredInvoices.length === 0 ? (
                <div className="p-8 bg-slate-900/40 border border-slate-800 rounded-2xl text-center text-xs text-slate-500">
                  No invoices found matching criteria.
                </div>
              ) : (
                filteredInvoices.map((inv) => {
                  const isPaid = inv.status === 'PAID';
                  const hasAdj = inv.hasAdjustments;

                  return (
                    <div
                      key={inv.id}
                      className={`bg-slate-900/80 border rounded-2xl p-5 transition ${
                        hasAdj
                          ? 'border-amber-600/80 shadow-lg shadow-amber-950/20'
                          : isPaid
                          ? 'border-slate-800/80 opacity-90'
                          : 'border-slate-800 hover:border-slate-700'
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

                        <div className="flex items-center space-x-3">
                          <div className="text-right">
                            <div className="text-base font-bold text-emerald-400">
                              {formatCents(inv.totalCents)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Issued: {new Date(inv.issuedAt).toLocaleDateString()}
                            </div>
                          </div>

                          <button
                            onClick={() => openInvoiceDetail(inv.id)}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="Inspect Invoice Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {!isPaid ? (
                            <button
                              onClick={() => handleMarkPaid(inv.id)}
                              className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-1 transition shadow"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Mark Paid</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-400 font-medium px-2 py-1 bg-emerald-950/40 rounded border border-emerald-900/60">
                              Paid
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
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
                  {(Array.isArray(companies) ? companies : []).map((c) => (
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
                    <div className="flex items-center space-x-2">
                      {filteredUninvoiced.length > 0 && (
                        <button
                          type="button"
                          onClick={handleSelectAllOrders}
                          className="text-[10px] text-slate-400 hover:text-slate-200 underline"
                        >
                          {selectedOrderIds.length === filteredUninvoiced.length ? 'Deselect All' : 'Select All'}
                        </button>
                      )}
                      <span className="text-[10px] text-emerald-400 font-semibold">
                        {selectedOrderIds.length} Selected
                      </span>
                    </div>
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
                              <div className="font-mono font-semibold">{ord.orderNumber || ord.id.slice(0, 8)}</div>
                              <div className="text-[10px] text-slate-400">
                                {new Date(ord.deliveryDate).toLocaleDateString()} • {ord.employee ? `${ord.employee.firstName} ${ord.employee.lastName}` : 'Employee'}
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

      {/* Invoice Details Modal */}
      {detailModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <FileText className="h-5 w-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">
                  Invoice {selectedInvoiceDetail?.invoiceNumber || ''}
                </h3>
              </div>
              <button
                onClick={() => setDetailModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {loadingDetail || !selectedInvoiceDetail ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-emerald-400" />
                  Loading invoice details...
                </div>
              ) : (
                <>
                  {/* Status & Company Info */}
                  <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs">
                    <div>
                      <div className="text-slate-400">Company</div>
                      <div className="font-semibold text-white mt-0.5">
                        {selectedInvoiceDetail.company?.name}
                      </div>
                      {selectedInvoiceDetail.company?.billingContactEmail && (
                        <div className="text-[11px] text-slate-400 mt-1 flex items-center space-x-1">
                          <Mail className="h-3 w-3" />
                          <span>{selectedInvoiceDetail.company.billingContactEmail}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-slate-400">Status & Dates</div>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            selectedInvoiceDetail.status === 'PAID'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {selectedInvoiceDetail.status}
                        </span>
                        {selectedInvoiceDetail.paidAt && (
                          <span className="text-[11px] text-slate-400">
                            Paid: {new Date(selectedInvoiceDetail.paidAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>Issued: {new Date(selectedInvoiceDetail.issuedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Financial Audit Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Invoiced Total</div>
                      <div className="text-base font-bold text-emerald-400 mt-0.5">
                        {formatCents(selectedInvoiceDetail.totalCents)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Snapshot at issuance</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Current Orders Total</div>
                      <div className="text-base font-bold text-white mt-0.5">
                        {formatCents(selectedInvoiceDetail.currentOrdersTotalCents ?? selectedInvoiceDetail.totalCents)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Live database value</div>
                    </div>
                    <div className={`p-3 rounded-xl border ${
                      selectedInvoiceDetail.hasAdjustments
                        ? 'bg-rose-950/40 border-rose-800'
                        : 'bg-slate-950 border-slate-800'
                    }`}>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Adjustment Variance</div>
                      <div className={`text-base font-bold mt-0.5 ${
                        selectedInvoiceDetail.totalAdjustmentDifferenceCents !== 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}>
                        {formatCents(selectedInvoiceDetail.totalAdjustmentDifferenceCents || 0)}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {selectedInvoiceDetail.hasAdjustments ? 'Mismatch detected' : 'In sync'}
                      </div>
                    </div>
                  </div>

                  {/* Post-issue Adjustment Warning */}
                  {selectedInvoiceDetail.hasAdjustments && (
                    <div className="p-3 bg-amber-950/40 border border-amber-800 rounded-xl flex items-start space-x-2 text-xs text-amber-300">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">Adjustment Required</div>
                        <div className="text-[11px] text-amber-200/80 mt-0.5">
                          One or more orders included in this invoice have been modified or cancelled after the invoice was generated. Review order itemization below.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Included Orders Table */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                      Itemized Orders ({selectedInvoiceDetail.orders?.length || 0})
                    </h4>
                    <div className="border border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="p-2.5 font-medium">Order #</th>
                            <th className="p-2.5 font-medium">Employee</th>
                            <th className="p-2.5 font-medium">Status</th>
                            <th className="p-2.5 font-medium text-right">Invoiced</th>
                            <th className="p-2.5 font-medium text-right">Current</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {(selectedInvoiceDetail.orders || []).map((entry: any) => {
                            const ord = entry.order;
                            const isCancelled = entry.isOrderCancelled || ord?.status === 'CANCELLED';
                            const hasMismatch = entry.hasAmountMismatch;

                            return (
                              <tr key={entry.orderId} className={isCancelled ? 'bg-rose-950/20' : ''}>
                                <td className="p-2.5 font-mono font-medium text-white">
                                  {ord?.orderNumber || entry.orderId.slice(0, 8)}
                                </td>
                                <td className="p-2.5 text-slate-300">
                                  {ord?.employee ? `${ord.employee.firstName} ${ord.employee.lastName}` : 'Employee'}
                                </td>
                                <td className="p-2.5">
                                  {isCancelled ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                                      Cancelled
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300">
                                      {ord?.status || 'CONFIRMED'}
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 text-right font-mono text-slate-300">
                                  {formatCents(entry.invoicedAmountCents)}
                                </td>
                                <td className="p-2.5 text-right font-mono">
                                  <span className={hasMismatch ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                                    {formatCents(entry.currentOrderTotalCents)}
                                  </span>
                                  {hasMismatch && (
                                    <div className="text-[10px] text-rose-400">
                                      ({entry.amountDifferenceCents > 0 ? '+' : ''}{formatCents(entry.amountDifferenceCents)})
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 flex justify-between items-center bg-slate-950/60">
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="py-1.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
              >
                Close
              </button>

              {selectedInvoiceDetail && selectedInvoiceDetail.status !== 'PAID' && (
                <button
                  type="button"
                  onClick={() => handleMarkPaid(selectedInvoiceDetail.id)}
                  className="py-1.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition flex items-center space-x-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Mark Invoice as Paid</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
