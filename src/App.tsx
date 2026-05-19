/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { clsx, type ClassValue } from 'clsx';
import {
    Activity,
    ArrowLeftRight,
    BarChart3,
    Clock,
    CalendarRange,
    Download,
    Gamepad2,
    Hourglass,
    Info,
    LayoutDashboard,
    Lock,
    LogOut,
    Monitor,
    Play,
    Plus,
    Printer,
    Receipt,
    Save,
    Settings,
    Timer,
    Trash2,
    TrendingUp,
    Unlock,
    Users,
    Wifi,
    X
} from 'lucide-react';
import { AnimatePresence, motion, useSpring } from 'motion/react';
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
const CafeScene = lazy(() => import('./CafeScene'));
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis
} from 'recharts';
import { twMerge } from 'tailwind-merge';
import {
    addStation,
    collectSession,
    deleteStation,
    endSession,
    extendSession,
    fetchDailyReport,
    fetchLogs,
    fetchPricing,
    fetchSettings,
    fetchStations,
    PlatformRates,
    PricingSlots,
    savePricing,
    savePricingSlots,
    saveSettings,
    startSession,
    terminateSession,
    verifyAdminPin,
    staffLogin,
    verifyStaffToken,
    fetchLogsRange,
    fetchExpenses,
    addExpense,
    deleteExpense,
    adjustPlayers,
    swapSession,
} from './api';
import { RevenueData, SessionLog, Station, Expense, ExpenseCategory } from './types';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Returns today's date as YYYY-MM-DD in the browser's local timezone,
// matching the +5:30 (Sri Lanka) offset the backend applies to stored UTC timestamps.
function localDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

// Session storage key for persisting the staff JWT across page reloads
const STAFF_TOKEN_KEY = 'nextgen_staff_token';

// Smoothly animates a number from 0 → value using spring physics
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const spring = useSpring(0, { stiffness: 75, damping: 18 });

  useEffect(() => {
    const unsub = spring.on('change', (v) => {
      if (ref.current) ref.current.textContent = Math.round(v).toLocaleString();
    });
    return unsub;
  }, [spring]);

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <span ref={ref} className={className}>0</span>;
}

// Stagger variants for the dashboard entrance sequence
const dashboardVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

const cardGridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

