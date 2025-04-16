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
} from '@mui/material';
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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchEmployees();
    fetchShifts();
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await api.get('/employees');
      setEmployees(response.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setError('Failed to load employees');
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
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Employee Shift Management
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Change Employee Shift
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Select Employee</InputLabel>
              <Select
                value={selectedEmployee}
                onChange={handleEmployeeChange}
                label="Select Employee"
              >
                {employees.map((employee) => (
                  <MenuItem key={employee.objectId} value={employee.employee_id}>
                    {employee.name} ({employee.employee_id})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Select Shift</InputLabel>
              <Select
                value={selectedShift}
                onChange={handleShiftChange}
                label="Select Shift"
              >
                {shifts.map((shift) => (
                  <MenuItem key={shift.objectId} value={shift.objectId}>
                    {shift.name} ({shift.login_time} - {shift.logout_time})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!selectedEmployee || !selectedShift}
          >
            Update Shift
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Current Employee Shifts
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Employee Name</TableCell>
                  <TableCell>Employee ID</TableCell>
                  <TableCell>Current Shift</TableCell>
                  <TableCell>Shift Times</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.objectId}>
                    <TableCell>{employee.name}</TableCell>
                    <TableCell>{employee.employee_id}</TableCell>
                    <TableCell>
                      {employee.shift ? employee.shift.name : 'No shift assigned'}
                    </TableCell>
                    <TableCell>
                      {employee.shift ? (
                        `${employee.shift.login_time} - ${employee.shift.logout_time}`
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
} 