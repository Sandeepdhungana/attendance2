export interface AttendanceRecord {
  id: string;
  objectId: string;
  employee_id: string;
  name?: string; // Employee name for search
  entry_time: string;
  exit_time: string;
  confidence: number;
  is_late?: boolean;
  is_early_exit?: boolean;
  late_message?: string;
  early_exit_message?: string;
}

export interface User {
  user_id?: string;
  employee_id: string;
  objectId?: string;
  name: string;
  department?: string;
  position?: string;
  status?: string;
  shift?: {
    objectId: string;
    name: string;
    login_time: string;
    logout_time: string;
  };
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