'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import {
  Users,
  Building2,
  Shield,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Mail,
  Plus,
  Edit2,
  ArrowRightLeft,
  UploadCloud,
} from 'lucide-react';

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [allergens, setAllergens] = useState<any[]>([]);
  const [dietaryTags, setDietaryTags] = useState<any[]>([]);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  // Form states for Create / Edit
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [compAssignmentId, setCompAssignmentId] = useState('');
  const [canChooseAddress, setCanChooseAddress] = useState(false);
  const [canChangeTime, setCanChangeTime] = useState(false);
  const [canChangePackaging, setCanChangePackaging] = useState(false);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Transfer state
  const [transferTargetCompId, setTransferTargetCompId] = useState('');
  const [transferNewEmail, setTransferNewEmail] = useState('');

  // CSV State
  const [csvText, setCsvText] = useState('');

  const fetchData = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const [comps, emps, alRes, dtRes] = await Promise.all([
        api.getCompanies(),
        api.getEmployees(selectedCompanyId || undefined),
        api.getAllergens().catch(() => []),
        api.getDietaryTags().catch(() => []),
      ]);
      const compList = Array.isArray(comps) ? comps : (comps as any)?.data || [];
      const empList = Array.isArray(emps) ? emps : (emps as any)?.data || [];
      setCompanies(compList);
      setEmployees(empList);
      setAllergens(Array.isArray(alRes) ? alRes : []);
      setDietaryTags(Array.isArray(dtRes) ? dtRes : []);

      if (compList.length > 0 && !compAssignmentId) {
        setCompAssignmentId(compList[0].id);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load employee records', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCompanyId]);

  // ---------------------------------------------------------------------------
  // CREATE / EDIT EMPLOYEE
  // ---------------------------------------------------------------------------
  const openCreateModal = () => {
    setSelectedEmployee(null);
    setFirstName('');
    setLastName('');
    setEmail('');
    setCompAssignmentId(selectedCompanyId || companies[0]?.id || '');
    setCanChooseAddress(false);
    setCanChangeTime(false);
    setCanChangePackaging(false);
    setSelectedAllergens([]);
    setSelectedTags([]);
    setIsCreateOpen(true);
  };

  const openEditModal = (emp: any) => {
    setSelectedEmployee(emp);
    setFirstName(emp.firstName || '');
    setLastName(emp.lastName || '');
    setEmail(emp.email || '');
    setCompAssignmentId(emp.companyId || emp.company?.id || '');
    setCanChooseAddress(Boolean(emp.canChooseAddress ?? emp.canChooseDeliveryAddress));
    setCanChangeTime(Boolean(emp.canChangeTime ?? emp.canChangeDeliveryTime));
    setCanChangePackaging(Boolean(emp.canChangePackaging));
    setSelectedAllergens(emp.allergies?.map((a: any) => a.allergenId || a.id) || []);
    setSelectedTags(emp.dietaryTags?.map((d: any) => d.dietaryTagId || d.id) || []);
    setIsEditOpen(true);
  };

  const openTransferModal = (emp: any) => {
    setSelectedEmployee(emp);
    setTransferTargetCompId('');
    setTransferNewEmail('');
    setIsTransferOpen(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        canChooseDeliveryAddress: canChooseAddress,
        canChangeDeliveryTime: canChangeTime,
        canChangePackaging: canChangePackaging,
        allergenIds: selectedAllergens,
        dietaryTagIds: selectedTags,
      };

      if (selectedEmployee) {
        await api.updateEmployee(selectedEmployee.id, payload);
        setMessage({ text: `Employee '${payload.firstName} ${payload.lastName}' updated!`, type: 'success' });
        setIsEditOpen(false);
      } else {
        payload.companyId = compAssignmentId;
        await api.createEmployee(payload);
        setMessage({ text: `Employee '${payload.firstName} ${payload.lastName}' created!`, type: 'success' });
        setIsCreateOpen(false);
      }

      await fetchData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save employee record (verify company domain)', type: 'error' });
    }
  };

  const handleTransferEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee || !transferTargetCompId) return;
    try {
      await api.transferEmployee(selectedEmployee.id, {
        targetCompanyId: transferTargetCompId,
        newEmail: transferNewEmail.trim() ? transferNewEmail.trim().toLowerCase() : undefined,
      } as any);
      setMessage({ text: `Employee transferred to new company successfully!`, type: 'success' });
      setIsTransferOpen(false);
      await fetchData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to transfer employee (verify domain match)', type: 'error' });
    }
  };

  const handleToggleEmployeeStatus = async (emp: any) => {
    try {
      if (emp.isActive !== false) {
        await api.deactivateEmployee(emp.id);
        setMessage({ text: `Employee '${emp.firstName} ${emp.lastName}' deactivated`, type: 'success' });
      } else {
        await api.activateEmployee(emp.id);
        setMessage({ text: `Employee '${emp.firstName} ${emp.lastName}' activated`, type: 'success' });
      }
      await fetchData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to change employee status', type: 'error' });
    }
  };

  const handleCsvBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim() || !compAssignmentId) return;

    try {
      const res = await api.bulkImportEmployees({
        companyId: compAssignmentId,
        csvText: csvText.trim(),
      });

      const failedDetails = res.results
        ?.filter((r: any) => r.status === 'FAILED')
        ?.map((r: any) => `Row ${r.row} (${r.email}): ${r.error}`)
        ?.join('; ');

      const detailMsg = failedDetails ? ` [Issues: ${failedDetails}]` : '';

      setMessage({
        text: `CSV Batch Complete: ${res.importedCount} imported, ${res.failedCount} failed.${detailMsg}`,
        type: res.importedCount > 0 ? 'success' : 'error',
      });
      setCsvText('');
      setIsCsvModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setMessage({
        text: err.message || 'Failed to process CSV import',
        type: 'error',
      });
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const q = searchQuery.toLowerCase();
    const nameMatch = `${emp.firstName || ''} ${emp.lastName || ''}`.toLowerCase().includes(q);
    const emailMatch = emp.email?.toLowerCase().includes(q);
    return nameMatch || emailMatch;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-800 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
              <Users className="h-6 w-6 text-emerald-400" />
              <span>Employees Roster & Permission Controls</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Onboard corporate employees, manage dietary restrictions, company transfers, and custom ordering permissions.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsCsvModalOpen(true)}
              className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center space-x-1.5 transition border border-slate-700"
            >
              <UploadCloud className="h-4 w-4" />
              <span>CSV Import</span>
            </button>

            <button
              onClick={openCreateModal}
              className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-1.5 transition shadow"
            >
              <Plus className="h-4 w-4" />
              <span>Create Employee</span>
            </button>

            <button
              onClick={fetchData}
              disabled={isLoading}
              title="Refresh employees"
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
        <div className="mt-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search employee by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="w-full sm:w-64">
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">All Companies</option>
              {(Array.isArray(companies) ? companies : []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Employees Table */}
        <div className="mt-6 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/60 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3 font-semibold">Employee</th>
                  <th className="px-6 py-3 font-semibold">Company</th>
                  <th className="px-6 py-3 font-semibold">Permissions</th>
                  <th className="px-6 py-3 font-semibold">Dietary & Allergies</th>
                  <th className="px-6 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoading && employees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      Loading employees...
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No employees found matching filter.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-6 py-4">
                        <div className="font-medium text-white flex items-center space-x-2">
                          <span>{emp.firstName} {emp.lastName}</span>
                          {emp.isActive === false && (
                            <span className="text-[10px] text-slate-500 font-normal">(Deactivated)</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center space-x-1 mt-0.5">
                          <Mail className="h-3 w-3" />
                          <span className="font-mono">{emp.email}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-1.5 text-xs text-slate-200">
                          <Building2 className="h-3.5 w-3.5 text-emerald-400" />
                          <span>{emp.company?.name || 'Assigned'}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 text-[11px]">
                          {(emp.canChooseAddress ?? emp.canChooseDeliveryAddress) && (
                            <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                              Address
                            </span>
                          )}
                          {(emp.canChangeTime ?? emp.canChangeDeliveryTime) && (
                            <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded">
                              Time
                            </span>
                          )}
                          {emp.canChangePackaging && (
                            <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                              Packaging
                            </span>
                          )}
                          {!(emp.canChooseAddress ?? emp.canChooseDeliveryAddress) &&
                            !(emp.canChangeTime ?? emp.canChangeDeliveryTime) &&
                            !emp.canChangePackaging && (
                              <span className="text-slate-500 text-xs">Standard Defaults</span>
                            )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 text-[11px]">
                          {emp.allergies && emp.allergies.length > 0 && (
                            <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded flex items-center space-x-1">
                              <AlertCircle className="h-3 w-3" />
                              <span>
                                {emp.allergies.map((a: any) => a.allergen?.name || a.name || a).join(', ')}
                              </span>
                            </span>
                          )}
                          {emp.dietaryTags && emp.dietaryTags.length > 0 && (
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                              {emp.dietaryTags.map((d: any) => d.dietaryTag?.name || d.name || d).join(', ')}
                            </span>
                          )}
                          {(!emp.allergies || emp.allergies.length === 0) &&
                            (!emp.dietaryTags || emp.dietaryTags.length === 0) && (
                              <span className="text-slate-500 text-xs">None listed</span>
                            )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => openEditModal(emp)}
                          className="py-1 px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => openTransferModal(emp)}
                          className="py-1 px-2.5 rounded bg-purple-950/60 hover:bg-purple-900 border border-purple-800 text-purple-300 text-xs font-medium transition"
                          title="Transfer to another company"
                        >
                          Transfer
                        </button>

                        <button
                          onClick={() => handleToggleEmployeeStatus(emp)}
                          className={`py-1 px-2.5 rounded text-xs font-medium transition ${
                            emp.isActive !== false
                              ? 'bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300'
                              : 'bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800 text-emerald-300'
                          }`}
                        >
                          {emp.isActive !== false ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* MODAL: CREATE / EDIT EMPLOYEE */}
        {/* ========================================================================= */}
        {(isCreateOpen || isEditOpen) && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white">
                  {isEditOpen ? `Edit Employee: ${firstName} ${lastName}` : 'Onboard Corporate Employee'}
                </h3>
                <button
                  onClick={() => {
                    setIsCreateOpen(false);
                    setIsEditOpen(false);
                  }}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSaveEmployee} className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">First Name *</label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Last Name *</label>
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Corporate Email * (Must match company domain)
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. employee@company.com"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {isCreateOpen && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Assigned Company *</label>
                    <select
                      required
                      value={compAssignmentId}
                      onChange={(e) => setCompAssignmentId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.domains?.map((d: any) => d.domain).join(', ')})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Custom Permissions */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="text-xs font-semibold text-slate-300">Custom Ordering Permissions</div>
                  <div className="space-y-1.5 text-xs text-slate-300">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={canChooseAddress}
                        onChange={(e) => setCanChooseAddress(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Allow Custom Delivery Address Selection</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={canChangeTime}
                        onChange={(e) => setCanChangeTime(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Allow Custom Delivery Time Selection</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={canChangePackaging}
                        onChange={(e) => setCanChangePackaging(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Allow Custom Packaging Selection</span>
                    </label>
                  </div>
                </div>

                {/* Dietary Tags & Allergens */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="text-xs font-semibold text-slate-300">Allergens & Preferences</div>
                  {allergens.length > 0 && (
                    <div>
                      <span className="text-[11px] text-slate-400 block mb-1">Allergies:</span>
                      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1 bg-slate-950 border border-slate-800 rounded">
                        {allergens.map((a) => {
                          const isSel = selectedAllergens.includes(a.id);
                          return (
                            <button
                              type="button"
                              key={a.id}
                              onClick={() =>
                                setSelectedAllergens((prev) =>
                                  isSel ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                                )
                              }
                              className={`px-1.5 py-0.5 rounded text-[10px] ${
                                isSel ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {a.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {dietaryTags.length > 0 && (
                    <div>
                      <span className="text-[11px] text-slate-400 block mb-1">Dietary Tags:</span>
                      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1 bg-slate-950 border border-slate-800 rounded">
                        {dietaryTags.map((dt) => {
                          const isSel = selectedTags.includes(dt.id);
                          return (
                            <button
                              type="button"
                              key={dt.id}
                              onClick={() =>
                                setSelectedTags((prev) =>
                                  isSel ? prev.filter((id) => id !== dt.id) : [...prev, dt.id]
                                )
                              }
                              className={`px-1.5 py-0.5 rounded text-[10px] ${
                                isSel ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {dt.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateOpen(false);
                      setIsEditOpen(false);
                    }}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                  >
                    {isEditOpen ? 'Save Employee' : 'Onboard Employee'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: TRANSFER EMPLOYEE */}
        {/* ========================================================================= */}
        {isTransferOpen && selectedEmployee && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <ArrowRightLeft className="h-4 w-4 text-purple-400" />
                  <span>Transfer Company: {selectedEmployee.firstName} {selectedEmployee.lastName}</span>
                </h3>
                <button
                  onClick={() => setIsTransferOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleTransferEmployee} className="mt-4 space-y-4">
                <div className="text-xs text-slate-400">
                  Current Company: <strong className="text-white">{selectedEmployee.company?.name}</strong>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Target Company *</label>
                  <select
                    required
                    value={transferTargetCompId}
                    onChange={(e) => setTransferTargetCompId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="">Select target company...</option>
                    {companies
                      .filter((c) => c.id !== (selectedEmployee.companyId || selectedEmployee.company?.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.domains?.map((d: any) => d.domain).join(', ')})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    New Email (If required to match target domain)
                  </label>
                  <input
                    type="email"
                    value={transferNewEmail}
                    onChange={(e) => setTransferNewEmail(e.target.value)}
                    placeholder="e.g. employee@newcompany.com"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Must match an authorized domain of the target company.
                  </span>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsTransferOpen(false)}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition"
                  >
                    Execute Transfer
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: CSV IMPORT */}
        {/* ========================================================================= */}
        {isCsvModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <UploadCloud className="h-4 w-4 text-emerald-400" />
                  <span>CSV Employee Batch Onboarding</span>
                </h3>
                <button
                  onClick={() => setIsCsvModalOpen(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleCsvBulkUpload} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Target Company *</label>
                  <select
                    required
                    value={compAssignmentId}
                    onChange={(e) => setCompAssignmentId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.domains?.map((d: any) => d.domain).join(', ')})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Paste CSV Data (Format: FirstName, LastName, Email) *
                  </label>
                  <textarea
                    rows={6}
                    required
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="Aarav, Patel, aarav@nexus.tech&#10;Deepa, Shah, deepa@nexus.tech&#10;Kiran, Rao, kiran@nexus.tech"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    One employee per line. All emails will be verified against the selected company domain.
                  </span>
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsCsvModalOpen(false)}
                    className="py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                  >
                    Process CSV Batch
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
