/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, 
  LayoutDashboard, 
  BarChart3, 
  Settings, 
  Plus, 
  TrendingUp, 
  Activity, 
  Users, 
  Timer, 
  Info, 
  Play, 
  X,
  ChevronRight,
  Monitor,
  Gamepad2,
  Clock,
  Download,
  Lock,
  Unlock,
  Save,
  Printer,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Station, SessionLog, RevenueData } from './types';
import {
  fetchStations,
  fetchPricing,
  fetchSettings,
  fetchLogs,
  fetchDailyReport,
  startSession,
  endSession,
  terminateSession,
  collectSession,
  savePricing,
  saveSettings,
  verifyAdminPin,
  PlatformRates,
} from './api';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to convert HH:MM:SS to seconds
function timeToSeconds(timeStr?: string): number {
  if (!timeStr) return 0;
  const [h, m, s] = timeStr.split(':').map(Number);
  return (h * 3600) + (m * 60) + s;
}

// Helper to convert seconds to HH:MM:SS
function secondsToTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
}

// Session storage key for persisting the admin JWT across page reloads
const ADMIN_TOKEN_KEY = 'nextgen_admin_token';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'settings'>('dashboard');
  const [stations, setStations] = useState<Station[]>([]);
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PS5' | 'PS4'>('ALL');
  const [setupStation, setSetupStation] = useState<Station | null>(null);
  const [terminateStation, setTerminateStation] = useState<Station | null>(null);
  const [confirmSessionData, setConfirmSessionData] = useState<{ stationId: string, players: number, startTime: string, endTime: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showPinModal, setShowPinModal] = useState(false);
  const [autoEndSessions, setAutoEndSessions] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [revenueHistory, setRevenueHistory] = useState<RevenueData[]>([]);

  // Admin & Pricing State
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(
    () => sessionStorage.getItem(ADMIN_TOKEN_KEY)
  );
  const [ps5Rates, setPs5Rates] = useState<PlatformRates | null>(null);
  const [ps4Rates, setPs4Rates] = useState<PlatformRates | null>(null);
  const [minDurationPrice, setMinDurationPrice] = useState(30);

  // Restore admin session from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (stored) {
      setAdminToken(stored);
      setIsAdmin(true);
    }
  }, []);

  // Initial data load on mount
  useEffect(() => {
    let cancelled = false;
    const today = new Date().toISOString().split('T')[0];

    async function loadInitialData() {
      try {
        const [stationsData, pricingData, settingsData, reportData] = await Promise.all([
          fetchStations(),
          fetchPricing(),
          fetchSettings(),
          fetchDailyReport(today),
        ]);
        if (cancelled) return;
        setStations(stationsData);
        setPs5Rates(pricingData.ps5Rates);
        setPs4Rates(pricingData.ps4Rates);
        setMinDurationPrice(pricingData.minDurationPrice);
        setAutoEndSessions(settingsData.auto_end_sessions);
        setRevenueHistory(reportData.hourlyBreakdown);
      } catch (err) {
        console.error('Failed to load initial data:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadInitialData();
    return () => { cancelled = true; };
  }, []);

  // Reload logs whenever the selected date changes
  useEffect(() => {
    let cancelled = false;
    fetchLogs(selectedDate)
      .then((data) => { if (!cancelled) setLogs(data); })
      .catch((err) => console.error('Failed to load logs:', err));
    return () => { cancelled = true; };
  }, [selectedDate]);

  // Reload revenue chart whenever the selected date changes
  useEffect(() => {
    let cancelled = false;
    fetchDailyReport(selectedDate)
      .then((data) => { if (!cancelled) setRevenueHistory(data.hourlyBreakdown); })
      .catch((err) => console.error('Failed to load daily report:', err));
    return () => { cancelled = true; };
  }, [selectedDate]);

  // Persist/clear adminToken in sessionStorage whenever it changes
  useEffect(() => {
    if (adminToken) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
    } else {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  }, [adminToken]);

  const handleSaveRates = async () => {
    if (!adminToken || !ps5Rates || !ps4Rates) return;
    try {
      await savePricing(adminToken, ps5Rates, ps4Rates, minDurationPrice);
      // Refresh stations so the UI picks up rate changes immediately
      const updated = await fetchStations();
      setStations(updated);
      alert('Pricing configuration saved successfully!');
    } catch (err) {
      console.error('Failed to save pricing:', err);
      alert('Failed to save pricing. Please try again.');
    }
  };

  // Track which station IDs are currently in-flight for auto-end to prevent duplicate API calls
  const autoEndingRef = useRef<Set<string>>(new Set());

  // Timer Effect — ticks every second, calls the server when a session hits zero
  useEffect(() => {
    const interval = setInterval(() => {
      setStations(prevStations => {
        const toAutoEnd: Station[] = [];

        const next = prevStations.map(station => {
          if (station.status !== 'busy' || station.remainingSeconds === undefined) {
            return station;
          }

          const nextSeconds = station.remainingSeconds - 1;

          if (nextSeconds <= 0 && autoEndSessions) {
            // Guard: only fire the API call once per station expiry
            if (!autoEndingRef.current.has(station.id)) {
              autoEndingRef.current.add(station.id);
              toAutoEnd.push(station);
            }

            // Optimistic update: move to completed so UI responds immediately
            return {
              ...station,
              remainingSeconds: 0,
              remainingTime: '00:00:00',
              status: 'completed' as const,
            };
          }

          // Countdown — allow negative drift when autoEnd is off
          return {
            ...station,
            remainingSeconds: nextSeconds,
            remainingTime: nextSeconds < 0
              ? `-${secondsToTime(Math.abs(nextSeconds))}`
              : secondsToTime(nextSeconds),
          };
        });

        // Fire API calls outside the render cycle
        if (toAutoEnd.length > 0) {
          for (const station of toAutoEnd) {
            endSession(station.id)
              .then((result) => {
                // Patch the station with server-authoritative revenue and duration
                setStations(prev => prev.map(s => {
                  if (s.id !== station.id) return s;
                  return {
                    ...s,
                    status: 'completed' as const,
                    pendingRevenue: result.pendingRevenue,
                    actualSecondsPlayed: result.actualSecondsPlayed,
                    remainingSeconds: 0,
                    remainingTime: '00:00:00',
                  };
                }));
                // Full refresh to stay in sync with any server-side state
                fetchStations()
                  .then(setStations)
                  .catch(err => console.error('Failed to refresh stations after auto-end:', err));
              })
              .catch(err => {
                console.error(`Auto-end failed for ${station.id}:`, err);
                // Remove the guard so the timer can retry on the next tick
                autoEndingRef.current.delete(station.id);
              });
          }
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoEndSessions]);

  const handleCollectMoney = async (station: Station) => {
    if (station.status !== 'completed') return;

    try {
      const result = await collectSession(station.id);

      // Build a log entry from the server response and prepend it to today's view
      const newLog: SessionLog = {
        id: result.sessionId,
        machineId: result.machineId,
        type: result.type,
        status: 'completed',
        players: result.players,
        duration: result.duration,
        revenue: result.revenue,
        date: result.date,
      };
      setLogs(prev => [newLog, ...prev]);

      // Refresh stations so the collected station shows as available
      const updated = await fetchStations();
      setStations(updated);

      // Clear the auto-end guard for this station so it can be reused
      autoEndingRef.current.delete(station.id);
    } catch (err) {
      console.error('Failed to collect money:', err);
      alert('Failed to collect payment. Please try again.');
    }
  };

  const handlePrintReceipt = (station: Station | SessionLog) => {
    const isLog = 'machineId' in station;
    const id = isLog ? (station as SessionLog).machineId : (station as Station).id;
    const user = isLog ? 'Customer' : (station as Station).user || 'Customer';
    const revenue = isLog ? (station as SessionLog).revenue : (station as Station).pendingRevenue || 0;
    const duration = isLog ? (station as SessionLog).duration : (() => {
      const s = station as Station;
      const durationSeconds = s.actualSecondsPlayed || 0;
      const hours = Math.floor(durationSeconds / 3600);
      const mins = Math.floor((durationSeconds % 3600) / 60);
      return `${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
    })();
    const date = isLog ? (station as SessionLog).date : new Date().toLocaleDateString();
    const type = isLog ? (station as SessionLog).type : (station as Station).type;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt - ${id}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=JetBrains+Mono&display=swap');
            body { 
              font-family: 'Inter', sans-serif; 
              padding: 40px; 
              color: #000;
              max-width: 300px;
              margin: 0 auto;
            }
            .header { text-align: center; border-bottom: 2px dashed #ccc; padding-bottom: 20px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 2px; }
            .header p { margin: 5px 0 0; font-size: 12px; color: #666; }
            .details { font-family: 'JetBrains Mono', monospace; font-size: 14px; line-height: 1.6; }
            .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .total { border-top: 2px solid #000; margin-top: 20px; padding-top: 10px; font-weight: bold; font-size: 18px; }
            .footer { text-align: center; margin-top: 40px; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 20px; }
            @media print {
              body { padding: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Nextgen Gaming</h1>
            <p>Premium Gaming Experience</p>
            <p>${date}</p>
          </div>
          <div class="details">
            <div class="row"><span>Station:</span> <span>${id}</span></div>
            <div class="row"><span>Platform:</span> <span>${type}</span></div>
            <div class="row"><span>Customer:</span> <span>${user}</span></div>
            <div class="row"><span>Duration:</span> <span>${duration}</span></div>
            <div class="total row"><span>TOTAL:</span> <span>LKR ${revenue.toLocaleString()}</span></div>
          </div>
          <div class="footer">
            <p>Thank you for playing!</p>
            <p>Visit us again soon.</p>
          </div>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleTerminateSession = async (stationId: string, reason: string) => {
    try {
      await terminateSession(stationId, reason);
      // Refresh both stations and logs so the terminated session appears correctly
      const [updatedStations, updatedLogs] = await Promise.all([
        fetchStations(),
        fetchLogs(selectedDate),
      ]);
      setStations(updatedStations);
      setLogs(updatedLogs);
      // Clear any auto-end guard for this station
      autoEndingRef.current.delete(stationId);
    } catch (err) {
      console.error('Failed to terminate session:', err);
      alert('Failed to terminate session. Please try again.');
    }
    setTerminateStation(null);
  };

  const handleClearLogs = () => {
    // Removed as per user request
  };

  const handleExportCSV = () => {
    const dailyLogs = logs.filter(l => l.date === selectedDate);
    if (dailyLogs.length === 0) {
      return;
    }

    const headers = ['Machine ID', 'Type', 'Status', 'Players', 'Duration', 'Revenue (LKR)', 'Date'];
    const csvContent = [
      headers.join(','),
      ...dailyLogs.map(log => [
        `"${log.machineId}"`,
        `"${log.type}"`,
        `"${log.status}"`,
        log.players,
        `"${log.duration}"`,
        log.revenue,
        `"${log.date}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `gaming-cafe-logs-${selectedDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredStations = stations.filter(s => filter === 'ALL' || s.type === filter);

  // Dashboard Calculations
  const activeMachines = stations.filter(s => s.status === 'busy' || s.status === 'completed').length;
  const totalStations = stations.length;
  
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  const earningsToday = logs
    .filter(log => log.date === today)
    .reduce((sum, log) => sum + log.revenue, 0);
    
  const earningsYesterday = logs
    .filter(log => log.date === yesterday)
    .reduce((sum, log) => sum + log.revenue, 0);
    
  const earningsChange = earningsYesterday === 0 
    ? 100 
    : ((earningsToday - earningsYesterday) / earningsYesterday) * 100;

  return (
    <div className="min-h-screen bg-background text-on-surface font-body overflow-x-hidden">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-white/5 h-16 px-6 flex items-center justify-between shadow-[0_0_12px_rgba(105,218,255,0.1)]">
        <div className="flex items-center gap-3">
          <Terminal className="w-6 h-6 text-primary" />
          <span className="text-xl font-black text-primary tracking-tighter font-headline uppercase">Nextgen Gaming</span>
        </div>
        
        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-8">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                "font-headline tracking-wider uppercase text-sm font-bold transition-colors px-3 py-1 rounded",
                activeTab === 'dashboard' ? "text-primary bg-primary/10" : "text-on-surface hover:bg-white/5"
              )}
            >
              DASHBOARD
            </button>
            <button 
              onClick={() => setActiveTab('reports')}
              className={cn(
                "font-headline tracking-wider uppercase text-sm font-bold transition-colors px-3 py-1 rounded",
                activeTab === 'reports' ? "text-primary bg-primary/10" : "text-on-surface hover:bg-white/5"
              )}
            >
              REPORTS
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={cn(
                "font-headline tracking-wider uppercase text-sm font-bold transition-colors px-3 py-1 rounded",
                activeTab === 'settings' ? "text-primary bg-primary/10" : "text-on-surface hover:bg-white/5"
              )}
            >
              SETTINGS
            </button>
          </nav>
          
          <div className="w-10 h-10 rounded-full border-2 border-primary/30 p-0.5 overflow-hidden cursor-pointer active:scale-95 transition-transform">
            <img 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuASPqnDtr6xQHfLt3er5e3Z6bD8wI-P0nEdydrE4JjquLA_ErJxxRsk2C5dkfG2T5E3rB9JCrC5ExKDEstLaOHWwrqxkrykniT2iBUu3kW_M3vJrpaZAJsf20oqpYcHO2tQg4L2QyVx0ZCQO0pwNx1I8F8T-bu17KWtgla5G7Id0oKoa6v80vSlUCL5EISToPDjGr5jpZ65xWCWqGRwmy7CnnfYS2Yd8r0tsLWuknB2HSVCrZILZUhUtuhdqRuZGB3WY2tfPeXygmc" 
              alt="Profile" 
              className="w-full h-full object-cover rounded-full"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-32 px-4 md:px-8 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {isLoading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center h-64"
            >
              <div className="flex flex-col items-center gap-4 text-on-surface-variant">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="font-headline text-xs tracking-widest uppercase">Loading station data...</span>
              </div>
            </motion.div>
          )}
          {!isLoading && activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {/* Summary Section */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-surface-container-low rounded-xl p-6 flex flex-col justify-between relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Activity className="w-32 h-32" />
                  </div>
                  <div>
                    <h2 className="font-headline text-xs text-on-surface-variant tracking-[0.1em] mb-1 uppercase">NETWORK STATUS</h2>
                    <p className="font-headline text-4xl font-bold text-primary tracking-tighter uppercase">Operational</p>
                  </div>
                  <div className="mt-8 flex gap-8">
                    <div>
                      <p className="font-headline text-[10px] text-on-surface-variant uppercase tracking-widest">Active Machines</p>
                      <p className="font-headline text-2xl font-bold text-on-surface">{activeMachines} <span className="text-on-surface-variant text-lg font-light">/ {totalStations}</span></p>
                    </div>
                    <div>
                      <p className="font-headline text-[10px] text-on-surface-variant uppercase tracking-widest">Latency</p>
                      <p className="font-headline text-2xl font-bold text-primary">12ms</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-surface-container-highest rounded-xl p-6 border-l-4 border-secondary shadow-lg">
                  <h2 className="font-headline text-xs text-on-surface-variant tracking-[0.1em] mb-4 uppercase">Earnings Today</h2>
                  <div className="flex flex-col gap-1">
                    <span className="font-headline text-5xl font-black text-on-surface">Rs. {earningsToday.toLocaleString()}</span>
                    <span className={cn(
                      "font-headline text-sm font-bold tracking-widest",
                      earningsChange >= 0 ? "text-secondary" : "text-error"
                    )}>
                      {earningsChange >= 0 ? '+' : ''}{earningsChange.toFixed(1)}% VS YESTERDAY
                    </span>
                  </div>
                  <div className="mt-6 h-2 w-full bg-surface-container rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (earningsToday / 5000) * 100)}%` }}
                      className="h-full bg-secondary rounded-full shadow-[0_0_8px_rgba(129,151,255,0.5)]"
                    />
                  </div>
                </div>
              </section>

              {/* Station Grid */}
              <section>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                  <h3 className="font-headline text-2xl font-bold tracking-tight flex items-center gap-3 uppercase">
                    <span className="w-2 h-8 bg-primary rounded-full"></span>
                    STATION OVERVIEW
                  </h3>
                  <div className="flex gap-2 bg-surface-container-high p-1 rounded-full">
                    {(['ALL', 'PS5', 'PS4'] as const).map((f) => (
                      <button 
                        key={f}
                        onClick={() => setFilter(f)}
                        className={cn(
                          "px-4 py-2 rounded-full font-headline text-xs font-bold transition-all",
                          filter === f ? "bg-primary text-on-primary shadow-[0_0_12px_rgba(105,218,255,0.3)]" : "text-on-surface-variant hover:text-on-surface"
                        )}
                      >
                        {f === 'ALL' ? 'ALL STATIONS' : `${f} ONLY`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {filteredStations.map((station) => (
                    <StationCard 
                      key={station.id} 
                      station={station} 
                      onStart={() => setSetupStation(station)}
                      onTerminate={() => setTerminateStation(station)}
                      onEnd={async () => {
                        try {
                          const result = await endSession(station.id);
                          // Optimistic update with server-authoritative values
                          setStations(prev => prev.map(s => {
                            if (s.id !== station.id) return s;
                            return {
                              ...s,
                              status: 'completed' as const,
                              pendingRevenue: result.pendingRevenue,
                              actualSecondsPlayed: result.actualSecondsPlayed,
                              remainingSeconds: 0,
                              remainingTime: '00:00:00',
                            };
                          }));
                          // Full refresh to pick up any server-side state
                          const updated = await fetchStations();
                          setStations(updated);
                        } catch (err) {
                          console.error('Failed to end session:', err);
                          alert('Failed to end session. Please try again.');
                        }
                      }}
                      onCollect={() => handleCollectMoney(station)}
                      onPrint={() => handlePrintReceipt(station)}
                    />
                  ))}
                </div>
              </section>
            </motion.div>
          )}

          {!isLoading && activeTab === 'reports' && (
            <motion.div
              key="reports"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h1 className="font-headline text-4xl font-bold tracking-tight text-on-surface uppercase">Sector Earnings</h1>
                  <p className="text-on-surface-variant font-label text-sm tracking-widest mt-1 uppercase">REAL-TIME FINANCIAL TELEMETRY</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="glass-card px-4 py-2 rounded-xl border border-white/5 flex flex-col items-end">
                    <span className="text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-1">Select Date</span>
                    <input 
                      type="date" 
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-transparent text-sm font-headline font-bold text-primary focus:outline-none cursor-pointer"
                    />
                  </div>
                  <div className="glass-card px-6 py-3 rounded-xl border border-white/5 flex flex-col items-end">
                    <span className="text-[10px] font-headline font-bold text-primary tracking-[0.2em] uppercase">Daily Revenue</span>
                    <span className="text-2xl font-headline font-bold">LKR {logs.filter(l => l.date === selectedDate).reduce((acc, curr) => acc + curr.revenue, 0).toLocaleString()}</span>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Revenue Chart */}
                <section className="lg:col-span-8 glass-card rounded-xl p-6 border border-white/5 relative overflow-hidden">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h2 className="font-headline font-bold text-lg tracking-wider text-on-surface uppercase">REVENUE TRAJECTORY</h2>
                      <p className="text-xs text-on-surface-variant font-label uppercase">PERFORMANCE FOR {selectedDate}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold font-headline border border-primary/20">DAILY REPORT</span>
                  </div>
                  
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#464752" vertical={false} opacity={0.2} />
                        <XAxis 
                          dataKey="time" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#aaaab7', fontSize: 10, fontFamily: 'Space Grotesk' }}
                        />
                        <Tooltip 
                          cursor={{ fill: 'rgba(105, 218, 255, 0.1)' }}
                          contentStyle={{ backgroundColor: '#1c1f2b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {revenueHistory.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.value > 3000 ? '#69daff' : '#222532'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  
                  <div className="mt-4 flex justify-between text-[10px] font-headline font-bold text-on-surface-variant tracking-widest uppercase">
                    <span>Morning Shift</span>
                    <span>Peak Hours</span>
                    <span>Late Night</span>
                  </div>
                </section>

                {/* Platform Mix */}
                <section className="lg:col-span-4 space-y-6">
                  <div className="glass-card rounded-xl p-6 border border-white/5 h-full flex flex-col">
                    <h2 className="font-headline font-bold text-lg tracking-wider text-on-surface mb-6 uppercase">Platform Mix</h2>
                    <div className="space-y-8 flex-grow">
                      {['PS5', 'PS4'].map(type => {
                        const dailyLogs = logs.filter(l => l.date === selectedDate);
                        const totalRevenue = dailyLogs.reduce((acc, curr) => acc + curr.revenue, 0);
                        const typeRevenue = dailyLogs.filter(l => l.type === type).reduce((acc, curr) => acc + curr.revenue, 0);
                        const percentage = totalRevenue > 0 ? Math.round((typeRevenue / totalRevenue) * 100) : 0;
                        
                        return (
                          <div key={type} className="relative">
                            <div className="flex justify-between items-end mb-2">
                              <div className="flex items-center gap-2">
                                <div className={cn("w-1.5 h-6 rounded-full", type === 'PS5' ? "bg-primary shadow-[0_0_10px_rgba(105,218,255,0.5)]" : "bg-secondary")}></div>
                                <span className="font-headline font-bold text-sm tracking-wide uppercase">PLAYSTATION {type === 'PS5' ? '5' : '4'}</span>
                              </div>
                              <span className={cn("text-xl font-headline font-bold", type === 'PS5' ? "text-primary" : "text-secondary")}>LKR {typeRevenue.toLocaleString()}</span>
                            </div>
                            <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
                              <div className={cn("h-full transition-all duration-1000", type === 'PS5' ? "bg-primary shadow-[0_0_10px_rgba(105,218,255,0.3)]" : "bg-secondary")} style={{ width: `${percentage}%` }}></div>
                            </div>
                            <span className="absolute -bottom-5 right-0 text-[10px] font-label text-on-surface-variant uppercase">{percentage}% OF TOTAL</span>
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="mt-12 p-4 bg-primary/5 rounded-lg border border-primary/10">
                      <div className="flex items-center gap-3 text-primary">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-[10px] font-headline font-black tracking-widest uppercase">
                          {logs.filter(l => l.date === selectedDate).length} MISSIONS COMPLETED TODAY
                        </span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Live Log */}
                <section className="lg:col-span-12 glass-card rounded-xl border border-white/5 overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-surface-container-low/50">
                    <h2 className="font-headline font-bold text-sm tracking-[0.2em] text-on-surface uppercase">Daily Log: {selectedDate}</h2>
                    <button 
                      onClick={handleExportCSV}
                      className="text-[10px] font-headline font-bold text-primary hover:underline transition-all flex items-center gap-1 uppercase"
                    >
                      <Download className="w-3 h-3" />
                      EXPORT CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-surface-container-low">
                        <tr className="text-[10px] font-headline font-black text-on-surface-variant uppercase tracking-widest">
                          <th className="px-6 py-4">Machine ID</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4 text-center">Players</th>
                          <th className="px-6 py-4 text-center">Actual Play Time</th>
                          <th className="px-6 py-4 text-right">Revenue (LKR)</th>
                          <th className="px-6 py-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {logs.filter(l => l.date === selectedDate).map((log) => (
                          <tr key={log.id} className="hover:bg-primary/5 transition-colors group">
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <div className={cn("w-2 h-2 rounded-full", log.type === 'PS5' ? "bg-primary shadow-[0_0_8px_rgba(105,218,255,0.5)]" : "bg-secondary")} />
                                <span className="font-headline font-bold text-sm uppercase">{log.machineId}</span>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex flex-col gap-1">
                                <span className={cn(
                                  "text-[10px] font-headline px-2 py-0.5 rounded border uppercase font-bold w-fit",
                                  log.status === 'completed' ? "border-primary/30 text-primary" : 
                                  log.status === 'terminated' ? "border-error/30 text-error" :
                                  "border-white/10 text-on-surface-variant"
                                )}>
                                  {log.status}
                                </span>
                                {log.terminationReason && (
                                  <span className="text-[10px] text-on-surface-variant italic">
                                    Reason: {log.terminationReason}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-5 text-center font-label text-sm">{log.players}</td>
                            <td className="px-6 py-5 text-center font-label text-sm text-on-surface-variant">{log.duration}</td>
                            <td className="px-6 py-5 text-right font-headline font-bold text-primary">LKR {log.revenue.toLocaleString()}</td>
                            <td className="px-6 py-5 text-right">
                              <button 
                                onClick={() => handlePrintReceipt(log)}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-on-surface-variant hover:text-primary"
                                title="Reprint Receipt"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {logs.filter(l => l.date === selectedDate).length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-on-surface-variant font-headline text-sm uppercase tracking-widest">
                              No data available for this date
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            </motion.div>
          )}

          {!isLoading && activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="flex justify-between items-center">
                <h1 className="font-headline text-4xl font-bold tracking-tight text-on-surface uppercase">Settings</h1>
                <button 
                  onClick={() => {
                    if (isAdmin) {
                      setIsAdmin(false);
                      setAdminToken(null);
                    } else {
                      setShowPinModal(true);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl font-headline font-bold text-xs transition-all",
                    isAdmin 
                      ? "bg-primary text-on-primary shadow-[0_0_15px_rgba(105,218,255,0.4)]" 
                      : "bg-surface-container-highest text-on-surface-variant"
                  )}
                >
                  {isAdmin ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  {isAdmin ? "ADMIN MODE ACTIVE" : "LOGIN AS ADMIN"}
                </button>
              </div>

              <div className="glass-card rounded-xl p-8 space-y-10">
                {/* General Config */}
                <div className="space-y-4">
                  <h3 className="font-headline text-lg font-bold text-primary uppercase flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    General Configuration
                  </h3>
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between p-4 bg-surface-container rounded-lg">
                      <div>
                        <p className="font-bold">Auto-End Sessions</p>
                        <p className="text-xs text-on-surface-variant">Automatically close sessions when timer hits zero</p>
                      </div>
                      <div 
                        onClick={() => {
                          const newValue = !autoEndSessions;
                          setAutoEndSessions(newValue);
                          if (isAdmin && adminToken) {
                            saveSettings(adminToken, { auto_end_sessions: newValue })
                              .catch(err => console.error('Failed to persist auto-end setting:', err));
                          }
                        }}
                        className={cn(
                          "w-12 h-6 rounded-full relative cursor-pointer transition-colors",
                          autoEndSessions ? "bg-primary" : "bg-surface-container-highest"
                        )}
                      >
                        <motion.div 
                          animate={{ x: autoEndSessions ? 24 : 4 }}
                          className="absolute top-1 w-4 h-4 bg-on-primary rounded-full shadow-md" 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pricing Config */}
                <div className="space-y-6 relative">
                  {!isAdmin && (
                    <div className="absolute inset-0 z-10 bg-background/40 backdrop-blur-[2px] rounded-xl flex items-center justify-center">
                      <div className="bg-surface-container-high p-4 rounded-xl border border-white/5 shadow-xl flex flex-col items-center gap-2">
                        <Lock className="w-8 h-8 text-primary" />
                        <p className="font-headline font-bold text-sm text-on-surface uppercase">Admin Access Required</p>
                        <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">Login to modify pricing</p>
                      </div>
                    </div>
                  )}

                  <h3 className="font-headline text-lg font-bold text-secondary uppercase flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Pricing Tiers (LKR/Hour)
                  </h3>

                  {(!ps5Rates || !ps4Rates) && (
                    <p className="text-on-surface-variant text-sm font-headline uppercase tracking-widest text-center py-8">Loading pricing...</p>
                  )}

                  {ps5Rates && ps4Rates && <div className="grid grid-cols-1 gap-12">
                    {/* PS5 Pricing */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 text-primary">
                        <Monitor className="w-6 h-6" />
                        <h4 className="font-headline font-bold text-lg uppercase tracking-wider">PlayStation 5 Pricing Matrix</h4>
                      </div>
                      <div className="bg-surface-container rounded-2xl overflow-hidden border border-white/10 shadow-xl">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-surface-container-high">
                              <th className="p-5 text-xs font-bold text-on-surface-variant uppercase border-b border-white/10 w-24">Tier</th>
                              <th className="p-5 text-xs font-bold text-on-surface-variant uppercase border-b border-white/10 min-w-[100px]">30-Min Rate</th>
                              <th className="p-5 text-xs font-bold text-on-surface-variant uppercase border-b border-white/10 min-w-[100px]">Hourly Rate</th>
                              <th className="p-5 text-xs font-bold text-on-surface-variant uppercase border-b border-white/10 min-w-[100px]">3-Hour Pkg</th>
                              <th className="p-5 text-xs font-bold text-on-surface-variant uppercase border-b border-white/10 min-w-[100px]">5-Hour Pkg</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(['single', 'duo', 'trio', 'squad'] as const).map((tier) => (
                              <tr key={tier} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                                <td className="p-5 text-xs font-black text-primary uppercase tracking-widest">{tier}</td>
                                <td className="p-4">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-primary/40">LKR</span>
                                    <input 
                                      type="number" 
                                      value={ps5Rates[tier].thirtyMin || ''}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                                        setPs5Rates(prev => ({ ...prev, [tier]: { ...prev[tier], thirtyMin: val } }));
                                      }}
                                      disabled={!isAdmin}
                                      className="bg-surface-container-low border border-primary/20 rounded-lg pl-7 pr-1 py-3 w-full text-base font-black text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all disabled:opacity-50"
                                    />
                                  </div>
                                </td>
                                <td className="p-4">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-primary/40">LKR</span>
                                    <input 
                                      type="number" 
                                      value={ps5Rates[tier].hourly || ''}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                                        setPs5Rates(prev => ({ ...prev, [tier]: { ...prev[tier], hourly: val } }));
                                      }}
                                      disabled={!isAdmin}
                                      className="bg-surface-container-low border border-primary/20 rounded-lg pl-7 pr-1 py-3 w-full text-base font-black text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all disabled:opacity-50"
                                    />
                                  </div>
                                </td>
                                <td className="p-4">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-primary/40">LKR</span>
                                    <input 
                                      type="number" 
                                      value={ps5Rates[tier].threeHour || ''}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                                        setPs5Rates(prev => ({ ...prev, [tier]: { ...prev[tier], threeHour: val } }));
                                      }}
                                      disabled={!isAdmin}
                                      className="bg-surface-container-low border border-primary/20 rounded-lg pl-7 pr-1 py-3 w-full text-base font-black text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all disabled:opacity-50"
                                    />
                                  </div>
                                </td>
                                <td className="p-4">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-primary/40">LKR</span>
                                    <input 
                                      type="number" 
                                      value={ps5Rates[tier].fiveHour || ''}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                                        setPs5Rates(prev => ({ ...prev, [tier]: { ...prev[tier], fiveHour: val } }));
                                      }}
                                      disabled={!isAdmin}
                                      className="bg-surface-container-low border border-primary/20 rounded-lg pl-7 pr-1 py-3 w-full text-base font-black text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all disabled:opacity-50"
                                    />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* PS4 Pricing */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 text-secondary">
                        <Gamepad2 className="w-6 h-6" />
                        <h4 className="font-headline font-bold text-lg uppercase tracking-wider">PlayStation 4 Pricing Matrix</h4>
                      </div>
                      <div className="bg-surface-container rounded-2xl overflow-hidden border border-white/10 shadow-xl">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-surface-container-high">
                              <th className="p-5 text-xs font-bold text-on-surface-variant uppercase border-b border-white/10 w-24">Tier</th>
                              <th className="p-5 text-xs font-bold text-on-surface-variant uppercase border-b border-white/10 min-w-[100px]">30-Min Rate</th>
                              <th className="p-5 text-xs font-bold text-on-surface-variant uppercase border-b border-white/10 min-w-[100px]">Hourly Rate</th>
                              <th className="p-5 text-xs font-bold text-on-surface-variant uppercase border-b border-white/10 min-w-[100px]">3-Hour Pkg</th>
                              <th className="p-5 text-xs font-bold text-on-surface-variant uppercase border-b border-white/10 min-w-[100px]">5-Hour Pkg</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(['single', 'duo', 'trio', 'squad'] as const).map((tier) => (
                              <tr key={tier} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                                <td className="p-5 text-xs font-black text-secondary uppercase tracking-widest">{tier}</td>
                                <td className="p-4">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-secondary/40">LKR</span>
                                    <input 
                                      type="number" 
                                      value={ps4Rates[tier].thirtyMin || ''}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                                        setPs4Rates(prev => ({ ...prev, [tier]: { ...prev[tier], thirtyMin: val } }));
                                      }}
                                      disabled={!isAdmin}
                                      className="bg-surface-container-low border border-secondary/20 rounded-lg pl-7 pr-1 py-3 w-full text-base font-black text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/50 transition-all disabled:opacity-50"
                                    />
                                  </div>
                                </td>
                                <td className="p-4">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-secondary/40">LKR</span>
                                    <input 
                                      type="number" 
                                      value={ps4Rates[tier].hourly || ''}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                                        setPs4Rates(prev => ({ ...prev, [tier]: { ...prev[tier], hourly: val } }));
                                      }}
                                      disabled={!isAdmin}
                                      className="bg-surface-container-low border border-secondary/20 rounded-lg pl-7 pr-1 py-3 w-full text-base font-black text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/50 transition-all disabled:opacity-50"
                                    />
                                  </div>
                                </td>
                                <td className="p-4">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-secondary/40">LKR</span>
                                    <input 
                                      type="number" 
                                      value={ps4Rates[tier].threeHour || ''}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                                        setPs4Rates(prev => ({ ...prev, [tier]: { ...prev[tier], threeHour: val } }));
                                      }}
                                      disabled={!isAdmin}
                                      className="bg-surface-container-low border border-secondary/20 rounded-lg pl-7 pr-1 py-3 w-full text-base font-black text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/50 transition-all disabled:opacity-50"
                                    />
                                  </div>
                                </td>
                                <td className="p-4">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-secondary/40">LKR</span>
                                    <input 
                                      type="number" 
                                      value={ps4Rates[tier].fiveHour || ''}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                                        setPs4Rates(prev => ({ ...prev, [tier]: { ...prev[tier], fiveHour: val } }));
                                      }}
                                      disabled={!isAdmin}
                                      className="bg-surface-container-low border border-secondary/20 rounded-lg pl-7 pr-1 py-3 w-full text-base font-black text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/50 transition-all disabled:opacity-50"
                                    />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>}

                  {/* Save Button */}
                  {isAdmin && ps5Rates && ps4Rates && (
                    <div className="pt-6 flex justify-end">
                      <button
                        onClick={handleSaveRates}
                        className="px-8 py-3 bg-primary text-on-primary rounded-xl font-headline font-bold uppercase shadow-[0_0_20px_rgba(105,218,255,0.3)] hover:shadow-[0_0_30px_rgba(105,218,255,0.5)] transition-all active:scale-95 flex items-center gap-2"
                      >
                        <Save className="w-5 h-5" />
                        Save Changes
                      </button>
                    </div>
                  )}

                  {/* Minimum Price */}
                  <div className="pt-4 border-t border-white/5">
                    <div className="flex items-center gap-2 text-on-surface mb-4">
                      <Clock className="w-4 h-4" />
                      <h4 className="font-headline font-bold text-sm uppercase">Duration Rules</h4>
                    </div>
                    <div className="p-4 bg-surface-container rounded-lg space-y-1 max-w-xs">
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase">Minimum Session Price (LKR)</p>
                      <input 
                        type="number" 
                        value={minDurationPrice || ''}
                        onChange={(e) => setMinDurationPrice(e.target.value === '' ? 0 : Number(e.target.value))}
                        disabled={!isAdmin}
                        className="bg-transparent border-b border-white/30 w-full font-headline text-xl font-bold focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 w-full z-50 h-20 bg-background/90 backdrop-blur-xl flex justify-around items-center px-4 border-t border-primary/10 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            "flex flex-col items-center justify-center px-4 py-1 transition-all active:scale-90",
            activeTab === 'dashboard' ? "bg-primary/10 text-primary rounded-xl shadow-[0_0_10px_rgba(105,218,255,0.2)]" : "text-secondary/60"
          )}
        >
          <LayoutDashboard className="w-6 h-6" />
          <span className="font-headline text-[10px] font-bold tracking-[0.05em] uppercase">DASHBOARD</span>
        </button>
        <button 
          onClick={() => setActiveTab('reports')}
          className={cn(
            "flex flex-col items-center justify-center px-4 py-1 transition-all active:scale-90",
            activeTab === 'reports' ? "bg-primary/10 text-primary rounded-xl shadow-[0_0_10px_rgba(105,218,255,0.2)]" : "text-secondary/60"
          )}
        >
          <BarChart3 className="w-6 h-6" />
          <span className="font-headline text-[10px] font-bold tracking-[0.05em] uppercase">REPORTS</span>
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={cn(
            "flex flex-col items-center justify-center px-4 py-1 transition-all active:scale-90",
            activeTab === 'settings' ? "bg-primary/10 text-primary rounded-xl shadow-[0_0_10px_rgba(105,218,255,0.2)]" : "text-secondary/60"
          )}
        >
          <Settings className="w-6 h-6" />
          <span className="font-headline text-[10px] font-bold tracking-[0.05em] uppercase">SETTINGS</span>
        </button>
      </nav>

      {/* Floating Action Button */}
      <button className="fixed bottom-24 right-6 md:bottom-8 md:right-8 w-14 h-14 bg-primary text-on-primary rounded-xl shadow-[0_0_20px_rgba(105,218,255,0.5)] flex items-center justify-center active:scale-90 transition-transform z-40">
        <Plus className="w-8 h-8" />
      </button>

      {/* Session Setup Modal */}
      <AnimatePresence>
        {setupStation && (
          <SessionSetupModal 
            station={setupStation} 
            minPrice={minDurationPrice}
            onClose={() => setSetupStation(null)} 
            onStartTimer={(players, startTime, endTime) => {
              setConfirmSessionData({ stationId: setupStation.id, players, startTime, endTime });
              setSetupStation(null);
            }}
          />
        )}

        {terminateStation && (
          <TerminateSessionModal
            stationId={terminateStation.id}
            onClose={() => setTerminateStation(null)}
            onConfirm={(reason) => handleTerminateSession(terminateStation.id, reason)}
          />
        )}

        {confirmSessionData && (
          <StartSessionConfirmationModal
            stationId={confirmSessionData.stationId}
            onClose={() => setConfirmSessionData(null)}
            onConfirm={async () => {
              const { stationId, players, startTime, endTime } = confirmSessionData;
              try {
                await startSession(stationId, players, startTime, endTime);
                // Refresh from server so we get the authoritative session state
                const updated = await fetchStations();
                setStations(updated);
              } catch (err) {
                console.error('Failed to start session:', err);
                alert('Failed to start session. Please try again.');
              }
              setConfirmSessionData(null);
            }}
          />
        )}

        <AdminPinModal
          isOpen={showPinModal}
          onClose={() => setShowPinModal(false)}
          onSuccess={(token: string) => {
            setAdminToken(token);
            setIsAdmin(true);
            setShowPinModal(false);
          }}
        />
      </AnimatePresence>
    </div>
  );
}

const AdminPinModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
}> = ({ isOpen, onClose, onSuccess }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || isVerifying) return;
    setIsVerifying(true);
    try {
      const result = await verifyAdminPin(pin);
      if (result.success && result.token) {
        onSuccess(result.token);
        setPin('');
        setError(false);
      } else {
        setError(true);
        setPin('');
        setTimeout(() => setError(false), 2000);
      }
    } catch {
      setError(true);
      setPin('');
      setTimeout(() => setError(false), 2000);
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ 
          opacity: 1, 
          scale: 1,
          x: error ? [-10, 10, -10, 10, 0] : 0
        }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface-container-high rounded-2xl p-8 w-full max-w-sm border border-white/10 shadow-2xl"
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="font-headline text-xl font-bold text-on-surface uppercase">Admin Access</h3>
            <p className="text-xs text-on-surface-variant uppercase tracking-widest mt-1">Enter Security PIN to continue</p>
          </div>
          
          <form onSubmit={handleSubmit} className="w-full space-y-4 mt-4">
            <input 
              type="password"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              maxLength={4}
              className={cn(
                "w-full bg-surface-container-low border rounded-xl px-4 py-4 text-center text-2xl font-black tracking-[1em] focus:outline-none transition-all",
                error ? "border-error text-error" : "border-white/10 text-on-surface focus:border-primary"
              )}
            />
            {error && <p className="text-error text-[10px] font-bold uppercase tracking-widest">Invalid PIN. Access Denied.</p>}
            
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-xl font-headline font-bold text-xs uppercase text-on-surface-variant hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isVerifying}
                className="flex-1 px-4 py-3 bg-primary text-on-primary rounded-xl font-headline font-bold text-xs uppercase shadow-[0_0_15px_rgba(105,218,255,0.3)] active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-wait"
              >
                {isVerifying ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

interface StationCardProps {
  station: Station;
  onStart: () => void;
  onEnd: () => void;
  onTerminate: () => void;
  onCollect: () => void;
  onPrint: () => void;
}

const StationCard: React.FC<StationCardProps> = ({ station, onStart, onEnd, onTerminate, onCollect, onPrint }) => {
  const isPS5 = station.type === 'PS5';
  const isBusy = station.status === 'busy';
  const isCompleted = station.status === 'completed';

  const progress = isBusy && station.totalSeconds && station.remainingSeconds 
    ? (station.remainingSeconds / station.totalSeconds) * 100 
    : 0;

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ 
        opacity: 1, 
        scale: 1,
        backgroundColor: isCompleted ? ['#1a1a1a', '#451a1a', '#1a1a1a'] : '#1a1a1a'
      }}
      transition={{
        backgroundColor: isCompleted ? { duration: 1, repeat: Infinity } : { duration: 0.2 }
      }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={cn(
        "group relative bg-surface-container-high rounded-xl overflow-hidden border-l-[6px] transition-all",
        isCompleted ? "border-error shadow-[0_0_20px_rgba(255,82,82,0.3)]" : isPS5 ? "next-gen-glow border-primary" : "classic-glow border-secondary",
        (!isBusy && !isCompleted) && "opacity-80 hover:opacity-100"
      )}
    >
      <div className="p-6 flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <span className={cn(
            "font-headline text-[10px] tracking-widest font-bold uppercase",
            isCompleted ? "text-error" : isPS5 ? "text-primary/70" : "text-secondary/70"
          )}>
            {isCompleted ? 'SESSION ENDED' : isPS5 ? 'NEXT-GEN STATION' : 'CLASSIC STATION'}
          </span>
          <h4 className="font-headline text-3xl font-black text-on-surface tracking-tighter uppercase">{station.id}</h4>
          <div className={cn(
            "text-[10px] font-bold mt-1 uppercase tracking-tighter",
            isPS5 ? "text-primary/60" : "text-secondary/60"
          )}>
            30m: LKR {station.rates.single.thirtyMin} (S) / {station.rates.duo.thirtyMin} (D) / {station.rates.trio.thirtyMin} (T) / {station.rates.squad.thirtyMin} (Q)
            <br />
            1hr: LKR {station.rates.single.hourly} (S) / {station.rates.duo.hourly} (D) / {station.rates.trio.hourly} (T) / {station.rates.squad.hourly} (Q)
            {station.rates.single.threeHour && ` • 3hr Special`}
            {station.rates.single.fiveHour && ` • 5hr Special`}
          </div>
          <div className={cn(
            "mt-4 flex items-center gap-2 px-3 py-1 border rounded-md w-fit",
            isCompleted ? "bg-error/20 border-error/40" : isBusy ? "bg-error/10 border-error/20" : isPS5 ? "bg-primary/10 border-primary/20" : "bg-secondary/10 border-secondary/20"
          )}>
            <span className={cn(
              "w-2 h-2 rounded-full",
              isCompleted ? "bg-error animate-ping" : isBusy ? "bg-error animate-pulse" : isPS5 ? "bg-primary" : "bg-secondary"
            )} />
            <span className={cn(
              "font-headline text-[10px] font-bold tracking-widest uppercase",
              isCompleted ? "text-error" : isBusy ? "text-error" : isPS5 ? "text-primary" : "text-secondary"
            )}>
              {isCompleted ? 'Payment Pending' : isBusy ? 'Busy' : 'Available'}
            </span>
          </div>
        </div>
        
        <div className={cn("text-right", (!isBusy && !isCompleted) && "opacity-30")}>
          <p className="font-headline text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">
            {isCompleted ? 'Total Amount' : 'Remaining'}
          </p>
          <p className={cn(
            "font-headline text-3xl font-bold tracking-tighter",
            isCompleted ? "text-error" : (isBusy && station.remainingTime?.startsWith('00:0')) ? "text-error-dim" : "text-on-surface"
          )}>
            {isCompleted ? `LKR ${station.pendingRevenue}` : (station.remainingTime || '--:--:--')}
          </p>
        </div>
      </div>

      <div className="px-6 pb-6 pt-2 flex items-center justify-between gap-4">
        {isCompleted ? (
          <>
            <div className="flex flex-col">
              <span className="text-[10px] text-on-surface-variant uppercase font-headline">User</span>
              <span className="text-sm font-bold text-on-surface">{station.user}</span>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={onPrint}
                className="bg-surface-container-highest hover:bg-white/10 text-on-surface px-4 py-3 rounded-xl font-headline text-xs font-bold tracking-widest uppercase transition-all active:scale-95 border border-white/10 flex items-center gap-2"
                title="Print Receipt"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button 
                onClick={onCollect}
                className="bg-primary hover:bg-primary/80 text-on-primary px-6 py-3 rounded-xl font-headline text-xs font-bold tracking-widest uppercase transition-all active:scale-95 shadow-[0_0_15px_rgba(105,218,255,0.4)]"
              >
                Collect Money
              </button>
            </div>
          </>
        ) : isBusy ? (
          <>
            <div className="flex flex-col">
              <span className="text-[10px] text-on-surface-variant uppercase font-headline">User</span>
              <span className="text-sm font-bold text-on-surface">{station.user}</span>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={onTerminate}
                className="bg-error/10 hover:bg-error/20 text-error px-4 py-3 rounded-xl font-headline text-[10px] font-bold tracking-widest uppercase transition-all active:scale-95 border border-error/20"
              >
                Terminate
              </button>
              <button 
                onClick={onEnd}
                className="bg-error/20 hover:bg-error/30 text-error px-6 py-3 rounded-xl font-headline text-xs font-bold tracking-widest uppercase transition-all active:scale-95"
              >
                End Session
              </button>
            </div>
          </>
        ) : (
          <div className="w-full flex justify-end">
            <button 
              onClick={onStart}
              className={cn(
                "px-8 py-3 rounded-xl font-headline text-xs font-bold tracking-widest uppercase transition-all active:scale-95",
                isPS5 ? "bg-primary text-on-primary hover:shadow-[0_0_15px_rgba(105,218,255,0.4)]" : "bg-secondary text-on-secondary hover:shadow-[0_0_15px_rgba(129,151,255,0.4)]"
              )}
            >
              Start Session
            </button>
          </div>
        )}
      </div>

      {isBusy && (
        <div className="absolute bottom-0 left-0 w-full h-1 bg-surface-container">
          <motion.div 
            initial={{ width: '100%' }}
            animate={{ width: `${progress}%` }}
            className={cn("h-full", isPS5 ? "bg-primary" : "bg-secondary")} 
          />
        </div>
      )}
    </motion.div>
  );
}

interface SessionSetupModalProps {
  station: Station;
  minPrice: number;
  onClose: () => void;
  onStartTimer: (players: number, startTime: string, endTime: string) => void;
}

function TerminateSessionModal({ stationId, onClose, onConfirm }: { stationId: string, onClose: () => void, onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);

  const handleConfirm = () => {
    if (reason.trim().length >= 3) {
      onConfirm(reason);
    } else {
      setError(true);
      setTimeout(() => setError(false), 1000);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-md bg-surface-container-low rounded-xl shadow-2xl border border-white/10 p-8 text-center"
      >
        <div className="w-16 h-16 bg-error/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <X className="w-8 h-8 text-error" />
        </div>
        
        <h2 className="font-headline text-2xl font-bold text-on-surface uppercase mb-2">Terminate Session</h2>
        <p className="text-on-surface-variant text-sm mb-8">
          Are you sure you want to terminate the session for <span className="text-on-surface font-bold">{stationId}</span>? No revenue will be added.
        </p>

        <div className="space-y-6">
          <div className="text-left">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 block">Reason for Termination</label>
            <textarea 
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
              className={cn(
                "w-full bg-surface-container-high border-2 rounded-xl py-4 px-6 font-headline text-lg focus:outline-none transition-all min-h-[100px] resize-none",
                error ? "border-error animate-shake" : "border-white/5 focus:border-primary"
              )}
              placeholder="Enter reason (e.g. Power failure, System crash...)"
            />
            {error && <p className="text-error text-[10px] font-bold mt-1 uppercase">Please provide a valid reason (min 3 chars)</p>}
          </div>

          <div className="flex gap-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 px-6 rounded-xl bg-surface-container-highest font-headline font-bold text-on-surface hover:bg-surface-bright transition-all uppercase"
            >
              CANCEL
            </button>
            <button 
              onClick={handleConfirm}
              className="flex-[2] py-4 px-6 rounded-xl bg-error text-on-primary font-headline font-bold shadow-[0_0_20px_rgba(255,82,82,0.3)] hover:shadow-[0_0_30px_rgba(255,82,82,0.5)] transition-all active:scale-95 uppercase"
            >
              TERMINATE
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StartSessionConfirmationModal({ stationId, onClose, onConfirm }: { stationId: string, onClose: () => void, onConfirm: () => void }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState(false);

  const handleConfirm = () => {
    if (passcode.toLowerCase() === "yes") {
      onConfirm();
    } else {
      setError(true);
      setTimeout(() => setError(false), 1000);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-md bg-surface-container-low rounded-xl shadow-2xl border border-white/10 p-8 text-center"
      >
        <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        
        <h2 className="font-headline text-2xl font-bold text-on-surface uppercase mb-2">Confirm Session</h2>
        <p className="text-on-surface-variant text-sm mb-8">
          Type <span className="text-primary font-bold">"yes"</span> to authorize session start for <span className="text-on-surface font-bold">{stationId}</span>
        </p>

        <div className="space-y-6">
          <input 
            type="text"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            autoFocus
            className={cn(
              "w-full bg-surface-container-high border-2 rounded-xl py-4 px-6 text-center font-headline text-2xl font-bold tracking-widest focus:outline-none transition-all uppercase",
              error ? "border-error animate-shake" : "border-white/5 focus:border-primary"
            )}
            placeholder="TYPE YES"
          />

          <div className="flex gap-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 px-6 rounded-xl bg-surface-container-highest font-headline font-bold text-on-surface hover:bg-surface-bright transition-all uppercase"
            >
              CANCEL
            </button>
            <button 
              onClick={handleConfirm}
              className="flex-[2] py-4 px-6 rounded-xl bg-primary text-on-primary font-headline font-bold shadow-[0_0_20px_rgba(105,218,255,0.3)] hover:shadow-[0_0_30px_rgba(105,218,255,0.5)] transition-all active:scale-95 uppercase"
            >
              AUTHORIZE
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SessionSetupModal({ station, minPrice, onClose, onStartTimer }: SessionSetupModalProps) {
  const [playerCount, setPlayerCount] = useState(1);
  const [duration, setDuration] = useState(60);
  const [isCustom, setIsCustom] = useState(false);
  const [customValue, setCustomValue] = useState('90');

  const playerType =
    playerCount === 4 ? 'squad' :
    playerCount === 3 ? 'trio' :
    playerCount === 2 ? 'duo' :
    'single';

  const rates = station.rates[playerType];
  const cost  = rates.hourly;

  let totalCost = 0;
  if (duration <= 30 && rates.thirtyMin) {
    totalCost = rates.thirtyMin;
  } else if (duration === 180 && rates.threeHour) {
    totalCost = rates.threeHour;
  } else if (duration === 300 && rates.fiveHour) {
    totalCost = rates.fiveHour;
  } else {
    totalCost = (cost * duration) / 60;
  }

  totalCost = Math.max(totalCost, minPrice);

  // Derive startTime / endTime from current clock + selected duration
  function getTimePair(): { startTime: string; endTime: string } {
    const now   = new Date();
    const start = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const end   = new Date(now.getTime() + duration * 60_000);
    const endStr = `${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
    return { startTime: start, endTime: endStr };
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-2xl bg-surface-container-low/95 backdrop-blur-2xl rounded-xl shadow-2xl border border-white/5 overflow-hidden"
      >
        {/* Modal Header */}
        <div className="p-8 border-b border-white/5 bg-surface-container-low flex justify-between items-end">
          <div>
            <span className="font-label text-primary text-xs font-bold tracking-[0.2em] uppercase mb-2 block">Tactical Override</span>
            <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface uppercase">
              Session Setup - <span className="text-primary">{station.id}</span>
            </h1>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-label text-on-surface-variant text-[10px] tracking-widest uppercase">System Status</span>
            <div className="flex items-center gap-2 text-primary font-bold">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              READY
            </div>
          </div>
        </div>

        <div className="p-8 space-y-10">
          {/* Player Count */}
          <section>
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-headline text-lg font-bold flex items-center gap-2 uppercase">
                <Users className="w-5 h-5 text-primary" />
                PLAYER COUNT
              </h2>
              <span className="font-label text-[10px] text-on-surface-variant tracking-widest uppercase">SELECT SQUAD SIZE</span>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <button 
                  key={n}
                  onClick={() => setPlayerCount(n)}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl transition-all border",
                    playerCount === n 
                      ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(105,218,255,0.2)]" 
                      : "bg-surface-container-high hover:bg-surface-bright border-transparent"
                  )}
                >
                  <span className={cn("font-headline text-2xl font-bold", playerCount === n ? "text-primary" : "text-on-surface")}>
                    {n.toString().padStart(2, '0')}
                  </span>
                  <span className={cn("font-label text-[10px] tracking-tighter uppercase", playerCount === n ? "text-primary/80" : "text-on-surface-variant")}>
                    {n === 1 ? 'SOLO' : n === 2 ? 'DUO' : n === 3 ? 'TRIO' : 'SQUAD'}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Duration */}
          <section>
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-headline text-lg font-bold flex items-center gap-2 uppercase">
                <Timer className="w-5 h-5 text-secondary" />
                DURATION
              </h2>
              <span className="font-label text-[10px] text-on-surface-variant tracking-widest uppercase">MISSION LENGTH</span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
              {[30, 60, 120, 180, 240, 300, 360, 420, 480].map((d) => (
                <button
                  key={d}
                  onClick={() => { setDuration(d); setIsCustom(false); }}
                  className={cn(
                    'flex flex-col items-center justify-center py-3 rounded-lg transition-all border',
                    duration === d && !isCustom
                      ? 'border-secondary bg-secondary/10 shadow-[0_0_10px_rgba(129,151,255,0.2)]'
                      : 'bg-surface-container-high hover:bg-surface-bright border-transparent'
                  )}
                >
                  <span className={cn('font-headline text-lg font-bold', duration === d && !isCustom ? 'text-secondary' : 'text-on-surface')}>
                    {d < 60 ? d : d / 60}
                  </span>
                  <span className={cn('font-label text-[8px] tracking-tighter uppercase', duration === d && !isCustom ? 'text-secondary/80' : 'text-on-surface-variant')}>
                    {d < 60 ? 'MINS' : 'HOURS'}
                  </span>
                </button>
              ))}
              <button
                onClick={() => setIsCustom(true)}
                className={cn(
                  'flex flex-col items-center justify-center py-3 rounded-lg transition-all border',
                  isCustom
                    ? 'border-secondary bg-secondary/10 shadow-[0_0_10px_rgba(129,151,255,0.2)]'
                    : 'bg-surface-container-high hover:bg-surface-bright border-transparent'
                )}
              >
                <Settings className={cn('w-5 h-5 mb-1', isCustom ? 'text-secondary' : 'text-on-surface-variant')} />
                <span className={cn('font-label text-[8px] tracking-tighter uppercase', isCustom ? 'text-secondary/80' : 'text-on-surface-variant')}>
                  Custom
                </span>
              </button>
            </div>

            {isCustom && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex items-center gap-4 p-4 bg-surface-container rounded-xl border border-secondary/20"
              >
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-1">Enter Minutes</p>
                  <input
                    type="number"
                    value={customValue}
                    onChange={(e) => {
                      setCustomValue(e.target.value);
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) setDuration(val);
                    }}
                    className="bg-transparent border-b border-secondary/30 w-full font-headline text-xl font-bold focus:outline-none focus:border-secondary transition-colors"
                    placeholder="e.g. 90"
                  />
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-1">Total Time</p>
                  <p className="font-headline text-lg font-bold text-secondary">
                    {Math.floor(duration / 60)}h {duration % 60}m
                  </p>
                </div>
              </motion.div>
            )}
          </section>

          {/* Pricing */}
          <section className="bg-surface-container-low rounded-xl p-6 border-l-4 border-primary">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <p className="font-label text-[10px] text-on-surface-variant tracking-[0.2em] uppercase">Total Tactical Cost</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-on-surface-variant font-headline text-xl">LKR</span>
                  <span className="font-headline text-5xl font-black text-on-surface tracking-tighter">{totalCost.toLocaleString()}</span>
                  {((duration <= 30 && rates.thirtyMin) || (duration === 180 && rates.threeHour) || (duration === 300 && rates.fiveHour)) && (
                    <span className="ml-2 px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-bold rounded uppercase tracking-widest">
                      Special Rate
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-2 text-primary/60 font-label text-[10px] tracking-widest mb-1 uppercase">
                  <Info className="w-3 h-3" />
                  RATE BREAKDOWN
                </div>
                <p className="text-sm font-medium text-on-surface-variant uppercase">
                  {duration <= 30 && rates.thirtyMin ? '30m Package' :
                   duration === 180 && rates.threeHour ? '3hr Package' :
                   duration === 300 && rates.fiveHour ? '5hr Package' :
                   `Base Rate: LKR ${cost}/hr (${playerCount} Player)`}
                </p>
                <p className="text-xs text-on-surface-variant/60 uppercase">Console: {station.type}-X High Performance</p>
              </div>
            </div>
          </section>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 px-6 rounded-xl bg-surface-container-highest font-headline font-bold text-on-surface hover:bg-surface-bright transition-all active:scale-95 uppercase"
            >
              CANCEL
            </button>
            <button 
              onClick={() => { if (duration > 0) { const { startTime, endTime } = getTimePair(); onStartTimer(playerCount, startTime, endTime); } }}
              className="flex-[2] py-4 px-6 rounded-xl bg-gradient-to-br from-primary to-primary-container font-headline font-bold text-on-primary shadow-[0_0_20px_rgba(105,218,255,0.3)] hover:shadow-[0_0_30px_rgba(105,218,255,0.5)] transition-all active:scale-95 flex items-center justify-center gap-3 uppercase"
            >
              <Play className="w-5 h-5 fill-current" />
              START TIMER
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
