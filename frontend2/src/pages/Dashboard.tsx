import React, { useState, useEffect, useMemo } from 'react';
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
  Stack,
  CircularProgress,
  TextField,
  InputAdornment,
  Grid,
  Avatar,
  Container,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { format, addDays, startOfMonth, endOfMonth } from 'date-fns';
import { 
  Delete as DeleteIcon, 
  CalendarToday, 
  Group, 
  ArrowBack, 
  ArrowForward, 
  Today, 
  Edit as EditIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Clear,
  Analytics as AnalyticsIcon,
  TableView as TableViewIcon,
  Groups as GroupsIcon,
  CheckCircle as CheckCircleIcon,
  Person as PersonIcon,
  Add as AddIcon,
  Schedule as ScheduleIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Refresh as RefreshIcon,
  List as ListIcon,
} from '@mui/icons-material';
import { TabPanel } from '../components/dashboard/TabPanel';
import { DeleteDialog } from '../components/dashboard/DeleteDialog';
import { DataTable } from '../components/dashboard/DataTable';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AttendanceRecord, User, AttendanceAnalytics, DateRangeFilter, Employee } from '../types/dashboard';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useEmployees } from '../contexts/EmployeeContext';
import api from '../api/config';
import AttendanceAnalyticsComponent from '../components/dashboard/AttendanceAnalytics';
import DateRangePickerComponent from '../components/dashboard/DateRangePicker';
import EmployeeSelectorComponent from '../components/dashboard/EmployeeSelector';
import { DataGrid } from '@mui/x-data-grid';



interface EmployeeEditData {
  name: string;
  email: string;
  employee_id: string;
  is_admin: boolean;
  is_active: boolean;
  password?: string;
}

