import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  TextField,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
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
  };
}

export default function Shifts() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newShift, setNewShift] = useState({
    name: '',
    login_time: '',
    logout_time: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; shiftId: string | null }>({
    open: false,
    shiftId: null,
  });
  const [assignDialog, setAssignDialog] = useState<{ open: boolean; shiftId: string | null }>({
    open: false,
    shiftId: null,
  });
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');

  useEffect(() => {
    fetchShifts();
    fetchEmployees();
  }, []);

  const fetchShifts = async () => {
    try {
      const response = await api.get('/shifts');
      setShifts(response.data);
      setError(null);
    } catch (error) {
      setError('Failed to fetch shifts');
      console.error('Error fetching shifts:', error);
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await api.get('/employees');
      setEmployees(response.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newShift.name || !newShift.login_time || !newShift.logout_time) {
      setError('Please fill in all fields');
      return;
    }

    try {
      await api.post('/shifts', newShift);
      setSuccess('Shift created successfully');
      setNewShift({ name: '', login_time: '', logout_time: '' });
      fetchShifts();
    } catch (error) {
      setError('Failed to create shift');
      console.error('Error creating shift:', error);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.shiftId) return;

    try {
      await api.delete(`/shifts/${deleteDialog.shiftId}`);
      setSuccess('Shift deleted successfully');
      setDeleteDialog({ open: false, shiftId: null });
      fetchShifts();
    } catch (error) {
      setError('Failed to delete shift');
      console.error('Error deleting shift:', error);
    }
  };

  const handleAssignShift = async () => {
    if (!assignDialog.shiftId || !selectedEmployee) return;

    try {
      await api.put(`/employees/${selectedEmployee}`, {
        shift_id: assignDialog.shiftId
      });
      setSuccess('Shift assigned successfully');
      setAssignDialog({ open: false, shiftId: null });
      setSelectedEmployee('');
      fetchEmployees();
    } catch (error) {
      setError('Failed to assign shift');
      console.error('Error assigning shift:', error);
    }
  };

  const getEmployeesInShift = (shiftId: string) => {
    return employees.filter(emp => emp.shift?.objectId === shiftId);
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Manage Shifts
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
            Add New Shift
          </Typography>
          <form onSubmit={handleSubmit}>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <TextField
                label="Shift Name"
                value={newShift.name}
                onChange={(e) => setNewShift({ ...newShift, name: e.target.value })}
                required
              />
              <TextField
                label="Login Time"
                type="time"
                value={newShift.login_time}
                onChange={(e) => setNewShift({ ...newShift, login_time: e.target.value })}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 300 }}
                required
              />
              <TextField
                label="Logout Time"
                type="time"
                value={newShift.logout_time}
                onChange={(e) => setNewShift({ ...newShift, logout_time: e.target.value })}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 300 }}
                required
              />
            </Box>
            <Button type="submit" variant="contained">
              Add Shift
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Existing Shifts
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Shift Name</TableCell>
                  <TableCell>Login Time</TableCell>
                  <TableCell>Logout Time</TableCell>
                  <TableCell>Assigned Employees</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shifts.map((shift) => {
                  const shiftEmployees = getEmployeesInShift(shift.objectId);
                  return (
                    <TableRow key={shift.objectId}>
                      <TableCell>{shift.name}</TableCell>
                      <TableCell>{shift.login_time}</TableCell>
                      <TableCell>{shift.logout_time}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {shiftEmployees.map(emp => (
                            <Chip
                              key={emp.objectId}
                              label={`${emp.name} (${emp.employee_id})`}
                              size="small"
                            />
                          ))}
                          {shiftEmployees.length === 0 && (
                            <Typography variant="body2" color="text.secondary">
                              No employees assigned
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <IconButton
                          color="primary"
                          onClick={() => setAssignDialog({ open: true, shiftId: shift.objectId })}
                          sx={{ mr: 1 }}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          color="error"
                          onClick={() => setDeleteDialog({ open: true, shiftId: shift.objectId })}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, shiftId: null })}
      >
        <DialogTitle>Delete Shift</DialogTitle>
        <DialogContent>
          Are you sure you want to delete this shift? This action cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, shiftId: null })}>
            Cancel
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={assignDialog.open}
        onClose={() => {
          setAssignDialog({ open: false, shiftId: null });
          setSelectedEmployee('');
        }}
      >
        <DialogTitle>Assign Employee to Shift</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Select Employee</InputLabel>
            <Select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              label="Select Employee"
            >
              {employees.map((employee) => (
                <MenuItem key={employee.objectId} value={employee.employee_id}>
                  {employee.name} ({employee.employee_id})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAssignDialog({ open: false, shiftId: null });
              setSelectedEmployee('');
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssignShift}
            color="primary"
            variant="contained"
            disabled={!selectedEmployee}
          >
            Assign
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 