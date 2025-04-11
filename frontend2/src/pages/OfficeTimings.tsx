import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import api from '../api/config';

interface OfficeTiming {
  login_time: string | null;
  logout_time: string | null;
}

export default function OfficeTimings() {
  const [timings, setTimings] = useState<OfficeTiming>({
    login_time: null,
    logout_time: null,
  });
  const [newLoginTime, setNewLoginTime] = useState('');
  const [newLogoutTime, setNewLogoutTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchTimings();
  }, []);

  const fetchTimings = async () => {
    try {
      const response = await api.get('/office-timings');
      setTimings(response.data);
    } catch (error) {
      setError('Failed to fetch office timings');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('login_time', newLoginTime);
      formData.append('logout_time', newLogoutTime);

      await api.post('/office-timings', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setSuccess('Office timings updated successfully');
      fetchTimings();
    } catch (error) {
      setError('Failed to update office timings');
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Office Timings
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Current Timings
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Login Time</TableCell>
                  <TableCell>{timings.login_time || 'Not set'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Logout Time</TableCell>
                  <TableCell>{timings.logout_time || 'Not set'}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Update Timings
          </Typography>
          <form onSubmit={handleSubmit}>
            <Box sx={{ mb: 2 }}>
              <TextField
                fullWidth
                label="Login Time"
                type="time"
                value={newLoginTime}
                onChange={(e) => setNewLoginTime(e.target.value)}
                InputLabelProps={{
                  shrink: true,
                }}
                inputProps={{
                  step: 300, // 5 min
                }}
              />
            </Box>
            <Box sx={{ mb: 2 }}>
              <TextField
                fullWidth
                label="Logout Time"
                type="time"
                value={newLogoutTime}
                onChange={(e) => setNewLogoutTime(e.target.value)}
                InputLabelProps={{
                  shrink: true,
                }}
                inputProps={{
                  step: 300, // 5 min
                }}
              />
            </Box>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
            <Button type="submit" variant="contained" color="primary">
              Update Timings
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
} 