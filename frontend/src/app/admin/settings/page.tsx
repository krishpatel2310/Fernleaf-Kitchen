'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import {
  Settings,
  Clock,
  Calendar,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Truck,
  Check,
} from 'lucide-react';

const DAYS_OF_WEEK = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [workingDays, setWorkingDays] = useState<any[]>([]);
  const [cutoffTime, setCutoffTime] = useState('16:00');
  const [cutoffDays, setCutoffDays] = useState(2);
  const [dispatchBuffer, setDispatchBuffer] = useState(30);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [cutoffPreview, setCutoffPreview] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingDays, setIsUpdatingDays] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchSettings = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const [setRes, holRes, daysRes, prevRes] = await Promise.all([
        api.getKitchenSettings(),
        api.getKitchenHolidays(),
        api.getKitchenWorkingDays(),
        api.getCutoffPreview(),
      ]);
      setSettings(setRes);
      setCutoffTime(setRes?.cutoffTime || '16:00');
      setCutoffDays(setRes?.cutoffWorkingDaysCount || 2);
      setDispatchBuffer(setRes?.dispatchBufferMinutes || 30);
      setHolidays(holRes || []);
      setWorkingDays(daysRes || []);
      setCutoffPreview(prevRes);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load kitchen settings', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      await api.updateKitchenSettings({
        cutoffTime,
        cutoffWorkingDaysCount: Number(cutoffDays),
        dispatchBufferMinutes: Number(dispatchBuffer),
      });
      setMessage({ text: 'Kitchen settings updated successfully!', type: 'success' });
      await fetchSettings();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update settings', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleWorkingDay = async (day: string) => {
    setIsUpdatingDays(true);
    setMessage(null);

    // Compute updated working days
    const currentDayConfig = workingDays.find((d) => d.dayOfWeek === day);
    const newIsWorking = currentDayConfig ? !currentDayConfig.isWorking : false;

    // Check that at least one day remains active
    const nextWorkingDays = DAYS_OF_WEEK.map((d) => {
      if (d === day) return { dayOfWeek: d, isWorking: newIsWorking };
      const existing = workingDays.find((item) => item.dayOfWeek === d);
      return { dayOfWeek: d, isWorking: existing ? existing.isWorking : true };
    });

    const activeCount = nextWorkingDays.filter((d) => d.isWorking).length;
    if (activeCount === 0) {
      setMessage({ text: 'At least one kitchen working day must remain active', type: 'error' });
      setIsUpdatingDays(false);
      return;
    }

    try {
      await api.updateKitchenWorkingDays(nextWorkingDays);
      setMessage({ text: `Kitchen working schedule updated`, type: 'success' });
      await fetchSettings();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update working days', type: 'error' });
    } finally {
      setIsUpdatingDays(false);
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayName || !newHolidayDate) return;
    try {
      await api.addKitchenHoliday(newHolidayName, newHolidayDate);
      setMessage({ text: `Holiday '${newHolidayName}' added`, type: 'success' });
      setNewHolidayName('');
      setNewHolidayDate('');
      await fetchSettings();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to add holiday', type: 'error' });
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    if (!confirm('Delete this kitchen holiday?')) return;
    try {
      await api.deleteKitchenHoliday(id);
      setMessage({ text: 'Holiday removed', type: 'success' });
      await fetchSettings();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to delete holiday', type: 'error' });
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
              <Settings className="h-6 w-6 text-purple-400" />
              <span>Kitchen Operational Settings</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Configure order cutoff times, working-day lead time, central kitchen working schedules, dispatch buffers, and kitchen holidays.
            </p>
          </div>

          <button
            onClick={fetchSettings}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition"
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

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Cutoff Parameters & Working Days */}
          <div className="space-y-6">
            {/* Cutoff Rules Card */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2 mb-4">
                <Clock className="h-4 w-4 text-emerald-400" />
                <span>Cutoff Rules & Lead Time</span>
              </h2>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Daily Cutoff Time (Asia/Kolkata)
                  </label>
                  <input
                    type="time"
                    required
                    value={cutoffTime}
                    onChange={(e) => setCutoffTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">Default cutoff time is 16:00 (4:00 PM IST)</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Kitchen Working Days Lead Time
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="14"
                    required
                    value={cutoffDays}
                    onChange={(e) => setCutoffDays(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Number of active kitchen working days required before delivery date (standard: 2).
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Dispatch Buffer Before Delivery (Minutes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="180"
                    required
                    value={dispatchBuffer}
                    onChange={(e) => setDispatchBuffer(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Standard duration in minutes orders must leave kitchen prior to delivery time.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition disabled:opacity-50"
                >
                  {isSaving ? 'Updating...' : 'Save Operational Settings'}
                </button>
              </form>
            </div>

            {/* Central Kitchen Working Days */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-sky-400" />
                  <span>Central Kitchen Working Days</span>
                </h2>
                {isUpdatingDays && (
                  <span className="text-[11px] text-sky-400 flex items-center space-x-1">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Saving...</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Toggle days the central production kitchen operates. Days marked off are skipped when calculating order cutoffs.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DAYS_OF_WEEK.map((day) => {
                  const dayEntry = workingDays.find((d) => d.dayOfWeek === day);
                  const isWorking = dayEntry ? dayEntry.isWorking : true;

                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={isUpdatingDays}
                      onClick={() => handleToggleWorkingDay(day)}
                      className={`p-3 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center transition ${
                        isWorking
                          ? 'bg-emerald-950/40 border-emerald-700/80 text-emerald-300 hover:bg-emerald-900/50'
                          : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-400'
                      }`}
                    >
                      <span className="uppercase text-[11px] tracking-wide">{day.slice(0, 3)}</span>
                      <div className="mt-1 flex items-center space-x-1 text-[10px]">
                        {isWorking ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span>Working</span>
                          </>
                        ) : (
                          <span>Off</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Cutoff Engine Preview */}
            {cutoffPreview && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Live Engine Cutoff Preview
                </h3>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sample Delivery Date:</span>
                    <span className="font-semibold text-white">
                      {new Date(cutoffPreview.deliveryDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Calculated Cutoff:</span>
                    <span className="font-semibold text-emerald-400">
                      {new Date(cutoffPreview.cutoffDateTime).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Active Timezone:</span>
                    <span className="text-slate-300">{cutoffPreview.timezone}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Kitchen Holidays */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 h-fit">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200 flex items-center space-x-2 mb-4">
              <Calendar className="h-4 w-4 text-purple-400" />
              <span>Kitchen Holidays</span>
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Scheduled kitchen holidays are treated as non-working days for order cutoff computations.
            </p>

            {/* Add Holiday Form */}
            <form onSubmit={handleAddHoliday} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6">
              <input
                type="text"
                required
                placeholder="Holiday Name"
                value={newHolidayName}
                onChange={(e) => setNewHolidayName(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <input
                type="date"
                required
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <button
                type="submit"
                className="py-2 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center justify-center space-x-1 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Holiday</span>
              </button>
            </form>

            {/* Holidays List */}
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {holidays.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-6">No kitchen holidays scheduled.</div>
              ) : (
                holidays.map((h) => (
                  <div
                    key={h.id}
                    className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-white">{h.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {new Date(h.date).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteHoliday(h.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 transition"
                      title="Delete holiday"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
