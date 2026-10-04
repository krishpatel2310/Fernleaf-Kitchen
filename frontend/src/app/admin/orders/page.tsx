'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
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
  Plus,
  ShieldAlert,
  FileText,
  History,
  Trash2,
  ChevronDown,
} from 'lucide-react';

interface DishSearchComboboxProps {
  dishes: any[];
  selectedDishId: string;
  onSelect: (dishId: string) => void;
  onQuickCreate?: (dishName: string) => Promise<string | void>;
}

function DishSearchCombobox({ dishes, selectedDishId, onSelect, onQuickCreate }: DishSearchComboboxProps) {
  const selectedDish = dishes.find((d) => d.id === selectedDishId);
  const [searchTerm, setSearchTerm] = useState(selectedDish ? selectedDish.name : '');
  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    const current = dishes.find((d) => d.id === selectedDishId);
    if (current) {
      setSearchTerm(current.name);
    } else if (!selectedDishId) {
      setSearchTerm('');
    }
  }, [selectedDishId, dishes]);

  const filteredDishes = dishes.filter((d) => {
    if (!isTyping || !searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return (
      d.name?.toLowerCase().includes(q) ||
      d.sku?.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q)
    );
  });

  const handleSelect = (dish: any) => {
    onSelect(dish.id);
    setSearchTerm(dish.name);
    setIsTyping(false);
    setIsOpen(false);
  };

  const handleInputChange = (val: string) => {
    setSearchTerm(val);
    setIsTyping(true);
    setIsOpen(true);
    // Auto-match exact dish name or SKU
    const match = dishes.find(
      (d) =>
        d.name?.toLowerCase() === val.toLowerCase().trim() ||
        d.sku?.toLowerCase() === val.toLowerCase().trim()
    );
    if (match) {
      onSelect(match.id);
    } else if (!val) {
      onSelect('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredDishes.length > 0) {
        handleSelect(filteredDishes[0]);
      } else if (searchTerm.trim() && onQuickCreate) {
        onQuickCreate(searchTerm.trim()).then((id) => {
          if (id) {
            onSelect(id);
            setIsOpen(false);
          }
        });
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative flex-1">
      <div className="relative flex items-center">
        <input
          type="text"
          placeholder="Type dish name or SKU..."
          value={searchTerm}
          onFocus={(e) => {
            setIsOpen(true);
            e.target.select();
          }}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 pr-14 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <div className="absolute right-2 flex items-center space-x-1">
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setIsTyping(false);
                onSelect('');
                setIsOpen(true);
              }}
              className="text-slate-400 hover:text-white text-xs px-1 rounded hover:bg-slate-800"
              title="Clear selection"
            >
              &times;
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsTyping(false);
              setIsOpen(!isOpen);
            }}
            className="text-slate-400 hover:text-white p-0.5"
            tabIndex={-1}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-56 overflow-y-auto divide-y divide-slate-800">
            {dishes.length === 0 ? (
              <div className="p-3 text-xs text-slate-400 text-center space-y-2">
                <div>No dishes found in catalogue.</div>
                {searchTerm.trim() && onQuickCreate && (
                  <button
                    type="button"
                    onClick={async () => {
                      const newId = await onQuickCreate(searchTerm.trim());
                      if (newId) {
                        onSelect(newId);
                        setIsOpen(false);
                      }
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition"
                  >
                    + Add &ldquo;{searchTerm.trim()}&rdquo; as New Dish
                  </button>
                )}
              </div>
            ) : filteredDishes.length === 0 ? (
              <div className="p-3 text-xs text-slate-400 text-center space-y-2">
                <div>No dishes matching &ldquo;{searchTerm}&rdquo;</div>
                {searchTerm.trim() && onQuickCreate && (
                  <button
                    type="button"
                    onClick={async () => {
                      const newId = await onQuickCreate(searchTerm.trim());
                      if (newId) {
                        onSelect(newId);
                        setIsOpen(false);
                      }
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition"
                  >
                    + Add &ldquo;{searchTerm.trim()}&rdquo; as New Dish
                  </button>
                )}
              </div>
            ) : (
              <>
                {filteredDishes.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => handleSelect(d)}
                    className={`p-2.5 text-xs cursor-pointer hover:bg-slate-800 flex justify-between items-center transition ${
                      d.id === selectedDishId ? 'bg-emerald-950/40 text-emerald-300 font-semibold' : 'text-slate-200'
                    }`}
                  >
                    <div>
                      <div className="font-medium text-white">{d.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        SKU: {d.sku} • {d.temperature || 'HOT'}
                      </div>
                    </div>
                    {d.costPriceCents !== undefined && (
                      <div className="text-right text-[11px] text-emerald-400 font-mono">
                        ${(d.costPriceCents / 100).toFixed(2)}
                      </div>
                    )}
                  </div>
                ))}
                {searchTerm.trim() && onQuickCreate && !dishes.some((d) => d.name?.toLowerCase() === searchTerm.toLowerCase().trim()) && (
                  <div className="p-2 border-t border-slate-800 bg-slate-900/90 sticky bottom-0">
                    <button
                      type="button"
                      onClick={async () => {
                        const newId = await onQuickCreate(searchTerm.trim());
                        if (newId) {
                          onSelect(newId);
                          setIsOpen(false);
                        }
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium hover:bg-slate-800 rounded transition flex items-center space-x-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add &ldquo;{searchTerm.trim()}&rdquo; to catalogue & select</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminOrdersPage() {
  const [ordersData, setOrdersData] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [dishes, setDishes] = useState<any[]>([]);
  const [packagingTypes, setPackagingTypes] = useState<any[]>([]);

  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderTimeline, setOrderTimeline] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals state
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [overridingOrder, setOverridingOrder] = useState<any>(null);

  // Create Order Form State
  const [orderEmployeeId, setOrderEmployeeId] = useState('');
  const [orderDeliveryDate, setOrderDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [orderDeliveryTimeStr, setOrderDeliveryTimeStr] = useState('12:30');
  const [orderPackagingTypeId, setOrderPackagingTypeId] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderIsPlaced, setOrderIsPlaced] = useState(true);
  const [orderLines, setOrderLines] = useState<{ dishId: string; quantity: number }[]>([
    { dishId: '', quantity: 1 },
  ]);

  // Admin Override Form State
  const [overrideTimeStr, setOverrideTimeStr] = useState('13:00');
  const [overridePackagingId, setOverridePackagingId] = useState('');
  const [overrideAddressId, setOverrideAddressId] = useState('');
  const [overrideNote, setOverrideNote] = useState('');
  const [isOverriding, setIsOverriding] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Quick Dish Creation in Order Modal
  const [showQuickCreateDish, setShowQuickCreateDish] = useState(false);
  const [newDishName, setNewDishName] = useState('');
  const [newDishPrice, setNewDishPrice] = useState('5.00');
  const [newDishTemp, setNewDishTemp] = useState<'HOT' | 'COLD'>('HOT');
  const [isSavingQuickDish, setIsSavingQuickDish] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [createOrderError, setCreateOrderError] = useState<string | null>(null);
  const [modalCompanyId, setModalCompanyId] = useState('');
  const [modalAddressId, setModalAddressId] = useState('');

  const fetchOrders = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const [res, compRes, empRes, dishRes, pkgRes] = await Promise.all([
        api.getOrders({
          page,
          limit: 15,
          companyId: selectedCompany || undefined,
          status: selectedStatus || undefined,
          date: filterDate || undefined,
        }),
        api.getCompanies().catch(() => []),
        api.getEmployees().catch(() => []),
        api.getDishes({ isActive: true, limit: 100 }).catch(() => []),
        api.getPackagingTypes().catch(() => []),
      ]);
      setOrdersData(res);
      setCompanies(Array.isArray(compRes) ? compRes : (compRes as any)?.data || []);
      setEmployees(Array.isArray(empRes) ? empRes : (empRes as any)?.data || []);
      setDishes(Array.isArray(dishRes) ? dishRes : (dishRes as any)?.data || []);
      setPackagingTypes(Array.isArray(pkgRes) ? pkgRes : []);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load orders', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [page, selectedCompany, selectedStatus, filterDate]);

  const handleTriggerCutoff = async () => {
    if (!confirm('Run cutoff processing for today? Placed orders will confirm and unplaced drafts will cancel.')) return;
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
    const reason = prompt('Enter cancellation reason (required):');
    if (!reason || !reason.trim()) return;
    try {
      await api.cancelOrder(orderId, reason.trim());
      setMessage({ text: `Order ${orderId} cancelled`, type: 'success' });
      await fetchOrders();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(null);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to cancel order', type: 'error' });
    }
  };

  const parseTimeToMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10) || 0);
    return h * 60 + m;
  };

  const formatMinutesToTime = (mins: number = 750) => {
    const h = Math.floor(mins / 60).toString().padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  const formatCents = (cents: number = 0) => {
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  // ---------------------------------------------------------------------------
  // CREATE ORDER
  // ---------------------------------------------------------------------------
  const handleQuickCreateDish = async (dishName: string): Promise<string | undefined> => {
    if (!dishName || !dishName.trim()) return undefined;
    try {
      const slug = dishName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 10);
      const uniqueSku = `DISH-${slug || 'CUSTOM'}-${Date.now().toString(36).toUpperCase()}`;
      const newDish = await api.createDish({
        name: dishName.trim(),
        sku: uniqueSku,
        temperature: 'HOT',
        costPriceCents: 500,
      });
      const freshDishes = await api.getDishes({ isActive: true, limit: 100 });
      const dishesList = Array.isArray(freshDishes) ? freshDishes : (freshDishes as any)?.data || [];
      setDishes(dishesList);
      return newDish.id;
    } catch (err: any) {
      alert(`Failed to create dish: ${err.message || 'Unknown error'}`);
      return undefined;
    }
  };

  const handleSaveQuickDish = async () => {
    if (!newDishName.trim()) return;
    setIsSavingQuickDish(true);
    try {
      const priceCents = Math.round(parseFloat(newDishPrice || '5') * 100) || 500;
      const slug = newDishName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 10);
      const uniqueSku = `DISH-${slug || 'CUSTOM'}-${Date.now().toString(36).toUpperCase()}`;
      const newDish = await api.createDish({
        name: newDishName.trim(),
        sku: uniqueSku,
        temperature: newDishTemp,
        costPriceCents: priceCents,
      });
      const freshDishes = await api.getDishes({ isActive: true, limit: 100 });
      const dishesList = Array.isArray(freshDishes) ? freshDishes : (freshDishes as any)?.data || [];
      setDishes(dishesList);

      setOrderLines((prev) => {
        if (prev.length === 1 && !prev[0].dishId) {
          return [{ dishId: newDish.id, quantity: 1 }];
        }
        return [...prev, { dishId: newDish.id, quantity: 1 }];
      });

      setNewDishName('');
      setShowQuickCreateDish(false);
      setMessage({ text: `Dish "${newDish.name}" created and added to order!`, type: 'success' });
    } catch (err: any) {
      alert(`Failed to create dish: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSavingQuickDish(false);
    }
  };

  const openCreateOrderModal = async () => {
    setCreateOrderError(null);
    setIsCreatingOrder(false);
    setShowQuickCreateDish(false);

    let currentDishes = dishes;
    let currentEmployees = employees;
    let currentCompanies = companies;
    let currentPackages = packagingTypes;

    try {
      const [freshDishes, freshEmployees, freshCompanies, freshPackages] = await Promise.all([
        api.getDishes({ isActive: true, limit: 100 }).catch(() => null),
        api.getEmployees().catch(() => null),
        api.getCompanies().catch(() => null),
        api.getPackagingTypes().catch(() => null),
      ]);

      if (freshDishes) {
        const dl = Array.isArray(freshDishes) ? freshDishes : (freshDishes as any)?.data || [];
        if (dl.length > 0) {
          setDishes(dl);
          currentDishes = dl;
        }
      }
      if (freshEmployees) {
        const el = Array.isArray(freshEmployees) ? freshEmployees : (freshEmployees as any)?.data || [];
        if (el.length > 0) {
          setEmployees(el);
          currentEmployees = el;
        }
      }
      if (freshCompanies) {
        const cl = Array.isArray(freshCompanies) ? freshCompanies : (freshCompanies as any)?.data || [];
        if (cl.length > 0) {
          setCompanies(cl);
          currentCompanies = cl;
        }
      }
      if (freshPackages) {
        const pl = Array.isArray(freshPackages) ? freshPackages : (freshPackages as any)?.data || [];
        if (pl.length > 0) {
          setPackagingTypes(pl);
          currentPackages = pl;
        }
      }
    } catch (_) {}

    const defaultComp = currentCompanies[0]?.id || '';
    setModalCompanyId(defaultComp);

    const compEmployees = defaultComp
      ? currentEmployees.filter((e: any) => e.companyId === defaultComp || e.company?.id === defaultComp)
      : currentEmployees;
    const initialEmp = compEmployees[0] || currentEmployees[0];

    setOrderEmployeeId(initialEmp?.id || '');
    const compObj = currentCompanies.find((c: any) => c.id === defaultComp);
    setModalAddressId(initialEmp?.defaultDeliveryAddressId || compObj?.addresses?.[0]?.id || '');
    setOrderDeliveryDate(new Date().toISOString().split('T')[0]);
    setOrderDeliveryTimeStr('12:30');
    setOrderPackagingTypeId(currentPackages[0]?.id || '');
    setOrderNotes('');
    setOrderIsPlaced(true);
    setOrderLines([{ dishId: currentDishes[0]?.id || '', quantity: 1 }]);
    setIsCreateOrderOpen(true);
  };

  const handleModalCompanyChange = (newCompanyId: string) => {
    setModalCompanyId(newCompanyId);
    const compEmps = newCompanyId
      ? employees.filter((e: any) => e.companyId === newCompanyId || e.company?.id === newCompanyId)
      : employees;
    const firstEmp = compEmps[0];
    setOrderEmployeeId(firstEmp?.id || '');
    const compObj = companies.find((c: any) => c.id === newCompanyId);
    setModalAddressId(firstEmp?.defaultDeliveryAddressId || compObj?.addresses?.[0]?.id || '');
  };

  const handleModalEmployeeChange = (newEmpId: string) => {
    setOrderEmployeeId(newEmpId);
    const emp = employees.find((e: any) => e.id === newEmpId);
    if (emp) {
      if (emp.companyId && emp.companyId !== modalCompanyId) {
        setModalCompanyId(emp.companyId);
      }
      if (emp.defaultDeliveryAddressId) {
        setModalAddressId(emp.defaultDeliveryAddressId);
      }
    }
  };

  const modalCompany = companies.find((c: any) => c.id === modalCompanyId);
  const modalCompanyAddresses = modalCompany?.addresses || [];
  const filteredModalEmployees = modalCompanyId
    ? employees.filter((e: any) => e.companyId === modalCompanyId || e.company?.id === modalCompanyId)
    : employees;

  const handleAddLine = () => {
    setOrderLines((prev) => [...prev, { dishId: dishes[0]?.id || '', quantity: 1 }]);
  };

  const handleRemoveLine = (index: number) => {
    setOrderLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateOrderError(null);

    if (!orderEmployeeId) {
      setCreateOrderError('Please select an employee.');
      return;
    }

    const validLines = orderLines.filter((l) => l.dishId && l.quantity > 0);
    if (validLines.length === 0) {
      setCreateOrderError('Please select a dish for at least one line item.');
      return;
    }

    setIsCreatingOrder(true);
    try {
      const payload: any = {
        employeeId: orderEmployeeId,
        deliveryDate: orderDeliveryDate,
        deliveryTimeMinutes: parseTimeToMinutes(orderDeliveryTimeStr),
        deliveryAddressId: modalAddressId || undefined,
        packagingTypeId: orderPackagingTypeId || undefined,
        notes: orderNotes.trim() || undefined,
        isPlaced: orderIsPlaced,
        bypassCutoff: true,
        bypassCalendar: true,
        lines: validLines.map((l) => ({
          dishId: l.dishId,
          quantity: l.quantity,
        })),
      };

      const res = await api.createOrder(payload);
      setMessage({
        text: `Order ${res.orderNumber || res.id} created successfully! Status: ${res.status}`,
        type: 'success',
      });
      setIsCreateOrderOpen(false);
      await fetchOrders();
    } catch (err: any) {
      setCreateOrderError(err.message || 'Failed to create order');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handlePlaceOrder = async (orderId: string) => {
    try {
      await api.placeOrder(orderId);
      setMessage({ text: `Order ${orderId} placed successfully!`, type: 'success' });
      await fetchOrders();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to place order', type: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // ADMIN OVERRIDE
  // ---------------------------------------------------------------------------
  const openOverrideModal = (ord: any) => {
    setOverridingOrder(ord);
    setOverrideTimeStr(formatMinutesToTime(ord.deliveryTimeMinutes || 750));
    setOverridePackagingId(ord.packagingTypeId || packagingTypes[0]?.id || '');
    setOverrideAddressId(ord.delivery?.companyAddressId || '');
    setOverrideNote('');
    setOverrideError(null);
    setIsOverriding(false);
    setIsOverrideOpen(true);
  };

  const handleExecuteOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overridingOrder) return;
    if (!overrideNote.trim()) {
      setOverrideError('Admin override note is mandatory per operational policy.');
      return;
    }

    setIsOverriding(true);
    setOverrideError(null);
    try {
      await api.adminOverrideOrder(overridingOrder.id, {
        deliveryAddressId: overrideAddressId || undefined,
        deliveryTimeMinutes: parseTimeToMinutes(overrideTimeStr),
        packagingTypeId: overridePackagingId || undefined,
        note: overrideNote.trim(),
      });

      setMessage({ text: `Order ${overridingOrder.orderNumber || overridingOrder.id} successfully overridden!`, type: 'success' });
      setIsOverrideOpen(false);
      await fetchOrders();
      if (selectedOrder?.id === overridingOrder.id) {
        const updated = await api.getOrderDetail(overridingOrder.id);
        setSelectedOrder(updated);
      }
    } catch (err: any) {
      setOverrideError(err.message || 'Failed to override order');
    } finally {
      setIsOverriding(false);
    }
  };

  const openOrderDetail = async (ord: any) => {
    setSelectedOrder(ord);
    setOrderTimeline([]);
    try {
      const [full, tl] = await Promise.all([
        api.getOrderDetail(ord.id),
        api.getOrderTimeline(ord.id).catch(() => []),
      ]);
      if (full) setSelectedOrder(full);
      setOrderTimeline(tl || []);
    } catch {
      // Ignore
    }
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
              Search, filter, place on behalf of employee, execute administrative overrides with audit logs, and trigger cutoffs.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={openCreateOrderModal}
              className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition shadow"
            >
              <Plus className="h-4 w-4" />
              <span>Create Order</span>
            </button>

            <button
              onClick={handleTriggerCutoff}
              className="py-1.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition shadow"
            >
              <FastForward className="h-3.5 w-3.5" />
              <span>Process Cutoffs</span>
            </button>

            <button
              onClick={fetchOrders}
              title="Refresh orders"
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
              {(Array.isArray(companies) ? companies : []).map((c) => (
                <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => {
                setFilterDate(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-white focus:outline-none cursor-pointer"
            />
            {filterDate && (
              <button
                onClick={() => setFilterDate('')}
                className="text-slate-500 hover:text-white text-[11px]"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Orders Table */}
        {(() => {
          const orderList: any[] = Array.isArray(ordersData?.orders)
            ? ordersData.orders
            : Array.isArray(ordersData?.items)
            ? ordersData.items
            : Array.isArray(ordersData?.data)
            ? ordersData.data
            : [];

          return (
            <div className="mt-6 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow">
              {isLoading && !ordersData ? (
                <div className="py-24 flex justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                </div>
              ) : ordersData && orderList.length === 0 ? (
                <div className="text-center py-16">
                  <Package className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                  <div className="text-sm font-semibold text-slate-300">No Orders Found</div>
                  <p className="text-xs text-slate-500 mt-1">Try adjusting the filter criteria or create an order.</p>
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
                      {orderList.map((ord: any) => {
                        const isConfirmed = ord.status === 'CONFIRMED';
                        const isDelivered = ord.status === 'DELIVERED';
                        const isDraft = ord.status === 'DRAFT';
                        const isPlaced = ord.status === 'PLACED';
                        const isCancelled = ord.status === 'CANCELLED';

                        return (
                          <tr key={ord.id} className="hover:bg-slate-800/40 transition">
                            <td className="py-3 px-4 font-mono font-semibold text-white">
                              <div>{ord.orderNumber || ord.id}</div>
                              {ord.orderNumber && ord.id !== ord.orderNumber && (
                                <div className="text-[10px] text-slate-500 font-mono">{ord.id.slice(0, 12)}...</div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-300">
                              <div>{new Date(ord.deliveryDate).toLocaleDateString()}</div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                {ord.deliveryTimeMinutes ? `${formatMinutesToTime(ord.deliveryTimeMinutes)} IST` : '-'}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-300">
                              <div className="font-medium text-white">{ord.company?.name || 'Company'}</div>
                              <div className="text-[11px] text-slate-400">
                                {ord.employee?.firstName || ord.employee?.name || ord.employee?.email} {ord.employee?.lastName || ''}
                              </div>
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
                            <td className="py-3 px-4 font-semibold text-emerald-400 font-mono">
                              {formatCents(ord.totalCents)}
                            </td>
                            <td className="py-3 px-4 text-right space-x-1.5">
                              {isDraft && (
                                <button
                                  onClick={() => handlePlaceOrder(ord.id)}
                                  className="px-2 py-1 rounded bg-amber-950/60 hover:bg-amber-900 border border-amber-800 text-amber-300 transition font-medium"
                                  title="Place draft order"
                                >
                                  Place
                                </button>
                              )}

                              <button
                                onClick={() => openOrderDetail(ord)}
                                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-medium"
                              >
                                Detail
                              </button>

                              {(isConfirmed || isPlaced) && (
                                <button
                                  onClick={() => openOverrideModal(ord)}
                                  className="px-2 py-1 rounded bg-purple-950/60 hover:bg-purple-900 border border-purple-800 text-purple-300 transition font-medium"
                                  title="Admin override delivery time/address/packaging"
                                >
                                  Override
                                </button>
                              )}

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
          );
        })()}

        {/* ========================================================================= */}
        {/* MODAL: CREATE ORDER ON BEHALF OF EMPLOYEE */}
        {/* ========================================================================= */}
        {isCreateOrderOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <Package className="h-4 w-4 text-emerald-400" />
                  <span>Create Order on Behalf of Employee</span>
                </h3>
                <button
                  onClick={() => setIsCreateOrderOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleCreateOrder} className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Company</label>
                    <select
                      value={modalCompanyId}
                      onChange={(e) => handleModalCompanyChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">All Companies</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Select Employee *</label>
                    <select
                      required
                      value={orderEmployeeId}
                      onChange={(e) => handleModalEmployeeChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {filteredModalEmployees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName} ({emp.email}) {!modalCompanyId && `— ${emp.company?.name || ''}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {modalCompanyAddresses.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Delivery Address</label>
                    <select
                      value={modalAddressId}
                      onChange={(e) => setModalAddressId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {modalCompanyAddresses.map((addr: any) => (
                        <option key={addr.id} value={addr.id}>
                          {addr.label || addr.addressLine1} ({addr.city})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Delivery Date *</label>
                    <input
                      type="date"
                      required
                      value={orderDeliveryDate}
                      onChange={(e) => setOrderDeliveryDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Delivery Time (IST)</label>
                    <input
                      type="time"
                      value={orderDeliveryTimeStr}
                      onChange={(e) => setOrderDeliveryTimeStr(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Packaging Preference</label>
                  <select
                    value={orderPackagingTypeId}
                    onChange={(e) => setOrderPackagingTypeId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Default Packaging</option>
                    {packagingTypes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dish Line Items */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-300">Order Dishes</span>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setShowQuickCreateDish(!showQuickCreateDish)}
                        className="text-amber-400 hover:text-amber-300 text-xs font-medium flex items-center space-x-1"
                      >
                        <Plus className="h-3 w-3" />
                        <span>{showQuickCreateDish ? 'Close Form' : 'Create New Dish'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAddLine}
                        className="text-emerald-400 hover:text-emerald-300 text-xs font-medium flex items-center space-x-1"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add Dish</span>
                      </button>
                    </div>
                  </div>

                  {showQuickCreateDish && (
                    <div className="p-3 bg-slate-950/80 border border-amber-500/40 rounded-xl space-y-2.5 my-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-amber-300">Quick Create New Dish</span>
                        <span className="text-[10px] text-slate-400">Adds to catalogue & selects in order</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Dish Name *</label>
                          <input
                            type="text"
                            placeholder="e.g. Special Chicken Wrap"
                            value={newDishName}
                            onChange={(e) => setNewDishName(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Price ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="5.00"
                            value={newDishPrice}
                            onChange={(e) => setNewDishPrice(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Temperature</label>
                          <select
                            value={newDishTemp}
                            onChange={(e) => setNewDishTemp(e.target.value as any)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                          >
                            <option value="HOT">HOT</option>
                            <option value="COLD">COLD</option>
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={handleSaveQuickDish}
                            disabled={!newDishName.trim() || isSavingQuickDish}
                            className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition"
                          >
                            {isSavingQuickDish ? 'Saving...' : 'Save & Add to Order'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {orderLines.map((line, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <DishSearchCombobox
                          dishes={dishes}
                          selectedDishId={line.dishId}
                          onSelect={(id) => {
                            setOrderLines((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, dishId: id } : item))
                            );
                          }}
                          onQuickCreate={handleQuickCreateDish}
                        />

                        <input
                          type="number"
                          min="1"
                          required
                          value={line.quantity}
                          onChange={(e) => {
                            const q = parseInt(e.target.value, 10) || 1;
                            setOrderLines((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, quantity: q } : item))
                            );
                          }}
                          className="w-16 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />

                        {orderLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="text-slate-500 hover:text-rose-400 p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-xs text-slate-300 pt-2">
                  <input
                    type="checkbox"
                    id="placeImmediately"
                    checked={orderIsPlaced}
                    onChange={(e) => setOrderIsPlaced(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="placeImmediately" className="cursor-pointer">
                    Place order immediately (PLACED status, ready for next cutoff)
                  </label>
                </div>

                {createOrderError && (
                  <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs flex items-center space-x-2">
                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    <span>{createOrderError}</span>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateOrderOpen(false)}
                    disabled={isCreatingOrder}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingOrder}
                    className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition flex items-center space-x-1.5"
                  >
                    {isCreatingOrder && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    <span>{isCreatingOrder ? 'Creating Order...' : 'Create Order'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: ADMIN OVERRIDE */}
        {/* ========================================================================= */}
        {isOverrideOpen && overridingOrder && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <ShieldAlert className="h-4 w-4 text-purple-400" />
                  <span>Admin Override: {overridingOrder.orderNumber || overridingOrder.id}</span>
                </h3>
                <button
                  onClick={() => setIsOverrideOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleExecuteOverride} className="mt-4 space-y-4">
                <div className="text-xs text-amber-400/90 bg-amber-950/40 p-3 rounded-lg border border-amber-800/80">
                  Administrative overrides modify production parameters. A documented audit reason is mandatory.
                </div>

                {overridingOrder.company?.addresses && overridingOrder.company.addresses.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Override Delivery Address</label>
                    <select
                      value={overrideAddressId}
                      onChange={(e) => setOverrideAddressId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      {overridingOrder.company.addresses.map((a: any) => (
                        <option key={a.id} value={a.id}>
                          {a.label || a.addressLine1} ({a.city || 'Bangalore'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Override Delivery Time</label>
                  <input
                    type="time"
                    value={overrideTimeStr}
                    onChange={(e) => setOverrideTimeStr(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Override Packaging</label>
                  <select
                    value={overridePackagingId}
                    onChange={(e) => setOverridePackagingId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    {packagingTypes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Override Note / Reason *</label>
                  <textarea
                    rows={3}
                    required
                    value={overrideNote}
                    onChange={(e) => setOverrideNote(e.target.value)}
                    placeholder="Document operational reason (e.g. CEO client request for executive boardroom session)..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                {overrideError && (
                  <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs flex items-center space-x-2">
                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                    <span>{overrideError}</span>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsOverrideOpen(false)}
                    disabled={isOverriding}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isOverriding}
                    className="py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold transition flex items-center space-x-1.5"
                  >
                    {isOverriding && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    <span>{isOverriding ? 'Applying Override...' : 'Apply Override'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: ORDER DETAIL & TIMELINE */}
        {/* ========================================================================= */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white font-mono flex items-center space-x-2">
                    <span>{selectedOrder.orderNumber || selectedOrder.id}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        selectedOrder.status === 'CONFIRMED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : selectedOrder.status === 'DELIVERED'
                          ? 'bg-blue-950 text-blue-300 border border-blue-800'
                          : selectedOrder.status === 'PLACED'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : selectedOrder.status === 'CANCELLED'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {selectedOrder.status}
                    </span>
                  </h3>
                  <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-3">
                    <span>
                      Company:{' '}
                      <Link
                        href={`/admin/companies`}
                        className="text-emerald-400 hover:underline font-medium"
                      >
                        {selectedOrder.company?.name || 'Company'}
                      </Link>
                    </span>
                    <span>
                      Employee:{' '}
                      <Link
                        href={`/admin/employees`}
                        className="text-emerald-400 hover:underline font-medium"
                      >
                        {selectedOrder.employee?.firstName || selectedOrder.employee?.name || ''} {selectedOrder.employee?.lastName || ''} ({selectedOrder.employee?.email})
                      </Link>
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              {/* Delivery Details */}
              <div className="mt-4 p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs space-y-1">
                <div className="font-semibold text-slate-300 flex items-center space-x-1.5">
                  <MapPin className="h-3.5 w-3.5 text-blue-400" />
                  <span>Delivery Details</span>
                </div>
                <div className="text-slate-300">
                  {selectedOrder.delivery?.addressLabelSnapshot ? (
                    <span>
                      <strong className="text-white">{selectedOrder.delivery.addressLabelSnapshot}</strong>: {selectedOrder.delivery.addressLine1Snapshot}, {selectedOrder.delivery.citySnapshot}
                    </span>
                  ) : (
                    <span>Default Company Address</span>
                  )}
                </div>
                {selectedOrder.delivery?.packagingNameSnapshot && (
                  <div className="text-slate-400 text-[11px]">
                    Packaging: <span className="text-slate-200">{selectedOrder.delivery.packagingNameSnapshot}</span>
                  </div>
                )}
                {selectedOrder.notes && (
                  <div className="text-amber-400/90 text-[11px] pt-1 border-t border-slate-800/80">
                    Note: {selectedOrder.notes}
                  </div>
                )}
              </div>

              {/* Order Lines */}
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Order Items</h4>
                <div className="space-y-2">
                  {selectedOrder.lines?.map((line: any) => (
                    <div key={line.id} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs">
                      <div className="flex justify-between font-semibold text-white">
                        <span>{line.quantity}× {line.dishNameSnapshot || line.dish?.name}</span>
                        <span className="text-emerald-400 font-mono">{formatCents(line.lineTotalCents)}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">SKU: {line.dishSkuSnapshot || line.dish?.sku}</div>

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
                <span className="text-emerald-400 text-lg font-mono">{formatCents(selectedOrder.totalCents)}</span>
              </div>

              {/* Timeline */}
              {orderTimeline.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-800">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                    <History className="h-3.5 w-3.5 text-purple-400" />
                    <span>Audit Event Timeline</span>
                  </h4>

                  <div className="space-y-2">
                    {orderTimeline.map((ev: any) => (
                      <div key={ev.id} className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg text-xs">
                        <div className="flex justify-between font-semibold text-slate-200">
                          <span>{ev.eventType}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(ev.timestamp || ev.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        {ev.note && <div className="text-slate-400 mt-0.5">{ev.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Drawer Quick Actions */}
              <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-400 font-mono">
                  {new Date(selectedOrder.deliveryDate).toLocaleDateString()} • {selectedOrder.deliveryTimeMinutes ? `${formatMinutesToTime(selectedOrder.deliveryTimeMinutes)} IST` : ''}
                </div>
                <div className="flex items-center space-x-2">
                  {selectedOrder.status === 'DRAFT' && (
                    <button
                      onClick={async () => {
                        await handlePlaceOrder(selectedOrder.id);
                        const updated = await api.getOrderDetail(selectedOrder.id).catch(() => null);
                        if (updated) setSelectedOrder(updated);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition"
                    >
                      Place Draft Order
                    </button>
                  )}
                  {(selectedOrder.status === 'CONFIRMED' || selectedOrder.status === 'PLACED') && (
                    <button
                      onClick={() => openOverrideModal(selectedOrder)}
                      className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition flex items-center space-x-1"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>Admin Override</span>
                    </button>
                  )}
                  {selectedOrder.status !== 'CANCELLED' && selectedOrder.status !== 'DELIVERED' && (
                    <button
                      onClick={() => handleCancelOrder(selectedOrder.id)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition"
                    >
                      Cancel Order
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
