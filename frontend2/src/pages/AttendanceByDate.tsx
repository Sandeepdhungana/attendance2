import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  alpha,
  useTheme,
  IconButton,
  Chip,
  TextField,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Tooltip
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { 
  CalendarMonth, 
  ArrowBack, 
  ArrowForward, 
  Today, 
  AccessTime, 
  ExitToApp, 
  Warning, 
  CheckCircle,
  Print
} from '@mui/icons-material';
import { format, addDays } from 'date-fns';
import api from '../api/config';

interface AttendanceRecord {
  objectId: string;
  id: string;
  employee_id: string;
  name: string;
  entry_time: string;
  exit_time: string | null;
  is_late: boolean;
  is_early_exit: boolean;
  early_exit_reason?: string;
  late_message?: string;
}

const AttendanceByDate: React.FC = () => {
  const theme = useTheme();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Format date for display
  const formattedDate = format(selectedDate, 'EEEE, MMMM d, yyyy');
  const apiDateFormat = format(selectedDate, 'yyyy-MM-dd');

  // Fetch attendance data for the selected date
  const fetchAttendanceByDate = async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/attendance/by-date/${date}`);
      setAttendanceRecords(response.data);
    } catch (err: any) {
      console.error('Error fetching attendance data:', err);
      setError('Failed to load attendance records. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Navigate to previous day
  const goToPreviousDay = () => {
    const newDate = addDays(selectedDate, -1);
    setSelectedDate(newDate);
  };

  // Navigate to next day
  const goToNextDay = () => {
    const newDate = addDays(selectedDate, 1);
    setSelectedDate(newDate);
  };

  // Go to today
  const goToToday = () => {
    setSelectedDate(new Date());
  };

  // Format time from ISO string
  const formatTime = (timeString: string | null | undefined) => {
    if (!timeString) return '—';
    try {
      return format(new Date(timeString), 'h:mm:ss a');
    } catch (e) {
      return timeString;
    }
  };

  // Calculate the duration between entry and exit times
  const calculateDuration = (entryTime: string | null, exitTime: string | null) => {
    if (!entryTime || !exitTime) return '—';

    try {
      const entry = new Date(entryTime);
      const exit = new Date(exitTime);
      const diffMs = exit.getTime() - entry.getTime();
      
      // Calculate hours, minutes, seconds
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else {
        return `${minutes}m`;
      }
    } catch (e) {
      return '—';
    }
  };

  // Print attendance report
  const printAttendanceReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <html>
        <head>
          <title>Attendance Report - ${formattedDate}</title>
          <style>
            body { font-family: Arial, sans-serif; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .late { color: #f44336; }
            .early-exit { color: #ff9800; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <h1>Attendance Report</h1>
          <p>Date: ${formattedDate}</p>
          <p>Total Employees: ${attendanceRecords.length}</p>
          
          <table>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Entry Time</th>
                <th>Exit Time</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${attendanceRecords.map(record => `
                <tr>
                  <td>${record.employee_id}</td>
                  <td>${record.name}</td>
                  <td>${formatTime(record.entry_time)} ${record.is_late ? '<span class="late">(Late)</span>' : ''}</td>
                  <td>${formatTime(record.exit_time)} ${record.is_early_exit ? '<span class="early-exit">(Early)</span>' : ''}</td>
                  <td>${calculateDuration(record.entry_time, record.exit_time)}</td>
                  <td>
                    ${record.is_late ? `<div class="late">Late: ${record.late_message || 'Late entry'}</div>` : ''}
                    ${record.is_early_exit ? `<div class="early-exit">Early Exit: ${record.early_exit_reason || 'Left early'}</div>` : ''}
                    ${!record.is_late && !record.is_early_exit ? 'Regular' : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="footer">
            <p>Generated on: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  // Fetch data when selected date changes
  useEffect(() => {
    fetchAttendanceByDate(apiDateFormat);
  }, [selectedDate]);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', p: 3 }}>
      <Typography variant="h4" fontWeight="700" color="text.primary" sx={{ mb: 3 }}>
        Attendance by Date
      </Typography>

      {/* Date Navigation Controls */}
      <Paper
        sx={{ 
          p: 2, 
          mb: 3, 
          borderRadius: 2,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2
        }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <IconButton onClick={goToPreviousDay}>
            <ArrowBack />
          </IconButton>
          
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DatePicker
              label="Select Date"
              value={selectedDate}
              onChange={(newDate) => newDate && setSelectedDate(newDate)}
              slotProps={{ 
                textField: { 
                  size: "small",
                  sx: { width: 150 }
                }
              }}
            />
          </LocalizationProvider>
          
          <IconButton onClick={goToNextDay}>
            <ArrowForward />
          </IconButton>
          
          <Button 
            variant="outlined" 
            startIcon={<Today />}
            onClick={goToToday}
            size="small"
          >
            Today
          </Button>
        </Stack>
        
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography 
            variant="h6" 
            fontWeight="600"
            sx={{ 
              minWidth: 250,
              display: { xs: 'none', sm: 'block' } 
            }}
          >
            {formattedDate}
          </Typography>
          
          <Tooltip title="Print Attendance Report">
            <IconButton 
              onClick={printAttendanceReport}
              disabled={loading || attendanceRecords.length === 0}
              sx={{ color: theme.palette.primary.main }}
            >
              <Print />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>

      {/* Date display for mobile */}
      <Typography 
        variant="h6" 
        fontWeight="600"
        sx={{ 
          mb: 2,
          display: { xs: 'block', sm: 'none' } 
        }}
      >
        {formattedDate}
      </Typography>

      {/* Error message if any */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Loading indicator */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* No records message */}
      {!loading && attendanceRecords.length === 0 && (
        <Paper
          sx={{ 
            p: 4, 
            borderRadius: 2,
            textAlign: 'center',
            backgroundColor: alpha(theme.palette.background.default, 0.6)
          }}
        >
          <CalendarMonth sx={{ fontSize: 60, color: alpha(theme.palette.text.secondary, 0.5), mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No attendance records found for this date
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Try selecting a different date or check back later
          </Typography>
        </Paper>
      )}

      {/* Attendance Records Table */}
      {!loading && attendanceRecords.length > 0 && (
        <TableContainer component={Paper} sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Table>
            <TableHead sx={{ backgroundColor: alpha(theme.palette.primary.main, 0.05) }}>
              <TableRow>
                <TableCell>Employee ID</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Entry Time</TableCell>
                <TableCell>Exit Time</TableCell>
                <TableCell>Duration</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {attendanceRecords.map((record) => (
                <TableRow key={record.objectId} hover>
                  <TableCell>{record.employee_id}</TableCell>
                  <TableCell>{record.name}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AccessTime fontSize="small" sx={{ color: theme.palette.text.secondary }} />
                      {formatTime(record.entry_time)}
                      {record.is_late && (
                        <Chip 
                          size="small" 
                          label="Late" 
                          color="error" 
                          variant="outlined"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {record.exit_time ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ExitToApp fontSize="small" sx={{ color: theme.palette.text.secondary }} />
                        {formatTime(record.exit_time)}
                        {record.is_early_exit && (
                          <Chip 
                            size="small" 
                            label="Early" 
                            color="warning" 
                            variant="outlined"
                            sx={{ ml: 1 }}
                          />
                        )}
                      </Box>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    {calculateDuration(record.entry_time, record.exit_time)}
                  </TableCell>
                  <TableCell>
                    {record.is_late && (
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          color: theme.palette.error.main,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          mb: record.is_early_exit ? 1 : 0
                        }}
                      >
                        <Warning fontSize="small" />
                        {record.late_message || "Late entry"}
                      </Typography>
                    )}
                    {record.is_early_exit && (
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          color: theme.palette.warning.main,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5
                        }}
                      >
                        <Warning fontSize="small" />
                        {record.early_exit_reason || "Left early"}
                      </Typography>
                    )}
                    {!record.is_late && !record.is_early_exit && (
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          color: theme.palette.success.main,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5
                        }}
                      >
                        <CheckCircle fontSize="small" />
                        Regular
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default AttendanceByDate; 