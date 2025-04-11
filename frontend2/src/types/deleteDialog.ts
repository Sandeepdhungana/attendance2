export interface DeleteDialogState<T> {
  open: boolean;
  item: T | null;
  loading: boolean;
} 