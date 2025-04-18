import { useState, useEffect } from 'react';
import api from '../api/config';
import { EarlyExitReason } from '../types/attendance';

interface DeleteDialogState {
  open: boolean;
  reasonId: string | null;
  isDeleting: boolean;
}

export const useEarlyExitReasons = () => {
  const [reasons, setReasons] = useState<EarlyExitReason[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    reasonId: null,
    isDeleting: false
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

  const handleDeleteClick = (reasonId: string) => {
    setDeleteDialog({ open: true, reasonId, isDeleting: false });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.reasonId) return;
    
    // Optimistic UI update - first update the state
    setDeleteDialog(prev => ({ ...prev, isDeleting: true }));
    
    // Remove the item from local state immediately
    const deletedId = deleteDialog.reasonId;
    const updatedReasons = reasons.filter(reason => reason.id !== deletedId);
    setReasons(updatedReasons);
    
    try {
      // Then make the API call
      await api.delete(`/early-exit-reasons/${deletedId}`);
      // No need to fetch all reasons again - we've already updated the UI
      handleCloseDialog();
    } catch (err) {
      // If the API call fails, revert the state change and show error
      setError('Failed to delete early exit reason. The UI has been refreshed.');
      console.error('Error deleting early exit reason:', err);
      // Fetch data again to ensure UI is in sync with backend
      fetchReasons();
    } finally {
      setDeleteDialog(prev => ({ ...prev, isDeleting: false }));
    }
  };

  const handleCloseDialog = () => {
    setDeleteDialog({ open: false, reasonId: null, isDeleting: false });
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