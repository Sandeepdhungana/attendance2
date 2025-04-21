import { useState } from 'react';
import api from '../api/config';
import { EarlyExitReason } from '../types/attendance';

export const useEarlyExit = () => {
  const [earlyExitDialog, setEarlyExitDialog] = useState<{
    open: boolean;
    reason: EarlyExitReason | null;
  }>({
    open: false,
    reason: null,
  });
  
  const [message, setMessage] = useState<string | null>(null);
  const [attendanceId, setAttendanceId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  const handleReasonTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReasonText(e.target.value);
    if (error) clearError();
  };

  /**
   * Handle submission of early exit reason
   * @param textOverride Optional override for the reason text
   * @param attendanceIdOverride Optional override for attendance ID (objectId)
   * @param empIdOverride Optional override for employee ID
   */
  const handleEarlyExitReason = async (
    textOverride?: string, 
    attendanceIdOverride?: string,
    empIdOverride?: string
  ) => {
    console.log("handleEarlyExitReason called with:", { 
      textOverride, 
      attendanceIdOverride,
      empIdOverride 
    });
    
    // If external parameters are provided, use them
    // Otherwise fall back to the internal state
    const reasonToUse = textOverride || reasonText;
    const employeeIdToUse = empIdOverride || employeeId;
    const attendanceIdToUse = attendanceIdOverride || attendanceId;
    
    console.log("Values to be used:", { 
      reasonToUse, 
      employeeIdToUse, 
      attendanceIdToUse 
    });
    
    if (!reasonToUse || reasonToUse.trim() === '') {
      console.error("Missing required data for early exit reason submission");
      setError("Please provide a reason for early exit");
      return false;
    }

    setIsSubmitting(true);
    clearError();

    try {
      // Option 1: If we have an attendance ID, use it directly
      if (attendanceIdToUse) {
        // Validate the attendance ID
        if (typeof attendanceIdToUse !== 'string' || attendanceIdToUse.trim() === '') {
          console.error("Invalid attendance ID format:", attendanceIdToUse);
          setError("Invalid attendance ID. Please try again or contact support.");
          return false;
        }

        // Create data object with proper typing
        const data: {
          attendance_id: string;  // This is an objectId string
          reason: string;
          employee_id?: string;
        } = {
          attendance_id: attendanceIdToUse,
          reason: reasonToUse
        };

        // If we also have an employee ID, add it to help the backend
        if (employeeIdToUse) {
          data.employee_id = employeeIdToUse;
        }

        console.log("Submitting early exit reason with attendance_id:", data);
        
        try {
          console.log(`Making API POST request to /early-exit-reason with attendance_id: "${data.attendance_id}"`);
          const response = await api.post('/early-exit-reason', data);
          console.log("Early exit reason submission response:", response);
          
          setEarlyExitDialog({
            open: false,
            reason: null,
          });
          
          return true;
        } catch (apiError) {
          console.error('Early exit reason API error:', apiError);
          throw apiError; // Rethrow to be caught by outer catch block
        }
      }
      
      // Option 2: If we don't have an attendance ID but have an employee ID
      // We'll use the /employee-early-exit endpoint which is designed for this case
      if (employeeIdToUse) {
        // Use the dedicated employee endpoint
        const employeeData = {
          employee_id: employeeIdToUse,
          reason: reasonToUse
        };
        
        console.log("Submitting to employee-early-exit endpoint:", employeeData);
        
        try {
          console.log(`Making API POST request to /employee-early-exit with employee_id: "${employeeData.employee_id}"`);
          const response = await api.post('/employee-early-exit', employeeData);
          console.log("Employee early exit response:", response);
          
          setEarlyExitDialog({
            open: false,
            reason: null,
          });
          
          return true;
        } catch (employeeExitError) {
          console.error('Failed employee-early-exit endpoint:', employeeExitError);
          throw employeeExitError; // Rethrow to be caught by outer catch block
        }
      }
      
      setError("Could not determine how to submit early exit reason. Missing both attendance ID and employee ID.");
      return false;
    } catch (error) {
      console.error('Failed to submit early exit reason:', error);
      setError('Failed to submit early exit reason. Please try again.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEarlyExitDialogChange = (updatedReason: EarlyExitReason) => {
    setEarlyExitDialog({
      ...earlyExitDialog,
      reason: updatedReason,
    });
  };

  return {
    earlyExitDialog,
    setEarlyExitDialog,
    handleEarlyExitReason,
    handleEarlyExitDialogChange,
    reasonText,
    setReasonText,
    attendanceId,
    setAttendanceId,
    employeeId,
    setEmployeeId,
    isSubmitting,
    error,
    clearError,
    handleReasonTextChange
  };
}; 