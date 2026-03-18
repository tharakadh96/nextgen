export type StationType = 'PS5' | 'PS4';

export interface Station {
  id: string;
  type: StationType;
  status: 'available' | 'busy' | 'completed';
  remainingTime?: string; // e.g., "00:42:15"
  remainingSeconds?: number; // Added for timer logic
  totalSeconds?: number; // Added for progress bar logic
  user?: string;
  players?: number; // Added to track players for logging
  pendingRevenue?: number; // Added to store amount to collect
  actualSecondsPlayed?: number; // Added to track actual time played
  rates: {
    single: { hourly: number; thirtyMin?: number; threeHour?: number; fiveHour?: number };
    duo: { hourly: number; thirtyMin?: number; threeHour?: number; fiveHour?: number };
    trio: { hourly: number; thirtyMin?: number; threeHour?: number; fiveHour?: number };
    squad: { hourly: number; thirtyMin?: number; threeHour?: number; fiveHour?: number };
  };
}

export interface SessionLog {
  id: string;
  machineId: string;
  type: StationType;
  status: 'completed' | 'in-progress' | 'terminated';
  players: number;
  duration: string;
  revenue: number;
  date: string; // ISO date string
  terminationReason?: string;
}

export interface RevenueData {
  time: string;
  value: number;
}
