import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import { DeleteDialogState } from '../../types/earlyExit';

interface DeleteConfirmationDialogProps {
  deleteDialog: DeleteDialogState;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
  deleteDialog,
  onClose,
  onConfirm,
}) => {
  return (
    <Dialog open={deleteDialog.open} onClose={onClose}>
      <DialogTitle>Delete Early Exit Reason</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to delete this early exit reason for{' '}
          {deleteDialog.reason?.user_name}?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm} color="error" variant="contained">
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}; 