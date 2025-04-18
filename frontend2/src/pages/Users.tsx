import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress
} from '@mui/material';
import api from '../api/config';
import { useWebSocket } from '../App';
import { useNavigate } from 'react-router-dom';

interface User {
  objectId: string;
  employee_id: string;
  name: string;
  department: string;
  position: string;
  status: string;
  shift?: {
    name: string;
    login_time: string;
    logout_time: string;
  };
  created_at: string;
}

export default function Users() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { sendMessage } = useWebSocket();
  const [openDialog, setOpenDialog] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    employee_id: '',
    department: '',
    position: '',
    status: 'active',
    shift_id: '',
  });

  const fetchUsers = async () => {
    try {
      setIsLoadingUsers(true);
      setError(null);
      const response = await api.get('/employees');
      setUsers(response.data);
    } catch (error) {
      setError('Failed to fetch employees');
      console.error('Error fetching employees:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.employee_id) {
      setError('Name and Employee ID are required');
      return;
    }

    setIsCreatingUser(true);
    setError(null);
    setSuccess(null);
    
    try {
      const formData = new FormData();
      Object.entries(newUser).forEach(([key, value]) => {
        if (value) formData.append(key, value);
      });

      const response = await api.post('/employees/register', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      // Close dialog
      setOpenDialog(false);
      
      // Optimistic UI update
      if (response.data && response.data.objectId) {
        const newEmployee = {
          objectId: response.data.objectId,
          employee_id: newUser.employee_id,
          name: newUser.name,
          department: newUser.department,
          position: newUser.position,
          status: newUser.status,
          created_at: new Date().toISOString()
        };
        
        setUsers(prevUsers => [...prevUsers, newEmployee]);
      }
      
      // Reset form
      setNewUser({
        name: '',
        employee_id: '',
        department: '',
        position: '',
        status: 'active',
        shift_id: '',
      });
      
      // Show success message
      setSuccess('Employee added successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      setError('Failed to add employee');
      console.error('Error adding employee:', error);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    try {
      setDeleteLoading(true);
      
      // Optimistic UI update - remove user from state first
      setUsers(prevUsers => prevUsers.filter(u => u.employee_id !== user.employee_id));
      
      // Then make the API call
      const deleteId = user.objectId || user.employee_id;
      await api.delete(`/employees/${deleteId}`);
      
      // Show success message
      setSuccess(`Employee ${user.name} was successfully deleted`);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      // If the API call fails, revert by fetching all data again
      setError('Failed to delete employee. The list has been refreshed.');
      console.error('Error deleting employee:', error);
      fetchUsers();
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Employees
      </Typography>

      {error && !isLoadingUsers && !isCreatingUser && !deleteLoading && (
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
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              onClick={() => setOpenDialog(true)}
            >
              Add Employee
            </Button>
          </Box>

          {isLoadingUsers ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Employee ID</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Department</TableCell>
                    <TableCell>Position</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Shift</TableCell>
                    <TableCell>Created At</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.employee_id}>
                      <TableCell>{user.employee_id}</TableCell>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>{user.department}</TableCell>
                      <TableCell>{user.position}</TableCell>
                      <TableCell>{user.status}</TableCell>
                      <TableCell>
                        {user.shift ? (
                          <Typography variant="body2">
                            {user.shift.name} ({user.shift.login_time} - {user.shift.logout_time})
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="error">
                            No shift assigned
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{new Date(user.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button
                          color="primary"
                          onClick={() => navigate(`/shift?employee_id=${user.employee_id}`)}
                          sx={{ mr: 1 }}
                        >
                          Assign Shift
                        </Button>
                        <Button
                          color="error"
                          onClick={() => handleDeleteUser(user)}
                          disabled={deleteLoading}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && !isLoadingUsers && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                        <Typography variant="body1" color="text.secondary">
                          No employees found. Add a new employee to get started.
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
        open={openDialog} 
        onClose={() => !isCreatingUser && setOpenDialog(false)}
      >
        <DialogTitle>Add New Employee</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            value={newUser.name}
            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            disabled={isCreatingUser}
            required
          />
          <TextField
            margin="dense"
            label="Employee ID"
            fullWidth
            value={newUser.employee_id}
            onChange={(e) => setNewUser({ ...newUser, employee_id: e.target.value })}
            disabled={isCreatingUser}
            required
          />
          <TextField
            margin="dense"
            label="Department"
            fullWidth
            value={newUser.department}
            onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
            disabled={isCreatingUser}
          />
          <TextField
            margin="dense"
            label="Position"
            fullWidth
            value={newUser.position}
            onChange={(e) => setNewUser({ ...newUser, position: e.target.value })}
            disabled={isCreatingUser}
          />
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setOpenDialog(false)}
            disabled={isCreatingUser}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleAddUser} 
            variant="contained"
            disabled={isCreatingUser || !newUser.name || !newUser.employee_id}
            startIcon={isCreatingUser ? <CircularProgress size={20} /> : null}
          >
            {isCreatingUser ? 'Adding...' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 