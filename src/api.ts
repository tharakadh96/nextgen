/**
 * Centralized API service for Nextgen Gaming backend.
 * Base URL: /api (same origin, port 7432)
 *
 * All functions throw on non-2xx responses with a descriptive Error message.
 * Callers are responsible for catch blocks.
 */

import { Station, SessionLog, RevenueData, StationType } from './types';

const BASE = '/api';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Typed rate structure returned from /api/pricing */
export interface PlatformRates {
  single: { hourly: number; thirtyMin: number; threeHour: number; fiveHour: number };
  duo:    { hourly: number; thirtyMin: number; threeHour: number; fiveHour: number };
  trio:   { hourly: number; thirtyMin: number; threeHour: number; fiveHour: number };
  squad:  { hourly: number; thirtyMin: number; threeHour: number; fiveHour: number };
}

export interface PricingData {
  ps5Rates: PlatformRates;
  ps4Rates: PlatformRates;
  minDurationPrice: number;
}

export interface SettingsData {
  auto_end_sessions: boolean;
  min_duration_price: number;
}

export interface DailyReport {
  date: string;
  totalRevenue: number;
  sessionCount: number;
  ps5Revenue: number;
  ps4Revenue: number;
  hourlyBreakdown: RevenueData[];
  platformMix: { ps5Percent: number; ps4Percent: number };
}

export interface StartSessionResponse {
  sessionId: string;
  stationId: string;
  startedAt: string;
  players: number;
  startTime: string;
  endTime: string;
  endsAt: string;
  durationSeconds: number;
  durationLabel: string;
}

export interface EndSessionResponse {
  stationId: string;
  sessionId: string;
  pendingRevenue: number;
  actualSecondsPlayed: number;
  endedAt: string;
}

export interface ExtendSessionResponse {
  stationId: string;
  endsAt: string;
  endTime: string;
  remainingSeconds: number;
  remainingTime: string;
  durationSeconds: number;
}

export interface AddStationResponse {
  id: string;
  type: string;
  status: string;
  rates: Station['rates'];
}

export interface DeleteStationResponse {
  stationId: string;
  deleted: boolean;
}

export interface TerminateSessionResponse {
  stationId: string;
  sessionId: string;
  status: string;
  terminationReason: string;
  duration: string;
  endedAt: string;
}

export interface CollectSessionResponse {
  stationId: string;
  sessionId: string;
  revenue: number;
  duration: string;
  machineId: string;
  type: StationType;
  status: string;
  players: number;
  date: string;
}

export interface VerifyPinResponse {
  success: boolean;
  token?: string;
  error?: string;
}

export interface StaffLoginResponse {
  success: boolean;
  token?: string;
  error?: string;
}

/** Authenticate as staff; returns a JWT on success. */
export async function staffLogin(username: string, password: string): Promise<StaffLoginResponse> {
  try {
    return await apiFetch<StaffLoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Login failed' };
  }
}

