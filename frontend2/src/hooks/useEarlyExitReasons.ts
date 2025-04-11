import { useState, useEffect } from 'react';
import { useWebSocket } from '../App';
import api from '../api/config';
import { EarlyExitReason, DeleteDialogState } from '../types/earlyExit';

export const useEarlyExitReasons = () => {
  const [reasons, setReasons] = useState<EarlyExitReason[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    reason: null,
  });
  const { sendMessage } = useWebSocket();

  const fetchReasons = async () => {
    try {
      const response = await api.get('/early-exit-reasons');
      setReasons(response.data);
    } catch (error) {
      setError('Failed to fetch early exit reasons');
    }
  };

  useEffect(() => {
    fetchReasons();
  }, []);

  const handleDeleteClick = (reason: EarlyExitReason) => {
    setDeleteDialog({
      open: true,
      reason,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.reason) return;

    try {
      sendMessage({
        type: 'delete_early_exit_reason',
        reason_id: deleteDialog.reason.id,
      });

      setDeleteDialog({
        open: false,
        reason: null,
      });

      setReasons((prev) => prev.filter((r) => r.id !== deleteDialog.reason?.id));
    } catch (error) {
      setError('Failed to delete early exit reason');
    }
  };

  const handleCloseDialog = () => {
    setDeleteDialog({ open: false, reason: null });
  };

  return {
    reasons,
    error,
    deleteDialog,
    handleDeleteClick,
    handleDeleteConfirm,
    handleCloseDialog,
  };
}; 