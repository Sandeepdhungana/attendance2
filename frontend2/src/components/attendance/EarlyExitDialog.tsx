import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
} from '@mui/material';
import { EarlyExitReason } from '../../types/attendance';

interface EarlyExitDialogProps {
  open: boolean;
  reason: EarlyExitReason | null;
  onClose: () => void;
  onSubmit: () => void;
  onDelete: () => void;
  onChange: (value: string) => void;
}

export const EarlyExitDialog: React.FC<EarlyExitDialogProps> = ({
  open,
  reason,
  onClose,
  onSubmit,
  onDelete,
  onChange,
}) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>
        {reason?.id ? 'Delete Early Exit Reason' : 'Early Exit Reason'}
      </DialogTitle>
      <DialogContent>
        {reason?.id ? (
          <Typography variant="body1">
            Are you sure you want to delete this early exit reason for{' '}
            {reason?.name}?
          </Typography>
        ) : (
          <>
            <Typography variant="body1" gutterBottom>
              Hey {reason?.name}, why are you leaving early?
            </Typography>
            <TextField
              autoFocus
              margin="dense"
              label="Reason"
              fullWidth
              multiline
              rows={4}
              value={reason?.early_exit_message || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Please provide a reason for leaving early..."
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        {reason?.id ? (
          <Button onClick={onDelete} color="error" variant="contained">
            Delete
          </Button>
        ) : (
          <Button
            onClick={onSubmit}
            variant="contained"
            color="primary"
            disabled={!reason?.early_exit_message?.trim()}
          >
            Submit
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}; 