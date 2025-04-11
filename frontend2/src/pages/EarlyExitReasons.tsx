import { useState, useEffect } from 'react';
import {
  Box,
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
} from '@mui/material';
import api from '../api/config';

interface EarlyExitReason {
  id: number;
  user_id: string;
  user_name: string;
  attendance_id: number;
  reason: string;
  timestamp: string;
}

export default function EarlyExitReasons() {
  const [reasons, setReasons] = useState<EarlyExitReason[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReasons();
  }, []);

  const fetchReasons = async () => {
    try {
      const response = await api.get('/early-exit-reasons');
      setReasons(response.data);
    } catch (error) {
      setError('Failed to fetch early exit reasons');
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Early Exit Reasons
      </Typography>

      <Card>
        <CardContent>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>Timestamp</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reasons.map((reason) => (
                  <TableRow key={reason.id}>
                    <TableCell>{reason.user_name}</TableCell>
                    <TableCell>{reason.reason}</TableCell>
                    <TableCell>
                      {new Date(reason.timestamp).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {reasons.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="center">
                      No early exit reasons found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
} 