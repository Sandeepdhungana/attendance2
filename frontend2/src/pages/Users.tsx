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
} from '@mui/material';
import api from '../api/config';
import { useWebSocket } from '../App';
import { useNavigate } from 'react-router-dom';

interface User {
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
      const response = await api.get('/employees');
      setUsers(response.data);
      setError(null);
    } catch (error) {
      setError('Failed to fetch employees');
      console.error('Error fetching employees:', error);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async () => {
    try {
      const formData = new FormData();
      Object.entries(newUser).forEach(([key, value]) => {
        if (value) formData.append(key, value);
      });

      await api.post('/employees/register', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setOpenDialog(false);
      setNewUser({
        name: '',
        employee_id: '',
        department: '',
        position: '',
        status: 'active',
        shift_id: '',
      });
      fetchUsers();
    } catch (error) {
      setError('Failed to add employee');
      console.error('Error adding employee:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await api.delete(`/employees/${userId}`);
      fetchUsers();
    } catch (error) {
      setError('Failed to delete employee');
      console.error('Error deleting employee:', error);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Employees
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
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
                        onClick={() => handleDeleteUser(user.employee_id)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
        <DialogTitle>Add New Employee</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            value={newUser.name}
            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Employee ID"
            fullWidth
            value={newUser.employee_id}
            onChange={(e) => setNewUser({ ...newUser, employee_id: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Department"
            fullWidth
            value={newUser.department}
            onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Position"
            fullWidth
            value={newUser.position}
            onChange={(e) => setNewUser({ ...newUser, position: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleAddUser} variant="contained">
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 