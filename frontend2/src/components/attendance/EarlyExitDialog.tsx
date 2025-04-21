import React, { useEffect, useState } from 'react';
import { 
  Button, 
  Dialog, 
  DialogActions, 
  DialogContent, 
  DialogTitle, 
  TextField, 
  Typography,
  Box
} from '@mui/material';
import { useEarlyExit } from '../../hooks/useEarlyExit';
import { EarlyExitReason } from '../../types/attendance';

interface EarlyExitDialogProps {
  open: boolean;
  onClose: () => void;
  reason: EarlyExitReason | null;
  onSubmit: (reasonText: string, attendanceId: string) => Promise<boolean>;
}

export const EarlyExitDialog: React.FC<EarlyExitDialogProps> = ({ open, onClose, reason, onSubmit }) => {
  const { 
    reasonText, 
    isSubmitting, 
    handleReasonTextChange, 
    error, 
    setReasonText, 
    clearError,
    setAttendanceId,
    setEmployeeId 
  } = useEarlyExit();
  
  const [localEmployeeId, setLocalEmployeeId] = useState<string | null>(null);
  const [localAttendanceId, setLocalAttendanceId] = useState<string | null>(null);

  // Set employee ID and attendance ID when reason changes
  useEffect(() => {
    if (reason) {
      console.log('Dialog received reason object:', reason);
      
      // Check for user_id first, then fallback to other properties
      const empId = reason.user_id || '';
      
      if (empId) {
        console.log('Setting local employee ID in dialog:', empId);
        setLocalEmployeeId(empId);
        setEmployeeId(empId); // Also set in the hook
      } else {
        console.error('No employee ID found in reason object:', reason);
      }
      
      // Also check for attendance_id if available
      if (reason.attendance_id) {
        console.log('Setting local attendance ID in dialog:', reason.attendance_id);
        setLocalAttendanceId(reason.attendance_id);
        setAttendanceId(reason.attendance_id); // Also set in the hook
      } else {
        console.error('No attendance ID found in reason object:', reason);
      }
    }
  }, [reason, setEmployeeId, setAttendanceId]);

  // Clear text inputs only when dialog closes
  useEffect(() => {
    if (!open) {
      setReasonText('');
      clearError();
    }
  }, [open, setReasonText, clearError]);

  const handleSubmit = async () => {
    // Use local state to ensure we have all required data
    console.log('Submitting early exit reason with:', {
      employeeId: localEmployeeId,
      attendanceId: localAttendanceId,
      reasonText, 
    });
    
    // Validation to ensure we have the attendance ID
    if (!localAttendanceId) {
      console.error('No attendance ID provided for early exit reason');
      return;
    }
    
    // Pass the attendance ID and reason to the parent component's onSubmit handler
    console.log(`Calling onSubmit with reason: "${reasonText}" and attendanceId: "${localAttendanceId}"`);
    const success = await onSubmit(reasonText, localAttendanceId);
    if (success) {
      onClose();
    }
  };

  const handleClose = () => {
    setReasonText('');
    clearError();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Early Exit Reason</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <Typography variant="body1" gutterBottom>
            Please provide a reason for early exit for {reason?.name || 'employee'}.
          </Typography>
          
          {error && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
              {error}
            </Typography>
          )}
          
          <TextField
            autoFocus
            margin="dense"
            label="Reason"
            fullWidth
            multiline
            rows={4}
            value={reasonText}
            onChange={handleReasonTextChange}
            error={!!error}
            disabled={isSubmitting}
          />
          
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            This will be recorded for reporting purposes.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          color="primary"
          disabled={!reasonText.trim() || isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}; 