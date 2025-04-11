import { useState } from 'react';
import api from '../api/config';
import { EarlyExitReason } from '../types/attendance';

export const useEarlyExit = (sendMessage: (message: any) => void) => {
  const [earlyExitDialog, setEarlyExitDialog] = useState<{
    open: boolean;
    reason: EarlyExitReason | null;
  }>({
    open: false,
    reason: null,
  });

  const handleEarlyExitReason = async () => {
    if (!earlyExitDialog.reason) {
      return;
    }

    try {
      const formData = new FormData();
      formData.append('early_exit_message', earlyExitDialog.reason.early_exit_message);

      const response = await api.post('/early-exit-reason', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.status === 200) {
        setEarlyExitDialog({
          open: false,
          reason: null,
        });
        sendMessage({ type: 'get_early_exit_reasons' });
      }
    } catch (error: any) {
      console.error('Failed to submit early exit reason:', error);
    }
  };

  const handleDeleteEarlyExitReason = (reason: EarlyExitReason) => {
    setEarlyExitDialog({
      open: true,
      reason,
    });
  };

  const handleDeleteEarlyExitConfirm = async () => {
    if (!earlyExitDialog.reason) return;

    try {
      sendMessage({
        type: 'delete_early_exit_reason',
        reason_id: earlyExitDialog.reason.id,
      });

      setEarlyExitDialog({
        open: false,
        reason: null,
      });
    } catch (error) {
      console.error('Failed to delete early exit reason:', error);
    }
  };

  return {
    earlyExitDialog,
    setEarlyExitDialog,
    handleEarlyExitReason,
    handleDeleteEarlyExitReason,
    handleDeleteEarlyExitConfirm,
  };
}; 