import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Tabs,
  Tab,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { format } from 'date-fns';
import api from '../api/config';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { useWebSocket } from '../App';

interface AttendanceRecord {
  id: number;
  user_id: string;
  name: string;
  entry_time: string;
  exit_time: string;
  confidence: number;
  is_late?: boolean;
  is_early_exit?: boolean;
  late_message?: string;
  early_exit_message?: string;
}

interface User {
  user_id: string;
  name: string;
  created_at: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [attendanceDeleteDialogOpen, setAttendanceDeleteDialogOpen] = useState(false);
  const [attendanceToDelete, setAttendanceToDelete] = useState<AttendanceRecord | null>(null);
  const [attendanceDeleteLoading, setAttendanceDeleteLoading] = useState(false);
  const { ws, isConnected, sendMessage } = useWebSocket();
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });

  const attendanceColumns: GridColDef[] = [
    {
      field: 'user_id',
      headerName: 'User ID',
      width: 150,
    },
    {
      field: 'name',
      headerName: 'Name',
      width: 200,
    },
    {
      field: 'entry_time',
      headerName: 'Entry Time',
      width: 200,
      valueFormatter: (params) => {
        if (!params.value) return 'Not recorded';
        const date = new Date(params.value);
        return format(date, 'PPpp');
      },
    },
    {
      field: 'exit_time',
      headerName: 'Exit Time',
      width: 200,
      valueFormatter: (params) => {
        if (!params.value) return 'Not recorded';
        const date = new Date(params.value);
        return format(date, 'PPpp');
      },
    },
    {
      field: 'confidence',
      headerName: 'Confidence',
      width: 130,
      valueFormatter: (params) => `${(params.value * 100).toFixed(1)}%`,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 200,
      valueGetter: (params) => {
        const row = params.row;
        if (row.is_late && row.late_message) return row.late_message;
        if (row.is_early_exit && row.early_exit_message) return row.early_exit_message;
        return 'On time';
      },
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Button
          variant="outlined"
          color="error"
          size="small"
          startIcon={<DeleteIcon />}
          onClick={() => handleAttendanceDeleteClick(params.row)}
        >
          Delete
        </Button>
      ),
    },
  ];

  const userColumns: GridColDef[] = [
    {
      field: 'user_id',
      headerName: 'User ID',
      width: 150,
    },
    {
      field: 'name',
      headerName: 'Name',
      width: 200,
    },
    {
      field: 'created_at',
      headerName: 'Registered On',
      width: 200,
      valueFormatter: (params) => format(new Date(params.value), 'PPpp'),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: (params: GridRenderCellParams) => (
        <Button
          variant="outlined"
          color="error"
          size="small"
          startIcon={<DeleteIcon />}
          onClick={() => handleDeleteClick(params.row)}
        >
          Delete
        </Button>
      ),
    },
  ];

  const fetchRecords = async () => {
    try {
      setRecordsLoading(true);
      const response = await api.get('/attendance');
      console.log('Attendance API Response:', response.data);
      
      const validRecords = response.data.filter((record: any) => {
        const isValid = record && 
          typeof record.id === 'number' && 
          typeof record.user_id === 'string' && 
          typeof record.name === 'string' && 
          record.entry_time && 
          typeof record.confidence === 'number';
        
        if (!isValid) {
          console.warn('Invalid record:', record);
        }
        return isValid;
      });
      
      console.log('Valid records:', validRecords);
      setRecords(validRecords);
      setError(null);
    } catch (err) {
      console.error('Error fetching attendance records:', err);
      setError('Failed to fetch attendance records');
    } finally {
      setRecordsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      const response = await api.get('/users');
      const validUsers = response.data.filter((user: any) => 
        user && typeof user.user_id === 'string' && 
        typeof user.name === 'string' && 
        typeof user.created_at === 'string'
      );
      setUsers(validUsers);
      setError(null);
    } catch (err) {
      setError('Failed to fetch users');
    } finally {
      setUsersLoading(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;
    
    setDeleteLoading(true);
    try {
      await api.delete(`/users/${userToDelete.user_id}`);
      setDeleteDialogOpen(false);
      fetchUsers(); // Refresh the user list
    } catch (err) {
      setError('Failed to delete user');
    } finally {
      setDeleteLoading(false);
      setUserToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  const handleAttendanceDeleteClick = (attendance: AttendanceRecord) => {
    setAttendanceToDelete(attendance);
    setAttendanceDeleteDialogOpen(true);
  };

  const handleAttendanceDeleteConfirm = async () => {
    if (!attendanceToDelete) return;
    
    setAttendanceDeleteLoading(true);
    try {
      await api.delete(`/attendance/${attendanceToDelete.id}`);
      setAttendanceDeleteDialogOpen(false);
      fetchRecords(); // Refresh the attendance records
    } catch (err) {
      setError('Failed to delete attendance record');
    } finally {
      setAttendanceDeleteLoading(false);
      setAttendanceToDelete(null);
    }
  };

  const handleAttendanceDeleteCancel = () => {
    setAttendanceDeleteDialogOpen(false);
    setAttendanceToDelete(null);
  };

  useEffect(() => {
    // Initial data fetch
    fetchRecords();
    fetchUsers();
  }, []); // Empty dependency array for initial fetch

  // Separate WebSocket listener setup
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'attendance_update') {
          fetchRecords();
        }
      } catch (error) {
        console.error('Error processing attendance update:', error);
      }
    };

    ws.addEventListener('message', handleMessage);

    // Cleanup function to remove the event listener
    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws]); // Only re-run when WebSocket instance changes

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      <Card>
        <CardContent>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tabValue} onChange={handleTabChange} aria-label="dashboard tabs">
              <Tab label="Attendance Records" />
              <Tab label="Registered Users" />
            </Tabs>
          </Box>

          <TabPanel value={tabValue} index={0}>
            {recordsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : error ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            ) : (
              <Box sx={{ height: 600, width: '100%' }}>
                <DataGrid
                  rows={records}
                  columns={attendanceColumns}
                  getRowId={(row) => row.id}
                  paginationModel={paginationModel}
                  onPaginationModelChange={(model) => setPaginationModel(model)}
                  pageSizeOptions={[10, 25, 50]}
                  disableRowSelectionOnClick
                  sx={{
                    '& .MuiDataGrid-cell': {
                      fontSize: '1rem',
                    },
                  }}
                />
              </Box>
            )}
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            {usersLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : error ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            ) : (
              <Box sx={{ height: 600, width: '100%' }}>
                <DataGrid
                  rows={users}
                  columns={userColumns}
                  getRowId={(row) => row.user_id}
                  paginationModel={paginationModel}
                  onPaginationModelChange={(model) => setPaginationModel(model)}
                  pageSizeOptions={[10, 25, 50]}
                  disableRowSelectionOnClick
                  sx={{
                    '& .MuiDataGrid-cell': {
                      fontSize: '1rem',
                    },
                  }}
                />
              </Box>
            )}
          </TabPanel>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog for Users */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete user {userToDelete?.name} ({userToDelete?.user_id})? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteConfirm} 
            color="error" 
            variant="contained"
            disabled={deleteLoading}
            startIcon={deleteLoading ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {deleteLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog for Attendance Records */}
      <Dialog
        open={attendanceDeleteDialogOpen}
        onClose={handleAttendanceDeleteCancel}
      >
        <DialogTitle>Delete Attendance Record</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this attendance record for user {attendanceToDelete?.user_id} from {attendanceToDelete ? format(new Date(attendanceToDelete.entry_time), 'PPpp') : ''}? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleAttendanceDeleteCancel} disabled={attendanceDeleteLoading}>
            Cancel
          </Button>
          <Button 
            onClick={handleAttendanceDeleteConfirm} 
            color="error" 
            variant="contained"
            disabled={attendanceDeleteLoading}
            startIcon={attendanceDeleteLoading ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {attendanceDeleteLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 