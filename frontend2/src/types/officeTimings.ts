export interface OfficeTiming {
  id: string;
  login_time: string | null;
  logout_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfficeTimingFormData {
  login_time: string;
  logout_time: string;
}

export interface DeleteDialogState<T> {
  open: boolean;
  item: T | null;
  loading: boolean;
} 