export default function Dashboard() {
  const theme = useTheme();
  const { state: authState } = useAuth();
  const { 
    state: { employees, isLoading: employeesLoading, error: employeesError }, 
    getActiveEmployees, 
    updateEmployee, 
    deleteEmployee: deleteEmployeeFromContext,
    fetchEmployees
  } = useEmployees();
  
  // Main tab state
  const [mainTabValue, setMainTabValue] = useState(0);
  const [tabValue, setTabValue] = useState(0);
  
  // Date range state
  const [dateRange, setDateRange] = useState<DateRangeFilter>({
    startDate: startOfMonth(new Date()),
    endDate: endOfMonth(new Date()),
  });
  
  // State management
  const [analytics, setAnalytics] = useState<AttendanceAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [error, setError] = useState<string | null>(null);
  
  // Delete dialog state
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    item: null as AttendanceRecord | null,
    loading: false,
  });
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [employeeTabValue, setEmployeeTabValue] = useState(0);
  const [editDialog, setEditDialog] = useState({
    open: false,
    employee: null as Employee | null,
  });
  const [editFormData, setEditFormData] = useState<EmployeeEditData>({
    name: '',
    email: '',
    employee_id: '',
    is_admin: false,
    is_active: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [employeeDeleteDialog, setEmployeeDeleteDialog] = useState({
    open: false,
    employee: null as Employee | null,
    loading: false,
  });

  // Check if user is admin
  const isAdmin = authState.user?.is_admin || false;

  // Employee Management Section Component
const EmployeeManagementSection = ({ 
  employees, 
  loading, 
  onEdit, 
  onDelete, 
  onRefresh, 
  searchQuery, 
  onSearchChange,
  tabValue,
  onTabChange,
  attendanceRecords,
  attendanceLoading 
}: any) => {
  const employeeColumns: GridColDef[] = [
    {
      field: 'avatar',
      headerName: '',
      width: 80,
      renderCell: (params) => (
        <Avatar sx={{ bgcolor: theme.palette.primary.main }}>
          {params.row.name?.charAt(0) || params.row.employee_id?.charAt(0) || 'U'}
        </Avatar>
      ),
      sortable: false,
    },
    {
      field: 'name',
      headerName: 'Name',
      width: 200,
      renderCell: (params) => (
        <Box>
          <Typography variant="body2" fontWeight="medium">
            {params.row.name || 'No Name'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ID: {params.row.employee_id}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'email',
      headerName: 'Email',
      width: 250,
    },
    {
      field: 'is_admin',
      headerName: 'Role',
      width: 120,
      renderCell: (params) => (
        <Chip 
          label={params.value ? 'Admin' : 'Employee'} 
          color={params.value ? 'primary' : 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'is_active',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Chip 
          label={params.value !== false ? 'Active' : 'Inactive'} 
          color={params.value !== false ? 'success' : 'error'}
          size="small"
        />
      ),
    },
    {
      field: 'created_at',
      headerName: 'Joined',
      width: 140,
      valueFormatter: (params) => {
        try {
          return format(new Date(params.value), 'MMM dd, yyyy');
        } catch {
          return '-';
        }
      },
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <IconButton
            size="small"
            onClick={() => onEdit(params.row)}
            color="primary"
          >
            <EditIcon />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => onDelete(params.row)}
            color="error"
          >
            <DeleteIcon />
          </IconButton>
        </Stack>
      ),
      sortable: false,
    },
  ];

  return (
    <Box>
      {/* Employee Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`
          }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    Total Employees
                  </Typography>
                  <Typography variant="h4" component="div" fontWeight="bold">
                    {employees.length}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: theme.palette.primary.main, width: 56, height: 56 }}>
                  <GroupsIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.1)} 0%, ${alpha(theme.palette.success.main, 0.05)} 100%)`,
            border: `1px solid ${alpha(theme.palette.success.main, 0.1)}`
          }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    Active Employees
                  </Typography>
                  <Typography variant="h4" component="div" fontWeight="bold">
                    {employees.filter(emp => emp.is_active !== false).length}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: theme.palette.success.main, width: 56, height: 56 }}>
                  <CheckCircleIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: `linear-gradient(135deg, ${alpha(theme.palette.warning.main, 0.1)} 0%, ${alpha(theme.palette.warning.main, 0.05)} 100%)`,
            border: `1px solid ${alpha(theme.palette.warning.main, 0.1)}`
          }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    Admins
                  </Typography>
                  <Typography variant="h4" component="div" fontWeight="bold">
                    {employees.filter(emp => emp.is_admin).length}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: theme.palette.warning.main, width: 56, height: 56 }}>
                  <PersonIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.1)} 0%, ${alpha(theme.palette.info.main, 0.05)} 100%)`,
            border: `1px solid ${alpha(theme.palette.info.main, 0.1)}`
          }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    New This Month
                  </Typography>
                  <Typography variant="h4" component="div" fontWeight="bold">
                    {employees.filter(emp => {
                      try {
                        const createdDate = new Date(emp.created_at);
                        const now = new Date();
                        return createdDate.getMonth() === now.getMonth() && 
                               createdDate.getFullYear() === now.getFullYear();
                      } catch {
                        return false;
                      }
                    }).length}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: theme.palette.info.main, width: 56, height: 56 }}>
                  <AddIcon />
                </Avatar>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs for Employee Management */}
      <Card sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={onTabChange}>
            <Tab 
              label="Employees" 
              icon={<GroupsIcon />} 
              iconPosition="start"
              sx={{ textTransform: 'none', fontWeight: 600 }}
            />
            <Tab 
              label="Attendance Records" 
              icon={<ListIcon />} 
              iconPosition="start"
              sx={{ textTransform: 'none', fontWeight: 600 }}
            />
          </Tabs>
        </Box>

        <CardContent>
          {/* Tab Content */}
          {tabValue === 0 && (
            <Box>
              {/* Employee Management Header */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
                <Typography variant="h6" fontWeight="600">
                  Employee Management
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <TextField
                    size="small"
                    placeholder="Search employees..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    sx={{ minWidth: 300 }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon />
                        </InputAdornment>
                      ),
                      endAdornment: searchQuery && (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => onSearchChange('')}
                            size="small"
                            edge="end"
                          >
                            <Clear />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Button
                    variant="contained"
                    startIcon={<RefreshIcon />}
                    onClick={onRefresh}
                    sx={{ borderRadius: 2 }}
                  >
                    Refresh
                  </Button>
                </Box>
              </Box>
              
              <DataGrid
                rows={employees}
                columns={employeeColumns}
                loading={loading}
                getRowId={(row) => row.objectId || row.employee_id}
                pageSizeOptions={[10, 25, 50]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 10 } },
                }}
                sx={{
                  border: 'none',
                  '& .MuiDataGrid-cell': {
                    borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                  },
                  '& .MuiDataGrid-columnHeaders': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    borderBottom: `2px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                  },
                }}
              />
            </Box>
          )}

          {/* Attendance Records Tab */}
          {tabValue === 1 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6" fontWeight="600">
                  All Attendance Records
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<RefreshIcon />}
                  onClick={onRefresh}
                  sx={{ borderRadius: 2 }}
                >
                  Refresh
                </Button>
              </Box>
              
              <DataGrid
                rows={attendanceRecords || []}
                columns={[
                  {
                    field: 'employee_id',
                    headerName: 'Employee ID',
                    width: 120,
                  },
                  {
                    field: 'name',
                    headerName: 'Employee Name',
                    width: 150,
                    renderCell: (params) => params.value || 'Unknown',
                  },
                  {
                    field: 'objectId',
                    headerName: 'Object ID',
                    width: 120,
                    renderCell: (params) => params.value?.substring(0, 8) + '...',
                  },
                  {
                    field: 'entry_time',
                    headerName: 'Entry Time',
                    width: 180,
                    valueFormatter: (params) => {
                      try {
                        return format(new Date(params.value), 'MMM dd, yyyy, HH:mm:ss');
                      } catch {
                        return params.value || '-';
                      }
                    },
                  },
                  {
                    field: 'exit_time',
                    headerName: 'Exit Time',
                    width: 180,
                    valueFormatter: (params) => {
                      try {
                        return params.value ? format(new Date(params.value), 'MMM dd, yyyy, HH:mm:ss') : '-';
                      } catch {
                        return params.value || '-';
                      }
                    },
                  },
                  {
                    field: 'confidence',
                    headerName: 'Confidence',
                    width: 120,
                    renderCell: (params) => {
                      const confidence = params.value || 0;
                      return (confidence * 100).toFixed(2);
                    },
                  },
                  {
                    field: 'is_late',
                    headerName: 'Late',
                    width: 80,
                    renderCell: (params) => (
                      <Chip 
                        label={params.value ? 'Yes' : 'No'} 
                        color={params.value ? 'error' : 'success'}
                        size="small"
                        variant="outlined"
                      />
                    ),
                  },
                  {
                    field: 'is_early_exit',
                    headerName: 'Early Exit',
                    width: 100,
                    renderCell: (params) => (
                      <Chip 
                        label={params.value ? 'Yes' : 'No'} 
                        color={params.value ? 'warning' : 'success'}
                        size="small"
                        variant="outlined"
                      />
                    ),
                  },
                  ...(isAdmin ? [{
                    field: 'actions',
                    headerName: 'Actions',
                    width: 100,
                    renderCell: (params: GridRenderCellParams) => (
                      <IconButton
                        onClick={() => setDeleteDialog({ open: true, item: params.row, loading: false })}
                        color="error"
                        size="small"
                      >
                        <DeleteIcon />
                      </IconButton>
                    ),
                  }] : []),
                ]}
                loading={attendanceLoading}
                getRowId={(row) => row.objectId}
                pageSizeOptions={[10, 25, 50]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 10 } },
                }}
                sx={{
                  border: 'none',
                  '& .MuiDataGrid-cell': {
                    borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                  },
                  '& .MuiDataGrid-columnHeaders': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    borderBottom: `2px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                  },
                }}
              />
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

  // Employee data now comes from EmployeeContext

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('start_date', format(dateRange.startDate, 'yyyy-MM-dd'));
      params.append('end_date', format(dateRange.endDate, 'yyyy-MM-dd'));
      
      if (selectedEmployee) {
        params.append('employee_id', selectedEmployee.employee_id);
      }
      
      const response = await api.get(`/attendance/analytics?${params.toString()}`);
      setAnalytics(response.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setError('Failed to fetch analytics data');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const fetchRecords = async () => {
    setRecordsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('start_date', format(dateRange.startDate, 'yyyy-MM-dd'));
      params.append('end_date', format(dateRange.endDate, 'yyyy-MM-dd'));
      
      if (selectedEmployee) {
        params.append('employee_id', selectedEmployee.employee_id);
      }
      
      const response = await api.get(`/attendance/by-date-range?${params.toString()}`);
      setRecords(response.data);
    } catch (error) {
      console.error('Error fetching records:', error);
      setError('Failed to fetch attendance records');
    } finally {
      setRecordsLoading(false);
    }
  };

  // Optimized function to fetch both analytics and records in parallel
  const fetchAllData = async () => {
    setAnalyticsLoading(true);
    setRecordsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      params.append('start_date', format(dateRange.startDate, 'yyyy-MM-dd'));
      params.append('end_date', format(dateRange.endDate, 'yyyy-MM-dd'));
      
      if (selectedEmployee) {
        params.append('employee_id', selectedEmployee.employee_id);
      }
      
      // Fetch both analytics and records in parallel
      const [analyticsResponse, recordsResponse] = await Promise.all([
        api.get(`/attendance/analytics?${params.toString()}`),
        api.get(`/attendance/by-date-range?${params.toString()}`)
      ]);
      
      setAnalytics(analyticsResponse.data);
      setRecords(recordsResponse.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to fetch dashboard data');
    } finally {
      setAnalyticsLoading(false);
      setRecordsLoading(false);
    }
  };

  const handleEditEmployee = (employee: Employee) => {
    setEditFormData({
      name: employee.name || '',
      email: employee.email || '',
      employee_id: employee.employee_id,
      is_admin: employee.is_admin || false,
      is_active: employee.is_active !== false,
    });
    setEditDialog({ open: true, employee });
  };

  const handleSaveEmployee = async () => {
    if (!editDialog.employee) return;
    
    try {
      const updateData: any = {
        name: editFormData.name,
        email: editFormData.email,
        is_admin: editFormData.is_admin,
        is_active: editFormData.is_active,
      };
      
      if (editFormData.password && editFormData.password.trim()) {
        updateData.password = editFormData.password;
      }
      
      await api.put(`/employees/${editDialog.employee.objectId}`, updateData);
      await fetchEmployees();
      setEditDialog({ open: false, employee: null });
      setEditFormData({
        name: '',
        email: '',
        employee_id: '',
        is_admin: false,
        is_active: true,
      });
      setShowPassword(false);
    } catch (error) {
      console.error('Error updating employee:', error);
      setError('Failed to update employee');
    }
  };

  const handleDeleteEmployee = async (employee: Employee) => {
    setEmployeeDeleteDialog({ open: true, employee, loading: false });
  };

  const confirmDeleteEmployee = async () => {
    if (!employeeDeleteDialog.employee) return;
    
    setEmployeeDeleteDialog(prev => ({ ...prev, loading: true }));
    try {
      await api.delete(`/employees/${employeeDeleteDialog.employee.objectId}`);
      await fetchEmployees();
      setEmployeeDeleteDialog({ open: false, employee: null, loading: false });
    } catch (error) {
      console.error('Error deleting employee:', error);
      setError('Failed to delete employee');
      setEmployeeDeleteDialog(prev => ({ ...prev, loading: false }));
    }
  };

  const handleDelete = async (record: AttendanceRecord) => {
    setDeleteDialog({ open: true, item: record, loading: true });
    try {
      await api.delete(`/attendance/${record.objectId}`);
      await fetchRecords();
      setDeleteDialog({ open: false, item: null, loading: false });
    } catch (error) {
      console.error('Error deleting record:', error);
      setError('Failed to delete attendance record');
      setDeleteDialog({ open: false, item: null, loading: false });
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleDateRangeChange = (newDateRange: DateRangeFilter) => {
    setDateRange(newDateRange);
  };

  const handleEmployeeChange = (employee: any) => {
    setSelectedEmployee(employee);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // Filter records based on search query
  const filteredRecords = useMemo(() => {
    if (!searchQuery) return records;
    
    return records.filter(record => 
      record.employee_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (record.name && record.name.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [records, searchQuery]);

  // Filter employees based on search query
  const filteredEmployees = useMemo(() => {
    if (!employeeSearchQuery) return employees;
    
    return employees.filter(employee => 
      employee.employee_id.toLowerCase().includes(employeeSearchQuery.toLowerCase()) ||
      (employee.name && employee.name.toLowerCase().includes(employeeSearchQuery.toLowerCase())) ||
      (employee.email && employee.email.toLowerCase().includes(employeeSearchQuery.toLowerCase()))
    );
  }, [employees, employeeSearchQuery]);

  // Effects
  useEffect(() => {
    if (authState.user && isAdmin) {
      fetchAnalytics();
      fetchRecords();
      fetchEmployees();
    }
  }, [selectedEmployee, dateRange]);

  useEffect(() => {
    if (isAdmin) {
      fetchEmployees();
    }
     }, [isAdmin]);

  // Column definitions for attendance records
  const columns: GridColDef[] = [
    // Show employee name/ID column only for admins viewing all employees
    ...(isAdmin && !selectedEmployee ? [{
      field: 'name',
      headerName: 'Employee',
      width: 180,
      renderCell: (params: GridRenderCellParams) => (
        <Box>
          <Typography variant="body2" fontWeight="medium">
            {params.row.name || 'Unknown'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {params.row.employee_id}
          </Typography>
        </Box>
      ),
    }] : []),
    {
      field: 'entry_time',
      headerName: 'Entry Time',
      width: 180,
      valueFormatter: (params) => {
        try {
          return format(new Date(params.value), 'MMM dd, yyyy HH:mm');
        } catch {
          return params.value || '-';
        }
      },
    },
    {
      field: 'exit_time',
      headerName: 'Exit Time',
      width: 180,
      valueFormatter: (params) => {
        try {
          return params.value ? format(new Date(params.value), 'MMM dd, yyyy HH:mm') : '-';
        } catch {
          return params.value || '-';
        }
      },
    },
    {
      field: 'is_late',
      headerName: 'Status',
      width: 140,
      renderCell: (params: GridRenderCellParams) => {
        const isLate = params.row.is_late;
        const isEarlyExit = params.row.is_early_exit;
        
        if (isLate && isEarlyExit) {
          return <Chip label="Late + Early Exit" color="error" size="small" />;
        } else if (isLate) {
          return <Chip label="Late" color="warning" size="small" />;
        } else if (isEarlyExit) {
          return <Chip label="Early Exit" color="info" size="small" />;
        } else {
          return <Chip label="On Time" color="success" size="small" />;
        }
      },
    },
    {
      field: 'confidence',
      headerName: 'Confidence',
      width: 120,
      renderCell: (params: GridRenderCellParams) => {
        const confidence = params.value * 100;
        const color = confidence >= 90 ? 'success' : confidence >= 70 ? 'warning' : 'error';
        return <Chip label={`${confidence.toFixed(1)}%`} color={color} size="small" />;
      },
    },
    // Only show Actions column for admin users
    ...(isAdmin ? [{
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      renderCell: (params: GridRenderCellParams) => (
          <IconButton
            onClick={() => setDeleteDialog({ open: true, item: params.row, loading: false })}
            color="error"
            size="small"
          >
            <DeleteIcon />
          </IconButton>
      ),
    }] : []),
  ];

  const getDashboardTitle = () => {
    if (!isAdmin) return 'My Dashboard';
    if (selectedEmployee) return `${selectedEmployee.name}'s Dashboard`;
    return 'Admin Dashboard';
  };

  const getRecordsTitle = () => {
    if (!isAdmin) return 'My Attendance Records';
    if (selectedEmployee) return `${selectedEmployee.name}'s Records`;
    return 'All Attendance Records';
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
        {getDashboardTitle()}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {isAdmin && (
        <>
          {/* Employee Selector for Analytics */}
        <EmployeeSelectorComponent
          selectedEmployee={selectedEmployee}
          onEmployeeChange={handleEmployeeChange}
          />

          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tabs value={mainTabValue} onChange={(e, newValue) => setMainTabValue(newValue)}>
              <Tab 
                label="Analytics Overview" 
                icon={<AnalyticsIcon />} 
                iconPosition="start"
                sx={{ textTransform: 'none', fontWeight: 600 }}
              />
              <Tab 
                label="Employee Management" 
                icon={<GroupsIcon />} 
                iconPosition="start"
                sx={{ textTransform: 'none', fontWeight: 600 }}
              />
            </Tabs>
          </Box>

          <TabPanel value={mainTabValue} index={0}>
            {/* Analytics Overview Tab */}
      <DateRangePickerComponent
        dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
            />

            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab 
            label="Analytics" 
            icon={<AnalyticsIcon />}
            iconPosition="start"
                  sx={{ textTransform: 'none', fontWeight: 600 }}
          />
          <Tab 
                  label="Records" 
                  icon={<ScheduleIcon />} 
            iconPosition="start"
                  sx={{ textTransform: 'none', fontWeight: 600 }}
          />
        </Tabs>
            </Box>

      <TabPanel value={tabValue} index={0}>
        {analytics ? (
          <AttendanceAnalyticsComponent 
            analytics={analytics} 
            loading={analyticsLoading}
          />
        ) : (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
            <CircularProgress />
          </Box>
        )}
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Card>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">
                {getRecordsTitle()}
              </Typography>
              <TextField
                size="small"
                placeholder="Search records..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                      sx={{ width: 300 }}
                    />
                  </Box>

                  <DataGrid
                    rows={filteredRecords}
                    columns={columns}
                    loading={recordsLoading}
                    paginationModel={paginationModel}
                    onPaginationModelChange={setPaginationModel}
                    getRowId={(row) => row.objectId}
                    pageSizeOptions={[10, 25, 50]}
                    sx={{
                      border: 'none',
                      '& .MuiDataGrid-cell': {
                        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                      },
                    }}
                  />
                </CardContent>
              </Card>
            </TabPanel>
          </TabPanel>

          <TabPanel value={mainTabValue} index={1}>
            {/* Employee Management Tab */}
            <EmployeeManagementSection 
              employees={filteredEmployees}
              loading={employeesLoading}
              onEdit={handleEditEmployee}
              onDelete={handleDeleteEmployee}
              onRefresh={fetchEmployees}
              searchQuery={employeeSearchQuery}
              onSearchChange={setEmployeeSearchQuery}
              tabValue={employeeTabValue}
              onTabChange={(e: any, newValue: number) => setEmployeeTabValue(newValue)}
              attendanceRecords={records}
              attendanceLoading={recordsLoading}
            />
          </TabPanel>
        </>
      )}

      {/* Non-admin view */}
      {!isAdmin && (
        <Box>
          <DateRangePickerComponent
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
          />
          
          {analytics ? (
            <AttendanceAnalyticsComponent 
              analytics={analytics}
              loading={analyticsLoading}
            />
          ) : (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
              <CircularProgress />
            </Box>
          )}
        </Box>
      )}

      {/* Employee Edit Dialog */}
      <Dialog open={editDialog.open} onClose={() => setEditDialog({ open: false, employee: null })} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Employee</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Name"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={editFormData.email}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Employee ID"
                value={editFormData.employee_id}
                disabled
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="New Password (optional)"
                type={showPassword ? 'text' : 'password'}
                value={editFormData.password || ''}
                onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={editFormData.is_admin}
                    onChange={(e) => setEditFormData({ ...editFormData, is_admin: e.target.checked })}
                  />
                }
                label="Admin Access"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={editFormData.is_active}
                    onChange={(e) => setEditFormData({ ...editFormData, is_active: e.target.checked })}
                  />
                }
                label="Active"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, employee: null })}>Cancel</Button>
          <Button onClick={handleSaveEmployee} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Employee Delete Dialog */}
      <Dialog 
        open={employeeDeleteDialog.open} 
        onClose={() => setEmployeeDeleteDialog({ open: false, employee: null, loading: false })}
      >
        <DialogTitle>Delete Employee</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete employee {employeeDeleteDialog.employee?.name || employeeDeleteDialog.employee?.employee_id}? 
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmployeeDeleteDialog({ open: false, employee: null, loading: false })}>
            Cancel
          </Button>
          <Button 
            onClick={confirmDeleteEmployee} 
            variant="contained" 
            color="error"
            disabled={employeeDeleteDialog.loading}
          >
            {employeeDeleteDialog.loading ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Attendance Delete Dialog */}
      <DeleteDialog
        dialog={deleteDialog}
        title="Delete Attendance Record"
        getContentText={(record) => 
          `Are you sure you want to delete the attendance record for ${record.name || record.employee_id} at ${new Date(record.entry_time).toLocaleString()}? This action cannot be undone.`
        }
        onClose={() => setDeleteDialog({ open: false, item: null, loading: false })}
        onConfirm={() => deleteDialog.item && handleDelete(deleteDialog.item)}
      />
    </Container>
  );
} 