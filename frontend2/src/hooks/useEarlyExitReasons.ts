import { useState, useEffect } from 'react';
import api from '../api/config';
import { EarlyExitReason } from '../types/attendance';

interface DeleteDialogState {
  open: boolean;
  reasonId: number | null;
}

export const useEarlyExitReasons = () => {
  const [reasons, setReasons] = useState<EarlyExitReason[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    reasonId: null,
  });

  const fetchReasons = async () => {
    try {
      const response = await api.get('/early-exit-reasons');
      // Ensure response.data is an array
      if (Array.isArray(response.data)) {
        setReasons(response.data);
        setError(null);
      } else {
        setError('Invalid response format from server');
        setReasons([]);
      }
    } catch (err) {
      setError('Failed to fetch early exit reasons');
      setReasons([]);
      console.error('Error fetching early exit reasons:', err);
    }
  };

  // useEffect(() => {
  //   fetchReasons();
  // }, []);

  const handleDeleteClick = (reasonId: number) => {
    setDeleteDialog({ open: true, reasonId });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.reasonId) return;

    try {
      await api.delete(`/early-exit-reasons/${deleteDialog.reasonId}`);
      await fetchReasons();
      handleCloseDialog();
    } catch (err) {
      setError('Failed to delete early exit reason');
      console.error('Error deleting early exit reason:', err);
    }
  };

  const handleCloseDialog = () => {
    setDeleteDialog({ open: false, reasonId: null });
  };

  return {
    reasons,
    error,
    deleteDialog,
    handleDeleteClick,
    handleDeleteConfirm,
    handleCloseDialog,
    fetchReasons,
  };
}; 