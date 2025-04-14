import { useState } from 'react';
import api from '../api/config';
import { EarlyExitReason } from '../types/attendance';

export const useEarlyExit = () => {
  const [earlyExitDialog, setEarlyExitDialog] = useState<{
    open: boolean;
    reason: EarlyExitReason | null;
  }>({
    open: false,
    reason: null,
  });

  const handleEarlyExitReason = async () => {
    if (!earlyExitDialog.reason?.attendance_id || !earlyExitDialog.reason.reason) {
      return;
    }

    try {
      const data = {
        attendance_id: earlyExitDialog.reason.attendance_id,
        reason: earlyExitDialog.reason.reason
      };

      await api.post('/early-exit-reason', data);
      
      // Close dialog and reset state
      setEarlyExitDialog({
        open: false,
        reason: null,
      });
    } catch (error) {
      console.error('Failed to submit early exit reason:', error);
    }
  };

  const handleEarlyExitDialogChange = (updatedReason: EarlyExitReason) => {
    setEarlyExitDialog({
      ...earlyExitDialog,
      reason: updatedReason,
    });
  };

  return {
    earlyExitDialog,
    setEarlyExitDialog,
    handleEarlyExitReason,
    handleEarlyExitDialogChange,
  };
}; 