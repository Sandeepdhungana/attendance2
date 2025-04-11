import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  CircularProgress,
} from '@mui/material';
import { DeleteDialogState } from '../../types/dashboard';

interface DeleteDialogProps<T> {
  dialog: DeleteDialogState<T>;
  title: string;
  getContentText: (item: T) => string;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteDialog<T>({
  dialog,
  title,
  getContentText,
  onClose,
  onConfirm,
}: DeleteDialogProps<T>) {
  return (
    <Dialog open={dialog.open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {dialog.item && getContentText(dialog.item)}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={dialog.loading}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={dialog.loading}
          startIcon={dialog.loading ? <CircularProgress size={20} /> : null}
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
} 