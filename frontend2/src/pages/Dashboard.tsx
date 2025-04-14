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
} from '@mui/material';
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { format } from 'date-fns';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { useDashboard } from '../hooks/useDashboard';
import { TabPanel } from '../components/dashboard/TabPanel';
import { DeleteDialog } from '../components/dashboard/DeleteDialog';
import { DataTable } from '../components/dashboard/DataTable';
import { AttendanceRecord, User } from '../types/dashboard';

export default function Dashboard() {
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
    { field: 'id', headerName: 'ID', width: 120 },
    { field: 'name', headerName: 'Name', width: 120, },
    { field: 'entry_time', headerName: 'Entry Time', width: 120, valueFormatter: (params) => params.value ? format(new Date(params.value), 'PPpp') : 'Not Recorded', },
    { field: 'exit_time', headerName: 'Exit Time', width: 120, valueFormatter: (params) => params.value ? format(new Date(params.value), 'PPpp') : 'Not Recorded', },
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
        >
          <DeleteIcon />
        </IconButton>
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
          onClick={() => handleUserDeleteClick(params.row)}
        >
          Delete
        </Button>
      ),
    },
  ];

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tabValue} onChange={handleTabChange}>
              <Tab label="Attendance Records" />
              <Tab label="Users" />
            </Tabs>
          </Box>

          <TabPanel value={tabValue} index={0}>
            <Box sx={{ p: 2 }}>
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
            <Box sx={{ p: 2 }}>
              <DataTable<User>
                rows={users}
                columns={userColumns}
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
        title="Delete User"
        getContentText={(user) => `Are you sure you want to delete user ${user.name}?`}
        onClose={() => setUserDeleteDialog(prev => ({ ...prev, open: false }))}
        onConfirm={handleUserDeleteConfirm}
      />

      <DeleteDialog<AttendanceRecord>
        dialog={attendanceDeleteDialog}
        title="Delete Attendance Record"
        getContentText={(record) => `Are you sure you want to delete the attendance record for ${record.name}?`}
        onClose={() => setAttendanceDeleteDialog(prev => ({ ...prev, open: false }))}
        onConfirm={handleAttendanceDeleteConfirm}
      />
    </Box>
  );
} 