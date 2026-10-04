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
} from 'lucide-react';

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCompanies = async () => {
    setIsLoading(true);
    try {
      const res = await api.getCompanies();
      setCompanies(res || []);
      if (res && res.length > 0 && !selectedCompany) {
        setSelectedCompany(res[0]);
        loadEmployees(res[0].id);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  };

  const loadEmployees = async (companyId: string) => {
    try {
      const emps = await api.getEmployees(companyId);
      setEmployees(emps || []);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-800 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
              <Building2 className="h-6 w-6 text-emerald-400" />
              <span>Corporate Clients & Employees</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              B2B corporate clients, email domains, delivery defaults, employee rosters, dietary preferences, and permission flags.
            </p>
          </div>

          <button
            onClick={fetchCompanies}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Companies Grid */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          {companies.map((comp) => {
            const isSelected = selectedCompany?.id === comp.id;
            return (
              <div
                key={comp.id}
                onClick={() => {
                  setSelectedCompany(comp);
                  loadEmployees(comp.id);
                }}
                className={`p-5 rounded-2xl cursor-pointer border transition ${
                  isSelected
                    ? 'bg-slate-900 border-emerald-500 shadow-lg shadow-emerald-950/20'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-white text-base">{comp.name}</div>
                <div className="text-xs text-slate-400 mt-1">
                  Domains: <strong className="text-emerald-400">{comp.domains?.map((d: any) => d.domain).join(', ')}</strong>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-400 space-y-1">
                  <div>Delivery Time: <strong className="text-white">{Math.floor(comp.defaultDeliveryTimeMinutes / 60)}:{(comp.defaultDeliveryTimeMinutes % 60).toString().padStart(2, '0')} IST</strong></div>
                  <div>Buffer Before Delivery: <strong className="text-white">{comp.deliveryMinutesBefore} min</strong></div>
                  <div>Price Tier: <strong className="text-purple-400">{comp.priceTier?.name || 'Default Tier'}</strong></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Company Employees Roster */}
        {selectedCompany && (
          <div className="mt-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
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
                    <th className="py-2.5 px-3">Permissions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-medium text-white">{emp.name}</td>
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
                          {(!emp.allergies || emp.allergies.length === 0) && (!emp.dietaryTags || emp.dietaryTags.length === 0) && (
                            <span className="text-slate-500 text-[11px]">None specified</span>
                          )}
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
        )}
      </main>
    </div>
  );
}
