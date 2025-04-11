export interface OfficeTiming {
  login_time: string | null;
  logout_time: string | null;
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