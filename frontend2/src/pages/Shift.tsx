import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
} from '@mui/material';
import api from '../api/config';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface Employee {
  employee_id: string;
  name: string;
  department: string;
  position: string;
  status: string;
  shift_id: string;
  objectId: string;
}

interface Shift {
  objectId: string;
  name: string;
  login_time: string;
  logout_time: string;
}

export default function Shift() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const employeeIdFromUrl = searchParams.get('employee_id');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchEmployees();
    fetchShifts();
    if (employeeIdFromUrl) {
      setSelectedEmployee(employeeIdFromUrl);
    }
  }, [employeeIdFromUrl]);

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

  const handleSubmit = async () => {
    if (!selectedEmployee || !selectedShift) {
      setError('Please select both employee and shift');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Find the selected employee to get their current details
      const currentEmployee = employees.find(emp => emp.employee_id === selectedEmployee);
      if (!currentEmployee) {
        throw new Error('Employee not found');
      }

      await api.put(`/employees/${currentEmployee.objectId}`, {
        shift_id: selectedShift
      });
      
      setSuccess('Shift updated successfully');
      fetchEmployees(); // Refresh the employee list
      if (employeeIdFromUrl) {
        navigate('/employees'); // Navigate back to employees list
      }
    } catch (error) {
      console.error('Error updating shift:', error);
      setError('Failed to update shift');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', p: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Assign Shift
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

          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Select Employee</InputLabel>
            <Select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              label="Select Employee"
            >
              {employees.map((employee) => (
                <MenuItem key={employee.employee_id} value={employee.employee_id}>
                  {employee.name} ({employee.employee_id})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Select Shift</InputLabel>
            <Select
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              label="Select Shift"
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
            disabled={loading}
            fullWidth
          >
            {loading ? <CircularProgress size={24} /> : 'Update Shift'}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
} 