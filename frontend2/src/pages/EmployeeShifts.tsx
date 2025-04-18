import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
  alpha,
  Grid,
  Chip,
  Divider,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  AccessTime,
  Update as UpdateIcon,
  Person as PersonIcon,
  Schedule as ScheduleIcon,
  Check as CheckIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import api from '../api/config';

interface Shift {
  objectId: string;
  name: string;
  login_time: string;
  logout_time: string;
}

interface Employee {
  objectId: string;
  employee_id: string;
  name: string;
  shift?: {
    objectId: string;
    name: string;
    login_time: string;
    logout_time: string;
  };
}

export default function EmployeeShifts() {
  const theme = useTheme();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchEmployees();
    fetchShifts();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await api.get('/employees');
      setEmployees(response.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setError('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const fetchShifts = async () => {
    try {
      const response = await api.get('/shifts');
      setShifts(response.data);
    } catch (error) {
      console.error('Error fetching shifts:', error);
      setError('Failed to load shifts');
    }
  };

  const handleEmployeeChange = (e: any) => {
    const employeeId = e.target.value;
    setSelectedEmployee(employeeId);
    const employee = employees.find(emp => emp.employee_id === employeeId);
    setSelectedShift(employee?.shift?.objectId || '');
  };

  const handleShiftChange = (e: any) => {
    setSelectedShift(e.target.value);
  };

  const handleSubmit = async () => {
    if (!selectedEmployee || !selectedShift) {
      setError('Please select both employee and shift');
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('shift_id', selectedShift);
      
      const employee = employees.find(emp => emp.employee_id === selectedEmployee);
      if (!employee) {
        setError('Employee not found');
        return;
      }
      console.log(selectedShift);

      await api.put(`/employees/${employee.objectId}`, {
        shift_id: selectedShift
      });
      setSuccess('Shift updated successfully');
      fetchEmployees();
    } catch (error) {
      setError('Failed to update shift');
      console.error('Error updating shift:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
        <ScheduleIcon 
          fontSize="large" 
          sx={{ 
            color: theme.palette.primary.main,
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            p: 1,
            borderRadius: 2,
            mr: 2
          }} 
        />
        <Typography variant="h4" fontWeight="700" color="text.primary">
          Employee Shift Management
        </Typography>
      </Box>

      {error && !loading && (
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

      {success && (
        <Alert 
          severity="success" 
          sx={{ 
            mb: 3,
            borderRadius: 2,
            '& .MuiAlert-icon': {
              alignItems: 'center'
            }
          }}
        >
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card 
            sx={{ 
              borderRadius: 3,
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
              height: '100%'
            }}
          >
            <Box sx={{ 
              p: 3, 
              backgroundColor: alpha(theme.palette.primary.main, 0.05),
              borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`
            }}>
              <Typography variant="h6" fontWeight="600" sx={{ display: 'flex', alignItems: 'center' }}>
                <UpdateIcon sx={{ mr: 1.5, color: theme.palette.primary.main }} />
                Update Employee Shift
              </Typography>
            </Box>
            
            <CardContent sx={{ p: 3 }}>
              <FormControl 
                fullWidth 
                sx={{ 
                  mb: 3,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                  }
                }}
              >
                <InputLabel>Select Employee</InputLabel>
                <Select
                  value={selectedEmployee}
                  onChange={handleEmployeeChange}
                  label="Select Employee"
                  startAdornment={<PersonIcon sx={{ mr: 1, ml: -0.5, color: theme.palette.text.secondary }} />}
                >
                  {employees.map((employee) => (
                    <MenuItem key={employee.objectId} value={employee.employee_id}>
                      {employee.name} ({employee.employee_id})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl 
                fullWidth 
                sx={{ 
                  mb: 3,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                  }
                }}
              >
                <InputLabel>Select Shift</InputLabel>
                <Select
                  value={selectedShift}
                  onChange={handleShiftChange}
                  label="Select Shift"
                  startAdornment={<AccessTime sx={{ mr: 1, ml: -0.5, color: theme.palette.text.secondary }} />}
                >
                  {shifts.map((shift) => (
                    <MenuItem key={shift.objectId} value={shift.objectId}>
                      {shift.name} ({shift.login_time} - {shift.logout_time})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={!selectedEmployee || !selectedShift || loading}
                startIcon={<UpdateIcon />}
                sx={{ 
                  borderRadius: 2,
                  py: 1.2,
                  px: 3,
                  textTransform: 'none',
                  fontWeight: 600,
                  boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
                }}
              >
                {loading ? 'Updating...' : 'Update Shift'}
              </Button>

              {selectedEmployee && (
                <Box sx={{ mt: 3, pt: 3, borderTop: `1px dashed ${alpha(theme.palette.divider, 0.7)}` }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Current Assignment
                  </Typography>
                  {employees.find(emp => emp.employee_id === selectedEmployee)?.shift ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Chip
                        icon={<CheckIcon />}
                        label={employees.find(emp => emp.employee_id === selectedEmployee)?.shift?.name}
                        color="primary"
                        variant="outlined"
                        sx={{ alignSelf: 'flex-start' }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        {employees.find(emp => emp.employee_id === selectedEmployee)?.shift?.login_time} - {employees.find(emp => emp.employee_id === selectedEmployee)?.shift?.logout_time}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No shift currently assigned
                    </Typography>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={8}>
          <Card 
            sx={{ 
              borderRadius: 3,
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
            }}
          >
            <Box sx={{ 
              p: 3, 
              backgroundColor: alpha(theme.palette.primary.main, 0.05),
              borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`
            }}>
              <Typography variant="h6" fontWeight="600" sx={{ display: 'flex', alignItems: 'center' }}>
                <ScheduleIcon sx={{ mr: 1.5, color: theme.palette.primary.main }} />
                Current Employee Shifts
              </Typography>
            </Box>
            
            <CardContent sx={{ p: 0 }}>
              <TableContainer>
                <Table>
                  <TableHead sx={{ backgroundColor: alpha(theme.palette.background.default, 0.7) }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, py: 2 }}>Employee Name</TableCell>
                      <TableCell sx={{ fontWeight: 600, py: 2 }}>Employee ID</TableCell>
                      <TableCell sx={{ fontWeight: 600, py: 2 }}>Current Shift</TableCell>
                      <TableCell sx={{ fontWeight: 600, py: 2 }}>Shift Times</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {employees.map((employee) => (
                      <TableRow 
                        key={employee.objectId}
                        sx={{ 
                          '&:hover': { 
                            backgroundColor: alpha(theme.palette.primary.main, 0.03),
                          }
                        }}
                      >
                        <TableCell sx={{ 
                          py: 1.8,
                          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`
                        }}>
                          <Typography variant="body2" fontWeight="500">
                            {employee.name}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ 
                          py: 1.8,
                          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`
                        }}>
                          <Chip 
                            label={employee.employee_id} 
                            size="small" 
                            sx={{ 
                              fontWeight: 500,
                              backgroundColor: alpha(theme.palette.primary.main, 0.1),
                              color: theme.palette.primary.main,
                            }} 
                          />
                        </TableCell>
                        <TableCell sx={{ 
                          py: 1.8,
                          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`
                        }}>
                          {employee.shift ? (
                            <Typography variant="body2" fontWeight="500" color="text.primary">
                              {employee.shift.name}
                            </Typography>
                          ) : (
                            <Typography variant="body2" color="text.secondary" fontStyle="italic">
                              No shift assigned
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ 
                          py: 1.8,
                          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`
                        }}>
                          {employee.shift ? (
                            <Box sx={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              backgroundColor: alpha(theme.palette.success.main, 0.1),
                              borderRadius: 1.5,
                              py: 0.5,
                              px: 1.5,
                              maxWidth: 'fit-content'
                            }}>
                              <AccessTime 
                                sx={{ 
                                  mr: 1, 
                                  fontSize: '0.875rem', 
                                  color: theme.palette.success.main
                                }} 
                              />
                              <Typography 
                                variant="body2" 
                                color="success.main" 
                                fontWeight="600"
                                sx={{ fontSize: '0.8125rem' }}
                              >
                                {employee.shift.login_time} - {employee.shift.logout_time}
                              </Typography>
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              N/A
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
} 