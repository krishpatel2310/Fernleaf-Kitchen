'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import {
  Building2,
  Users,
  MapPin,
  Clock,
  Shield,
  RefreshCw,
  Mail,
  Plus,
  Edit2,
  Globe,
  Trash2,
  Calendar,
  Check,
  Truck,
  Package,
} from 'lucide-react';

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [packagingTypes, setPackagingTypes] = useState<any[]>([]);
  const [priceTiers, setPriceTiers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals state
  const [isCreateCompanyOpen, setIsCreateCompanyOpen] = useState(false);
  const [isEditCompanyOpen, setIsEditCompanyOpen] = useState(false);
  const [isAddAddressOpen, setIsAddAddressOpen] = useState(false);
  const [isAddHolidayOpen, setIsAddHolidayOpen] = useState(false);

  // Form states for Create Company
  const [compName, setCompName] = useState('');
  const [compDomain, setCompDomain] = useState('');
  const [billingContactName, setBillingContactName] = useState('');
  const [billingContactEmail, setBillingContactEmail] = useState('');
  const [defaultDeliveryTimeStr, setDefaultDeliveryTimeStr] = useState('12:30');
  const [deliveryMinutesBefore, setDeliveryMinutesBefore] = useState('60');
  const [packagingTypeId, setPackagingTypeId] = useState('');
  const [priceTierId, setPriceTierId] = useState('');
  const [defaultDriverId, setDefaultDriverId] = useState('');
  const [driverInstructions, setDriverInstructions] = useState('');

  // Initial Address for Create Company
  const [addrLabel, setAddrLabel] = useState('Headquarters');
  const [addrLine1, setAddrLine1] = useState('');
  const [addrCity, setAddrCity] = useState('Bengaluru');
  const [addrState, setAddrState] = useState('Karnataka');
  const [addrPostalCode, setAddrPostalCode] = useState('560001');

  // Domain add state
  const [newDomainStr, setNewDomainStr] = useState('');

  // Company holiday form state
  const [holidayName, setHolidayName] = useState('');
  const [holidayDate, setHolidayDate] = useState('');

  const fetchCompanies = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const [compRes, pkRes, tierRes, drvRes] = await Promise.all([
        api.getCompanies(),
        api.getPackagingTypes().catch(() => []),
        api.getPriceTiers().catch(() => []),
        api.getDrivers().catch(() => []),
      ]);

      const compList = Array.isArray(compRes) ? compRes : (compRes as any)?.data || [];
      setCompanies(compList);
      setPackagingTypes(Array.isArray(pkRes) ? pkRes : []);
      setPriceTiers(Array.isArray(tierRes) ? tierRes : []);
      setDrivers(Array.isArray(drvRes) ? drvRes : []);

      if (compList.length > 0) {
        const active = selectedCompany ? compList.find((c: any) => c.id === selectedCompany.id) || compList[0] : compList[0];
        setSelectedCompany(active);
        await loadCompanyDetails(active.id);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load companies', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadCompanyDetails = async (companyId: string) => {
    try {
      const [emps, fullComp] = await Promise.all([
        api.getEmployees(companyId).catch(() => []),
        api.getCompanyDetail(companyId).catch(() => null),
      ]);
      const empList = Array.isArray(emps) ? emps : (emps as any)?.data || [];
      setEmployees(empList);
      if (fullComp) {
        setSelectedCompany(fullComp);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  // Time conversion
  const parseTimeToMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10) || 0);
    return h * 60 + m;
  };

  const formatMinutesToTime = (mins: number = 750) => {
    const h = Math.floor(mins / 60).toString().padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  // ---------------------------------------------------------------------------
  // CREATE / EDIT COMPANY
  // ---------------------------------------------------------------------------
  const openCreateModal = () => {
    setCompName('');
    setCompDomain('');
    setBillingContactName('');
    setBillingContactEmail('');
    setDefaultDeliveryTimeStr('12:30');
    setDeliveryMinutesBefore('60');
    setPackagingTypeId(packagingTypes[0]?.id || '');
    setPriceTierId(priceTiers[0]?.id || '');
    setDefaultDriverId('');
    setDriverInstructions('');
    setAddrLabel('Headquarters');
    setAddrLine1('');
    setAddrCity('Bengaluru');
    setAddrState('Karnataka');
    setAddrPostalCode('560001');
    setIsCreateCompanyOpen(true);
  };

  const openEditModal = (comp: any) => {
    setCompName(comp.name || '');
    setBillingContactName(comp.billingContactName || '');
    setBillingContactEmail(comp.billingContactEmail || '');
    setDefaultDeliveryTimeStr(formatMinutesToTime(comp.defaultDeliveryTimeMinutes || 750));
    setDeliveryMinutesBefore(String(comp.deliveryMinutesBefore || 60));
    setPackagingTypeId(comp.defaultPackagingTypeId || packagingTypes[0]?.id || '');
    setPriceTierId(comp.priceTierId || '');
    setDefaultDriverId(comp.defaultDriverId || '');
    setDriverInstructions(comp.driverInstructions || '');
    setIsEditCompanyOpen(true);
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        name: compName.trim(),
        domains: [compDomain.trim().toLowerCase()],
        addresses: [
          {
            label: addrLabel.trim(),
            addressLine1: addrLine1.trim(),
            city: addrCity.trim(),
            state: addrState.trim(),
            postalCode: addrPostalCode.trim(),
          },
        ],
        billingContactName: billingContactName.trim(),
        billingContactEmail: billingContactEmail.trim().toLowerCase(),
        defaultDeliveryTimeMinutes: parseTimeToMinutes(defaultDeliveryTimeStr),
        deliveryMinutesBefore: parseInt(deliveryMinutesBefore, 10) || 60,
        defaultPackagingTypeId: packagingTypeId,
        priceTierId: priceTierId || undefined,
        defaultDriverId: defaultDriverId || undefined,
        driverInstructions: driverInstructions.trim() || undefined,
      };

      const res = await api.createCompany(payload);
      setMessage({ text: `Company '${payload.name}' created successfully!`, type: 'success' });
      setIsCreateCompanyOpen(false);
      await fetchCompanies();
      if (res?.id) {
        setSelectedCompany(res);
        await loadCompanyDetails(res.id);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create company', type: 'error' });
    }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    try {
      const payload: any = {
        name: compName.trim(),
        billingContactName: billingContactName.trim(),
        billingContactEmail: billingContactEmail.trim().toLowerCase(),
        defaultDeliveryTimeMinutes: parseTimeToMinutes(defaultDeliveryTimeStr),
        deliveryMinutesBefore: parseInt(deliveryMinutesBefore, 10) || 60,
        defaultPackagingTypeId: packagingTypeId || undefined,
        priceTierId: priceTierId || null,
        defaultDriverId: defaultDriverId || null,
        driverInstructions: driverInstructions.trim() || null,
      };

      await api.updateCompany(selectedCompany.id, payload);
      setMessage({ text: `Company '${payload.name}' updated!`, type: 'success' });
      setIsEditCompanyOpen(false);
      await fetchCompanies();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update company', type: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // DOMAIN MANAGEMENT
  // ---------------------------------------------------------------------------
  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !newDomainStr.trim()) return;
    try {
      await api.addCompanyDomain(selectedCompany.id, newDomainStr.trim().toLowerCase());
      setMessage({ text: `Domain '${newDomainStr}' added!`, type: 'success' });
      setNewDomainStr('');
      await loadCompanyDetails(selectedCompany.id);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to add domain (rejects public domains / duplicates)', type: 'error' });
    }
  };

  const handleRemoveDomain = async (domainId: string) => {
    if (!selectedCompany) return;
    if (!confirm('Remove this domain from the company?')) return;
    try {
      await api.removeCompanyDomain(selectedCompany.id, domainId);
      setMessage({ text: 'Domain removed', type: 'success' });
      await loadCompanyDetails(selectedCompany.id);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to remove domain', type: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // ADDRESS MANAGEMENT
  // ---------------------------------------------------------------------------
  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    try {
      await api.addCompanyAddress(selectedCompany.id, {
        label: addrLabel.trim(),
        addressLine1: addrLine1.trim(),
        city: addrCity.trim(),
        state: addrState.trim(),
        postalCode: addrPostalCode.trim(),
      });
      setMessage({ text: 'Address added successfully!', type: 'success' });
      setIsAddAddressOpen(false);
      setAddrLine1('');
      await loadCompanyDetails(selectedCompany.id);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to add address', type: 'error' });
    }
  };

  const handleRemoveAddress = async (addressId: string) => {
    if (!selectedCompany) return;
    if (!confirm('Deactivate this delivery address?')) return;
    try {
      await api.removeCompanyAddress(selectedCompany.id, addressId);
      setMessage({ text: 'Address deactivated', type: 'success' });
      await loadCompanyDetails(selectedCompany.id);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to deactivate address', type: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // CALENDAR & WORKING DAYS
  // ---------------------------------------------------------------------------
  const handleToggleWorkingDay = async (dayOfWeek: string, currentIsDelivery: boolean) => {
    if (!selectedCompany) return;
    try {
      await api.updateCompanyWorkingDay(selectedCompany.id, {
        dayOfWeek,
        isDeliveryDay: !currentIsDelivery,
      });
      setMessage({ text: `Updated ${dayOfWeek} delivery status`, type: 'success' });
      await loadCompanyDetails(selectedCompany.id);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update calendar day', type: 'error' });
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany || !holidayName || !holidayDate) return;
    try {
      await api.addCompanyHoliday(selectedCompany.id, {
        name: holidayName.trim(),
        date: holidayDate,
      });
      setMessage({ text: `Holiday '${holidayName}' added!`, type: 'success' });
      setHolidayName('');
      setHolidayDate('');
      setIsAddHolidayOpen(false);
      await loadCompanyDetails(selectedCompany.id);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to add holiday', type: 'error' });
    }
  };

  const handleRemoveHoliday = async (holidayId: string) => {
    if (!selectedCompany) return;
    try {
      await api.removeCompanyHoliday(selectedCompany.id, holidayId);
      setMessage({ text: 'Company holiday removed', type: 'success' });
      await loadCompanyDetails(selectedCompany.id);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to remove holiday', type: 'error' });
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
              <Building2 className="h-6 w-6 text-emerald-400" />
              <span>Corporate Clients Management</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Admin operations for corporate accounts, verified email domains, delivery addresses, pricing tiers, and delivery calendars.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={openCreateModal}
              className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition shadow"
            >
              <Plus className="h-4 w-4" />
              <span>Register New Company</span>
            </button>

            <button
              onClick={fetchCompanies}
              title="Refresh companies"
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

        {/* Companies Grid */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Array.isArray(companies) ? companies : []).map((comp) => {
            const isSelected = selectedCompany?.id === comp.id;
            return (
              <div
                key={comp.id}
                onClick={() => {
                  setSelectedCompany(comp);
                  loadCompanyDetails(comp.id);
                }}
                className={`p-5 rounded-2xl cursor-pointer border transition flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-900 border-emerald-500 shadow-lg shadow-emerald-950/20'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-white text-base">{comp.name}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(comp);
                      }}
                      className="py-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center space-x-1 transition"
                    >
                      <Edit2 className="h-3 w-3" />
                      <span>Edit</span>
                    </button>
                  </div>

                  <div className="text-xs text-slate-400 mt-2 space-y-1">
                    <div>
                      Domains:{' '}
                      <strong className="text-emerald-400">
                        {comp.domains?.map((d: any) => d.domain).join(', ') || 'None'}
                      </strong>
                    </div>
                    <div>
                      Delivery Time:{' '}
                      <strong className="text-white">
                        {formatMinutesToTime(comp.defaultDeliveryTimeMinutes)} IST
                      </strong>
                    </div>
                    <div>
                      Kitchen Buffer:{' '}
                      <strong className="text-white">{comp.deliveryMinutesBefore} min</strong>
                    </div>
                    <div>
                      Price Tier:{' '}
                      <strong className="text-purple-400">{comp.priceTier?.name || 'Default Tier'}</strong>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 flex justify-between items-center">
                  <span>{comp.addresses?.length || 1} addresses</span>
                  <span>{comp.employees?.length || 0} employees</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Company Management Hub */}
        {selectedCompany && (
          <div className="mt-8 space-y-6">
            {/* Row 1: Domains & Addresses */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Domains Hub */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
                <div className="flex justify-between items-center pb-3 border-b border-slate-800 mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2">
                    <Globe className="h-4 w-4 text-emerald-400" />
                    <span>Verified Corporate Domains</span>
                  </h3>
                  <span className="text-xs text-slate-500">Auto-routes employee signups</span>
                </div>

                {/* Domains List */}
                <div className="space-y-2 mb-4">
                  {(selectedCompany.domains || []).map((d: any) => (
                    <div
                      key={d.id}
                      className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-xs flex justify-between items-center"
                    >
                      <span className="font-mono text-emerald-400 font-semibold">{d.domain}</span>
                      {selectedCompany.domains.length > 1 && (
                        <button
                          onClick={() => handleRemoveDomain(d.id)}
                          className="text-slate-500 hover:text-rose-400 transition"
                          title="Remove domain"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Domain Form */}
                <form onSubmit={handleAddDomain} className="flex space-x-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. acme-corp.com"
                    value={newDomainStr}
                    onChange={(e) => setNewDomainStr(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                  />
                  <button
                    type="submit"
                    className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                  >
                    Add Domain
                  </button>
                </form>
              </div>

              {/* Delivery Addresses Hub */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
                <div className="flex justify-between items-center pb-3 border-b border-slate-800 mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2">
                    <MapPin className="h-4 w-4 text-blue-400" />
                    <span>Delivery Locations ({selectedCompany.addresses?.length || 0})</span>
                  </h3>
                  <button
                    onClick={() => {
                      setAddrLabel('');
                      setAddrLine1('');
                      setIsAddAddressOpen(true);
                    }}
                    className="py-1 px-2.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center space-x-1 transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Address</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {(selectedCompany.addresses || []).map((addr: any) => (
                    <div
                      key={addr.id}
                      className={`p-2.5 bg-slate-950/70 border rounded-xl text-xs flex justify-between items-center ${
                        addr.isActive !== false ? 'border-slate-800' : 'border-slate-800/40 opacity-50'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-white flex items-center space-x-2">
                          <span>{addr.label}</span>
                          {addr.isActive === false && (
                            <span className="text-[10px] text-slate-500 font-normal">(Inactive)</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {addr.addressLine1}, {addr.city} {addr.postalCode}
                        </div>
                      </div>

                      {addr.isActive !== false && (
                        <button
                          onClick={() => handleRemoveAddress(addr.id)}
                          className="text-slate-500 hover:text-rose-400 transition"
                          title="Deactivate address"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Delivery Calendar & Holidays */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800 mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-purple-400" />
                  <span>Company Delivery Calendar & Custom Holidays</span>
                </h3>
                <button
                  onClick={() => setIsAddHolidayOpen(true)}
                  className="py-1 px-2.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center space-x-1 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Holiday</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Working Days */}
                <div>
                  <div className="text-xs font-medium text-slate-400 mb-2">Delivery Days (Click to toggle)</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day) => {
                      const dayConfig = selectedCompany.workingDays?.find((w: any) => w.dayOfWeek === day);
                      const isDelivery = dayConfig ? dayConfig.isDeliveryDay : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].includes(day);

                      return (
                        <button
                          key={day}
                          onClick={() => handleToggleWorkingDay(day, isDelivery)}
                          className={`p-2 rounded-lg text-xs font-semibold transition border ${
                            isDelivery
                              ? 'bg-emerald-950 border-emerald-700 text-emerald-300'
                              : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          <div>{day.slice(0, 3)}</div>
                          <div className="text-[10px] font-normal mt-0.5">{isDelivery ? 'Delivery' : 'No Delivery'}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Holidays */}
                <div>
                  <div className="text-xs font-medium text-slate-400 mb-2">Company Specific Holidays</div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {(!selectedCompany.holidays || selectedCompany.holidays.length === 0) ? (
                      <div className="text-[11px] text-slate-500 italic">No company-specific holidays added.</div>
                    ) : (
                      selectedCompany.holidays.map((h: any) => (
                        <div
                          key={h.id}
                          className="p-2 bg-slate-950/70 border border-slate-800 rounded-lg text-xs flex justify-between items-center"
                        >
                          <div>
                            <span className="font-semibold text-white">{h.name}</span>
                            <span className="text-slate-400 text-[11px] ml-2 font-mono">
                              {new Date(h.date).toLocaleDateString()}
                            </span>
                          </div>
                          <button
                            onClick={() => handleRemoveHoliday(h.id)}
                            className="text-slate-500 hover:text-rose-400 transition"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: Employee Roster */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2">
                  <Users className="h-4 w-4 text-emerald-400" />
                  <span>Employees at {selectedCompany.name} ({employees.length})</span>
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3">Email</th>
                      <th className="py-2.5 px-3">Dietary / Allergens</th>
                      <th className="py-2.5 px-3">Custom Permissions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 font-medium text-white">
                          {emp.firstName} {emp.lastName}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">{emp.email}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {emp.allergies?.map((a: any) => (
                              <span key={a.allergenId} className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 text-[10px]">
                                {a.allergen?.name}
                              </span>
                            ))}
                            {emp.dietaryTags?.map((t: any) => (
                              <span key={t.dietaryTagId} className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px]">
                                {t.dietaryTag?.name}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-400 space-x-1">
                          {emp.canChooseAddress && <span className="text-emerald-400">Address</span>}
                          {emp.canChangeTime && <span className="text-blue-400">• Time</span>}
                          {emp.canChangePackaging && <span className="text-purple-400">• Packaging</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: CREATE COMPANY */}
        {/* ========================================================================= */}
        {isCreateCompanyOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">Register Corporate Client</h3>
                <button
                  onClick={() => setIsCreateCompanyOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleCreateCompany} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    placeholder="e.g. Nexus Innovations Pvt Ltd"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Corporate Email Domain * (No Gmail / Yahoo)
                  </label>
                  <input
                    type="text"
                    required
                    value={compDomain}
                    onChange={(e) => setCompDomain(e.target.value)}
                    placeholder="e.g. nexus.tech"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Billing Contact Name *</label>
                    <input
                      type="text"
                      required
                      value={billingContactName}
                      onChange={(e) => setBillingContactName(e.target.value)}
                      placeholder="e.g. Priya Sharma"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Billing Contact Email *</label>
                    <input
                      type="email"
                      required
                      value={billingContactEmail}
                      onChange={(e) => setBillingContactEmail(e.target.value)}
                      placeholder="e.g. accounts@nexus.tech"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Default Delivery Time *</label>
                    <input
                      type="time"
                      required
                      value={defaultDeliveryTimeStr}
                      onChange={(e) => setDefaultDeliveryTimeStr(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Kitchen Buffer (min)</label>
                    <input
                      type="number"
                      min="15"
                      max="180"
                      value={deliveryMinutesBefore}
                      onChange={(e) => setDeliveryMinutesBefore(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Price Tier</label>
                    <select
                      value={priceTierId}
                      onChange={(e) => setPriceTierId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">Default Tier</option>
                      {priceTiers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Default Packaging *</label>
                    <select
                      required
                      value={packagingTypeId}
                      onChange={(e) => setPackagingTypeId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {packagingTypes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Primary Delivery Address */}
                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div className="text-xs font-semibold text-slate-300">Primary Delivery Address</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <input
                        type="text"
                        required
                        placeholder="Address Label (e.g. HQ Tower B)"
                        value={addrLabel}
                        onChange={(e) => setAddrLabel(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        required
                        placeholder="Street Address Line 1"
                        value={addrLine1}
                        onChange={(e) => setAddrLine1(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateCompanyOpen(false)}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                  >
                    Register Company
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: EDIT COMPANY */}
        {/* ========================================================================= */}
        {isEditCompanyOpen && selectedCompany && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">Edit Company: {selectedCompany.name}</h3>
                <button
                  onClick={() => setIsEditCompanyOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleUpdateCompany} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Company Name *</label>
                  <input
                    type="text"
                    required
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Billing Contact Name</label>
                    <input
                      type="text"
                      value={billingContactName}
                      onChange={(e) => setBillingContactName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Billing Contact Email</label>
                    <input
                      type="email"
                      value={billingContactEmail}
                      onChange={(e) => setBillingContactEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Default Delivery Time</label>
                    <input
                      type="time"
                      value={defaultDeliveryTimeStr}
                      onChange={(e) => setDefaultDeliveryTimeStr(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Kitchen Buffer (min)</label>
                    <input
                      type="number"
                      value={deliveryMinutesBefore}
                      onChange={(e) => setDeliveryMinutesBefore(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Price Tier</label>
                    <select
                      value={priceTierId}
                      onChange={(e) => setPriceTierId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">Default Tier</option>
                      {priceTiers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Default Packaging</label>
                    <select
                      value={packagingTypeId}
                      onChange={(e) => setPackagingTypeId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {packagingTypes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Driver Delivery Instructions</label>
                  <textarea
                    rows={2}
                    value={driverInstructions}
                    onChange={(e) => setDriverInstructions(e.target.value)}
                    placeholder="Gate entry instructions..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsEditCompanyOpen(false)}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: ADD ADDRESS */}
        {/* ========================================================================= */}
        {isAddAddressOpen && selectedCompany && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">Add Delivery Address</h3>
                <button
                  onClick={() => setIsAddAddressOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleAddAddress} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Address Label *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. North Campus Cafeteria"
                    value={addrLabel}
                    onChange={(e) => setAddrLabel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Street Address Line 1 *</label>
                  <input
                    type="text"
                    required
                    placeholder="123 Innovation Way"
                    value={addrLine1}
                    onChange={(e) => setAddrLine1(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">City *</label>
                    <input
                      type="text"
                      required
                      value={addrCity}
                      onChange={(e) => setAddrCity(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Postal Code *</label>
                    <input
                      type="text"
                      required
                      value={addrPostalCode}
                      onChange={(e) => setAddrPostalCode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsAddAddressOpen(false)}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
                  >
                    Add Address
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: ADD COMPANY HOLIDAY */}
        {/* ========================================================================= */}
        {isAddHolidayOpen && selectedCompany && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">Add Company Holiday</h3>
                <button
                  onClick={() => setIsAddHolidayOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleAddHoliday} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Holiday Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Annual Company Offsite"
                    value={holidayName}
                    onChange={(e) => setHolidayName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={holidayDate}
                    onChange={(e) => setHolidayDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsAddHolidayOpen(false)}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition"
                  >
                    Add Holiday
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
