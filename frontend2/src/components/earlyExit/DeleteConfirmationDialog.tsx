import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from '@mui/material';

interface DeleteConfirmationDialogProps {
  deleteDialog: {
    open: boolean;
    reasonId: number | null;
  };
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
        <Typography>
          Are you sure you want to delete this early exit reason? This action cannot be undone.
        </Typography>
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