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
} from 'lucide-react';

export default function AdminEmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [comps, emps] = await Promise.all([
        api.getCompanies(),
        api.getEmployees(selectedCompanyId || undefined),
      ]);
      setCompanies(comps || []);
      // If employees endpoint returns paginated object with data array:
      const empList = Array.isArray(emps) ? emps : (emps as any)?.data || [];
      setEmployees(empList);
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCompanyId]);

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
              <span>Employees Roster</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage corporate employee accounts, dietary preferences, delivery permissions, and company assignments.
            </p>
          </div>

          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 transition"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

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
              {companies.map((c) => (
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
                  <th className="px-6 py-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      Loading employees...
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No employees found matching current filter.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">
                          {emp.firstName} {emp.lastName}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center space-x-1 mt-0.5">
                          <Mail className="h-3 w-3" />
                          <span>{emp.email}</span>
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
                          {emp.canChooseAddress && (
                            <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                              Custom Address
                            </span>
                          )}
                          {emp.canChangeTime && (
                            <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded">
                              Custom Time
                            </span>
                          )}
                          {emp.canChangePackaging && (
                            <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                              Custom Packaging
                            </span>
                          )}
                          {!emp.canChooseAddress && !emp.canChangeTime && !emp.canChangePackaging && (
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

                      <td className="px-6 py-4 text-right">
                        {emp.isActive !== false ? (
                          <span className="inline-flex items-center space-x-1 text-xs text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-xs text-slate-500">
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Inactive</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