function LoginPage({ onLogin, cafeName, cafeLogoUrl }: { onLogin: (token: string) => void; cafeName: string; cafeLogoUrl: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shaking, setShaking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await staffLogin(username, password);
    setLoading(false);
    if (result.success && result.token) {
      sessionStorage.setItem(STAFF_TOKEN_KEY, result.token);
      onLogin(result.token);
    } else {
      setError(result.error ?? 'Invalid username or password');
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    }
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-body flex items-center justify-center">
      <motion.div
        animate={shaking ? { x: [-10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        <div className="bg-surface-container-low border-l-4 border-primary p-8">
          <div className="flex flex-col items-center mb-8">
            {cafeLogoUrl && <img src={cafeLogoUrl} alt={cafeName} className="w-16 h-16 object-contain mb-3" />}
            <h1 className="font-headline text-2xl font-black text-on-surface tracking-tighter uppercase">{cafeName}</h1>
            <p className="text-[10px] text-on-surface-variant font-headline tracking-[0.2em] uppercase mt-1">Staff Access Portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(''); }}
                className="w-full bg-surface-container border border-outline-variant/50 px-4 py-2.5 text-sm font-body text-on-surface focus:outline-none focus:border-primary transition-colors"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                className="w-full bg-surface-container border border-outline-variant/50 px-4 py-2.5 text-sm font-body text-on-surface focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {error && (
              <p className="text-xs text-error font-headline tracking-wide">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2 py-3 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Login'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

type CardTheme = 'flat' | '3d' | 'neon' | 'glass' | 'cyber' | 'terminal' | 'retro' | 'minimal';

const CARD_THEMES: Array<{ id: CardTheme; label: string; description: string }> = [
  { id: 'flat',     label: 'Flat',          description: 'Clean minimal cards'     },
  { id: '3d',       label: '3D Depth',      description: 'Elevated gloss & depth'  },
  { id: 'neon',     label: 'Neon Arcade',   description: 'Glowing neon brackets'   },
  { id: 'glass',    label: 'Glassmorphism', description: 'Frosted glass panels'    },
  { id: 'cyber',    label: 'Cyberpunk',     description: 'Angular diagonal cuts'   },
  { id: 'terminal', label: 'Terminal',      description: 'CLI mono display'        },
  { id: 'retro',    label: 'Retro Wave',    description: 'Grid lines & neon pink'  },
  { id: 'minimal',  label: 'Minimal',       description: 'Ultra-clean typography'  },
];

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reports' | 'expenses' | 'settings'>('dashboard');
  const [stations, setStations] = useState<Station[]>([]);
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [yesterdayLogs, setYesterdayLogs] = useState<SessionLog[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PS5' | 'PS4'>('ALL');
  const [setupStation, setSetupStation] = useState<Station | null>(null);
  const [terminateStation, setTerminateStation] = useState<Station | null>(null);
  const [extendStation, setExtendStation] = useState<Station | null>(null);
  const [adjustStation, setAdjustStation] = useState<Station | null>(null);
  const [showAddStation, setShowAddStation] = useState(false);
  const [confirmSessionData, setConfirmSessionData] = useState<{ stationId: string, players: number, startTime: string, endTime: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(localDateString());
  const [showPinModal, setShowPinModal] = useState(false);
  const [autoEndSessions, setAutoEndSessions] = useState(true);
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(5);
  const [swapStation, setSwapStation] = useState<Station | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [revenueHistory, setRevenueHistory] = useState<RevenueData[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFrom, setExportFrom] = useState<string>(localDateString());
  const [exportTo, setExportTo] = useState<string>(localDateString());
  const [exporting, setExporting] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [now, setNow] = useState(new Date());
  const [cardTheme, setCardTheme] = useState<CardTheme>(
    () => (localStorage.getItem('nextgen_card_theme') as CardTheme) ?? 'flat'
  );

  useEffect(() => {
    localStorage.setItem('nextgen_card_theme', cardTheme);
  }, [cardTheme]);

  // Real-time clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Expenses State
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [expenseMonth, setExpenseMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [expenseForm, setExpenseForm] = useState<{ category: ExpenseCategory; description: string; amount: string; date: string }>({
    category: 'internet',
    description: '',
    amount: '',
    date: localDateString(),
  });
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [expenseError, setExpenseError] = useState('');

  // Cafe branding
  const [cafeName, setCafeName] = useState('Nextgen Gaming');
  const [cafeLogoUrl, setCafeLogoUrl] = useState('https://olive-adjacent-orangutan-186.mypinata.cloud/ipfs/bafkreif3vvhdqi2dqa36ykkglkc73ku7m2mblm2mi46e5y7ktkdx7sm5pe');

  useEffect(() => {
    document.title = cafeName || 'NextGen Gaming';
    if (cafeLogoUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = cafeLogoUrl;
    }
  }, [cafeName, cafeLogoUrl]);

  // Admin & Pricing State
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(
    () => sessionStorage.getItem(ADMIN_TOKEN_KEY)
  );
  const [ps5Rates, setPs5Rates] = useState<PlatformRates | null>(null);
  const [ps4Rates, setPs4Rates] = useState<PlatformRates | null>(null);
  const [pricingSlots, setPricingSlots] = useState<PricingSlots | null>(null);

  // Restore admin session from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (stored) {
      setAdminToken(stored);
      setIsAdmin(true);
    }
  }, []);

  // Fetch branding early so the login page shows the correct name/logo
  useEffect(() => {
    fetchSettings().then((s) => {
      if (s.cafe_name)     setCafeName(s.cafe_name);
      if (s.cafe_logo_url) setCafeLogoUrl(s.cafe_logo_url);
    }).catch(() => {});
  }, []);

  // Verify staff JWT on mount; clear it if expired/invalid
  useEffect(() => {
    const token = sessionStorage.getItem(STAFF_TOKEN_KEY);
    if (!token) {
      setAuthChecking(false);
      return;
    }
    verifyStaffToken(token).then((valid) => {
      if (valid) {
        setIsLoggedIn(true);
      } else {
        sessionStorage.removeItem(STAFF_TOKEN_KEY);
      }
      setAuthChecking(false);
    });
  }, []);

  // Initial data load on mount
  useEffect(() => {
    let cancelled = false;
    const today = localDateString();

    async function loadInitialData() {
      const yesterday = localDateString(new Date(Date.now() - 86400000));
      try {
        const [stationsData, pricingData, settingsData, reportData, todayLogs, prevLogs] = await Promise.all([
          fetchStations(),
          fetchPricing(),
          fetchSettings(),
          fetchDailyReport(today),
          fetchLogs(today),
          fetchLogs(yesterday),
        ]);
        if (cancelled) return;
        setStations(stationsData);
        setPs5Rates(pricingData.ps5Rates);
        setPs4Rates(pricingData.ps4Rates);
        setPricingSlots(pricingData.slots);
        setAutoEndSessions(settingsData.auto_end_sessions);
        if (typeof settingsData.grace_period_minutes === 'number') setGracePeriodMinutes(settingsData.grace_period_minutes);
        if (settingsData.cafe_name)     setCafeName(settingsData.cafe_name);
        if (settingsData.cafe_logo_url) setCafeLogoUrl(settingsData.cafe_logo_url);
        setRevenueHistory(reportData.hourlyBreakdown);
        setLogs(todayLogs);
        setYesterdayLogs(prevLogs);
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

  // Refresh reports data whenever the reports tab is opened
  useEffect(() => {
    if (activeTab !== 'reports') return;
    let cancelled = false;
    Promise.all([fetchLogs(selectedDate), fetchDailyReport(selectedDate)])
      .then(([logsData, reportData]) => {
        if (cancelled) return;
        setLogs(logsData);
        setRevenueHistory(reportData.hourlyBreakdown);
      })
      .catch((err) => console.error('Failed to refresh reports data:', err));
    return () => { cancelled = true; };
  }, [activeTab]);

  // Load expenses when the expenses tab is opened or month changes
  useEffect(() => {
    if (activeTab !== 'expenses') return;
    let cancelled = false;
    fetchExpenses(expenseMonth)
      .then(({ data, total }) => {
        if (cancelled) return;
        setExpenses(data);
        setExpensesTotal(total);
      })
      .catch((err) => console.error('Failed to load expenses:', err));
    return () => { cancelled = true; };
  }, [activeTab, expenseMonth]);

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
      await savePricing(adminToken, ps5Rates, ps4Rates);
      if (pricingSlots) await savePricingSlots(adminToken, pricingSlots);
      const updated = await fetchStations();
      setStations(updated);
      alert('Pricing configuration saved successfully!');
    } catch (err) {
      console.error('Failed to save pricing:', err);
      alert('Failed to save pricing. Please try again.');
    }
  };

  // Latency measurement — pings /api/stations every 5 seconds
  useEffect(() => {
    const measure = async () => {
      const t0 = performance.now();
      try {
        await fetch('/api/stations');
        setLatency(Math.round(performance.now() - t0));
      } catch {
        setLatency(null);
      }
    };
    measure();
    const id = setInterval(measure, 5000);
    return () => clearInterval(id);
  }, []);

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

          const graceLimitSeconds = -(gracePeriodMinutes * 60);
          if (autoEndSessions && nextSeconds <= graceLimitSeconds) {
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
  }, [autoEndSessions, gracePeriodMinutes]);

  const handleExtendSession = async (station: Station, minutes: number) => {
    try {
      const data = await extendSession(station.id, minutes);
      setStations(prev => prev.map(s => {
        if (s.id !== station.id) return s;
        return {
          ...s,
          remainingSeconds: data.remainingSeconds,
          remainingTime: data.remainingTime,
          totalSeconds: data.durationSeconds,
        };
      }));
    } catch (err) {
      console.error('Failed to extend session:', err);
      alert('Failed to extend session. Please try again.');
    }
    setExtendStation(null);
  };

  const handleAdjustPlayers = async (station: Station, newPlayers: number) => {
    try {
      await adjustPlayers(station.id, newPlayers);
      setStations(prev => prev.map(s =>
        s.id === station.id ? { ...s, players: newPlayers } : s
      ));
    } catch (err: any) {
      console.error('Failed to adjust players:', err);
      alert(err.message ?? 'Failed to adjust players. Please try again.');
    }
    setAdjustStation(null);
  };

  const handleSwapSession = async (fromStationId: string, toStationId: string) => {
    try {
      await swapSession(fromStationId, toStationId);
      // Refresh all stations to get authoritative state
      const updated = await fetchStations();
      setStations(updated);
    } catch (err: any) {
      alert(err.message ?? 'Failed to swap session. Please try again.');
    }
    setSwapStation(null);
  };

  const handleAddStation = async (id: string, type: string, pricingTemplate: 'PS5' | 'PS4') => {
    if (!adminToken) return;
    try {
      const newStation = await addStation(id, type, pricingTemplate, adminToken);
      setStations(prev => [...prev, newStation]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to add station: ${msg}`);
    }
    setShowAddStation(false);
  };

  const handleDeleteStation = async (stationId: string) => {
    if (!adminToken) return;
    if (!window.confirm(`Remove station ${stationId}? This cannot be undone.`)) return;
    try {
      await deleteStation(stationId, adminToken);
      setStations(prev => prev.filter(s => s.id !== stationId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to remove station: ${msg}`);
    }
  };

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

      // Reset the station to available without a full refetch
      setStations(prev => prev.map(s => {
        if (s.id !== station.id) return s;
        return {
          ...s,
          status: 'available' as const,
          pendingRevenue: undefined,
          actualSecondsPlayed: undefined,
          remainingSeconds: undefined,
          remainingTime: undefined,
          players: undefined,
        };
      }));

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
            <h1>${cafeName}</h1>
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

  const handleExportRange = async () => {
    setExporting(true);
    try {
      const { data, totalRevenue } = await fetchLogsRange(exportFrom, exportTo);
      if (data.length === 0) {
        alert('No transactions found for the selected date range.');
        setExporting(false);
        return;
      }

      const headers = ['Machine ID', 'Type', 'Status', 'Players', 'Duration', 'Revenue (LKR)', 'Date'];
      const rows = data.map(log => [
        `"${log.machineId}"`,
        `"${log.type}"`,
        `"${log.status}"`,
        log.players,
        `"${log.duration}"`,
        log.revenue,
        `"${log.date}"`
      ].join(','));
      rows.push(`,,,,,"Total: ${totalRevenue}",`);

      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `nextgen-report-${exportFrom}-to-${exportTo}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setShowExportModal(false);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    }
    setExporting(false);
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

  const today = localDateString();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const earningsToday = logs
    .filter(log => log.date === today)
    .reduce((sum, log) => sum + log.revenue, 0);

  const earningsYesterday = yesterdayLogs.reduce((sum, log) => sum + log.revenue, 0);

  const earningsChange = earningsYesterday === 0
    ? (earningsToday > 0 ? 100 : 0)
    : ((earningsToday - earningsYesterday) / earningsYesterday) * 100;

  if (authChecking) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!isLoggedIn) {
    return <LoginPage onLogin={(_token) => setIsLoggedIn(true)} cafeName={cafeName} cafeLogoUrl={cafeLogoUrl} />;
  }

  return (
    <div className="min-h-screen bg-background text-on-surface font-body overflow-x-hidden">
      {/* Top Bar */}
      <header className="fixed top-0 w-full z-50 bg-background flex justify-between items-center px-6 h-16 shadow-[0_0_12px_rgba(105,218,255,0.1)]">
        <div className="flex items-center gap-3">
          {cafeLogoUrl
            ? <img src={cafeLogoUrl} alt={cafeName} className="w-8 h-8 object-contain shrink-0" />
            : <Monitor className="w-6 h-6 text-primary shrink-0" />
          }
          <span className="font-headline text-xl font-black text-primary tracking-tighter uppercase">{cafeName}</span>
        </div>

        <div className="flex items-center gap-4">
          <nav className="hidden md:flex gap-6 mr-6">
            {([
              { tab: 'dashboard', label: 'Dashboard' },
              { tab: 'reports',   label: 'Reports'   },
              { tab: 'expenses',  label: 'Expenses'  },
              { tab: 'settings',  label: 'Settings'  },
            ] as const).map(({ tab, label }) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={cn(
                  "font-headline text-sm font-bold tracking-wider uppercase px-3 py-1 rounded transition-colors hover:bg-surface-container-low",
                  activeTab === tab ? "text-primary" : "text-on-surface"
                )}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="font-headline text-[9px] text-on-surface-variant uppercase tracking-widest">{now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
              <p className="font-headline text-xs font-bold text-primary tabular-nums">{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
            </div>
            <div className="w-10 h-10 rounded-full border-2 border-primary/30 p-0.5 overflow-hidden shrink-0 cursor-pointer">
              {cafeLogoUrl
                ? <img src={cafeLogoUrl} alt="Staff" className="w-full h-full object-cover rounded-full" />
                : <div className="w-full h-full rounded-full bg-surface-container-highest flex items-center justify-center"><Users className="w-4 h-4 text-on-surface-variant" /></div>
              }
            </div>
            <button
              onClick={() => { sessionStorage.removeItem(STAFF_TOKEN_KEY); setIsLoggedIn(false); }}
              className="text-on-surface-variant hover:text-error transition-colors p-1"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 w-full z-50 h-20 bg-background/90 backdrop-blur-xl flex justify-around items-center px-4 border-t border-primary/10 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        {([
          { tab: 'dashboard', icon: LayoutDashboard, label: 'DASH' },
          { tab: 'reports',   icon: BarChart3,       label: 'DATA' },
          { tab: 'expenses',  icon: Receipt,          label: 'EXPS' },
          { tab: 'settings',  icon: Settings,         label: 'CONF' },
        ] as const).map(({ tab, icon: Icon, label }) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-4 py-1 rounded-xl transition-all active:scale-90",
                isActive
                  ? "bg-primary/10 text-primary shadow-[0_0_10px_rgba(105,218,255,0.2)]"
                  : "text-secondary/60 hover:text-on-surface"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="font-headline text-[10px] font-bold tracking-[0.05em] uppercase">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Content */}
      <main className="pt-24 pb-32 md:pb-16 px-6 max-w-7xl mx-auto">
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
              variants={dashboardVariants}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Summary — bento grid */}
              <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                {/* Network Status — col-span-2 */}
                <div className="md:col-span-2 bg-surface-container-low rounded-xl p-6 flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none select-none">
                    <Activity className="w-24 h-24" />
                  </div>
                  <div>
                    <h2 className="font-headline text-xs text-on-surface-variant tracking-[0.1em] mb-1 uppercase">Network Status</h2>
                    <p className="font-headline text-4xl font-bold text-primary tracking-tighter uppercase">
                      {activeMachines > 0 ? 'Operational' : 'Standby'}
                    </p>
                  </div>
                  <div className="mt-8 flex gap-8 flex-wrap">
                    <div>
                      <p className="font-headline text-xs text-on-surface-variant uppercase tracking-widest">Active Machines</p>
                      <p className="font-headline text-2xl font-bold text-on-surface">
                        {activeMachines} <span className="text-on-surface-variant text-lg font-light">/ {totalStations}</span>
                      </p>
                    </div>
                    <div>
                      <p className="font-headline text-xs text-on-surface-variant uppercase tracking-widest">Latency</p>
                      <p className={cn("font-headline text-2xl font-bold tabular-nums",
                        latency === null ? "text-on-surface-variant" : latency < 100 ? "text-primary" : latency < 300 ? "text-yellow-400" : "text-error"
                      )}>
                        {latency === null ? '--' : `${latency}ms`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Earnings Today */}
                <div className="bg-surface-container-highest rounded-xl p-6 border-l-4 border-secondary shadow-lg flex flex-col justify-between">
                  <div>
                    <h2 className="font-headline text-xs text-on-surface-variant tracking-[0.1em] mb-4 uppercase">Earnings Today</h2>
                    <div className="flex flex-col gap-1">
                      <span className="font-headline text-4xl font-black text-on-surface tabular-nums">
                        Rs. <AnimatedNumber value={earningsToday} />
                      </span>
                      <span className={cn("font-headline text-sm font-bold tracking-widest", earningsChange >= 0 ? "text-secondary" : "text-error")}>
                        {earningsChange >= 0 ? '+' : ''}{earningsChange.toFixed(1)}% VS YESTERDAY
                      </span>
                    </div>
                  </div>
                  <div className="mt-6 h-2 w-full bg-surface-container rounded-full overflow-hidden">
                    <div
                      className="h-full bg-secondary rounded-full shadow-[0_0_8px_rgba(129,151,255,0.5)] transition-all duration-700"
                      style={{ width: `${earningsYesterday === 0 ? (earningsToday > 0 ? 100 : 0) : Math.min((earningsToday / earningsYesterday) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </motion.div>

              {/* Section header + filters */}
              <motion.div variants={fadeUp} className="flex items-center justify-between mb-8 gap-4">
                <h3 className="font-headline text-2xl font-bold tracking-tight flex items-center gap-3 uppercase">
                  <span className="w-2 h-8 bg-primary rounded-full" />
                  Station Overview
                </h3>
                <div className="flex gap-2">
                  {(['ALL', 'PS5', 'PS4'] as const).map((f) => (
                    <button key={f} onClick={() => setFilter(f)}
                      className={cn(
                        "px-4 py-2 rounded-full font-headline text-xs font-bold uppercase transition-all",
                        filter === f
                          ? "bg-primary text-on-primary shadow-[0_0_12px_rgba(105,218,255,0.3)]"
                          : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                      )}
                    >
                      {f === 'ALL' ? 'All Stations' : `${f} Only`}
                    </button>
                  ))}
                </div>
              </motion.div>

              {/* Station card grid */}
              <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <AnimatePresence>
                  {filteredStations.map(station => (
                    <StationCard
                      key={station.id}
                      station={station}
                      slots={pricingSlots}
                      isAdmin={isAdmin}
                      cardTheme={cardTheme}
                      gracePeriodMinutes={gracePeriodMinutes}
                      onStart={() => setSetupStation(station)}
                      onEnd={async () => {
                        try {
                          const result = await endSession(station.id);
                          setStations(prev => prev.map(s => s.id !== station.id ? s : {
                            ...s, status: 'completed' as const,
                            pendingRevenue: result.pendingRevenue,
                            actualSecondsPlayed: result.actualSecondsPlayed,
                            remainingSeconds: 0, remainingTime: '00:00:00',
                          }));
                        } catch { alert('Failed to end session.'); }
                      }}
                      onExtend={() => setExtendStation(station)}
                      onAdjustPlayers={() => setAdjustStation(station)}
                      onTerminate={() => setTerminateStation(station)}
                      onCollect={() => handleCollectMoney(station)}
                      onPrint={() => handlePrintReceipt(station)}
                      onDelete={isAdmin ? () => handleDeleteStation(station.id) : undefined}
                      onSwap={() => setSwapStation(station)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
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
                  <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-on-surface uppercase">Sector Earnings</h1>
                  <p className="text-on-surface-variant font-label text-sm tracking-widest mt-1 uppercase">REAL-TIME FINANCIAL TELEMETRY</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary font-headline font-bold text-xs tracking-widest uppercase hover:bg-primary/20 transition-colors"
                  >
                    <CalendarRange className="w-4 h-4" />
                    Export
                  </button>
                  <div className="glass-card px-4 py-2 rounded-xl border border-outline-variant flex flex-col items-end">
                    <span className="text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-1">Select Date</span>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-transparent text-sm font-headline font-bold text-primary focus:outline-none cursor-pointer"
                    />
                  </div>
                  <div className="glass-card px-4 py-3 rounded-xl border border-outline-variant flex flex-col items-end">
                    <span className="text-[10px] font-headline font-bold text-primary tracking-[0.2em] uppercase">Daily Revenue</span>
                    <span className="text-xl md:text-2xl font-headline font-bold">LKR {logs.filter(l => l.date === selectedDate).reduce((acc, curr) => acc + curr.revenue, 0).toLocaleString()}</span>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Revenue Chart */}
                <section className="lg:col-span-8 glass-card p-6 border border-outline-variant relative overflow-hidden">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h2 className="font-headline font-bold text-lg tracking-wider text-on-surface uppercase">REVENUE TRAJECTORY</h2>
                      <p className="text-xs text-on-surface-variant font-label uppercase">PERFORMANCE FOR {selectedDate}</p>
                    </div>
                    <span className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-bold font-headline border border-primary/20">DAILY REPORT</span>
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
                          cursor={{ fill: 'rgba(74, 222, 128, 0.1)' }}
                          contentStyle={{ backgroundColor: '#0c0e17', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {revenueHistory.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.value > 3000 ? '#69daff' : '#3e65ff'} />
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
                  <div className="glass-card p-6 border border-outline-variant h-full flex flex-col">
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
                <section className="lg:col-span-12 glass-card border border-outline-variant overflow-hidden">
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
                    <table className="w-full min-w-[580px] text-left">
                      <thead className="bg-surface-container-low">
                        <tr className="text-[10px] font-headline font-black text-on-surface-variant uppercase tracking-widest">
                          <th className="px-4 py-4">Machine ID</th>
                          <th className="px-4 py-4">Status</th>
                          <th className="px-4 py-4 text-center">Players</th>
                          <th className="px-4 py-4 text-center">Play Time</th>
                          <th className="px-4 py-4 text-right">Revenue (LKR)</th>
                          <th className="px-4 py-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {logs.filter(l => l.date === selectedDate).map((log) => (
                          <motion.tr key={log.id} className="hover:bg-primary/5 transition-colors group"
                            initial={{ opacity: 0, x: -8 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true, margin: '-20px' }}
                            transition={{ duration: 0.3 }}
                          >
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
                          </motion.tr>
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

          {!isLoading && activeTab === 'expenses' && (
            <motion.div
              key="expenses"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Header */}
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-on-surface uppercase">Expenses</h1>
                  <p className="text-on-surface-variant font-label text-sm tracking-widest mt-1 uppercase">Operational Cost Tracker</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="glass-card px-4 py-2 rounded-xl border border-outline-variant flex flex-col items-end">
                    <span className="text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-1">Month</span>
                    <input
                      type="month"
                      value={expenseMonth}
                      onChange={(e) => setExpenseMonth(e.target.value)}
                      className="bg-transparent text-sm font-headline font-bold text-primary focus:outline-none cursor-pointer"
                    />
                  </div>
                  <div className="glass-card px-4 py-3 rounded-xl border border-outline-variant flex flex-col items-end">
                    <span className="text-[10px] font-headline font-bold text-red-400 tracking-[0.2em] uppercase">Monthly Total</span>
                    <span className="text-xl md:text-2xl font-headline font-bold text-red-400">LKR {expensesTotal.toLocaleString()}</span>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Add Expense Form */}
                <div className="lg:col-span-4 space-y-4">
                  <div className="glass-card p-6 border border-outline-variant space-y-5">
                    <h2 className="font-headline font-bold text-base tracking-wider text-on-surface uppercase flex items-center gap-2">
                      <Plus className="w-4 h-4 text-primary" />
                      Add Expense
                    </h2>

                    {/* Category */}
                    <div>
                      <label className="block text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-2">Category</label>
                      <select
                        value={expenseForm.category}
                        onChange={(e) => setExpenseForm(f => ({ ...f, category: e.target.value as ExpenseCategory }))}
                        className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2.5 text-sm font-body text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
                      >
                        <option value="internet">Internet Bill</option>
                        <option value="water">Water Bill</option>
                        <option value="electricity">Current Bill (Electricity)</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="game_dvd">Game DVD</option>
                        <option value="psn">PSN Subscription</option>
                        <option value="salary">Salary</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-2">Description <span className="normal-case font-normal">(optional)</span></label>
                      <input
                        type="text"
                        value={expenseForm.description}
                        onChange={(e) => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="e.g. Dialog fiber — May"
                        className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2.5 text-sm font-body text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors placeholder:text-on-surface-variant/40"
                      />
                    </div>

                    {/* Amount */}
                    <div>
                      <label className="block text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-2">Amount (LKR)</label>
                      <input
                        type="number"
                        min={1}
                        value={expenseForm.amount}
                        onChange={(e) => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="0"
                        className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2.5 text-sm font-body text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors placeholder:text-on-surface-variant/40"
                      />
                    </div>

                    {/* Date */}
                    <div>
                      <label className="block text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-2">Date</label>
                      <input
                        type="date"
                        value={expenseForm.date}
                        onChange={(e) => setExpenseForm(f => ({ ...f, date: e.target.value }))}
                        className="w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2.5 text-sm font-body text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
                      />
                    </div>

                    {expenseError && (
                      <p className="text-xs text-red-400 font-label tracking-wide">{expenseError}</p>
                    )}

                    <button
                      disabled={expenseSubmitting}
                      onClick={async () => {
                        const amt = parseInt(expenseForm.amount, 10);
                        if (!expenseForm.amount || isNaN(amt) || amt <= 0) {
                          setExpenseError('Enter a valid amount greater than 0');
                          return;
                        }
                        if (!expenseForm.date) {
                          setExpenseError('Select a date');
                          return;
                        }
                        setExpenseError('');
                        setExpenseSubmitting(true);
                        try {
                          const created = await addExpense({
                            category: expenseForm.category,
                            description: expenseForm.description,
                            amount: amt,
                            date: expenseForm.date,
                          });
                          setExpenses(prev => [created, ...prev]);
                          setExpensesTotal(prev => prev + created.amount);
                          setExpenseForm(f => ({ ...f, description: '', amount: '' }));
                        } catch (err: any) {
                          setExpenseError(err.message ?? 'Failed to save expense');
                        } finally {
                          setExpenseSubmitting(false);
                        }
                      }}
                      className="btn-primary w-full py-3 rounded-xl disabled:opacity-50"
                    >
                      {expenseSubmitting ? 'Saving...' : 'Add Expense'}
                    </button>
                  </div>

                  {/* Category Breakdown */}
                  {expenses.length > 0 && (() => {
                    const catLabels: Record<string, string> = {
                      internet: 'Internet', water: 'Water', electricity: 'Electricity', maintenance: 'Maintenance',
                      game_dvd: 'Game DVD', psn: 'PSN Sub', salary: 'Salary', other: 'Other',
                    };
                    const breakdown = expenses.reduce<Record<string, number>>((acc, e) => {
                      acc[e.category] = (acc[e.category] ?? 0) + e.amount;
                      return acc;
                    }, {});
                    return (
                      <div className="glass-card p-6 border border-outline-variant space-y-3">
                        <h2 className="font-headline font-bold text-sm tracking-wider text-on-surface uppercase">By Category</h2>
                        {(Object.entries(breakdown) as [string, number][]).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
                          <div key={cat} className="flex items-center justify-between">
                            <span className="text-xs font-label text-on-surface-variant uppercase tracking-wider">{catLabels[cat] ?? cat}</span>
                            <span className="text-sm font-headline font-bold text-on-surface">LKR {total.toLocaleString()}</span>
                          </div>
                        ))}
                        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                          <span className="text-xs font-headline font-bold text-on-surface-variant uppercase tracking-wider">Total</span>
                          <span className="text-sm font-headline font-bold text-red-400">LKR {expensesTotal.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Expense List */}
                <div className="lg:col-span-8 glass-card border border-outline-variant overflow-hidden">
                  <div className="p-6 border-b border-white/5">
                    <h2 className="font-headline font-bold text-base tracking-wider text-on-surface uppercase flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-primary" />
                      Expense Log — {expenseMonth}
                    </h2>
                  </div>

                  {expenses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-on-surface-variant gap-3">
                      <Receipt className="w-10 h-10 opacity-20" />
                      <p className="font-headline text-xs tracking-widest uppercase">No expenses recorded for this month</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px] text-left">
                        <thead>
                          <tr className="border-b border-white/5">
                            <th className="px-4 py-3 text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.15em] uppercase">Date</th>
                            <th className="px-4 py-3 text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.15em] uppercase">Category</th>
                            <th className="px-4 py-3 text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.15em] uppercase">Description</th>
                            <th className="px-4 py-3 text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.15em] uppercase text-right">Amount</th>
                            {isAdmin && <th className="px-6 py-3" />}
                          </tr>
                        </thead>
                        <tbody>
                          {expenses.map((exp) => {
                            const catLabels: Record<string, string> = {
                              internet: 'Internet', water: 'Water', electricity: 'Electricity', maintenance: 'Maintenance',
                              game_dvd: 'Game DVD', psn: 'PSN Sub', other: 'Other',
                            };
                            const catColors: Record<string, string> = {
                              internet: 'text-blue-400 bg-blue-400/10',
                              water: 'text-cyan-400 bg-cyan-400/10',
                              electricity: 'text-yellow-400 bg-yellow-400/10',
                              maintenance: 'text-orange-400 bg-orange-400/10',
                              game_dvd: 'text-purple-400 bg-purple-400/10',
                              psn: 'text-indigo-400 bg-indigo-400/10',
                              salary: 'text-emerald-400 bg-emerald-400/10',
                              other: 'text-on-surface-variant bg-white/5',
                            };
                            return (
                              <tr key={exp.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                                <td className="px-6 py-4 text-sm font-body text-on-surface-variant">{exp.date}</td>
                                <td className="px-6 py-4">
                                  <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold font-headline tracking-wider uppercase', catColors[exp.category] ?? 'text-on-surface-variant bg-white/5')}>
                                    {catLabels[exp.category] ?? exp.category}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-sm font-body text-on-surface">{exp.description || <span className="text-on-surface-variant/40 italic">—</span>}</td>
                                <td className="px-6 py-4 text-sm font-headline font-bold text-red-400 text-right">LKR {exp.amount.toLocaleString()}</td>
                                {isAdmin && (
                                  <td className="px-4 py-4 text-right">
                                    <button
                                      onClick={async () => {
                                        if (!adminToken) return;
                                        try {
                                          await deleteExpense(exp.id, adminToken);
                                          setExpenses(prev => prev.filter(e => e.id !== exp.id));
                                          setExpensesTotal(prev => prev - exp.amount);
                                        } catch (err: any) {
                                          console.error('Failed to delete expense:', err);
                                        }
                                      }}
                                      className="p-1.5 rounded-lg text-on-surface-variant hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                      title="Delete expense"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
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

              {/* Card Theme */}
              <div className="glass-card p-8 space-y-5">
                <h3 className="font-headline text-lg font-bold text-primary uppercase flex items-center gap-2">
                  <Monitor className="w-5 h-5" />
                  Station Card Theme
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {/* Flat */}
                  <button onClick={() => setCardTheme('flat')} className={cn("p-3 rounded-xl border-2 text-left transition-all", cardTheme === 'flat' ? "border-primary bg-primary/10" : "border-outline-variant bg-surface-container hover:border-outline")}>
                    <div className="rounded-md h-16 mb-2 bg-surface-container-high border-l-4 border-primary relative overflow-hidden">
                      <div className="p-2 flex justify-between items-start">
                        <div className="space-y-1"><div className="w-10 h-1 bg-primary/30 rounded-full" /><div className="w-8 h-2 bg-on-surface/40 rounded-sm" /></div>
                        <div className="w-10 h-2.5 bg-on-surface/50 rounded-sm" />
                      </div>
                      <div className="absolute bottom-0 left-0 w-3/5 h-0.5 bg-primary" />
                    </div>
                    <p className="font-headline text-xs font-bold text-on-surface uppercase tracking-wider">Flat</p>
                    <p className="text-[9px] text-on-surface-variant mt-0.5">Clean minimal cards</p>
                  </button>

                  {/* 3D Depth */}
                  <button onClick={() => setCardTheme('3d')} className={cn("p-3 rounded-xl border-2 text-left transition-all", cardTheme === '3d' ? "border-primary bg-primary/10" : "border-outline-variant bg-surface-container hover:border-outline")}>
                    <div className="rounded-md h-16 mb-2 bg-surface-container-high border-l-4 border-primary relative overflow-hidden" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.5), 0 0 8px rgba(105,218,255,0.12)' }}>
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, transparent 55%)' }} />
                      <div className="p-2 flex justify-between items-start">
                        <div className="space-y-1"><div className="w-10 h-1 bg-primary/40 rounded-full" /><div className="w-8 h-2 bg-on-surface/50 rounded-sm" /></div>
                        <div className="rounded px-1 py-0.5" style={{ background: 'rgba(0,0,0,0.35)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}><div className="w-10 h-2 bg-primary/60 rounded-sm" style={{ boxShadow: '0 0 5px rgba(105,218,255,0.4)' }} /></div>
                      </div>
                      <div className="absolute bottom-0 left-0 w-3/5 h-1" style={{ background: 'linear-gradient(90deg, #3e6e8a, #69daff)', boxShadow: '0 0 5px rgba(105,218,255,0.5)' }} />
                    </div>
                    <p className="font-headline text-xs font-bold text-on-surface uppercase tracking-wider">3D Depth</p>
                    <p className="text-[9px] text-on-surface-variant mt-0.5">Elevated gloss &amp; depth</p>
                  </button>

                  {/* Neon Arcade */}
                  <button onClick={() => setCardTheme('neon')} className={cn("p-3 rounded-xl border-2 text-left transition-all", cardTheme === 'neon' ? "border-primary bg-primary/10" : "border-outline-variant bg-surface-container hover:border-outline")}>
                    <div className="h-16 mb-2 relative overflow-hidden" style={{ background: '#050810', boxShadow: '0 0 0 1px rgba(105,218,255,0.2), 0 0 12px rgba(105,218,255,0.08)' }}>
                      {[0,1,2,3].map(i => <div key={i} className={`absolute w-2.5 h-2.5 ${i===0?'top-0 left-0':i===1?'top-0 right-0':i===2?'bottom-0 left-0':'bottom-0 right-0'}`} style={{ borderTop: i<2 ? '1.5px solid #69daff' : undefined, borderBottom: i>=2 ? '1.5px solid #69daff' : undefined, borderLeft: i%2===0 ? '1.5px solid #69daff' : undefined, borderRight: i%2===1 ? '1.5px solid #69daff' : undefined }} />)}
                      <div className="p-2 flex justify-between items-start">
                        <div className="space-y-1"><div className="w-10 h-0.5 bg-primary/60 rounded-full" style={{ boxShadow: '0 0 4px rgba(105,218,255,0.6)' }} /><div className="w-8 h-2 bg-on-surface/50 rounded-sm" /></div>
                        <div className="w-10 h-2.5 bg-primary/70 rounded-sm" style={{ boxShadow: '0 0 6px rgba(105,218,255,0.7)' }} />
                      </div>
                      <div className="absolute bottom-0 left-0 w-3/5 h-px bg-primary" style={{ boxShadow: '0 0 4px rgba(105,218,255,0.8)' }} />
                    </div>
                    <p className="font-headline text-xs font-bold text-on-surface uppercase tracking-wider">Neon Arcade</p>
                    <p className="text-[9px] text-on-surface-variant mt-0.5">Glowing neon brackets</p>
                  </button>

                  {/* Glassmorphism */}
                  <button onClick={() => setCardTheme('glass')} className={cn("p-3 rounded-xl border-2 text-left transition-all", cardTheme === 'glass' ? "border-primary bg-primary/10" : "border-outline-variant bg-surface-container hover:border-outline")}>
                    <div className="rounded-xl h-16 mb-2 relative overflow-hidden" style={{ background: 'rgba(105,218,255,0.05)', backdropFilter: 'blur(12px)', border: '1px solid rgba(105,218,255,0.15)' }}>
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)' }} />
                      <div className="p-2 flex justify-between items-start">
                        <div className="space-y-1"><div className="w-10 h-1 bg-primary/40 rounded-full" /><div className="w-8 h-2 bg-on-surface/40 rounded-sm" /></div>
                        <div className="w-10 h-2.5 bg-on-surface/35 rounded-sm" />
                      </div>
                      <div className="absolute bottom-0 left-0 w-3/5 h-0.5 rounded-full" style={{ background: 'linear-gradient(90deg, #1a4a5c, #69daff)' }} />
                    </div>
                    <p className="font-headline text-xs font-bold text-on-surface uppercase tracking-wider">Glass</p>
                    <p className="text-[9px] text-on-surface-variant mt-0.5">Frosted glass panels</p>
                  </button>

                  {/* Cyberpunk */}
                  <button onClick={() => setCardTheme('cyber')} className={cn("p-3 rounded-xl border-2 text-left transition-all", cardTheme === 'cyber' ? "border-primary bg-primary/10" : "border-outline-variant bg-surface-container hover:border-outline")}>
                    <div className="h-16 mb-2 relative overflow-hidden" style={{ background: '#090b13', clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)', borderLeft: '3px solid #69daff' }}>
                      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, #69daff, transparent)' }} />
                      <div className="absolute top-0 right-0 w-3 h-3" style={{ background: '#04050a', clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
                      <div className="p-2 flex justify-between items-start">
                        <div className="space-y-1"><div className="w-12 h-0.5 bg-primary/60" /><div className="w-8 h-2 bg-on-surface/50" /></div>
                        <div className="w-10 h-2.5 bg-primary/50" />
                      </div>
                      <div className="absolute bottom-0 left-0 w-3/5 h-0.5 bg-primary" />
                    </div>
                    <p className="font-headline text-xs font-bold text-on-surface uppercase tracking-wider">Cyberpunk</p>
                    <p className="text-[9px] text-on-surface-variant mt-0.5">Angular diagonal cuts</p>
                  </button>

                  {/* Terminal */}
                  <button onClick={() => setCardTheme('terminal')} className={cn("p-3 rounded-xl border-2 text-left transition-all", cardTheme === 'terminal' ? "border-primary bg-primary/10" : "border-outline-variant bg-surface-container hover:border-outline")}>
                    <div className="h-16 mb-2 relative overflow-hidden" style={{ background: '#000', border: '1px solid rgba(105,218,255,0.2)', fontFamily: "'JetBrains Mono', monospace" }}>
                      <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)' }} />
                      <div className="p-2 relative z-10 space-y-1">
                        <div className="text-[8px]" style={{ color: 'rgba(105,218,255,0.35)' }}>{'> STATION_INFO'}</div>
                        <div className="text-[8px] font-bold" style={{ color: '#69daff' }}>{'$ PS5-01 [IN_SESSION]'}</div>
                        <div className="text-[8px]" style={{ color: 'rgba(105,218,255,0.4)' }}>{'  [████████░░░░]'}</div>
                      </div>
                    </div>
                    <p className="font-headline text-xs font-bold text-on-surface uppercase tracking-wider">Terminal</p>
                    <p className="text-[9px] text-on-surface-variant mt-0.5">CLI mono display</p>
                  </button>

                  {/* Retro Wave */}
                  <button onClick={() => setCardTheme('retro')} className={cn("p-3 rounded-xl border-2 text-left transition-all", cardTheme === 'retro' ? "border-primary bg-primary/10" : "border-outline-variant bg-surface-container hover:border-outline")}>
                    <div className="rounded-md h-16 mb-2 relative overflow-hidden" style={{ background: '#0d0516', borderLeft: '3px solid #ff2d9c', boxShadow: '0 0 10px rgba(255,45,156,0.1)' }}>
                      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,45,156,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,45,156,0.1) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #ff2d9c, transparent)' }} />
                      <div className="p-2 flex justify-between items-start relative z-10">
                        <div className="space-y-1"><div className="w-10 h-1 italic" style={{ background: '#ff2d9c55', borderRadius: 0 }} /><div className="w-8 h-2 bg-on-surface/40" /></div>
                        <div className="w-10 h-2.5 italic" style={{ background: '#ff6ed866' }} />
                      </div>
                      <div className="absolute bottom-0 left-0 w-3/5 h-0.5" style={{ background: 'linear-gradient(90deg, #5a0032, #ff2d9c)', boxShadow: '0 0 5px rgba(255,45,156,0.6)' }} />
                    </div>
                    <p className="font-headline text-xs font-bold text-on-surface uppercase tracking-wider">Retro Wave</p>
                    <p className="text-[9px] text-on-surface-variant mt-0.5">Grid lines &amp; neon pink</p>
                  </button>

                  {/* Minimal */}
                  <button onClick={() => setCardTheme('minimal')} className={cn("p-3 rounded-xl border-2 text-left transition-all", cardTheme === 'minimal' ? "border-primary bg-primary/10" : "border-outline-variant bg-surface-container hover:border-outline")}>
                    <div className="rounded-md h-16 mb-2 relative overflow-hidden" style={{ background: '#0c0e17', borderLeft: '2px solid rgba(105,218,255,0.3)', border: '1px solid rgba(255,255,255,0.04)', borderLeftWidth: '2px', borderLeftColor: 'rgba(105,218,255,0.3)' }}>
                      <div className="p-2 flex justify-between items-start">
                        <div className="space-y-1.5"><div className="w-8 h-0.5 bg-primary/30 rounded-full" /><div className="w-10 h-2 bg-on-surface/40 rounded-sm" /><div className="flex items-center gap-1"><div className="w-1 h-1 rounded-full bg-primary/40" /><div className="w-8 h-0.5 bg-on-surface-variant/25 rounded-full" /></div></div>
                        <div className="space-y-1 text-right"><div className="w-6 h-0.5 bg-on-surface-variant/20 rounded-full ml-auto" /><div className="w-10 h-2 bg-on-surface/35 rounded-sm" /></div>
                      </div>
                      <div className="absolute bottom-0 left-0 w-3/5 h-px" style={{ background: 'rgba(105,218,255,0.25)' }} />
                    </div>
                    <p className="font-headline text-xs font-bold text-on-surface uppercase tracking-wider">Minimal</p>
                    <p className="text-[9px] text-on-surface-variant mt-0.5">Ultra-clean typography</p>
                  </button>
                </div>
              </div>

              {/* Cafe Branding */}
              <div className="glass-card p-8 space-y-6 relative">
                {!isAdmin && (
                  <div className="absolute inset-0 z-10 bg-background/40 backdrop-blur-[2px] flex items-center justify-center">
                    <div className="bg-surface-container-high p-4 border border-outline-variant shadow-xl flex flex-col items-center gap-2">
                      <Lock className="w-8 h-8 text-primary" />
                      <p className="font-headline font-bold text-sm text-on-surface uppercase">Admin Access Required</p>
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">Login to change branding</p>
                    </div>
                  </div>
                )}
                <h3 className="font-headline text-lg font-bold text-primary uppercase flex items-center gap-2">
                  <Gamepad2 className="w-5 h-5" />
                  Cafe Branding
                </h3>

                {/* Preview */}
                <div className="flex items-center gap-4 p-4 bg-surface-container border border-outline-variant">
                  {cafeLogoUrl
                    ? <img src={cafeLogoUrl} alt={cafeName} className="w-12 h-12 object-contain object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    : <div className="w-12 h-12 bg-surface-container-highest flex items-center justify-center"><Gamepad2 className="w-6 h-6 text-on-surface-variant" /></div>
                  }
                  <div>
                    <p className="font-headline font-bold text-on-surface uppercase tracking-tight">{cafeName}</p>
                    <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">Live preview</p>
                  </div>
                </div>

                {/* Cafe Name */}
                <div>
                  <label className="block text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-2">Cafe Name</label>
                  <input
                    type="text"
                    value={cafeName}
                    onChange={(e) => setCafeName(e.target.value)}
                    disabled={!isAdmin}
                    maxLength={80}
                    placeholder="e.g. Nextgen Gaming"
                    className="w-full bg-surface-container border border-outline-variant px-4 py-2.5 text-sm font-headline text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Logo URL */}
                <div>
                  <label className="block text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-2">Logo URL <span className="normal-case font-normal">(https://...)</span></label>
                  <input
                    type="url"
                    value={cafeLogoUrl}
                    onChange={(e) => setCafeLogoUrl(e.target.value)}
                    disabled={!isAdmin}
                    placeholder="https://..."
                    className="w-full bg-surface-container border border-outline-variant px-4 py-2.5 text-sm font-headline text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                <button
                  disabled={!isAdmin || !cafeName.trim()}
                  onClick={async () => {
                    if (!adminToken) return;
                    try {
                      await saveSettings(adminToken, { cafe_name: cafeName.trim(), cafe_logo_url: cafeLogoUrl.trim() });
                    } catch (err) {
                      console.error('Failed to save branding:', err);
                    }
                  }}
                  className="btn-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  Save Branding
                </button>
              </div>

              <div className="glass-card p-8 space-y-10">
                {/* General Config */}
                <div className="space-y-4">
                  <h3 className="font-headline text-lg font-bold text-primary uppercase flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    General Configuration
                  </h3>
                  <div className="grid gap-4">
                    {/* Auto-End Sessions */}
                    <div className="flex items-center justify-between p-4 bg-surface-container rounded-lg">
                      <div>
                        <p className="font-headline font-bold text-sm text-on-surface uppercase tracking-wide">Auto-End Sessions</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">Automatically close sessions when grace period expires</p>
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
                          "w-12 h-6 rounded-full relative cursor-pointer transition-colors shrink-0",
                          autoEndSessions ? "bg-primary" : "bg-surface-container-highest"
                        )}
                      >
                        <motion.div
                          animate={{ x: autoEndSessions ? 24 : 4 }}
                          className="absolute top-1 w-4 h-4 bg-on-primary rounded-full shadow-md"
                        />
                      </div>
                    </div>

                    {/* Grace Period */}
                    <div className="flex items-center justify-between p-4 bg-surface-container rounded-lg">
                      <div>
                        <div className="flex items-center gap-2">
                          <Hourglass className="w-4 h-4 text-amber-400" />
                          <p className="font-headline font-bold text-sm text-on-surface uppercase tracking-wide">Grace Period</p>
                        </div>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          Extra time after session expires before auto-ending
                          {gracePeriodMinutes === 0 && <span className="ml-1 text-on-surface-variant/50">(disabled)</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {[0, 5, 10, 15, 20, 30].map(mins => (
                          <button
                            key={mins}
                            onClick={() => {
                              setGracePeriodMinutes(mins);
                              if (isAdmin && adminToken) {
                                saveSettings(adminToken, { grace_period_minutes: mins })
                                  .catch(err => console.error('Failed to persist grace period:', err));
                              }
                            }}
                            className={cn(
                              "px-2.5 py-1 rounded-md font-headline text-[10px] font-bold transition-all",
                              gracePeriodMinutes === mins
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                                : "bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-transparent"
                            )}
                          >
                            {mins === 0 ? 'Off' : `${mins}m`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pricing Config */}
                <div className="space-y-6 relative">
                  {!isAdmin && (
                    <div className="absolute inset-0 z-10 bg-background/40 backdrop-blur-[2px] flex items-center justify-center">
                      <div className="bg-surface-container-high p-4 border border-outline-variant shadow-xl flex flex-col items-center gap-2">
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
                      <div className="bg-surface-container overflow-x-auto border border-outline-variant shadow-xl">
                        <table className="w-full min-w-[560px] text-left border-collapse">
                          <thead>
                            <tr className="bg-surface-container-high">
                              <th className="p-4 text-xs font-bold text-on-surface-variant uppercase border-b border-white/10">Duration</th>
                              {(['single', 'duo', 'trio', 'squad'] as const).map(tier => (
                                <th key={tier} className="p-4 text-xs font-bold text-primary uppercase border-b border-white/10 text-right">{tier}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {!pricingSlots?.['PS5']?.['single'] ? (
                              <tr><td colSpan={5} className="p-4 text-center text-on-surface-variant text-sm">Loading slot prices...</td></tr>
                            ) : (
                              Object.keys(pricingSlots['PS5']['single'])
                                .map(Number)
                                .sort((a, b) => a - b)
                                .map(mins => {
                                  const label = mins < 60 ? `${mins} min` : mins % 60 === 0 ? `${mins / 60} hr` : `${Math.floor(mins / 60)}.5 hr`;
                                  return (
                                    <tr key={mins} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                                      <td className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-widest">{label}</td>
                                      {(['single', 'duo', 'trio', 'squad'] as const).map(tier => (
                                        <td key={tier} className="p-3">
                                          <div className="relative">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-primary/40">LKR</span>
                                            <input
                                              type="number"
                                              value={pricingSlots['PS5'][tier]?.[mins] ?? 0}
                                              onChange={(e) => {
                                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                                setPricingSlots(prev => ({
                                                  ...prev!,
                                                  PS5: { ...prev!['PS5'], [tier]: { ...prev!['PS5'][tier], [mins]: val } },
                                                }));
                                              }}
                                              disabled={!isAdmin}
                                              className="bg-surface-container-low border border-primary/20 rounded-lg pl-8 pr-1 py-2 w-full text-sm font-black text-on-surface text-right focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all disabled:opacity-50"
                                            />
                                          </div>
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* PS4 Pricing */}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-secondary">
                          <Gamepad2 className="w-6 h-6" />
                          <h4 className="font-headline font-bold text-lg uppercase tracking-wider">PlayStation 4 Pricing Matrix</h4>
                        </div>
                        <span className="text-[10px] font-bold text-secondary/60 uppercase tracking-widest border border-secondary/20 px-2 py-1">Custom Slot Pricing</span>
                      </div>
                      <div className="bg-surface-container overflow-x-auto border border-outline-variant shadow-xl">
                        <table className="w-full min-w-[560px] text-left border-collapse">
                          <thead>
                            <tr className="bg-surface-container-high">
                              <th className="p-4 text-xs font-bold text-on-surface-variant uppercase border-b border-white/10">Duration</th>
                              {(['single', 'duo', 'trio', 'squad'] as const).map(tier => (
                                <th key={tier} className="p-4 text-xs font-bold text-secondary uppercase border-b border-white/10 text-right">{tier}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {!pricingSlots?.['PS4']?.['single'] ? (
                              <tr><td colSpan={5} className="p-4 text-center text-on-surface-variant text-sm">Loading slot prices...</td></tr>
                            ) : (
                              Object.keys(pricingSlots['PS4']['single'])
                                .map(Number)
                                .sort((a, b) => a - b)
                                .map(mins => {
                                  const label = mins < 60 ? `${mins} min` : mins % 60 === 0 ? `${mins / 60} hr` : `${Math.floor(mins / 60)}.5 hr`;
                                  return (
                                    <tr key={mins} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                                      <td className="p-4 text-xs font-bold text-on-surface-variant uppercase tracking-widest">{label}</td>
                                      {(['single', 'duo', 'trio', 'squad'] as const).map(tier => (
                                        <td key={tier} className="p-3">
                                          <div className="relative">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-secondary/40">LKR</span>
                                            <input
                                              type="number"
                                              value={pricingSlots['PS4'][tier]?.[mins] ?? 0}
                                              onChange={(e) => {
                                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                                setPricingSlots(prev => ({
                                                  ...prev!,
                                                  PS4: { ...prev!['PS4'], [tier]: { ...prev!['PS4'][tier], [mins]: val } },
                                                }));
                                              }}
                                              disabled={!isAdmin}
                                              className="bg-surface-container-low border border-secondary/20 rounded-lg pl-8 pr-1 py-2 w-full text-sm font-black text-on-surface text-right focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary/50 transition-all disabled:opacity-50"
                                            />
                                          </div>
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                })
                            )}
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
                        className="btn-primary px-8 py-3 rounded-xl active:scale-95 flex items-center gap-2"
                      >
                        <Save className="w-5 h-5" />
                        Save Changes
                      </button>
                    </div>
                  )}

                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* FAB */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => setShowAddStation(true)}
          className="fixed bottom-24 right-6 md:bottom-8 md:right-8 w-14 h-14 bg-primary text-on-primary rounded-xl shadow-[0_0_20px_rgba(105,218,255,0.5)] flex items-center justify-center active:scale-90 transition-transform z-40"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Session Setup Modal */}
      <AnimatePresence>
        {setupStation && (
          <SessionSetupModal
            station={setupStation}
            slots={pricingSlots}
            onClose={() => setSetupStation(null)}
            onStartTimer={(players, startTime, endTime) => {
              setConfirmSessionData({ stationId: setupStation.id, players, startTime, endTime });
              setSetupStation(null);
            }}
          />
        )}

        {adjustStation && (
          <AdjustPlayersModal
            station={adjustStation}
            onClose={() => setAdjustStation(null)}
            onConfirm={(players) => handleAdjustPlayers(adjustStation, players)}
          />
        )}

        {swapStation && (
          <SwapSessionModal
            station={swapStation}
            availableStations={stations.filter(s => s.status === 'available')}
            onClose={() => setSwapStation(null)}
            onConfirm={(toId) => handleSwapSession(swapStation.id, toId)}
          />
        )}

        {terminateStation && (
          <TerminateSessionModal
            stationId={terminateStation.id}
            onClose={() => setTerminateStation(null)}
            onConfirm={(reason) => handleTerminateSession(terminateStation.id, reason)}
          />
        )}

        {extendStation && (
          <ExtendSessionModal
            station={extendStation}
            onClose={() => setExtendStation(null)}
            onConfirm={(minutes) => handleExtendSession(extendStation, minutes)}
          />
        )}

        {showAddStation && (
          <AddStationModal
            onClose={() => setShowAddStation(false)}
            onConfirm={handleAddStation}
          />
        )}

        {confirmSessionData && (
          <StartSessionConfirmationModal
            stationId={confirmSessionData.stationId}
            onClose={() => setConfirmSessionData(null)}
            onConfirm={async () => {
              const { stationId, players, startTime, endTime } = confirmSessionData;
              try {
                const data = await startSession(stationId, players, startTime, endTime);
                setStations(prev => prev.map(s => {
                  if (s.id !== stationId) return s;
                  const rem = data.durationSeconds;
                  const h = String(Math.floor(rem / 3600)).padStart(2, '0');
                  const m = String(Math.floor((rem % 3600) / 60)).padStart(2, '0');
                  const sec = String(rem % 60).padStart(2, '0');
                  return {
                    ...s,
                    status: 'busy' as const,
                    players: data.players,
                    totalSeconds: rem,
                    remainingSeconds: rem,
                    remainingTime: `${h}:${m}:${sec}`,
                  };
                }));
              } catch (err) {
                console.error('Failed to start session:', err);
                alert('Failed to start session. Please try again.');
              }
              setConfirmSessionData(null);
            }}
          />
        )}

        {/* Export Range Modal */}
        <AnimatePresence>
          {showExportModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
              onClick={() => setShowExportModal(false)}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 8 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                onClick={(e) => e.stopPropagation()}
                className="glass-card border border-outline-variant p-6 w-full max-w-sm shadow-[0_0_40px_rgba(105,218,255,0.08)]"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="font-headline font-bold text-lg uppercase tracking-wider">Export Report</h2>
                    <p className="text-xs text-on-surface-variant font-label tracking-widest uppercase mt-0.5">Select date range</p>
                  </div>
                  <button onClick={() => setShowExportModal(false)} className="text-on-surface-variant hover:text-on-surface transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-1.5">From</label>
                    <input
                      type="date"
                      value={exportFrom}
                      onChange={(e) => setExportFrom(e.target.value)}
                      className="w-full bg-surface-container border border-outline-variant px-4 py-2.5 text-sm font-headline text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-1.5">To</label>
                    <input
                      type="date"
                      value={exportTo}
                      onChange={(e) => setExportTo(e.target.value)}
                      className="w-full bg-surface-container border border-outline-variant px-4 py-2.5 text-sm font-headline text-on-surface focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                  </div>
                </div>

                <button
                  onClick={handleExportRange}
                  disabled={exporting || !exportFrom || !exportTo}
                  className="w-full mt-6 flex items-center justify-center gap-2 bg-primary text-on-primary font-headline font-bold text-sm tracking-widest uppercase py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {exporting ? 'Exporting...' : 'Download CSV'}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
        className="bg-surface-container-high p-8 w-full max-w-sm border border-outline-variant shadow-2xl"
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 border border-primary/30 flex items-center justify-center">
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
                "w-full bg-surface-container-low border px-4 py-4 text-center text-2xl font-black tracking-[1em] focus:outline-none transition-all",
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
                className="btn-primary flex-1 px-4 py-3 rounded-xl text-xs active:scale-95 disabled:opacity-60 disabled:cursor-wait"
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
  slots?: PricingSlots | null;
  onStart: () => void;
  onEnd: () => void;
  onExtend: () => void;
  onAdjustPlayers: () => void;
  onTerminate: () => void;
  onCollect: () => void;
  onPrint: () => void;
  onDelete?: () => void;
  onSwap?: () => void;
  isAdmin?: boolean;
  cardTheme?: CardTheme;
  gracePeriodMinutes?: number;
}

const StationCard: React.FC<StationCardProps> = ({ station, slots, onStart, onEnd, onExtend, onAdjustPlayers, onTerminate, onCollect, onPrint, onDelete, onSwap, isAdmin, cardTheme = 'flat', gracePeriodMinutes = 0 }) => {
  const isPS5 = station.type === 'PS5';
  const isBusy = station.status === 'busy';
  const isCompleted = station.status === 'completed';
  const isAvailable = !isBusy && !isCompleted;

  const progress = isBusy && station.totalSeconds && station.remainingSeconds
    ? (station.remainingSeconds / station.totalSeconds) * 100
    : 0;

  const isWarningTime = isBusy && station.remainingTime?.startsWith('00:0') && (station.remainingSeconds ?? 0) >= 0;
  const isInGrace = isBusy && (station.remainingSeconds ?? 0) < 0 && Math.abs(station.remainingSeconds ?? 0) <= gracePeriodMinutes * 60;
  const isOvertime = isBusy && (station.remainingSeconds ?? 0) < 0 && !isInGrace;

  // Real-time accrued revenue: proportional cost based on elapsed time
  const accruedRevenue = (() => {
    if (!isBusy || !station.totalSeconds || station.remainingSeconds === undefined) return 0;
    const playerType = station.players === 4 ? 'squad' : station.players === 3 ? 'trio' : station.players === 2 ? 'duo' : 'single';
    const r = station.rates[playerType];
    const totalMins = Math.round(station.totalSeconds / 60);
    let totalCost = 0;
    const tierSlots = slots?.[station.type]?.[playerType];
    if (tierSlots) {
      const GRACE = 5;
      let billedMins = totalMins;
      for (const m of Object.keys(tierSlots).map(Number).sort((a, b) => a - b)) {
        if (totalMins > m && totalMins <= m + GRACE) { billedMins = m; break; }
      }
      for (const m of Object.keys(tierSlots).map(Number).sort((a, b) => a - b)) {
        if (m <= billedMins) totalCost = tierSlots[m];
      }
    } else if (totalMins <= 30 && r.thirtyMin) {
      totalCost = r.thirtyMin;
    } else if (totalMins === 180 && r.threeHour) {
      totalCost = r.threeHour;
    } else if (totalMins === 300 && r.fiveHour) {
      totalCost = r.fiveHour;
    } else {
      totalCost = (r.hourly * totalMins) / 60;
    }
    const elapsed = station.totalSeconds - Math.max(station.remainingSeconds, 0);
    return Math.floor((totalCost * elapsed) / station.totalSeconds);
  })();

  const colorRgb = isPS5 ? '105,218,255' : '129,151,255';
  const accentColor = isPS5 ? '#69daff' : '#8197ff';
  const accentDim   = isPS5 ? '#1a4a5c' : '#1a2466';

  // ── 3D THEME ──────────────────────────────────────────────────────────────
  if (cardTheme === '3d') {
    const borderColor = isCompleted ? '#ff716c' : isBusy ? accentColor : `${accentColor}44`;
    const cardShadow = isBusy || isCompleted
      ? `0 0 0 1px rgba(255,255,255,0.06), 0 1px 0 rgba(255,255,255,0.08) inset, 0 4px 8px rgba(0,0,0,0.4), 0 12px 28px rgba(0,0,0,0.55), 0 4px 20px rgba(${colorRgb},0.2)`
      : `0 0 0 1px rgba(255,255,255,0.04), 0 1px 0 rgba(255,255,255,0.06) inset, 0 4px 8px rgba(0,0,0,0.3), 0 10px 24px rgba(0,0,0,0.45)`;

    return (
      <motion.div
        layout
        whileHover={{ y: -6 }}
        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        className={cn(
          "group relative rounded-xl overflow-hidden",
          isPS5 ? "bg-surface-container-high" : "bg-surface-container",
          isAvailable && "opacity-80 hover:opacity-100"
        )}
        style={{ boxShadow: cardShadow, borderLeft: `6px solid ${borderColor}` }}
      >
        {/* Gloss highlight overlay */}
        <div className="absolute inset-0 pointer-events-none rounded-xl z-10"
          style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 40%, transparent 60%)' }}
        />

        {/* Completion pulse */}
        {isCompleted && (
          <motion.div className="absolute inset-0 bg-error/[0.06] pointer-events-none z-10"
            animate={{ opacity: [0.3, 0.9, 0.3] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {/* Top section */}
        <div className="p-6 flex justify-between items-start relative z-20">
          <div className="flex flex-col gap-1">
            <span className={cn("font-headline text-xs tracking-widest font-bold", isPS5 ? "text-primary/70" : "text-secondary/70")}>
              {isPS5 ? 'Next-Gen Station' : 'Classic Station'}
            </span>
            <h4 className="font-headline text-3xl font-black text-on-surface tracking-tighter"
              style={isBusy ? { textShadow: `0 0 20px rgba(${colorRgb},0.15)` } : {}}>
              {station.id}
            </h4>
            <div className={cn("text-[10px] font-bold mt-1 uppercase tracking-tighter", isPS5 ? "text-primary/60" : "text-secondary/60")}>
              1hr: Rs. {station.rates.single.hourly} (S) / {station.rates.duo.hourly} (D)
            </div>
            <div className={cn(
              "mt-4 flex items-center gap-2 px-3 py-1 rounded-md w-fit border",
              isCompleted ? "bg-error/10 border-error/20"
              : isBusy ? "bg-error/10 border-error/20"
              : isPS5 ? "bg-primary/10 border-primary/20"
              : "bg-secondary/10 border-secondary/20"
            )}>
              <span className={cn("w-2 h-2 rounded-full",
                isCompleted ? "bg-error animate-pulse"
                : isBusy ? (isWarningTime ? "bg-error animate-pulse" : "bg-error")
                : isPS5 ? "bg-primary" : "bg-secondary"
              )} />
              <span className={cn("font-headline text-[10px] font-bold tracking-widest uppercase",
                isCompleted ? "text-error" : isBusy ? "text-error" : isPS5 ? "text-primary" : "text-secondary"
              )}>
                {isCompleted ? 'Payment Due' : isBusy ? 'Busy' : 'Available'}
              </span>
            </div>
          </div>

          {/* Inset "screen" display */}
          <div
            className={cn("text-right shrink-0 px-4 py-3 rounded-lg", isAvailable && "opacity-30")}
            style={{ background: 'rgba(0,0,0,0.38)', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)' }}
          >
            <p className={cn("font-headline text-[10px] uppercase tracking-widest mb-1",
              isWarningTime || isCompleted ? "text-error" : "text-on-surface-variant"
            )}>
              {isCompleted ? 'Amount Due' : 'Remaining'}
            </p>
            <p className={cn("font-headline text-2xl font-bold tracking-tighter tabular-nums",
              isCompleted ? "text-error" : isWarningTime ? "text-error-dim" : "text-on-surface"
            )}
              style={isBusy ? { textShadow: `0 0 14px rgba(${colorRgb},0.55)` } : {}}>
              {isCompleted
                ? `Rs. ${(station.pendingRevenue ?? 0).toLocaleString()}`
                : (station.remainingTime ?? '--:--:--')}
            </p>
            {isBusy && (
              <div className="mt-2 text-right">
                {station.players && <p className="font-headline text-[9px] text-on-surface-variant">{station.players}P playing</p>}
                <p className={cn("font-headline text-sm font-bold tabular-nums mt-0.5",
                  isWarningTime ? "text-error" : isPS5 ? "text-primary" : "text-secondary"
                )}
                  style={{ textShadow: `0 0 10px rgba(${colorRgb},0.7)` }}>
                  Rs. {accruedRevenue.toLocaleString()}
                </p>
                <p className="font-headline text-[8px] text-on-surface-variant/60 uppercase tracking-wider">earned</p>
              </div>
            )}
          </div>
        </div>

        {/* Separator line with gradient */}
        <div className="mx-6" style={{ height: '1px', background: `linear-gradient(90deg, transparent, rgba(${colorRgb},0.15), transparent)` }} />

        {/* Bottom section */}
        <div className="px-6 pb-6 pt-4 flex items-center justify-between gap-4 relative z-20">
          {(isBusy || isCompleted) && station.user
            ? <div className="flex flex-col"><span className="text-[10px] text-on-surface-variant uppercase font-headline">User</span><span className="text-sm font-bold text-on-surface">{station.user}</span></div>
            : <div />
          }

          {isCompleted ? (
            <div className="flex gap-2 ml-auto">
              <button onClick={onPrint}
                className="text-on-surface-variant border border-white/10 px-4 py-2.5 rounded-xl font-headline text-xs font-bold tracking-widest uppercase hover:text-on-surface transition-all flex items-center gap-1.5"
                style={{ boxShadow: '0 3px 0 rgba(0,0,0,0.4)' }}>
                <Printer className="w-3.5 h-3.5" /> Receipt
              </button>
              <button onClick={onCollect}
                className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-headline text-xs font-bold tracking-widest uppercase active:scale-95 transition-all"
                style={{ boxShadow: `0 3px 0 ${accentDim}, 0 0 16px rgba(${colorRgb},0.35)` }}>
                Collect
              </button>
            </div>
          ) : isBusy ? (
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={onAdjustPlayers} title="Adjust players"
                className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-white/5 rounded-lg transition-colors"
                style={{ boxShadow: '0 2px 0 rgba(0,0,0,0.4)' }}>
                <Users className="w-4 h-4" />
              </button>
              <button onClick={onExtend} title="Extend"
                className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-white/5 rounded-lg transition-colors"
                style={{ boxShadow: '0 2px 0 rgba(0,0,0,0.4)' }}>
                <Plus className="w-4 h-4" />
              </button>
              <button onClick={onSwap} title="Swap station"
                className="p-2 text-on-surface-variant hover:text-primary hover:bg-white/5 rounded-lg transition-colors"
                style={{ boxShadow: '0 2px 0 rgba(0,0,0,0.4)' }}>
                <ArrowLeftRight className="w-4 h-4" />
              </button>
              <button onClick={onTerminate} title="Terminate"
                className="p-2 text-on-surface-variant hover:text-error hover:bg-error/5 rounded-lg transition-colors"
                style={{ boxShadow: '0 2px 0 rgba(0,0,0,0.4)' }}>
                <X className="w-4 h-4" />
              </button>
              <button onClick={onEnd}
                className={cn("px-6 py-2.5 rounded-xl font-headline text-xs font-bold tracking-widest uppercase transition-all active:scale-95 active:translate-y-px",
                  isPS5 ? "bg-error/20 hover:bg-error/30 text-error" : "bg-surface-container-highest text-on-surface-variant hover:text-error"
                )}
                style={{ boxShadow: '0 3px 0 rgba(0,0,0,0.5)' }}>
                End Session
              </button>
            </div>
          ) : (
            <div className="flex gap-2 ml-auto">
              {isAdmin && onDelete && (
                <button onClick={onDelete} title="Remove station"
                  className="p-2 text-on-surface-variant hover:text-error hover:bg-error/5 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={onStart}
                className={cn("px-8 py-2.5 rounded-xl font-headline text-xs font-bold tracking-widest uppercase transition-all active:scale-95 active:translate-y-px",
                  isPS5 ? "bg-primary text-on-primary" : "bg-secondary text-on-secondary"
                )}
                style={{ boxShadow: `0 3px 0 ${accentDim}, 0 0 16px rgba(${colorRgb},0.3)` }}>
                Start Session
              </button>
            </div>
          )}
        </div>

        {/* Progress bar — gradient + glow */}
        {isBusy && (
          <div className="absolute bottom-0 left-0 w-full h-1.5" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
              className="h-full"
              style={{
                background: isWarningTime ? '#d7383b' : `linear-gradient(90deg, ${accentDim}, ${accentColor})`,
                boxShadow: `0 0 8px rgba(${colorRgb},0.6)`,
              }}
            />
          </div>
        )}
      </motion.div>
    );
  }
  // ── END 3D THEME ──────────────────────────────────────────────────────────

  // ── NEON ARCADE THEME ─────────────────────────────────────────────────────
  if (cardTheme === 'neon') {
    const neonColor = accentColor;
    const neonGlow = isBusy || isCompleted
      ? `0 0 0 1px rgba(${colorRgb},0.25), 0 0 24px rgba(${colorRgb},0.12), 0 0 48px rgba(${colorRgb},0.06)`
      : `0 0 0 1px rgba(${colorRgb},0.1)`;
    return (
      <motion.div layout className="relative overflow-hidden" style={{ background: '#050810', boxShadow: neonGlow }}>
        {/* Corner L-brackets */}
        {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, i) => (
          <div key={i} className={`absolute ${pos} w-4 h-4 pointer-events-none`} style={{
            borderTop:    i < 2    ? `2px solid ${neonColor}` : undefined,
            borderBottom: i >= 2   ? `2px solid ${neonColor}` : undefined,
            borderLeft:   i % 2 === 0 ? `2px solid ${neonColor}` : undefined,
            borderRight:  i % 2 === 1 ? `2px solid ${neonColor}` : undefined,
          }} />
        ))}
        {isCompleted && <motion.div className="absolute inset-0 bg-error/[0.05] pointer-events-none" animate={{ opacity: [0.3, 0.9, 0.3] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />}

        <div className="p-6 flex justify-between items-start">
          <div className="flex flex-col gap-1">
            <span className="font-headline text-[10px] tracking-widest font-bold uppercase" style={{ color: neonColor, textShadow: `0 0 8px rgba(${colorRgb},0.8)` }}>
              {isPS5 ? '// NEXT-GEN' : '// CLASSIC'}
            </span>
            <h4 className="font-headline text-3xl font-black text-on-surface tracking-tighter">{station.id}</h4>
            <div className="text-[10px] font-bold mt-1 uppercase tracking-tighter" style={{ color: `rgba(${colorRgb},0.45)` }}>
              1hr: Rs. {station.rates.single.hourly} (S) / {station.rates.duo.hourly} (D)
            </div>
            <div className="mt-4 flex items-center gap-2 px-3 py-1 w-fit" style={{ border: `1px solid rgba(${isCompleted || isBusy ? '255,113,108' : colorRgb},0.35)`, boxShadow: `0 0 8px rgba(${isCompleted || isBusy ? '255,113,108' : colorRgb},0.15)` }}>
              <span className="w-1.5 h-1.5" style={{ background: isCompleted || isBusy ? '#ff716c' : neonColor, boxShadow: `0 0 6px ${isCompleted || isBusy ? '#ff716c' : neonColor}` }} />
              <span className="font-headline text-[10px] font-bold tracking-widest uppercase" style={{ color: isCompleted || isBusy ? '#ff716c' : neonColor, textShadow: `0 0 6px ${isCompleted || isBusy ? 'rgba(255,113,108,0.8)' : `rgba(${colorRgb},0.8)`}` }}>
                {isCompleted ? 'PAYMENT DUE' : isBusy ? (isWarningTime ? '!! WARNING !!' : 'IN SESSION') : 'STANDBY'}
              </span>
            </div>
          </div>
          <div className={cn("text-right shrink-0", isAvailable && "opacity-25")}>
            <p className="font-headline text-[10px] uppercase tracking-widest mb-1 text-on-surface-variant">
              {isCompleted ? 'Amount Due' : 'Remaining'}
            </p>
            <p className="font-headline text-3xl font-bold tracking-tighter tabular-nums" style={{ color: isCompleted || isWarningTime ? '#ff716c' : isBusy ? neonColor : '#f0f0fd', textShadow: isBusy ? `0 0 20px rgba(${colorRgb},0.7)` : undefined }}>
              {isCompleted ? `Rs. ${(station.pendingRevenue ?? 0).toLocaleString()}` : (station.remainingTime ?? '--:--:--')}
            </p>
            {isBusy && (
              <div className="mt-2 text-right">
                {station.players && <p className="font-headline text-[9px] text-on-surface-variant">{station.players}P playing</p>}
                <p className="font-headline text-sm font-bold tabular-nums mt-0.5" style={{ color: neonColor, textShadow: `0 0 12px rgba(${colorRgb},0.9)` }}>
                  Rs. {accruedRevenue.toLocaleString()}
                </p>
                <p className="font-headline text-[8px] text-on-surface-variant/60 uppercase tracking-wider">earned</p>
              </div>
            )}
          </div>
        </div>

        <div className="mx-6 h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(${colorRgb},0.35), transparent)`, boxShadow: `0 0 4px rgba(${colorRgb},0.3)` }} />

        <div className="px-6 pb-6 pt-4 flex items-center justify-between gap-4">
          {(isBusy || isCompleted) && station.user ? (
            <div className="flex flex-col"><span className="text-[10px] text-on-surface-variant uppercase font-headline">User</span><span className="text-sm font-bold text-on-surface">{station.user}</span></div>
          ) : <div />}
          {isCompleted ? (
            <div className="flex gap-2 ml-auto">
              <button onClick={onPrint} className="text-on-surface-variant border border-white/10 px-4 py-2.5 font-headline text-xs font-bold tracking-widest uppercase hover:text-on-surface transition-all flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5" /> Receipt
              </button>
              <button onClick={onCollect} className="px-6 py-2.5 font-headline text-xs font-bold tracking-widest uppercase active:scale-95 transition-all" style={{ background: neonColor, color: isPS5 ? '#004a5d' : '#001661', boxShadow: `0 0 20px rgba(${colorRgb},0.6)` }}>
                Collect
              </button>
            </div>
          ) : isBusy ? (
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={onAdjustPlayers} title="Adjust players" className="p-2 text-on-surface-variant hover:text-on-surface transition-colors"><Users className="w-4 h-4" /></button>
              <button onClick={onExtend} title="Extend" className="p-2 text-on-surface-variant hover:text-on-surface transition-colors"><Plus className="w-4 h-4" /></button>
              <button onClick={onSwap} title="Swap station" className="p-2 text-on-surface-variant hover:text-primary transition-colors"><ArrowLeftRight className="w-4 h-4" /></button>
              <button onClick={onTerminate} title="Terminate" className="p-2 text-on-surface-variant hover:text-error transition-colors"><X className="w-4 h-4" /></button>
              <button onClick={onEnd} className="px-6 py-2.5 font-headline text-xs font-bold tracking-widest uppercase transition-all active:scale-95" style={{ border: '1px solid rgba(255,113,108,0.4)', color: '#ff716c', background: 'rgba(255,113,108,0.08)', boxShadow: '0 0 10px rgba(255,113,108,0.15)' }}>
                End Session
              </button>
            </div>
          ) : (
            <div className="flex gap-2 ml-auto">
              {isAdmin && onDelete && <button onClick={onDelete} title="Remove station" className="p-2 text-on-surface-variant hover:text-error transition-colors"><Trash2 className="w-4 h-4" /></button>}
              <button onClick={onStart} className="px-8 py-2.5 font-headline text-xs font-bold tracking-widest uppercase transition-all active:scale-95" style={{ background: neonColor, color: isPS5 ? '#004a5d' : '#001661', boxShadow: `0 0 20px rgba(${colorRgb},0.5)` }}>
                Start Session
              </button>
            </div>
          )}
        </div>

        {isBusy && (
          <div className="absolute bottom-0 left-0 w-full h-px" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <motion.div initial={{ width: '100%' }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} className="h-full"
              style={{ background: isWarningTime ? '#ff716c' : neonColor, boxShadow: `0 0 8px rgba(${colorRgb},0.9)` }} />
          </div>
        )}
      </motion.div>
    );
  }
  // ── END NEON THEME ─────────────────────────────────────────────────────────

  // ── GLASSMORPHISM THEME ───────────────────────────────────────────────────
  if (cardTheme === 'glass') {
    return (
      <motion.div layout whileHover={{ y: -5, scale: 1.01 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        className="relative overflow-hidden rounded-2xl"
        style={{ background: `rgba(${colorRgb},0.05)`, backdropFilter: 'blur(20px)', border: `1px solid rgba(${colorRgb},0.15)`, boxShadow: isBusy || isCompleted ? `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(${colorRgb},0.08)` : '0 8px 32px rgba(0,0,0,0.3)' }}>
        {/* Glass sheen */}
        <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 50%, transparent 100%)' }} />
        {isCompleted && <motion.div className="absolute inset-0 bg-error/[0.04] pointer-events-none rounded-2xl" animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />}

        <div className="p-6 flex justify-between items-start relative z-10">
          <div className="flex flex-col gap-1">
            <span className={cn("font-headline text-xs tracking-widest font-bold", isPS5 ? "text-primary/80" : "text-secondary/80")}>
              {isPS5 ? 'Next-Gen Station' : 'Classic Station'}
            </span>
            <h4 className="font-headline text-3xl font-black text-on-surface tracking-tighter">{station.id}</h4>
            <div className={cn("text-[10px] font-bold mt-1 uppercase tracking-tighter", isPS5 ? "text-primary/55" : "text-secondary/55")}>
              1hr: Rs. {station.rates.single.hourly} (S) / {station.rates.duo.hourly} (D)
            </div>
            <div className="mt-4 flex items-center gap-2 px-3 py-1 rounded-full w-fit"
              style={{ background: isCompleted || isBusy ? 'rgba(255,113,108,0.12)' : `rgba(${colorRgb},0.1)`, backdropFilter: 'blur(8px)', border: `1px solid rgba(${isCompleted || isBusy ? '255,113,108' : colorRgb},0.2)` }}>
              <span className={cn("w-2 h-2 rounded-full", isCompleted ? "bg-error animate-pulse" : isBusy ? (isWarningTime ? "bg-error animate-pulse" : "bg-error") : isPS5 ? "bg-primary" : "bg-secondary")} />
              <span className={cn("font-headline text-[10px] font-bold tracking-widest uppercase", isCompleted ? "text-error" : isBusy ? "text-error" : isPS5 ? "text-primary" : "text-secondary")}>
                {isCompleted ? 'Payment Due' : isBusy ? 'Busy' : 'Available'}
              </span>
            </div>
          </div>
          <div className={cn("text-right shrink-0", isAvailable && "opacity-25")}>
            <p className={cn("font-headline text-xs uppercase tracking-widest mb-1", isWarningTime || isCompleted ? "text-error" : "text-on-surface-variant")}>
              {isCompleted ? 'Amount Due' : 'Remaining'}
            </p>
            <p className={cn("font-headline text-3xl font-bold tracking-tighter tabular-nums", isCompleted ? "text-error" : isWarningTime ? "text-error-dim" : "text-on-surface")}>
              {isCompleted ? `Rs. ${(station.pendingRevenue ?? 0).toLocaleString()}` : (station.remainingTime ?? '--:--:--')}
            </p>
            {isBusy && (
              <div className="mt-2 text-right">
                {station.players && <p className="font-headline text-[9px] text-on-surface-variant">{station.players}P playing</p>}
                <p className={cn("font-headline text-sm font-bold tabular-nums mt-0.5", isWarningTime ? "text-error" : isPS5 ? "text-primary" : "text-secondary")}>
                  Rs. {accruedRevenue.toLocaleString()}
                </p>
                <p className="font-headline text-[8px] text-on-surface-variant/60 uppercase tracking-wider">earned</p>
              </div>
            )}
          </div>
        </div>

        <div className="mx-6 relative z-10" style={{ height: '1px', background: `linear-gradient(90deg, transparent, rgba(${colorRgb},0.2), transparent)` }} />

        <div className="px-6 pb-6 pt-4 flex items-center justify-between gap-4 relative z-10">
          {(isBusy || isCompleted) && station.user ? (
            <div className="flex flex-col"><span className="text-[10px] text-on-surface-variant uppercase font-headline">User</span><span className="text-sm font-bold text-on-surface">{station.user}</span></div>
          ) : <div />}
          {isCompleted ? (
            <div className="flex gap-2 ml-auto">
              <button onClick={onPrint} className="text-on-surface-variant px-4 py-2.5 rounded-xl font-headline text-xs font-bold tracking-widest uppercase hover:text-on-surface transition-all flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Printer className="w-3.5 h-3.5" /> Receipt
              </button>
              <button onClick={onCollect} className={cn("px-6 py-2.5 rounded-xl font-headline text-xs font-bold tracking-widest uppercase hover:opacity-90 transition-all active:scale-95", isPS5 ? "bg-primary text-on-primary" : "bg-secondary text-on-secondary")}>
                Collect
              </button>
            </div>
          ) : isBusy ? (
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={onAdjustPlayers} title="Adjust players" className="p-2 text-on-surface-variant hover:text-on-surface transition-colors rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}><Users className="w-4 h-4" /></button>
              <button onClick={onExtend} title="Extend" className="p-2 text-on-surface-variant hover:text-on-surface transition-colors rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}><Plus className="w-4 h-4" /></button>
              <button onClick={onSwap} title="Swap station" className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}><ArrowLeftRight className="w-4 h-4" /></button>
              <button onClick={onTerminate} title="Terminate" className="p-2 text-on-surface-variant hover:text-error transition-colors rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}><X className="w-4 h-4" /></button>
              <button onClick={onEnd} className="px-6 py-2.5 rounded-xl font-headline text-xs font-bold tracking-widest uppercase transition-all active:scale-95" style={{ background: 'rgba(255,113,108,0.1)', border: '1px solid rgba(255,113,108,0.2)', color: '#ff716c' }}>
                End Session
              </button>
            </div>
          ) : (
            <div className="flex gap-2 ml-auto">
              {isAdmin && onDelete && <button onClick={onDelete} title="Remove station" className="p-2 text-on-surface-variant hover:text-error transition-colors rounded-lg"><Trash2 className="w-4 h-4" /></button>}
              <button onClick={onStart} className={cn("px-8 py-2.5 rounded-xl font-headline text-xs font-bold tracking-widest uppercase transition-all active:scale-95", isPS5 ? "bg-primary text-on-primary" : "bg-secondary text-on-secondary")} style={{ boxShadow: `0 0 20px rgba(${colorRgb},0.3)` }}>
                Start Session
              </button>
            </div>
          )}
        </div>

        {isBusy && (
          <div className="absolute bottom-0 left-0 w-full h-1 overflow-hidden" style={{ background: `rgba(${colorRgb},0.08)` }}>
            <motion.div initial={{ width: '100%' }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} className="h-full" style={{ background: isWarningTime ? '#d7383b' : `linear-gradient(90deg, ${accentDim}, ${accentColor})` }} />
          </div>
        )}
      </motion.div>
    );
  }
  // ── END GLASS THEME ───────────────────────────────────────────────────────

  // ── CYBERPUNK THEME ───────────────────────────────────────────────────────
  if (cardTheme === 'cyber') {
    const cyberClip = 'polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)';
    const buttonClip = 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)';
    return (
      <motion.div layout className="relative"
        style={{ background: '#090b13', clipPath: cyberClip, borderLeft: `4px solid ${accentColor}` }}>
        {/* Diagonal corner fill */}
        <div className="absolute top-0 right-0 w-5 h-5 pointer-events-none z-10" style={{ background: '#040508', clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
        <div className="absolute top-0 right-0 w-px h-6 pointer-events-none z-10" style={{ background: accentColor, transform: 'rotate(-45deg) translate(9px, -2px)', transformOrigin: 'top' }} />
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, ${accentColor}, rgba(${colorRgb},0.2), transparent)` }} />
        {isCompleted && <motion.div className="absolute inset-0 bg-error/[0.04] pointer-events-none" animate={{ opacity: [0.3, 0.9, 0.3] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />}

        <div className="p-5 flex justify-between items-start">
          <div className="flex flex-col gap-1">
            <span className="font-headline text-[9px] tracking-[0.25em] font-bold uppercase" style={{ color: accentColor }}>
              {isPS5 ? 'SYS::NEXT-GEN' : 'SYS::CLASSIC'}
            </span>
            <h4 className="font-headline text-3xl font-black text-on-surface tracking-tighter">{station.id}</h4>
            <div className="text-[10px] font-bold mt-1 uppercase tracking-tighter" style={{ color: `rgba(${colorRgb},0.45)` }}>
              Rs.{station.rates.single.hourly}/h(S) · Rs.{station.rates.duo.hourly}/h(D)
            </div>
            <div className="mt-3 flex items-center gap-2 px-2 py-0.5 w-fit" style={{ background: isCompleted || isBusy ? 'rgba(255,113,108,0.08)' : `rgba(${colorRgb},0.08)`, borderLeft: `2px solid ${isCompleted || isBusy ? '#ff716c' : accentColor}` }}>
              <span className="font-headline text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: isCompleted || isBusy ? '#ff716c' : accentColor }}>
                {isCompleted ? 'PAYMENT::DUE' : isBusy ? (isWarningTime ? 'TIME::CRITICAL' : 'STATUS::BUSY') : 'STATUS::IDLE'}
              </span>
            </div>
          </div>
          <div className={cn("text-right shrink-0", isAvailable && "opacity-25")}>
            <p className="font-headline text-[9px] uppercase tracking-[0.2em] mb-1" style={{ color: isWarningTime || isCompleted ? '#ff716c' : `rgba(${colorRgb},0.55)` }}>
              {isCompleted ? '// DUE' : '// REMAINING'}
            </p>
            <p className="font-headline text-3xl font-bold tracking-tighter tabular-nums" style={{ color: isCompleted || isWarningTime ? '#ff716c' : accentColor }}>
              {isCompleted ? `Rs. ${(station.pendingRevenue ?? 0).toLocaleString()}` : (station.remainingTime ?? '--:--:--')}
            </p>
            {isBusy && (
              <div className="mt-2 text-right">
                {station.players && <p className="font-headline text-[9px] text-on-surface-variant">{station.players}P</p>}
                <p className="font-headline text-sm font-bold tabular-nums mt-0.5" style={{ color: accentColor }}>Rs. {accruedRevenue.toLocaleString()}</p>
                <p className="font-headline text-[8px] uppercase tracking-wider" style={{ color: `rgba(${colorRgb},0.35)` }}>ACCRUED</p>
              </div>
            )}
          </div>
        </div>

        <div className="mx-5" style={{ height: '1px', background: `linear-gradient(90deg, ${accentColor}55, transparent)` }} />

        <div className="px-5 pb-5 pt-3 flex items-center justify-between gap-4">
          {(isBusy || isCompleted) && station.user ? (
            <div className="flex flex-col"><span className="text-[9px] uppercase tracking-[0.15em] font-headline" style={{ color: `rgba(${colorRgb},0.45)` }}>USER_ID</span><span className="text-sm font-bold text-on-surface font-headline">{station.user}</span></div>
          ) : <div />}
          {isCompleted ? (
            <div className="flex gap-2 ml-auto">
              <button onClick={onPrint} className="text-on-surface-variant border border-white/10 px-4 py-2 font-headline text-[10px] font-bold tracking-[0.15em] uppercase hover:text-on-surface transition-all flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5" /> PRINT
              </button>
              <button onClick={onCollect} className="px-6 py-2 font-headline text-[10px] font-bold tracking-[0.15em] uppercase active:scale-95 transition-all" style={{ background: accentColor, color: isPS5 ? '#004a5d' : '#001661', clipPath: buttonClip }}>
                COLLECT
              </button>
            </div>
          ) : isBusy ? (
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={onAdjustPlayers} title="Adjust players" className="p-2 text-on-surface-variant hover:text-on-surface transition-colors"><Users className="w-4 h-4" /></button>
              <button onClick={onExtend} title="Extend" className="p-2 text-on-surface-variant hover:text-on-surface transition-colors"><Plus className="w-4 h-4" /></button>
              <button onClick={onSwap} title="Swap station" className="p-2 text-on-surface-variant hover:text-primary transition-colors"><ArrowLeftRight className="w-4 h-4" /></button>
              <button onClick={onTerminate} title="Terminate" className="p-2 text-on-surface-variant hover:text-error transition-colors"><X className="w-4 h-4" /></button>
              <button onClick={onEnd} className="px-5 py-2 font-headline text-[10px] font-bold tracking-[0.15em] uppercase transition-all active:scale-95" style={{ border: '1px solid rgba(255,113,108,0.4)', color: '#ff716c', background: 'rgba(255,113,108,0.06)' }}>
                END SESSION
              </button>
            </div>
          ) : (
            <div className="flex gap-2 ml-auto">
              {isAdmin && onDelete && <button onClick={onDelete} title="Remove station" className="p-2 text-on-surface-variant hover:text-error transition-colors"><Trash2 className="w-4 h-4" /></button>}
              <button onClick={onStart} className="px-8 py-2 font-headline text-[10px] font-bold tracking-[0.15em] uppercase transition-all active:scale-95" style={{ background: accentColor, color: isPS5 ? '#004a5d' : '#001661', clipPath: buttonClip }}>
                START SESSION
              </button>
            </div>
          )}
        </div>

        {isBusy && (
          <div className="absolute bottom-0 left-0 w-full h-0.5">
            <motion.div initial={{ width: '100%' }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} className="h-full" style={{ background: isWarningTime ? '#ff716c' : accentColor }} />
          </div>
        )}
      </motion.div>
    );
  }
  // ── END CYBER THEME ───────────────────────────────────────────────────────

  // ── TERMINAL THEME ────────────────────────────────────────────────────────
  if (cardTheme === 'terminal') {
    const termColor = accentColor;
    const totalBars = 12;
    const filledBars = isBusy ? Math.round((progress / 100) * totalBars) : 0;
    const asciiBar = '[' + '█'.repeat(filledBars) + '░'.repeat(totalBars - filledBars) + ']';
    return (
      <motion.div layout className="relative overflow-hidden"
        style={{ background: '#000000', fontFamily: "'JetBrains Mono', monospace", border: `1px solid rgba(${colorRgb},0.22)` }}>
        {/* Scanlines */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 4px)', zIndex: 1 }} />
        {isCompleted && <motion.div className="absolute inset-0 bg-error/[0.04] pointer-events-none" style={{ zIndex: 2 }} animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />}

        <div className="p-5 relative z-10">
          <div className="text-[10px] mb-3" style={{ color: `rgba(${colorRgb},0.35)` }}>
            {'> STATION_INFO --id='}<span style={{ color: `rgba(${colorRgb},0.6)` }}>{station.id}</span>
          </div>
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-0.5">
              <div className="text-[10px] mb-1" style={{ color: `rgba(${colorRgb},0.45)` }}>
                {'  type:  '}<span style={{ color: termColor }}>{isPS5 ? 'PS5_NEXT_GEN' : 'PS4_CLASSIC'}</span>
              </div>
              <div className="text-2xl font-bold text-on-surface mb-1" style={{ letterSpacing: '0.04em' }}>
                <span style={{ color: `rgba(${colorRgb},0.4)` }}>$ </span>{station.id}
              </div>
              <div className="text-[10px] mb-2" style={{ color: `rgba(${colorRgb},0.35)` }}>
                {'  rate:  '}<span style={{ color: `rgba(${colorRgb},0.65)` }}>Rs.{station.rates.single.hourly}/h · Rs.{station.rates.duo.hourly}/h(d)</span>
              </div>
              <div className="text-[10px] px-2 py-0.5 w-fit" style={{
                background: isCompleted || isBusy ? 'rgba(255,113,108,0.08)' : `rgba(${colorRgb},0.07)`,
                border: `1px solid ${isCompleted || isBusy ? 'rgba(255,113,108,0.28)' : `rgba(${colorRgb},0.2)`}`,
                color: isCompleted || isBusy ? '#ff716c' : termColor,
              }}>
                {'['}{isCompleted ? 'PAYMENT_DUE' : isBusy ? (isWarningTime ? '!TIME_LOW!' : 'IN_SESSION') : 'AVAILABLE'}{']'}
              </div>
            </div>
            <div className={cn("text-right shrink-0", isAvailable && "opacity-25")}>
              <div className="text-[9px] mb-1" style={{ color: `rgba(${colorRgb},0.35)` }}>
                {'  '}{isCompleted ? 'pending:' : 'timer:  '}
              </div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: isCompleted || isWarningTime ? '#ff716c' : termColor, letterSpacing: '0.04em' }}>
                {isCompleted ? `Rs.${(station.pendingRevenue ?? 0).toLocaleString()}` : (station.remainingTime ?? '--:--:--')}
              </div>
              {isBusy && (
                <div className="mt-1.5 text-right">
                  {station.players && <div className="text-[9px]" style={{ color: `rgba(${colorRgb},0.35)` }}>players: {station.players}</div>}
                  <div className="text-sm font-bold tabular-nums mt-0.5" style={{ color: termColor }}>Rs. {accruedRevenue.toLocaleString()}</div>
                  <div className="text-[8px]" style={{ color: `rgba(${colorRgb},0.25)` }}>accrued</div>
                </div>
              )}
            </div>
          </div>

          {isBusy && (
            <div className="mt-3 text-[10px]" style={{ color: isWarningTime ? '#ff716c' : `rgba(${colorRgb},0.65)` }}>
              {'  prog: '}<span>{asciiBar}</span>
              <span className="ml-2" style={{ color: `rgba(${colorRgb},0.35)` }}>{Math.round(100 - progress)}% elapsed</span>
            </div>
          )}
        </div>

        <div className="mx-5 relative z-10" style={{ height: '1px', background: `rgba(${colorRgb},0.12)` }} />

        <div className="px-5 pb-4 pt-3 flex items-center justify-between gap-4 relative z-10">
          {(isBusy || isCompleted) && station.user ? (
            <div className="flex flex-col">
              <span className="text-[9px] mb-0.5" style={{ color: `rgba(${colorRgb},0.35)` }}>{'  user: '}</span>
              <span className="text-sm font-bold" style={{ color: termColor }}>{station.user}</span>
            </div>
          ) : <div />}
          {isCompleted ? (
            <div className="flex gap-2 ml-auto">
              <button onClick={onPrint} className="px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase hover:opacity-80 transition-all flex items-center gap-1.5" style={{ border: `1px solid rgba(${colorRgb},0.18)`, color: `rgba(${colorRgb},0.55)` }}>
                <Printer className="w-3 h-3" /> [PRINT]
              </button>
              <button onClick={onCollect} className="px-5 py-1.5 text-[10px] font-bold tracking-widest uppercase active:scale-95 transition-all" style={{ background: `rgba(${colorRgb},0.12)`, border: `1px solid ${termColor}`, color: termColor }}>
                [COLLECT]
              </button>
            </div>
          ) : isBusy ? (
            <div className="flex items-center gap-1.5 ml-auto">
              <button onClick={onAdjustPlayers} title="Adjust" className="p-1.5 hover:opacity-80 transition-colors" style={{ color: `rgba(${colorRgb},0.45)` }}><Users className="w-4 h-4" /></button>
              <button onClick={onExtend} title="Extend" className="p-1.5 hover:opacity-80 transition-colors" style={{ color: `rgba(${colorRgb},0.45)` }}><Plus className="w-4 h-4" /></button>
              <button onClick={onSwap} title="Swap station" className="p-1.5 hover:opacity-80 transition-colors" style={{ color: `rgba(${colorRgb},0.45)` }}><ArrowLeftRight className="w-4 h-4" /></button>
              <button onClick={onTerminate} title="Terminate" className="p-1.5 hover:text-error transition-colors" style={{ color: `rgba(${colorRgb},0.45)` }}><X className="w-4 h-4" /></button>
              <button onClick={onEnd} className="px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase transition-all active:scale-95" style={{ border: '1px solid rgba(255,113,108,0.35)', color: '#ff716c', background: 'rgba(255,113,108,0.05)' }}>
                [END]
              </button>
            </div>
          ) : (
            <div className="flex gap-2 ml-auto">
              {isAdmin && onDelete && <button onClick={onDelete} title="Remove" className="p-1.5 hover:text-error transition-colors" style={{ color: `rgba(${colorRgb},0.35)` }}><Trash2 className="w-4 h-4" /></button>}
              <button onClick={onStart} className="px-6 py-1.5 text-[10px] font-bold tracking-widest uppercase transition-all active:scale-95" style={{ background: `rgba(${colorRgb},0.09)`, border: `1px solid ${termColor}`, color: termColor }}>
                [START_SESSION]
              </button>
            </div>
          )}
        </div>
      </motion.div>
    );
  }
  // ── END TERMINAL THEME ────────────────────────────────────────────────────

  // ── RETRO WAVE THEME ──────────────────────────────────────────────────────
  if (cardTheme === 'retro') {
    const retro = isPS5
      ? { primary: '#ff2d9c', secondary: '#ff6ed8', dim: '#5a0032', bg: '#0d0516' }
      : { primary: '#bd00ff', secondary: '#d966ff', dim: '#3d0052', bg: '#0a0416' };
    return (
      <motion.div layout whileHover={{ scale: 1.01 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        className="relative overflow-hidden rounded-lg"
        style={{ background: retro.bg, borderLeft: `4px solid ${retro.primary}`, boxShadow: `0 0 20px rgba(${isPS5 ? '255,45,156' : '189,0,255'},0.1), 0 4px 16px rgba(0,0,0,0.5)` }}>
        {/* Grid overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `linear-gradient(${retro.primary}1a 1px, transparent 1px), linear-gradient(90deg, ${retro.primary}1a 1px, transparent 1px)`, backgroundSize: '24px 24px', opacity: 0.7 }} />
        {/* Horizon glow line */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${retro.primary}, transparent)` }} />
        {isCompleted && <motion.div className="absolute inset-0 bg-error/[0.04] pointer-events-none" animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />}

        <div className="p-6 flex justify-between items-start relative z-10">
          <div className="flex flex-col gap-1">
            <span className="font-headline text-[10px] tracking-widest font-bold uppercase italic" style={{ color: retro.primary, textShadow: `0 0 8px ${retro.primary}88` }}>
              {isPS5 ? '✦ NEXT-GEN' : '✦ CLASSIC'}
            </span>
            <h4 className="font-headline text-3xl font-black text-on-surface tracking-tighter italic">{station.id}</h4>
            <div className="text-[10px] font-bold mt-1 uppercase tracking-tighter italic" style={{ color: `${retro.secondary}66` }}>
              1hr: Rs. {station.rates.single.hourly} (S) / {station.rates.duo.hourly} (D)
            </div>
            <div className="mt-4 flex items-center gap-2 px-3 py-1 rounded-sm w-fit" style={{ background: `${retro.primary}12`, border: `1px solid ${retro.primary}44` }}>
              <span className="w-2 h-2 rounded-full" style={{ background: isCompleted || isBusy ? '#ff716c' : retro.primary, boxShadow: `0 0 6px ${isCompleted || isBusy ? '#ff716c' : retro.primary}` }} />
              <span className="font-headline text-[10px] font-bold tracking-widest uppercase italic" style={{ color: isCompleted || isBusy ? '#ff716c' : retro.primary }}>
                {isCompleted ? 'Payment Due' : isBusy ? 'Busy' : 'Available'}
              </span>
            </div>
          </div>
          <div className={cn("text-right shrink-0", isAvailable && "opacity-25")}>
            <p className="font-headline text-xs uppercase tracking-widest mb-1 italic" style={{ color: isWarningTime || isCompleted ? '#ff716c' : `${retro.secondary}88` }}>
              {isCompleted ? 'Amount Due' : 'Remaining'}
            </p>
            <p className="font-headline text-3xl font-bold tracking-tighter tabular-nums italic" style={{ color: isCompleted || isWarningTime ? '#ff716c' : retro.secondary }}>
              {isCompleted ? `Rs. ${(station.pendingRevenue ?? 0).toLocaleString()}` : (station.remainingTime ?? '--:--:--')}
            </p>
            {isBusy && (
              <div className="mt-2 text-right">
                {station.players && <p className="font-headline text-[9px] italic" style={{ color: `${retro.secondary}55` }}>{station.players}P playing</p>}
                <p className="font-headline text-sm font-bold tabular-nums mt-0.5 italic" style={{ color: retro.primary, textShadow: `0 0 12px ${retro.primary}88` }}>
                  Rs. {accruedRevenue.toLocaleString()}
                </p>
                <p className="font-headline text-[8px] uppercase tracking-wider italic" style={{ color: `${retro.secondary}44` }}>earned</p>
              </div>
            )}
          </div>
        </div>

        <div className="mx-6 relative z-10" style={{ height: '1px', background: `linear-gradient(90deg, transparent, ${retro.primary}55, transparent)` }} />

        <div className="px-6 pb-6 pt-4 flex items-center justify-between gap-4 relative z-10">
          {(isBusy || isCompleted) && station.user ? (
            <div className="flex flex-col"><span className="text-[10px] uppercase font-headline italic" style={{ color: `${retro.secondary}55` }}>User</span><span className="text-sm font-bold text-on-surface italic">{station.user}</span></div>
          ) : <div />}
          {isCompleted ? (
            <div className="flex gap-2 ml-auto">
              <button onClick={onPrint} className="text-on-surface-variant border border-white/10 px-4 py-2.5 rounded-sm font-headline text-xs font-bold tracking-widest uppercase hover:text-on-surface transition-all flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5" /> Receipt
              </button>
              <button onClick={onCollect} className="px-6 py-2.5 rounded-sm font-headline text-xs font-bold tracking-widest uppercase hover:opacity-90 transition-all active:scale-95 italic" style={{ background: retro.primary, color: '#fff', boxShadow: `0 0 20px ${retro.primary}55` }}>
                Collect
              </button>
            </div>
          ) : isBusy ? (
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={onAdjustPlayers} className="p-2 text-on-surface-variant hover:text-on-surface transition-colors"><Users className="w-4 h-4" /></button>
              <button onClick={onExtend} className="p-2 text-on-surface-variant hover:text-on-surface transition-colors"><Plus className="w-4 h-4" /></button>
              <button onClick={onSwap} title="Swap station" className="p-2 text-on-surface-variant hover:text-primary transition-colors"><ArrowLeftRight className="w-4 h-4" /></button>
              <button onClick={onTerminate} className="p-2 text-on-surface-variant hover:text-error transition-colors"><X className="w-4 h-4" /></button>
              <button onClick={onEnd} className="px-6 py-2.5 rounded-sm font-headline text-xs font-bold tracking-widest uppercase transition-all active:scale-95" style={{ border: '1px solid rgba(255,113,108,0.35)', color: '#ff716c', background: 'rgba(255,113,108,0.06)' }}>
                End Session
              </button>
            </div>
          ) : (
            <div className="flex gap-2 ml-auto">
              {isAdmin && onDelete && <button onClick={onDelete} className="p-2 text-on-surface-variant hover:text-error transition-colors"><Trash2 className="w-4 h-4" /></button>}
              <button onClick={onStart} className="px-8 py-2.5 rounded-sm font-headline text-xs font-bold tracking-widest uppercase transition-all active:scale-95 italic" style={{ background: retro.primary, color: '#fff', boxShadow: `0 0 20px ${retro.primary}44` }}>
                Start Session
              </button>
            </div>
          )}
        </div>

        {isBusy && (
          <div className="absolute bottom-0 left-0 w-full h-1" style={{ background: `${retro.primary}1a` }}>
            <motion.div initial={{ width: '100%' }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} className="h-full" style={{ background: isWarningTime ? '#ff716c' : `linear-gradient(90deg, ${retro.dim}, ${retro.primary})`, boxShadow: `0 0 8px ${retro.primary}88` }} />
          </div>
        )}
      </motion.div>
    );
  }
  // ── END RETRO THEME ───────────────────────────────────────────────────────

  // ── MINIMAL THEME ─────────────────────────────────────────────────────────
  if (cardTheme === 'minimal') {
    return (
      <motion.div layout whileHover={{ backgroundColor: 'rgba(255,255,255,0.018)' }}
        className="relative overflow-hidden rounded-lg transition-colors"
        style={{ background: '#0c0e17', borderLeft: `2px solid ${isCompleted ? '#ff716c' : isBusy ? accentColor : `rgba(${colorRgb},0.18)`}`, border: `1px solid rgba(255,255,255,0.04)`, borderLeftWidth: '2px', borderLeftColor: isCompleted ? '#ff716c' : isBusy ? accentColor : `rgba(${colorRgb},0.18)` }}>
        {isCompleted && <motion.div className="absolute inset-0 bg-error/[0.03] pointer-events-none" animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />}

        <div className="p-6 flex justify-between items-start">
          <div className="flex flex-col gap-1">
            <span className={cn("font-body text-[10px] tracking-widest", isPS5 ? "text-primary/45" : "text-secondary/45")}>
              {isPS5 ? 'PS5 · Next-Gen' : 'PS4 · Classic'}
            </span>
            <h4 className="font-headline text-3xl font-black text-on-surface tracking-tighter">{station.id}</h4>
            <div className={cn("text-[10px] mt-1", isPS5 ? "text-primary/35" : "text-secondary/35")}>
              Rs. {station.rates.single.hourly}/hr · {station.rates.duo.hourly}/hr (duo)
            </div>
            <div className="mt-4 flex items-center gap-1.5">
              <span className={cn("w-1.5 h-1.5 rounded-full", isCompleted ? "bg-error" : isBusy ? (isWarningTime ? "bg-error animate-pulse" : "bg-error/60") : isPS5 ? "bg-primary/50" : "bg-secondary/50")} />
              <span className={cn("font-body text-xs", isCompleted ? "text-error/80" : isBusy ? "text-error/65" : "text-on-surface-variant/50")}>
                {isCompleted ? 'Payment due' : isBusy ? 'Session active' : 'Available'}
              </span>
            </div>
          </div>
          <div className={cn("text-right shrink-0", isAvailable && "opacity-20")}>
            <p className="font-body text-[10px] text-on-surface-variant/40 mb-1">
              {isCompleted ? 'due' : 'remaining'}
            </p>
            <p className={cn("font-headline text-3xl font-bold tracking-tighter tabular-nums", isCompleted ? "text-error" : isWarningTime ? "text-error-dim" : "text-on-surface/85")}>
              {isCompleted ? `Rs. ${(station.pendingRevenue ?? 0).toLocaleString()}` : (station.remainingTime ?? '--:--:--')}
            </p>
            {isBusy && (
              <div className="mt-1.5 text-right">
                {station.players && <p className="font-body text-[9px] text-on-surface-variant/35">{station.players} players</p>}
                <p className={cn("font-headline text-sm font-bold tabular-nums mt-0.5", isPS5 ? "text-primary/60" : "text-secondary/60")}>
                  Rs. {accruedRevenue.toLocaleString()}
                </p>
                <p className="font-body text-[8px] text-on-surface-variant/25">earned</p>
              </div>
            )}
          </div>
        </div>

        <div className="mx-6" style={{ height: '1px', background: 'rgba(255,255,255,0.04)' }} />

        <div className="px-6 pb-5 pt-4 flex items-center justify-between gap-4">
          {(isBusy || isCompleted) && station.user ? (
            <div className="flex flex-col">
              <span className="font-body text-[10px] text-on-surface-variant/35">user</span>
              <span className="text-sm font-medium text-on-surface/75">{station.user}</span>
            </div>
          ) : <div />}
          {isCompleted ? (
            <div className="flex gap-2 ml-auto">
              <button onClick={onPrint} className="text-on-surface-variant/45 hover:text-on-surface-variant px-4 py-2 rounded-md font-body text-xs transition-all flex items-center gap-1.5" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                <Printer className="w-3 h-3" /> Receipt
              </button>
              <button onClick={onCollect} className={cn("px-6 py-2 rounded-md font-body text-xs font-semibold transition-all active:scale-95 hover:opacity-90", isPS5 ? "bg-primary text-on-primary" : "bg-secondary text-on-secondary")}>
                Collect
              </button>
            </div>
          ) : isBusy ? (
            <div className="flex items-center gap-1.5 ml-auto">
              <button onClick={onAdjustPlayers} className="p-2 text-on-surface-variant/35 hover:text-on-surface-variant transition-colors rounded-md"><Users className="w-4 h-4" /></button>
              <button onClick={onExtend} className="p-2 text-on-surface-variant/35 hover:text-on-surface-variant transition-colors rounded-md"><Plus className="w-4 h-4" /></button>
              <button onClick={onSwap} title="Swap station" className="p-2 text-on-surface-variant/35 hover:text-primary transition-colors rounded-md"><ArrowLeftRight className="w-4 h-4" /></button>
              <button onClick={onTerminate} className="p-2 text-on-surface-variant/35 hover:text-error transition-colors rounded-md"><X className="w-4 h-4" /></button>
              <button onClick={onEnd} className="px-5 py-2 rounded-md font-body text-xs font-medium transition-all active:scale-95" style={{ border: '1px solid rgba(255,113,108,0.18)', color: 'rgba(255,113,108,0.6)', background: 'transparent' }}>
                End
              </button>
            </div>
          ) : (
            <div className="flex gap-2 ml-auto">
              {isAdmin && onDelete && <button onClick={onDelete} className="p-2 text-on-surface-variant/35 hover:text-error transition-colors rounded-md"><Trash2 className="w-4 h-4" /></button>}
              <button onClick={onStart} className={cn("px-7 py-2 rounded-md font-body text-xs font-semibold transition-all active:scale-95 hover:opacity-80", isPS5 ? "bg-primary/12 text-primary/80 hover:bg-primary/18" : "bg-secondary/12 text-secondary/80 hover:bg-secondary/18")}>
                Start Session
              </button>
            </div>
          )}
        </div>

        {isBusy && (
          <div className="absolute bottom-0 left-0 w-full h-px" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <motion.div initial={{ width: '100%' }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} className="h-full" style={{ background: isWarningTime ? 'rgba(255,113,108,0.5)' : `rgba(${colorRgb},0.35)` }} />
          </div>
        )}
      </motion.div>
    );
  }
  // ── END MINIMAL THEME ─────────────────────────────────────────────────────

  return (
    <motion.div
      layout
      className={cn(
        "group relative rounded-xl overflow-hidden",
        isCompleted
          ? cn(isPS5 ? "bg-surface-container-high next-gen-glow" : "bg-surface-container classic-glow", "border-l-[6px] border-error")
          : isBusy
            ? isPS5
              ? "bg-surface-container-high next-gen-glow border-l-[6px] border-primary"
              : "bg-surface-container classic-glow border-l-[6px] border-secondary"
            : isPS5
              ? "bg-surface-container-high next-gen-glow border-l-[6px] border-primary/30 opacity-80 hover:opacity-100 transition-opacity"
              : "bg-surface-container classic-glow border-l-[6px] border-secondary/30 opacity-80 hover:opacity-100 transition-opacity"
      )}
    >
      {/* Completion pulse */}
      {isCompleted && (
        <motion.div
          className="absolute inset-0 bg-error/[0.04] pointer-events-none"
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Top section */}
      <div className="p-6 flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <span className={cn("font-headline text-xs tracking-widest font-bold", isPS5 ? "text-primary/70" : "text-secondary/70")}>
            {isPS5 ? 'Next-Gen Station' : 'Classic Station'}
          </span>
          <h4 className="font-headline text-3xl font-black text-on-surface tracking-tighter">{station.id}</h4>
          <div className={cn("text-[10px] font-bold mt-1 uppercase tracking-tighter", isPS5 ? "text-primary/60" : "text-secondary/60")}>
            1hr: Rs. {station.rates.single.hourly} (S) / {station.rates.duo.hourly} (D)
          </div>

          {/* Status badge */}
          <div className={cn(
            "mt-4 flex items-center gap-2 px-3 py-1 rounded-md w-fit border",
            isCompleted ? "bg-error/10 border-error/20"
            : isInGrace ? "bg-amber-500/10 border-amber-500/25"
            : isBusy ? "bg-error/10 border-error/20"
            : isPS5 ? "bg-primary/10 border-primary/20"
            : "bg-secondary/10 border-secondary/20"
          )}>
            <span className={cn(
              "w-2 h-2 rounded-full",
              isCompleted ? "bg-error animate-pulse"
              : isInGrace ? "bg-amber-400 animate-pulse"
              : isBusy ? (isWarningTime ? "bg-error animate-pulse" : "bg-error")
              : isPS5 ? "bg-primary" : "bg-secondary"
            )} />
            <span className={cn(
              "font-headline text-[10px] font-bold tracking-widest uppercase",
              isCompleted ? "text-error" : isInGrace ? "text-amber-400" : isBusy ? "text-error" : isPS5 ? "text-primary" : "text-secondary"
            )}>
              {isCompleted ? 'Payment Due' : isInGrace ? 'Grace Period' : isBusy ? 'Busy' : 'Available'}
            </span>
          </div>
        </div>

        <div className={cn("text-right shrink-0", isAvailable && "opacity-30")}>
          <p className={cn(
            "font-headline text-xs uppercase tracking-widest mb-1",
            isWarningTime || isCompleted ? "text-error" : isInGrace ? "text-amber-400" : "text-on-surface-variant"
          )}>
            {isCompleted ? 'Amount Due' : isInGrace ? 'Grace Time' : 'Remaining'}
          </p>
          <p className={cn(
            "font-headline text-3xl font-bold tracking-tighter tabular-nums",
            isCompleted ? "text-error" : isWarningTime ? "text-error-dim" : isInGrace ? "text-amber-400" : "text-on-surface"
          )}>
            {isCompleted
              ? `Rs. ${(station.pendingRevenue ?? 0).toLocaleString()}`
              : (station.remainingTime ?? '--:--:--')}
          </p>
          {isBusy && (
            <div className="mt-2 text-right">
              {station.players && (
                <p className="font-headline text-[9px] text-on-surface-variant">{station.players}P playing</p>
              )}
              <p className={cn(
                "font-headline text-sm font-bold tabular-nums mt-0.5",
                isWarningTime || isInGrace ? "text-error" : isPS5 ? "text-primary" : "text-secondary"
              )}>
                Rs. {accruedRevenue.toLocaleString()}
              </p>
              <p className="font-headline text-[8px] text-on-surface-variant/60 uppercase tracking-wider">earned</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom section */}
      <div className="px-6 pb-6 pt-2 flex items-center justify-between gap-4">
        {(isBusy || isCompleted) && station.user ? (
          <div className="flex flex-col">
            <span className="text-[10px] text-on-surface-variant uppercase font-headline">User</span>
            <span className="text-sm font-bold text-on-surface">{station.user}</span>
          </div>
        ) : <div />}

        {isCompleted ? (
          <div className="flex gap-2 ml-auto">
            <button onClick={onPrint}
              className="text-on-surface-variant border border-white/10 px-4 py-2.5 rounded-xl font-headline text-xs font-bold tracking-widest uppercase hover:text-on-surface transition-all flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5" /> Receipt
            </button>
            <button onClick={onCollect}
              className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-headline text-xs font-bold tracking-widest uppercase hover:shadow-[0_0_15px_rgba(105,218,255,0.4)] transition-all active:scale-95">
              Collect
            </button>
          </div>
        ) : isBusy ? (
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onAdjustPlayers} title="Adjust players"
              className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-white/5 rounded-lg transition-colors">
              <Users className="w-4 h-4" />
            </button>
            <button onClick={onExtend} title="Extend"
              className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-white/5 rounded-lg transition-colors">
              <Plus className="w-4 h-4" />
            </button>
            <button onClick={onSwap} title="Swap station"
              className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-lg transition-colors">
              <ArrowLeftRight className="w-4 h-4" />
            </button>
            <button onClick={onTerminate} title="Terminate"
              className="p-2 text-on-surface-variant hover:text-error hover:bg-error/5 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
            <button onClick={onEnd}
              className={cn(
                "px-6 py-2.5 rounded-xl font-headline text-xs font-bold tracking-widest uppercase transition-all active:scale-95",
                isPS5
                  ? "bg-error/20 hover:bg-error/30 text-error"
                  : "bg-surface-container-highest text-on-surface-variant hover:text-error"
              )}>
              End Session
            </button>
          </div>
        ) : (
          <div className="flex gap-2 ml-auto">
            {isAdmin && onDelete && (
              <button onClick={onDelete} title="Remove station"
                className="p-2 text-on-surface-variant hover:text-error hover:bg-error/5 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onStart}
              className={cn(
                "px-8 py-2.5 rounded-xl font-headline text-xs font-bold tracking-widest uppercase transition-all active:scale-95",
                isPS5
                  ? "bg-primary text-on-primary hover:shadow-[0_0_15px_rgba(105,218,255,0.4)]"
                  : "bg-secondary text-on-secondary hover:shadow-[0_0_15px_rgba(129,151,255,0.4)]"
              )}>
              Start Session
            </button>
          </div>
        )}
      </div>

      {/* Progress bar at bottom */}
      {isBusy && (
        <div className="absolute bottom-0 left-0 w-full h-1 bg-surface-container">
          <motion.div
            initial={{ width: '100%' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
            className={cn("h-full", isWarningTime ? "bg-error-dim" : isPS5 ? "bg-primary" : "bg-secondary")}
          />
        </div>
      )}
    </motion.div>
  );
}

function SwapSessionModal({ station, availableStations, onClose, onConfirm }: {
  station: Station;
  availableStations: Station[];
  onClose: () => void;
  onConfirm: (targetStationId: string) => void;
}) {
  const isPS5 = station.type === 'PS5';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 16 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="bg-surface-container-low border border-outline-variant w-full max-w-md shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-outline-variant">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", isPS5 ? "bg-primary/10" : "bg-secondary/10")}>
              <ArrowLeftRight className={cn("w-5 h-5", isPS5 ? "text-primary" : "text-secondary")} />
            </div>
            <div>
              <h3 className="font-headline text-base font-bold text-on-surface uppercase tracking-tight">Swap Station</h3>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Move session from <span className={cn("font-bold", isPS5 ? "text-primary" : "text-secondary")}>{station.id}</span> to another station
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-white/5 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Station list */}
        <div className="p-6">
          {availableStations.length === 0 ? (
            <div className="text-center py-8">
              <Hourglass className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="font-headline text-sm font-bold text-on-surface-variant uppercase tracking-wide">No Available Stations</p>
              <p className="text-xs text-on-surface-variant/60 mt-1">All other stations are currently busy.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-headline text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-4">Select Target Station</p>
              {availableStations.map(target => {
                const tPS5 = target.type === 'PS5';
                return (
                  <motion.button
                    key={target.id}
                    whileHover={{ x: 4 }}
                    onClick={() => onConfirm(target.id)}
                    className={cn(
                      "w-full flex items-center justify-between p-4 text-left transition-colors border",
                      tPS5
                        ? "bg-primary/5 border-primary/15 hover:bg-primary/10 hover:border-primary/30"
                        : "bg-secondary/5 border-secondary/15 hover:bg-secondary/10 hover:border-secondary/30"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", tPS5 ? "bg-primary/10" : "bg-secondary/10")}>
                        <Gamepad2 className={cn("w-5 h-5", tPS5 ? "text-primary" : "text-secondary")} />
                      </div>
                      <div>
                        <p className="font-headline text-base font-black text-on-surface tracking-tighter">{target.id}</p>
                        <p className={cn("text-[10px] font-bold uppercase tracking-widest", tPS5 ? "text-primary/60" : "text-secondary/60")}>
                          {tPS5 ? 'PlayStation 5' : 'PlayStation 4'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-full", tPS5 ? "bg-primary/15 text-primary" : "bg-secondary/15 text-secondary")}>
                        Available
                      </span>
                      <ArrowLeftRight className={cn("w-4 h-4", tPS5 ? "text-primary/50" : "text-secondary/50")} />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex justify-end">
          <button onClick={onClose} className="px-6 py-2.5 border border-outline-variant text-on-surface-variant font-headline text-xs font-bold uppercase tracking-widest hover:text-on-surface transition-colors">
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AddStationModal({ onClose, onConfirm }: {
  onClose: () => void;
  onConfirm: (id: string, type: string, pricingTemplate: 'PS5' | 'PS4') => void;
}) {
  const [stationId, setStationId] = useState('');
  const [stationType, setStationType] = useState('PS5');
  const [customType, setCustomType] = useState('');
  const [pricingTemplate, setPricingTemplate] = useState<'PS5' | 'PS4'>('PS5');
  const [error, setError] = useState('');

  const presetTypes = ['PS5', 'PS4', 'PC'];
  const finalType = stationType === 'CUSTOM' ? customType.toUpperCase() : stationType;

  const handleSubmit = () => {
    if (!stationId.trim()) { setError('Station ID is required'); return; }
    if (!/^[A-Za-z0-9_\-]{2,20}$/.test(stationId.trim())) { setError('ID: 2–20 chars, letters/numbers/dash/underscore only'); return; }
    if (stationType === 'CUSTOM' && !customType.trim()) { setError('Enter a custom type name'); return; }
    setError('');
    onConfirm(stationId.trim(), finalType, pricingTemplate);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 10, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full max-w-md bg-surface-container-low shadow-2xl border border-outline-variant p-8"
      >
        <div className="w-14 h-14 border border-primary/30 flex items-center justify-center mx-auto mb-6">
          <Plus className="w-7 h-7 text-primary" />
        </div>
        <h2 className="font-headline text-2xl font-bold text-on-surface uppercase text-center mb-1">Add Station</h2>
        <p className="text-on-surface-variant text-sm text-center mb-8">Register a new console or PC to the network</p>

        <div className="space-y-6">
          {/* Station ID */}
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Station ID</p>
            <input
              type="text"
              value={stationId}
              onChange={e => setStationId(e.target.value.toUpperCase())}
              placeholder="e.g. PS5-05, PC-01"
              className="w-full bg-surface-container-high border-2 border-white/5 focus:border-primary rounded-xl py-3 px-4 font-headline text-lg font-bold uppercase tracking-widest focus:outline-none transition-all"
            />
          </div>

          {/* Station Type */}
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Station Type</p>
            <div className="grid grid-cols-4 gap-2">
              {[...presetTypes, 'CUSTOM'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setStationType(t)}
                  className={cn(
                    'py-3 rounded-xl border font-headline text-xs font-bold uppercase transition-all',
                    stationType === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-transparent bg-surface-container-high text-on-surface-variant hover:bg-surface-bright'
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {stationType === 'CUSTOM' && (
              <input
                type="text"
                value={customType}
                onChange={e => setCustomType(e.target.value)}
                placeholder="e.g. XBOX, VR"
                className="mt-2 w-full bg-surface-container-high border-2 border-primary/30 rounded-xl py-2 px-4 font-headline text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-primary transition-all"
              />
            )}
          </div>

          {/* Pricing Template */}
          <div>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Base Pricing Template</p>
            <div className="grid grid-cols-2 gap-2">
              {(['PS5', 'PS4'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPricingTemplate(t)}
                  className={cn(
                    'py-3 rounded-xl border font-headline text-xs font-bold uppercase transition-all',
                    pricingTemplate === t
                      ? t === 'PS5' ? 'border-primary bg-primary/10 text-primary' : 'border-secondary bg-secondary/10 text-secondary'
                      : 'border-transparent bg-surface-container-high text-on-surface-variant hover:bg-surface-bright'
                  )}
                >
                  {t} Rates
                </button>
              ))}
            </div>
            <p className="text-[10px] text-on-surface-variant mt-1">Pricing can be adjusted later in Settings</p>
          </div>

          {error && <p className="text-error text-[10px] font-bold uppercase tracking-widest">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-surface-container-highest font-headline font-bold text-xs text-on-surface uppercase hover:bg-surface-bright transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="btn-primary flex-[2] py-3 rounded-xl text-xs active:scale-95"
            >
              Add Station
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ExtendSessionModal({ station, onClose, onConfirm }: { station: Station; onClose: () => void; onConfirm: (minutes: number) => void }) {
  const [selected, setSelected] = useState(30);
  const isPS5 = station.type === 'PS5';

  const options = [15, 30, 60, 90, 120];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 10, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full max-w-sm bg-surface-container-low shadow-2xl border border-outline-variant p-8"
      >
        <div className={cn("w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-6", isPS5 ? "bg-primary/20" : "bg-secondary/20")}>
          <Plus className={cn("w-7 h-7", isPS5 ? "text-primary" : "text-secondary")} />
        </div>
        <h2 className="font-headline text-2xl font-bold text-on-surface uppercase text-center mb-1">Extend Session</h2>
        <p className="text-on-surface-variant text-sm text-center mb-8">
          Add time to <span className="text-on-surface font-bold">{station.id}</span>
        </p>

        <div className="grid grid-cols-5 gap-2 mb-8">
          {options.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSelected(m)}
              className={cn(
                'flex flex-col items-center justify-center py-3 rounded-xl border transition-all',
                selected === m
                  ? isPS5 ? 'border-primary bg-primary/10 text-primary' : 'border-secondary bg-secondary/10 text-secondary'
                  : 'border-transparent bg-surface-container-high text-on-surface-variant hover:bg-surface-bright'
              )}
            >
              <span className="font-headline text-lg font-bold leading-none">{m}</span>
              <span className="font-label text-[9px] uppercase tracking-tight mt-0.5">min</span>
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-surface-container-highest font-headline font-bold text-xs text-on-surface uppercase hover:bg-surface-bright transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            className={cn(
              "flex-[2] py-3 rounded-xl text-xs active:scale-95",
              isPS5 ? "btn-primary" : "btn-secondary"
            )}
          >
            + {selected} Minutes
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface SessionSetupModalProps {
  slots: PricingSlots | null;
  station: Station;
  onClose: () => void;
  onStartTimer: (players: number, startTime: string, endTime: string) => void;
}

function AdjustPlayersModal({ station, onClose, onConfirm }: { station: Station; onClose: () => void; onConfirm: (players: number) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const current = station.players ?? 1;
  const tierLabel = (n: number) => ['', 'Single', 'Duo', 'Trio', 'Squad'][n] ?? `${n}P`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 10, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full max-w-md bg-surface-container-low shadow-2xl border border-outline-variant p-8"
      >
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="font-headline text-xl font-bold text-on-surface uppercase">Adjust Players</h2>
            <p className="text-on-surface-variant text-xs font-label uppercase tracking-wider">{station.id} — Currently {current} player{current > 1 ? 's' : ''} ({tierLabel(current)})</p>
          </div>
        </div>

        <div className="bg-surface-container rounded-xl p-4 mb-6 border border-yellow-400/20">
          <p className="text-xs text-yellow-400 font-headline font-bold uppercase tracking-wider mb-1">How billing works</p>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Revenue so far ({tierLabel(current)} rate) will be saved. The session continues and bills the remaining time at the new rate.
          </p>
        </div>

        <p className="text-[10px] font-headline font-bold text-on-surface-variant tracking-[0.2em] uppercase mb-3">Select New Player Count</p>
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              disabled={n === current}
              onClick={() => setSelected(n)}
              className={cn(
                'flex flex-col items-center py-4 rounded-xl border font-headline font-bold transition-all',
                n === current
                  ? 'border-white/5 bg-surface-container text-on-surface-variant opacity-40 cursor-not-allowed'
                  : selected === n
                  ? 'border-primary bg-primary/10 text-primary shadow-[0_0_12px_rgba(105,218,255,0.2)]'
                  : 'border-white/10 bg-surface-container hover:border-primary/40 text-on-surface'
              )}
            >
              <span className="text-2xl font-black">{n}</span>
              <span className="text-[9px] tracking-widest uppercase mt-1">{tierLabel(n)}</span>
              {n === current && <span className="text-[8px] mt-0.5 text-on-surface-variant">Current</span>}
            </button>
          ))}
        </div>

        <div className="flex gap-4">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-surface-container-highest font-headline font-bold text-on-surface hover:bg-surface-bright transition-all uppercase text-sm">
            Cancel
          </button>
          <button
            disabled={selected === null}
            onClick={() => { if (selected !== null) onConfirm(selected); }}
            className="btn-primary flex-[2] py-3 rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm Change
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
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
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 10, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full max-w-md bg-surface-container-low shadow-2xl border border-outline-variant p-8 text-center"
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
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 10, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full max-w-md bg-surface-container-low shadow-2xl border border-outline-variant p-5 sm:p-8 text-center"
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
              className="btn-primary flex-[2] py-4 px-6 rounded-xl active:scale-95"
            >
              AUTHORIZE
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SessionSetupModal({ station, slots, onClose, onStartTimer }: SessionSetupModalProps) {
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
  const tierSlots = slots?.[station.type]?.[playerType];
  if (tierSlots) {
    const GRACE = 5;
    let billedMins = duration;
    for (const m of Object.keys(tierSlots).map(Number).sort((a, b) => a - b)) {
      if (duration > m && duration <= m + GRACE) { billedMins = m; break; }
    }
    for (const m of Object.keys(tierSlots).map(Number).sort((a, b) => a - b)) {
      if (m <= billedMins) totalCost = tierSlots[m];
    }
  } else if (duration <= 30 && rates.thirtyMin) {
    totalCost = rates.thirtyMin;
  } else if (duration === 180 && rates.threeHour) {
    totalCost = rates.threeHour;
  } else if (duration === 300 && rates.fiveHour) {
    totalCost = rates.fiveHour;
  } else {
    totalCost = (cost * duration) / 60;
  }

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
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 10, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full max-w-2xl bg-surface-container-low/95 backdrop-blur-2xl shadow-2xl border border-outline-variant overflow-hidden"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-8 border-b border-white/5 bg-surface-container-low flex justify-between items-start sm:items-end gap-3">
          <div className="min-w-0">
            <span className="font-label text-primary text-xs font-bold tracking-[0.2em] uppercase mb-1 sm:mb-2 block">Tactical Override</span>
            <h1 className="font-headline text-xl sm:text-3xl font-bold tracking-tight text-on-surface uppercase leading-tight">
              Session Setup — <span className="text-primary">{station.id}</span>
            </h1>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="font-label text-on-surface-variant text-[10px] tracking-widest uppercase">System Status</span>
            <div className="flex items-center gap-2 text-primary font-bold">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              READY
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-8 space-y-6 sm:space-y-10">
          {/* Player Count */}
          <section>
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h2 className="font-headline text-base sm:text-lg font-bold flex items-center gap-2 uppercase">
                <Users className="w-5 h-5 text-primary" />
                PLAYER COUNT
              </h2>
              <span className="font-label text-[10px] text-on-surface-variant tracking-widest uppercase hidden sm:block">SELECT SQUAD SIZE</span>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:gap-4">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setPlayerCount(n)}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl transition-all border",
                    playerCount === n
                      ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(105,218,255,0.2)]"
                      : "bg-surface-container-high hover:bg-surface-bright border-transparent"
                  )}
                >
                  <span className={cn("font-headline text-xl sm:text-2xl font-bold", playerCount === n ? "text-primary" : "text-on-surface")}>
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
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h2 className="font-headline text-base sm:text-lg font-bold flex items-center gap-2 uppercase">
                <Timer className="w-5 h-5 text-secondary" />
                DURATION
              </h2>
              <span className="font-label text-[10px] text-on-surface-variant tracking-widest uppercase hidden sm:block">MISSION LENGTH</span>
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
          <section className="bg-surface-container-low rounded-xl p-4 sm:p-6 border-l-4 border-primary">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-0">
              <div className="space-y-1">
                <p className="font-label text-[10px] text-on-surface-variant tracking-[0.2em] uppercase">Total Tactical Cost</p>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-on-surface-variant font-headline text-xl">LKR</span>
                  <span className="font-headline text-4xl sm:text-5xl font-black text-on-surface tracking-tighter">{totalCost.toLocaleString()}</span>
                  {((duration <= 30 && rates.thirtyMin) || (duration === 180 && rates.threeHour) || (duration === 300 && rates.fiveHour)) && (
                    <span className="px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-bold rounded uppercase tracking-widest">
                      Special Rate
                    </span>
                  )}
                </div>
              </div>
              <div className="sm:text-right">
                <div className="flex items-center sm:justify-end gap-2 text-primary/60 font-label text-[10px] tracking-widest mb-1 uppercase">
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
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 pt-2 sm:pt-4">
            <button
              onClick={onClose}
              className="sm:flex-1 py-3 sm:py-4 px-6 rounded-xl bg-surface-container-highest font-headline font-bold text-on-surface hover:bg-surface-bright transition-all active:scale-95 uppercase"
            >
              CANCEL
            </button>
            <button
              onClick={() => { if (duration > 0) { const { startTime, endTime } = getTimePair(); onStartTimer(playerCount, startTime, endTime); } }}
              className="btn-primary sm:flex-[2] py-3 sm:py-4 px-6 rounded-xl active:scale-95 flex items-center justify-center gap-3"
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