/** Verify that a staff JWT is still valid. */
export async function verifyStaffToken(token: string): Promise<boolean> {
  try {
    const res = await apiFetch<{ valid: boolean }>('/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.valid;
  } catch {
    return false;
  }
}

/**
 * Internal fetch wrapper. Throws a typed Error for any non-2xx response,
 * including the server's error message when available.
 */
async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const { headers: optHeaders, ...restOptions } = options ?? {};
  const response = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(optHeaders ?? {}),
    },
    ...restOptions,
  });

  if (!response.ok) {
    let message = `API error ${response.status}`;
    try {
      const body = await response.json() as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      // ignore parse failure — use the status-based message
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

/** Builds an Authorization header from an admin JWT. */
function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

/** Fetch the live state of all stations from the server. */
export async function fetchStations(): Promise<Station[]> {
  const result = await apiFetch<{ data: Station[] }>('/stations');
  return result.data;
}

/** Start a timed session on a station. */
export async function startSession(
  stationId: string,
  players: number,
  startTime: string,
  endTime: string,
): Promise<StartSessionResponse> {
  const result = await apiFetch<{ data: StartSessionResponse }>(
    `/stations/${encodeURIComponent(stationId)}/start`,
    {
      method: 'POST',
      body: JSON.stringify({ players, startTime, endTime }),
    }
  );
  return result.data;
}

/** Extend a busy session by a given number of minutes. */
export async function extendSession(stationId: string, minutes: number): Promise<ExtendSessionResponse> {
  const result = await apiFetch<{ data: ExtendSessionResponse }>(
    `/stations/${encodeURIComponent(stationId)}/extend`,
    {
      method: 'POST',
      body: JSON.stringify({ minutes }),
    }
  );
  return result.data;
}

export async function addStation(
  id: string,
  type: string,
  pricingTemplate: 'PS5' | 'PS4',
  adminToken: string,
): Promise<Station> {
  const result = await apiFetch<{ data: Station }>('/stations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ id, type, pricingTemplate }),
  });
  return result.data;
}

export async function deleteStation(stationId: string, adminToken: string): Promise<DeleteStationResponse> {
  const result = await apiFetch<{ data: DeleteStationResponse }>(
    `/stations/${encodeURIComponent(stationId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    }
  );
  return result.data;
}

/** Manually end an active session (calculates revenue server-side). */
export async function endSession(stationId: string): Promise<EndSessionResponse> {
  const result = await apiFetch<{ data: EndSessionResponse }>(
    `/stations/${encodeURIComponent(stationId)}/end`,
    { method: 'POST' }
  );
  return result.data;
}

/** Terminate a session early without collecting revenue. */
export async function terminateSession(
  stationId: string,
  reason: string
): Promise<TerminateSessionResponse> {
  const result = await apiFetch<{ data: TerminateSessionResponse }>(
    `/stations/${encodeURIComponent(stationId)}/terminate`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
  return result.data;
}

/** Collect pending revenue from a completed session; returns the new log entry. */
export async function collectSession(stationId: string): Promise<CollectSessionResponse> {
  const result = await apiFetch<{ data: CollectSessionResponse }>(
    `/stations/${encodeURIComponent(stationId)}/collect`,
    { method: 'POST' }
  );
  return result.data;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/** Fetch current pricing configuration. */
export async function fetchPricing(): Promise<PricingData> {
  const result = await apiFetch<{ data: PricingData }>('/pricing');
  return result.data;
}

/** Persist updated pricing (admin only). */
export async function savePricing(
  token: string,
  ps5Rates: PlatformRates,
  ps4Rates: PlatformRates,
  minDurationPrice?: number
): Promise<void> {
  await apiFetch<unknown>('/pricing', {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ ps5Rates, ps4Rates, ...(minDurationPrice !== undefined ? { minDurationPrice } : {}) }),
  });
}

// ---------------------------------------------------------------------------
// Logs & Reports
// ---------------------------------------------------------------------------

/** Fetch session logs for a specific date (YYYY-MM-DD). */
export async function fetchLogs(date: string): Promise<SessionLog[]> {
  const result = await apiFetch<{ data: SessionLog[] }>(
    `/logs?date=${encodeURIComponent(date)}`
  );
  return result.data;
}

/** Fetch all session logs between two dates (inclusive). */
export async function fetchLogsRange(from: string, to: string): Promise<{ data: SessionLog[]; totalRevenue: number }> {
  return apiFetch(`/logs/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

/** Fetch the daily revenue report for a specific date (YYYY-MM-DD). */
export async function fetchDailyReport(date: string): Promise<DailyReport> {
  const result = await apiFetch<{ data: DailyReport }>(
    `/reports/daily?date=${encodeURIComponent(date)}`
  );
  return result.data;
}

// ---------------------------------------------------------------------------
// Admin / Settings
// ---------------------------------------------------------------------------

/**
 * Verify the admin PIN.
 * Returns { success: true, token } on success or { success: false, error } on failure.
 * Does NOT throw on a wrong PIN — callers should check `success`.
 */
export async function verifyAdminPin(pin: string): Promise<VerifyPinResponse> {
  // This endpoint returns a non-2xx status on wrong PIN in some implementations;
  // we handle both cases gracefully.
  try {
    const result = await apiFetch<VerifyPinResponse>('/admin/verify-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
    return result;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Verification failed' };
  }
}

/** Fetch current application settings. */
export async function fetchSettings(): Promise<SettingsData> {
  const result = await apiFetch<{ data: SettingsData }>('/settings');
  return result.data;
}

/** Persist updated settings (admin only). */
export async function saveSettings(
  token: string,
  settings: Partial<Pick<SettingsData, 'auto_end_sessions' | 'min_duration_price'>>
): Promise<void> {
  await apiFetch<unknown>('/settings', {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify(settings),
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Format a duration in minutes as "HHh MMm" for use in session start requests.
 * e.g. 90 -> "01h 30m", 60 -> "01h 00m"
 */
export function formatDurationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}
