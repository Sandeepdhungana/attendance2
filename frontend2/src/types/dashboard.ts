export interface AttendanceRecord {
  id: string;
  objectId: string;
  employee_id: string;
  entry_time: string;
  exit_time: string;
  confidence: number;
  is_late?: boolean;
  is_early_exit?: boolean;
  late_message?: string;
  early_exit_message?: string;
}

export interface User {
  user_id: string;
  name: string;
  created_at: string;
}

export interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

export interface DeleteDialogState<T> {
  open: boolean;
  item: T | null;
  loading: boolean;
} 