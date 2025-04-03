import { useState, useEffect } from 'react';
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
import axios from 'axios';
import { Delete as DeleteIcon } from '@mui/icons-material';

interface AttendanceRecord {
  id: number;
  user_id: string;
  timestamp: string;
  confidence: number;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [attendanceDeleteDialogOpen, setAttendanceDeleteDialogOpen] = useState(false);
  const [attendanceToDelete, setAttendanceToDelete] = useState<AttendanceRecord | null>(null);
  const [attendanceDeleteLoading, setAttendanceDeleteLoading] = useState(false);

  const attendanceColumns: GridColDef[] = [
    {
      field: 'user_id',
      headerName: 'User ID',
      width: 150,
    },
    {
      field: 'timestamp',
      headerName: 'Time',
      width: 200,
      valueFormatter: (params) => format(new Date(params.value), 'PPpp'),
    },
    {
      field: 'confidence',
      headerName: 'Confidence',
      width: 130,
      valueFormatter: (params) => `${(params.value * 100).toFixed(1)}%`,
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
      const response = await axios.get('/api/attendance');
      setRecords(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch attendance records');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get('/api/users');
      setUsers(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch users');
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
      await axios.delete(`/api/users/${userToDelete.user_id}`);
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
      await axios.delete(`/api/attendance/${attendanceToDelete.id}`);
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
    fetchRecords();
    fetchUsers();
    // Set up polling for real-time updates
    const interval = setInterval(() => {
      fetchRecords();
      if (tabValue === 1) { // Only fetch users when on the users tab
        fetchUsers();
      }
    }, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [tabValue]);

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
            {loading ? (
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
                  pageSize={10}
                  rowsPerPageOptions={[10, 25, 50]}
                  disableSelectionOnClick
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
            {loading ? (
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
                  pageSize={10}
                  rowsPerPageOptions={[10, 25, 50]}
                  disableSelectionOnClick
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
            Are you sure you want to delete this attendance record for user {attendanceToDelete?.user_id} from {attendanceToDelete ? format(new Date(attendanceToDelete.timestamp), 'PPpp') : ''}? This action cannot be undone.
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