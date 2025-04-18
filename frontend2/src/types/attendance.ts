export interface UserResult {
  message: string;
  name: string;
  timestamp?: string;
  employee_id?: string;
  similarity?: number;
  similarity_percent?: number;
  confidence_str?: string;
  detection_time?: string;
  is_streaming?: boolean;
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
  notification_type?: 'success' | 'error' | 'warning' | 'info';
  multiple_users?: boolean;
  users?: UserResult[];
  data?: any[];
  name?: string;
  employee_id?: string;
  confidence?: number;
  confidence_percent?: number;
  confidence_str?: string;
  timestamp?: string;
}

export interface AttendanceUpdate {
  employee_id: string;
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
  id: string;
  user_id: string;
  user_name: string;
  attendance_id: string;
  reason: string;
  timestamp: string | {
    __type: string;
    iso: string;
  };
  name?: string;
  is_early_exit?: boolean;
  exit_time?: string | null;
}

export interface MessageState {
  type: 'success' | 'error' | null;
  text: string;
}

export interface EarlyExitDialogState {
  open: boolean;
  reason: EarlyExitReason | null;
} 