export interface EarlyExitReason {
  id: number;
  user_id: string;
  user_name: string;
  attendance_id: number;
  reason: string;
  timestamp: string;
}

export interface DeleteDialogState {
  open: boolean;
  reason: EarlyExitReason | null;
} 