'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { api } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import {
  ChefHat,
  Clock,
  Play,
  CheckCircle,
  AlertCircle,
  Calendar,
  Filter,
  RefreshCw,
  FastForward,
} from 'lucide-react';

export default function KitchenBoardPage() {
  const { user } = useAuth();
  const [boardData, setBoardData] = useState<any>(null);
  const [stations, setStations] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchBoard = async (date?: string, station?: string) => {
    setIsLoading(true);
    setMessage(null);
    try {
      const [res, stationsRes] = await Promise.all([
        api.getKitchenBoard(date, station),
        api.getKitchenStations().catch(() => []),
      ]);
      setBoardData(res);
      setStations(stationsRes);
      if (!selectedDate && res.date) {
        setSelectedDate(res.date);
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to load kitchen board', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBoard();
  }, []);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value;
    setSelectedDate(d);
    fetchBoard(d, selectedStation);
  };

  const handleStationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const st = e.target.value;
    setSelectedStation(st);
    fetchBoard(selectedDate, st);
  };

  const handleStartUnit = async (unitId: string) => {
    setActionLoading(unitId);
    try {
      await api.startKitchenUnit(unitId);
      setMessage({ text: 'Unit marked IN_PROGRESS', type: 'success' });
      await fetchBoard(selectedDate, selectedStation);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to start unit', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteUnit = async (unitId: string) => {
    setActionLoading(unitId);
    try {
      await api.completeKitchenUnit(unitId);
      setMessage({ text: 'Unit marked DONE', type: 'success' });
      await fetchBoard(selectedDate, selectedStation);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to complete unit', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleForceComplete = async (orderId: string) => {
    if (!confirm(`Force-complete entire order ${orderId}? All units will be marked DONE.`)) return;
    setActionLoading(orderId);
    try {
      await api.forceCompleteOrder(orderId);
      setMessage({ text: `Order ${orderId} force-completed successfully`, type: 'success' });
      await fetchBoard(selectedDate, selectedStation);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to force complete order', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Title Bar & Filters */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-800 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
              <ChefHat className="h-6 w-6 text-amber-400" />
              <span>Kitchen Production Board</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Active prep units for confirmed orders. Units route to kitchen stations and display real-time timing status.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Station Filter */}
            <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
              <Filter className="h-4 w-4 text-amber-400" />
              <select
                value={selectedStation}
                onChange={handleStationChange}
                className="bg-transparent text-white focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-white">All Stations</option>
                {stations.map((st) => (
                  <option key={st.id} value={st.id} className="bg-slate-900 text-white">
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Filter */}
            <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
              <Calendar className="h-4 w-4 text-emerald-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                className="bg-transparent text-white focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={() => fetchBoard(selectedDate, selectedStation)}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition"
              title="Refresh board"
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

        {/* Board Workload Summary */}
        {boardData && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Prep Units</span>
              <div className="text-xl font-bold text-white mt-0.5">{boardData.units?.length || 0}</div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Not Started</span>
              <div className="text-xl font-bold text-slate-300 mt-0.5">
                {boardData.units?.filter((u: any) => u.status === 'NOT_STARTED').length || 0}
              </div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">In Progress</span>
              <div className="text-xl font-bold text-amber-400 mt-0.5">
                {boardData.units?.filter((u: any) => u.status === 'IN_PROGRESS').length || 0}
              </div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Completed Units</span>
              <div className="text-xl font-bold text-emerald-400 mt-0.5">
                {boardData.units?.filter((u: any) => u.status === 'DONE').length || 0}
              </div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">At Risk (&le;15m)</span>
              <div className="text-xl font-bold text-amber-400 mt-0.5">
                {boardData.units?.filter((u: any) => u.timingStatus === 'AT_RISK').length || 0}
              </div>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Late Work</span>
              <div className="text-xl font-bold text-rose-400 mt-0.5">
                {boardData.units?.filter((u: any) => u.timingStatus === 'LATE').length || 0}
              </div>
            </div>
          </div>
        )}

        {/* Units Grid */}
        <div className="mt-8">
          {isLoading && !boardData ? (
            <div className="py-24 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
            </div>
          ) : boardData && boardData.units?.length === 0 ? (
            <div className="text-center py-20 bg-slate-900/40 rounded-2xl border border-slate-800">
              <ChefHat className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <div className="text-sm font-semibold text-slate-300">No Confirmed Workload</div>
              <p className="text-xs text-slate-500 mt-1">
                No confirmed orders require cooking for {selectedDate || 'the selected date'}.
              </p>
            </div>
          ) : boardData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {boardData.units.map((unit: any) => {
                const isDone = unit.status === 'DONE';
                const isInProgress = unit.status === 'IN_PROGRESS';
                const isLate = unit.timingStatus === 'LATE';
                const isAtRisk = unit.timingStatus === 'AT_RISK';

                return (
                  <div
                    key={unit.id}
                    className={`bg-slate-900/80 border rounded-2xl p-5 flex flex-col justify-between transition-all ${
                      isDone
                        ? 'border-slate-800/60 opacity-60'
                        : isLate
                        ? 'border-rose-600/80 shadow-lg shadow-rose-950/20'
                        : isAtRisk
                        ? 'border-amber-500/80 shadow-lg shadow-amber-950/20'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Top Header */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-[11px] font-semibold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                          {unit.stationName || 'Unassigned Station'}
                        </span>
                        <div className="flex items-center space-x-1.5">
                          {/* Timing Badge */}
                          {unit.timingStatus && (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                isLate
                                  ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                  : isAtRisk
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {unit.timingStatus}
                            </span>
                          )}

                          {/* Status Badge */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isDone
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : isInProgress
                                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {unit.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      {/* Dish & Quantity */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-base font-bold text-white tracking-tight">
                            {unit.quantity}× {unit.dishName}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            SKU: {unit.dishSku} • {unit.temperature}
                          </div>
                        </div>
                      </div>

                      {/* Options / Customizations */}
                      {unit.options && unit.options.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1">
                          {unit.options.map((opt: any, idx: number) => (
                            <div key={idx} className="text-xs text-slate-300 flex items-center justify-between">
                              <span className="text-slate-400">{opt.groupName}:</span>
                              <span className="font-medium text-emerald-400">{opt.optionName}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Order & Timing Details */}
                      <div className="mt-4 pt-3 border-t border-slate-800/60 text-xs text-slate-400 space-y-1">
                        <div className="flex justify-between">
                          <span>Order ID:</span>
                          <span className="font-mono text-slate-300">{unit.orderId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Delivery Time:</span>
                          <span className="text-slate-200 font-semibold">{unit.deliveryTimeFormatted}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Planned Ready:</span>
                          <span className="text-slate-300">{unit.plannedKitchenReadyFormatted}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      {!isDone ? (
                        <>
                          {unit.status === 'NOT_STARTED' && (
                            <button
                              onClick={() => handleStartUnit(unit.id)}
                              disabled={actionLoading === unit.id}
                              className="flex-1 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-xs flex items-center justify-center space-x-1 transition disabled:opacity-50"
                            >
                              <Play className="h-3.5 w-3.5" />
                              <span>Start Unit</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleCompleteUnit(unit.id)}
                            disabled={actionLoading === unit.id}
                            className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center space-x-1 transition disabled:opacity-50"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span>Mark Done</span>
                          </button>
                        </>
                      ) : (
                        <div className="w-full text-center py-1 text-xs text-emerald-400 font-medium flex items-center justify-center space-x-1">
                          <CheckCircle className="h-4 w-4" />
                          <span>Prepared & Ready</span>
                        </div>
                      )}

                      {/* Admin Force Complete */}
                      {user?.roleName === 'ADMIN' && !isDone && (
                        <button
                          onClick={() => handleForceComplete(unit.orderId)}
                          disabled={actionLoading === unit.orderId}
                          title="Admin: Force-complete entire order"
                          className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-purple-900/60 text-purple-300 border border-purple-800/60 transition"
                        >
                          <FastForward className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
