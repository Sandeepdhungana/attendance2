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
  CircularProgress
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Group as GroupIcon } from '@mui/icons-material';
import api from '../api/config';

interface Shift {
  objectId: string;
  name: string;
  login_time: string;
  logout_time: string;
  grace_period?: number;
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
    grace_period: 15,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCreatingShift, setIsCreatingShift] = useState(false);
  const [isLoadingShifts, setIsLoadingShifts] = useState(false);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; shiftId: string | null }>({
    open: false,
    shiftId: null,
  });
  const [assignDialog, setAssignDialog] = useState<{ open: boolean; shiftId: string | null }>({
    open: false,
    shiftId: null,
  });
  const [editDialog, setEditDialog] = useState<{ 
    open: boolean; 
    shift: Shift | null 
  }>({
    open: false,
    shift: null,
  });
  const [editedShift, setEditedShift] = useState<{
    name: string;
    login_time: string;
    logout_time: string;
    grace_period: number;
  }>({
    name: '',
    login_time: '',
    logout_time: '',
    grace_period: 0,
  });
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');

  useEffect(() => {
    fetchShifts();
    fetchEmployees();
  }, []);

  const fetchShifts = async () => {
    try {
      setIsLoadingShifts(true);
      setError(null);
      const response = await api.get('/shifts');
      setShifts(response.data);
    } catch (error) {
      setError('Failed to fetch shifts');
      console.error('Error fetching shifts:', error);
    } finally {
      setIsLoadingShifts(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      setIsLoadingEmployees(true);
      const response = await api.get('/employees');
      setEmployees(response.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setIsLoadingEmployees(false);
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

    setIsCreatingShift(true);
    
    try {
      // Make the API call first (we need the objectId from the response)
      const response = await api.post('/shifts', newShift);
      
      // If we have a valid response with an objectId
      if (response.data && response.data.objectId) {
        // Create a new shift object with the response data
        const createdShift = {
          objectId: response.data.objectId,
          name: newShift.name,
          login_time: newShift.login_time,
          logout_time: newShift.logout_time,
          grace_period: newShift.grace_period,
          created_at: new Date().toISOString()
        };
        
        // Update the shifts state by adding the new shift
        setShifts(prevShifts => [...prevShifts, createdShift]);
        
        // Show success message
        setSuccess('Shift created successfully');
        
        // Reset the form
        setNewShift({ name: '', login_time: '', logout_time: '', grace_period: 15 });
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      } else {
        // Handle case where response doesn't have expected data
        console.error('Invalid response format from API:', response);
        setError('Failed to create shift: Invalid response from server');
        fetchShifts(); // Fallback to fetching all shifts
      }
    } catch (error) {
      setError('Failed to create shift');
      console.error('Error creating shift:', error);
    } finally {
      setIsCreatingShift(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.shiftId) return;

    // Store the shift ID that's being deleted
    const shiftIdToDelete = deleteDialog.shiftId;
    
    // Optimistic UI update - remove the shift from state first
    setShifts(prevShifts => prevShifts.filter(shift => shift.objectId !== shiftIdToDelete));
    
    // Close dialog immediately for better UX
    setDeleteDialog({ open: false, shiftId: null });
    
    try {
      // Then make the API call
      await api.delete(`/shifts/${shiftIdToDelete}`);
      
      // Show success message
      setSuccess('Shift deleted successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      // If the API call fails, revert by fetching all data again
      setError('Failed to delete shift. The list has been refreshed.');
      console.error('Error deleting shift:', error);
      fetchShifts();
    }
  };

  const handleAssignShift = async () => {
    if (!assignDialog.shiftId || !selectedEmployee) return;

    // Store the shift and employee IDs
    const shiftId = assignDialog.shiftId;
    const employeeId = selectedEmployee;
    
    // Get the employee and shift objects
    const employeeToUpdate = employees.find(emp => emp.employee_id === employeeId);
    const shiftToAssign = shifts.find(shift => shift.objectId === shiftId);
    
    if (!employeeToUpdate || !shiftToAssign) {
      setError('Employee or shift not found');
      return;
    }

    // Optimistic UI update - update employee in state first
    setEmployees(prevEmployees => 
      prevEmployees.map(emp => 
        emp.employee_id === employeeId
          ? {
              ...emp,
              shift: {
                objectId: shiftToAssign.objectId,
                name: shiftToAssign.name,
                login_time: shiftToAssign.login_time,
                logout_time: shiftToAssign.logout_time
              }
            }
          : emp
      )
    );

    // Close dialog immediately for better UX
    setAssignDialog({ open: false, shiftId: null });
    setSelectedEmployee('');
    
    try {
      // Then make the API call
      await api.put(`/employees/${employeeToUpdate.objectId}`, {
        shift_id: shiftId
      });
      
      // Show success message
      setSuccess('Shift assigned successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      // If the API call fails, revert by fetching employees data again
      setError('Failed to assign shift. The list has been refreshed.');
      console.error('Error assigning shift:', error);
      fetchEmployees();
    }
  };

  const handleEdit = (shift: Shift) => {
    setEditedShift({
      name: shift.name,
      login_time: shift.login_time,
      logout_time: shift.logout_time,
      grace_period: shift.grace_period || 0,
    });
    setEditDialog({
      open: true,
      shift: shift,
    });
  };

  const handleUpdateShift = async () => {
    if (!editDialog.shift) return;
    
    // Store the shift to be updated
    const shiftToUpdate = editDialog.shift;
    const updatedShiftData = editedShift;
    
    // Optimistic UI update - update the shift in state first
    setShifts(prevShifts => 
      prevShifts.map(shift => 
        shift.objectId === shiftToUpdate.objectId
          ? { 
              ...shift, 
              name: updatedShiftData.name,
              login_time: updatedShiftData.login_time,
              logout_time: updatedShiftData.logout_time,
              grace_period: updatedShiftData.grace_period
            }
          : shift
      )
    );
    
    // Close dialog immediately for better UX
    setEditDialog({ open: false, shift: null });
    
    try {
      // Then make the API call
      await api.put(`/shifts/${shiftToUpdate.objectId}`, updatedShiftData);
      
      // Show success message
      setSuccess('Shift updated successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      // If the API call fails, revert by fetching all data again
      setError('Failed to update shift. The list has been refreshed.');
      console.error('Error updating shift:', error);
      fetchShifts();
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

      {error && !isLoadingShifts && !isCreatingShift && (
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
                disabled={isCreatingShift}
              />
              <TextField
                label="Login Time"
                type="time"
                value={newShift.login_time}
                onChange={(e) => setNewShift({ ...newShift, login_time: e.target.value })}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 300 }}
                required
                disabled={isCreatingShift}
              />
              <TextField
                label="Logout Time"
                type="time"
                value={newShift.logout_time}
                onChange={(e) => setNewShift({ ...newShift, logout_time: e.target.value })}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 300 }}
                required
                disabled={isCreatingShift}
              />
              <TextField
                label="Grace Period (minutes)"
                type="number"
                value={newShift.grace_period}
                onChange={(e) => setNewShift({ ...newShift, grace_period: parseInt(e.target.value) || 0 })}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: 0, max: 60, step: 5 }}
                required
                disabled={isCreatingShift}
              />
            </Box>
            <Button 
              type="submit" 
              variant="contained"
              disabled={isCreatingShift}
              startIcon={isCreatingShift ? <CircularProgress size={20} /> : null}
            >
              {isCreatingShift ? 'Creating...' : 'Add Shift'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Existing Shifts
          </Typography>
          {isLoadingShifts ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Shift Name</TableCell>
                    <TableCell>Login Time</TableCell>
                    <TableCell>Logout Time</TableCell>
                    <TableCell>Grace Period (min)</TableCell>
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
                        <TableCell>{shift.grace_period || 0}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {isLoadingEmployees ? (
                              <CircularProgress size={20} />
                            ) : (
                              <>
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
                              </>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <IconButton
                            color="primary"
                            onClick={() => handleEdit(shift)}
                            sx={{ mr: 1 }}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            color="secondary"
                            onClick={() => setAssignDialog({ open: true, shiftId: shift.objectId })}
                            sx={{ mr: 1 }}
                          >
                            <GroupIcon />
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
                  {shifts.length === 0 && !isLoadingShifts && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                        <Typography variant="body1" color="text.secondary">
                          No shifts found. Add a new shift to get started.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
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

      <Dialog
        open={editDialog.open}
        onClose={() => setEditDialog({ open: false, shift: null })}
      >
        <DialogTitle>Edit Shift</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2, minWidth: '400px' }}>
            <TextField
              label="Shift Name"
              value={editedShift.name}
              onChange={(e) => setEditedShift({ ...editedShift, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Login Time"
              type="time"
              value={editedShift.login_time}
              onChange={(e) => setEditedShift({ ...editedShift, login_time: e.target.value })}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
              fullWidth
              required
            />
            <TextField
              label="Logout Time"
              type="time"
              value={editedShift.logout_time}
              onChange={(e) => setEditedShift({ ...editedShift, logout_time: e.target.value })}
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
              fullWidth
              required
            />
            <TextField
              label="Grace Period (minutes)"
              type="number"
              value={editedShift.grace_period}
              onChange={(e) => setEditedShift({ ...editedShift, grace_period: parseInt(e.target.value) || 0 })}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: 0, max: 60, step: 5 }}
              fullWidth
              required
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, shift: null })}>
            Cancel
          </Button>
          <Button 
            onClick={handleUpdateShift} 
            color="primary" 
            variant="contained"
            disabled={!editedShift.name || !editedShift.login_time || !editedShift.logout_time}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 