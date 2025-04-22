import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { AttendanceRecord, User } from '../types/dashboard';
import { DeleteDialogState } from '../types/deleteDialog';
import api from '../api/config';
import { format } from 'date-fns';

export function useDashboard() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [userDeleteDialog, setUserDeleteDialog] = useState<DeleteDialogState<User>>({
    open: false,
    item: null,
    loading: false,
  });
  const [attendanceDeleteDialog, setAttendanceDeleteDialog] = useState<DeleteDialogState<AttendanceRecord>>({
    open: false,
    item: null,
    loading: false,
  });
  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 10,
  });

  const { ws, isConnected, sendMessage } = useWebSocket();

  // Fetch data from REST API
  const fetchData = useCallback(async () => {
    try {
      setRecordsLoading(true);
      setUsersLoading(true);
      setError(null);

      // Fetch attendance records
      const attendanceResponse = await api.get('/attendance');
      console.log('Attendance data from API:', attendanceResponse.data);
      setRecords(attendanceResponse.data);
      
      // Fetch users
      const usersResponse = await api.get('/employees');
      setUsers(usersResponse.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setRecordsLoading(false);
      setUsersLoading(false);
    }
  }, []);

  // Fetch data by date
  const fetchDataByDate = useCallback(async (date: string) => {
    try {
      setRecordsLoading(true);
      setError(null);

      // Fetch attendance records by date
      const url = `/attendance/by-date/${date}`;
      console.log(`Fetching attendance data for date: ${date} from ${url}`);
      
      const attendanceResponse = await api.get(url);
      console.log('Attendance data by date from API:', attendanceResponse.data);
      setFilteredRecords(attendanceResponse.data);
    } catch (err) {
      console.error('Error fetching attendance by date:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch attendance data for the selected date');
      setFilteredRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  // Update filtered records whenever dateFilter changes
  useEffect(() => {
    fetchDataByDate(dateFilter);
  }, [dateFilter, fetchDataByDate]);

  // Initial data fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // WebSocket message handler
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'attendance_data') {
          // Only update if we have new data
          if (data.data && Array.isArray(data.data)) {
            setRecords(data.data);
            
            // Also update filtered records if they match the current date filter
            fetchDataByDate(dateFilter);
          }
          setRecordsLoading(false);
          setError(null);
        } else if (data.type === 'user_data') {
          // Only update if we have new data
          if (data.data && Array.isArray(data.data)) {
            setUsers(data.data);
          }
          setUsersLoading(false);
          setError(null);
        } else if (data.type === 'attendance_update') {
          // Handle attendance update without clearing the data
          if (data.data && Array.isArray(data.data)) {
            console.log('Received attendance update:', data.data);
            // Update only the changed records
            setRecords(prevRecords => {
              const updatedRecords = [...prevRecords];
              data.data.forEach((update: any) => {
                const index = updatedRecords.findIndex(r => r.id === update.id || r.employee_id === update.employee_id);
                if (index !== -1) {
                  // Preserve the objectId when updating
                  const objectId = updatedRecords[index].objectId;
                  updatedRecords[index] = { 
                    ...updatedRecords[index], 
                    ...update,
                    objectId: objectId // Ensure objectId is preserved
                  };
                } else {
                  updatedRecords.push(update);
                }
              });
              return updatedRecords;
            });
            
            // Also update filtered records to reflect the changes
            fetchDataByDate(dateFilter);
          }
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err);
        setError('Failed to process data from server');
      }
    };

    ws.addEventListener('message', handleMessage);

    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws, dateFilter, fetchDataByDate]);

  // Request data via WebSocket when connected
  useEffect(() => {
    if (isConnected) {
      sendMessage({ type: 'get_attendance' });
      sendMessage({ type: 'get_users' });
    }
  }, [isConnected, sendMessage]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleUserDeleteClick = (user: User) => {
    setUserDeleteDialog({ open: true, item: user, loading: false });
  };

  const handleUserDeleteConfirm = async () => {
    if (!userDeleteDialog.item) return;
    
    // Set loading state
    setUserDeleteDialog(prev => ({ ...prev, loading: true }));
    
    // Store the item to be deleted
    const userToDelete = userDeleteDialog.item;
    const identifierToFilter = userToDelete.employee_id;
    const deleteId = userToDelete.objectId || userToDelete.employee_id;
    
    // Optimistic UI update - remove the user from state immediately
    setUsers(prevUsers => prevUsers.filter(u => u.employee_id !== identifierToFilter));
    
    try {
      // Make the API call
      console.log(`Deleting user with ID: ${deleteId}`);
      await api.delete(`/employees/${deleteId}`);
      
      // Close the dialog
      setUserDeleteDialog({ open: false, item: null, loading: false });
      
      // No need to refresh data since we've already updated the UI
    } catch (err) {
      console.error('Error deleting user:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete user. UI has been refreshed.');
      
      // If the API call fails, fetch all data again to ensure UI is in sync with backend
      fetchData();
    }
  };

  const handleAttendanceDeleteClick = (record: AttendanceRecord) => {
    console.log('Deleting attendance record:', record);
    setAttendanceDeleteDialog({ open: true, item: record, loading: false });
  };

  const handleAttendanceDeleteConfirm = async () => {
    if (!attendanceDeleteDialog.item) return;
    
    // Set loading state
    setAttendanceDeleteDialog(prev => ({ ...prev, loading: true }));
    
    // Store the item to be deleted
    const recordToDelete = attendanceDeleteDialog.item;
    
    // Optimistic UI update - remove the record from state immediately
    setFilteredRecords(prevRecords => prevRecords.filter(r => r.id !== recordToDelete.id));
    
    try {
      // Make the API call
      console.log('Confirming deletion for:', recordToDelete);
      await api.delete(`/attendance/${recordToDelete.objectId}`);
      
      // Close the dialog
      setAttendanceDeleteDialog({ open: false, item: null, loading: false });
      
      // Also update the main records list
      setRecords(prevRecords => prevRecords.filter(r => r.id !== recordToDelete.id));
    } catch (err) {
      console.error('Error deleting attendance record:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete attendance record. UI has been refreshed.');
      
      // If the API call fails, fetch all data again to ensure UI is in sync with backend
      fetchData();
      fetchDataByDate(dateFilter);
    }
  };

  return {
    records: filteredRecords,
    allRecords: records,
    users,
    recordsLoading,
    usersLoading,
    error,
    tabValue,
    dateFilter,
    userDeleteDialog,
    attendanceDeleteDialog,
    paginationModel,
    handleTabChange,
    handleUserDeleteClick,
    handleUserDeleteConfirm,
    handleAttendanceDeleteClick,
    handleAttendanceDeleteConfirm,
    setPaginationModel,
    setUserDeleteDialog,
    setAttendanceDeleteDialog,
    setDateFilter,
  };
} 