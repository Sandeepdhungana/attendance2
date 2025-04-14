import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { AttendanceRecord, User } from '../types/dashboard';
import { DeleteDialogState } from '../types/deleteDialog';
import api from '../api/config';

export function useDashboard() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
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
      setRecords(attendanceResponse.data);

      // Fetch users
      const usersResponse = await api.get('/users');
      setUsers(usersResponse.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setRecordsLoading(false);
      setUsersLoading(false);
    }
  }, []);

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
            // Update only the changed records
            setRecords(prevRecords => {
              const updatedRecords = [...prevRecords];
              data.data.forEach((update: any) => {
                const index = updatedRecords.findIndex(r => r.id === update.id);
                if (index !== -1) {
                  updatedRecords[index] = { ...updatedRecords[index], ...update };
                } else {
                  updatedRecords.push(update);
                }
              });
              return updatedRecords;
            });
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
  }, [ws]);

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
    if (userDeleteDialog.item) {
      try {
        await api.delete(`/users/${userDeleteDialog.item.user_id}`);
        setUsers(users.filter(u => u.user_id !== userDeleteDialog.item?.user_id));
        setUserDeleteDialog({ open: false, item: null, loading: false });
        // Refresh data
        fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete user');
      }
    }
  };

  const handleAttendanceDeleteClick = (record: AttendanceRecord) => {
    setAttendanceDeleteDialog({ open: true, item: record, loading: false });
  };

  const handleAttendanceDeleteConfirm = async () => {
    if (attendanceDeleteDialog.item) {
      try {
        await api.delete(`/attendance/${attendanceDeleteDialog.item.id}`);
        setRecords(records.filter(r => r.id !== attendanceDeleteDialog.item?.id));
        setAttendanceDeleteDialog({ open: false, item: null, loading: false });
        // Refresh data
        fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete attendance record');
      }
    }
  };

  return {
    records,
    users,
    recordsLoading,
    usersLoading,
    error,
    tabValue,
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
  };
} 