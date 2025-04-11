import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Box,
} from '@mui/material';
import { OfficeTiming } from '../../types/officeTimings';

interface TimingsTableProps {
  timings: OfficeTiming[];
  loading: boolean;
}

export function TimingsTable({ timings, loading }: TimingsTableProps) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Login Time</TableCell>
            <TableCell>Logout Time</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {timings.map((timing, index) => (
            <TableRow key={index}>
              <TableCell>{timing.login_time || 'Not set'}</TableCell>
              <TableCell>{timing.logout_time || 'Not set'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
} 