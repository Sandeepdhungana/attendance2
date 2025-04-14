export interface UserResult {
  message: string;
  user_id: string;
  name: string;
  timestamp?: string;
  similarity?: number;
  is_late?: boolean;
  is_early_exit?: boolean;
  late_message?: string;
  early_exit_message?: string;
  attendance_id?: number;
}

export interface WebSocketResponse {
  type?: string;
  status?: string;
  message?: string;
  multiple_users?: boolean;
  users?: UserResult[];
  data?: any[];
}

export interface AttendanceUpdate {
  user_id: string;
  name: string;
  entry_type: 'entry' | 'exit';
  timestamp: string;
  is_late?: boolean;
  is_early_exit?: boolean;
  late_message?: string;
  early_exit_message?: string;
  similarity?: number;
  entry_time?: string;
  exit_time?: string;
}

export interface EarlyExitReason {
  id: number;
  user_id: string;
  user_name: string;
  attendance_id: number;
  reason: string;
  timestamp: string;
  name?: string;
}

export interface MessageState {
  type: 'success' | 'error' | null;
  text: string;
}

export interface EarlyExitDialogState {
  open: boolean;
  reason: EarlyExitReason | null;
} 