import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  Button,
  Tabs,
  Tab,
  Chip,
  IconButton,
  useTheme,
  alpha,
  Paper,
  Divider,
} from '@mui/material';
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { format } from 'date-fns';
import { Delete as DeleteIcon, CalendarToday, Group } from '@mui/icons-material';
import { useDashboard } from '../hooks/useDashboard';
import { TabPanel } from '../components/dashboard/TabPanel';
import { DeleteDialog } from '../components/dashboard/DeleteDialog';
import { DataTable } from '../components/dashboard/DataTable';
import { AttendanceRecord, User } from '../types/dashboard';

export default function Dashboard() {
  const theme = useTheme();
  const {
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
  } = useDashboard();

  const attendanceColumns: GridColDef[] = [
    { field: 'employee_id', headerName: 'Employee ID', width: 150 },
    { field: 'name', headerName: 'Employee Name', width: 150 },
    { field: 'objectId', headerName: 'Object ID', width: 150 },
    { 
      field: 'entry_time', 
      headerName: 'Entry Time', 
      width: 200, 
      valueFormatter: (params) => params.value ? format(new Date(params.value), 'PPpp') : 'Not Recorded',
    },
    { 
      field: 'exit_time', 
      headerName: 'Exit Time', 
      width: 200, 
      valueFormatter: (params) => params.value ? format(new Date(params.value), 'PPpp') : 'Not Recorded',
    },
    { field: 'confidence', headerName: 'Confidence', width: 100 },
    { 
      field: 'is_late', 
      headerName: 'Late', 
      width: 100,
      renderCell: (params) => (
        <Chip 
          label={params.value ? 'Yes' : 'No'} 
          color={params.value ? 'error' : 'success'} 
          size="small"
          variant="outlined"
          sx={{ 
            fontWeight: 600,
            minWidth: 60,
            '& .MuiChip-label': { px: 1 }
          }}
        />
      )
    },
    { 
      field: 'is_early_exit', 
      headerName: 'Early Exit', 
      width: 120,
      renderCell: (params) => (
        <Chip 
          label={params.value ? 'Yes' : 'No'} 
          color={params.value ? 'error' : 'success'} 
          size="small"
          variant="outlined"
          sx={{ 
            fontWeight: 600,
            minWidth: 60,
            '& .MuiChip-label': { px: 1 }
          }}
        />
      )
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <IconButton
          color="error"
          onClick={() => handleAttendanceDeleteClick(params.row)}
          size="small"
          sx={{
            border: `1px solid ${alpha(theme.palette.error.main, 0.5)}`,
            '&:hover': {
              backgroundColor: alpha(theme.palette.error.main, 0.1),
            }
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const employeeColumns: GridColDef[] = [
    {
      field: 'employee_id',
      headerName: 'Employee ID',
      width: 150,
    },
    {
      field: 'name',
      headerName: 'Name',
      width: 200,
    },
    {
      field: 'department',
      headerName: 'Department',
      width: 150,
    },
    {
      field: 'position',
      headerName: 'Position',
      width: 150,
    },
    {
      field: 'shift',
      headerName: 'Shift',
      width: 200,
      valueGetter: (params) => {
        const shift = params.row.shift;
        return shift ? `${shift.name} (${shift.login_time} - ${shift.logout_time})` : 'Not Assigned';
      }
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Chip 
          label={params.value} 
          color={params.value === 'active' ? 'success' : 'error'} 
          size="small"
          variant="outlined"
          sx={{ 
            textTransform: 'capitalize',
            fontWeight: 600,
            minWidth: 80,
            '& .MuiChip-label': { px: 1 }
          }}
        />
      )
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
          onClick={() => handleUserDeleteClick(params.row)}
          sx={{
            borderRadius: '8px',
            textTransform: 'none',
            fontWeight: 600,
            '&:hover': {
              backgroundColor: alpha(theme.palette.error.main, 0.1),
            }
          }}
        >
          Delete
        </Button>
      ),
    },
  ];

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight="700" color="text.primary">
          Dashboard
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Paper 
            elevation={0} 
            sx={{ 
              px: 2, 
              py: 1, 
              display: 'flex', 
              alignItems: 'center', 
              borderRadius: 2,
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
            }}
          >
            <CalendarToday color="primary" fontSize="small" sx={{ mr: 1 }} />
            <Typography variant="body2" fontWeight="600" color="primary.main">
              {records.length} Attendance Records
            </Typography>
          </Paper>
          
          <Paper 
            elevation={0} 
            sx={{ 
              px: 2, 
              py: 1, 
              display: 'flex', 
              alignItems: 'center', 
              borderRadius: 2,
              backgroundColor: alpha(theme.palette.success.main, 0.1),
              border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`
            }}
          >
            <Group color="success" fontSize="small" sx={{ mr: 1 }} />
            <Typography variant="body2" fontWeight="600" color="success.main">
              {users.length} Employees
            </Typography>
          </Paper>
        </Box>
      </Box>

      {error && !recordsLoading && !usersLoading && 
        !userDeleteDialog.loading && !attendanceDeleteDialog.loading && (
        <Alert 
          severity="error" 
          sx={{ 
            mb: 3,
            borderRadius: 2,
            '& .MuiAlert-icon': {
              alignItems: 'center'
            }
          }}
        >
          {error}
        </Alert>
      )}

      <Card sx={{ 
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
      }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ 
            borderBottom: 1, 
            borderColor: 'divider', 
            bgcolor: alpha(theme.palette.background.paper, 0.6)
          }}>
            <Tabs 
              value={tabValue} 
              onChange={handleTabChange}
              sx={{
                '& .MuiTabs-indicator': {
                  height: 3,
                  borderRadius: '3px 3px 0 0',
                },
                '& .MuiTab-root': {
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  minHeight: 56,
                  '&.Mui-selected': {
                    color: 'primary.main',
                  }
                }
              }}
            >
              <Tab label="Attendance Records" />
              <Tab label="Employees" />
            </Tabs>
          </Box>

          <TabPanel value={tabValue} index={0}>
            <Box sx={{ p: 0 }}>
              <DataTable<AttendanceRecord>
                rows={records}
                columns={attendanceColumns}
                loading={recordsLoading}
                paginationModel={paginationModel}
                onPaginationModelChange={setPaginationModel}
              />
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Box sx={{ p: 0 }}>
              <DataTable<User>
                rows={users}
                columns={employeeColumns}
                loading={usersLoading}
                paginationModel={paginationModel}
                onPaginationModelChange={setPaginationModel}
              />
            </Box>
          </TabPanel>
        </CardContent>
      </Card>

      <DeleteDialog<User>
        dialog={userDeleteDialog}
        title="Delete Employee"
        getContentText={(user) => `Are you sure you want to delete employee ${user.name}?`}
        onClose={() => setUserDeleteDialog(prev => ({ ...prev, open: false }))}
        onConfirm={handleUserDeleteConfirm}
      />

      <DeleteDialog<AttendanceRecord>
        dialog={attendanceDeleteDialog}
        title="Delete Attendance Record"
        getContentText={(record) => `Are you sure you want to delete the attendance record for employee ${record.employee_id}?`}
        onClose={() => setAttendanceDeleteDialog(prev => ({ ...prev, open: false }))}
        onConfirm={handleAttendanceDeleteConfirm}
      />
    </Box>
  );
} 