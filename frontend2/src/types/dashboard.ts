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

export interface Employee {
  objectId: string;
  employee_id: string;
  name?: string;
  email?: string;
  is_admin: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
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

export interface AttendanceAnalytics {
  date_range: {
    start_date: string;
    end_date: string;
    total_days: number;
    working_days: number;
  };
  attendance_summary: {
    present_days: number;
    absent_days: number;
    attendance_percentage: number;
    total_records: number;
    total_employees?: number; // Only present for aggregated admin view
  };
  punctuality: {
    on_time_arrivals: number;
    late_arrivals: number;
    on_time_percentage: number;
    early_exits: number;
  };
  working_hours: {
    total_hours: number;
    average_daily_hours: number;
    expected_daily_hours: number;
    expected_total_hours: number;
    hours_completion_percentage: number;
  };
  employee_info: {
    name: string;
    employee_id: string;
    department: string;
    shift: {
      name: string;
      login_time: string;
      logout_time: string;
      grace_period: number;
    } | null;
    is_aggregated?: boolean; // Indicates if this is aggregated data for all employees
  };
}

export interface DateRangeFilter {
  startDate: Date;
  endDate: Date;
} 