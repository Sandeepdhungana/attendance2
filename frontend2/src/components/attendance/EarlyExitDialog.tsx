import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  CircularProgress,
} from '@mui/material';
import { EarlyExitReason } from '../../types/attendance';
import api from '../../api/config';

interface EarlyExitDialogProps {
  open: boolean;
  reason: EarlyExitReason | null;
  onClose: () => void;
  onSubmit: () => void;
}

export const EarlyExitDialog: React.FC<EarlyExitDialogProps> = ({
  open,
  reason,
  onClose,
  onSubmit,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState('');

  const handleSubmit = async () => {
    if (!reason?.attendance_id || !reasonText.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const data = {
        attendance_id: reason.attendance_id,
        reason: reasonText
      };

      await api.post('/early-exit-reason', data);
      onSubmit();
      onClose();
    } catch (err) {
      setError('Failed to submit early exit reason');
      console.error('Error submitting early exit reason:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Early Exit Reason</DialogTitle>
      <DialogContent>
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
          value={reasonText}
          onChange={(e) => setReasonText(e.target.value)}
          placeholder="Please provide a reason for leaving early..."
          error={!!error}
          helperText={error}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={!reasonText.trim() || isSubmitting}
        >
          {isSubmitting ? <CircularProgress size={24} /> : 'Submit'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}; 