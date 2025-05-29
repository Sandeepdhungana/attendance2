import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Grid,
  TextField,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  useTheme,
  alpha,
  Autocomplete,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import {
  FilterList,
  Person,
  CalendarMonth,
  Schedule,
  ExitToApp,
  Warning,
  CheckCircle,
  EventBusy,
  Analytics,
  ExpandMore,
  AccessTime,
  Timeline,
  FileDownload,
  TableChart,
} from '@mui/icons-material';
import { format, parseISO, eachDayOfInterval, isWeekend } from 'date-fns';
import * as XLSX from 'xlsx';
import api from '../api/config';

interface Employee {
  employee_id: string;
  name: string;
  department: string;
  position: string;
}

interface AttendanceRecord {
  objectId: string;
  id: string;
  employee_id: string;
  name: string;
  timestamp: string;
  entry_time: string;
  exit_time: string | null;
  is_late: boolean;
  is_early_exit: boolean;
  early_exit_reason?: string;
  late_message?: string;
  confidence: number;
  created_at: string;
  updated_at: string;
}

interface FilteredAttendanceData {
  records: AttendanceRecord[];
  summary: {
    totalDays: number;
    presentDays: number;
    lateDays: number;
    earlyExitDays: number;
    absentDays: number;
    incompleteRecords: number;
    onTimeDays: number;
    absentDates: string[];
    latePercentage: number;
    attendancePercentage: number;
  };
}

export default function Filter() {
  const theme = useTheme();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attendanceData, setAttendanceData] = useState<FilteredAttendanceData | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Fetch employees on component mount
  useEffect(() => {
    fetchEmployees();
  }, []);

  // Auto-clear success message
  useEffect(() => {
    if (exportSuccess) {
      const timer = setTimeout(() => {
        setExportSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [exportSuccess]);

  const fetchEmployees = async () => {
    try {
      const response = await api.get('/employees');
      setEmployees(response.data);
    } catch (err) {
      console.error('Error fetching employees:', err);
      setError('Failed to fetch employees');
    }
  };

  const generateDateRange = (start: Date, end: Date): string[] => {
    return eachDayOfInterval({ start, end })
      .filter(date => !isWeekend(date)) // Exclude weekends
      .map(date => format(date, 'yyyy-MM-dd'));
  };

  const processAttendanceData = (records: AttendanceRecord[], startDate: Date, endDate: Date): FilteredAttendanceData => {
    // Generate all working days in the range
    const allDates = generateDateRange(startDate, endDate);
    
    // Group records by date
    const recordsByDate = new Map<string, AttendanceRecord[]>();
    records.forEach(record => {
      const recordDate = format(new Date(record.entry_time), 'yyyy-MM-dd');
      if (!recordsByDate.has(recordDate)) {
        recordsByDate.set(recordDate, []);
      }
      recordsByDate.get(recordDate)!.push(record);
    });

    // Calculate statistics
    const presentDates = Array.from(recordsByDate.keys());
    const absentDates = allDates.filter(date => !recordsByDate.has(date));
    
    let lateDays = 0;
    let earlyExitDays = 0;
    let incompleteRecords = 0;
    let onTimeDays = 0;

    records.forEach(record => {
      if (record.is_late) lateDays++;
      if (record.is_early_exit) earlyExitDays++;
      if (!record.exit_time) incompleteRecords++;
      if (!record.is_late && !record.is_early_exit && record.exit_time) onTimeDays++;
    });

    const totalDays = allDates.length;
    const presentDays = presentDates.length;
    const absentDays = absentDates.length;
    
    return {
      records,
      summary: {
        totalDays,
        presentDays,
        lateDays,
        earlyExitDays,
        absentDays,
        incompleteRecords,
        onTimeDays,
        absentDates,
        latePercentage: presentDays > 0 ? (lateDays / presentDays) * 100 : 0,
        attendancePercentage: totalDays > 0 ? (presentDays / totalDays) * 100 : 0,
      }
    };
  };

  const handleFilter = async () => {
    if (!selectedEmployee || !startDate || !endDate) {
      setError('Please select an employee and date range');
      return;
    }

    if (startDate > endDate) {
      setError('Start date must be before end date');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch attendance records for each date in the range
      const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
      const allRecords: AttendanceRecord[] = [];

      for (const date of dateRange) {
        const dateStr = format(date, 'yyyy-MM-dd');
        try {
          const response = await api.get(`/attendance/by-date/${dateStr}`);
          const dayRecords = response.data.filter((record: AttendanceRecord) => 
            record.employee_id === selectedEmployee.employee_id
          );
          allRecords.push(...dayRecords);
        } catch (err) {
          console.warn(`Failed to fetch data for ${dateStr}:`, err);
        }
      }

      const processedData = processAttendanceData(allRecords, startDate, endDate);
      setAttendanceData(processedData);
    } catch (err) {
      console.error('Error fetching attendance data:', err);
      setError('Failed to fetch attendance data');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timeString: string | null) => {
    if (!timeString) return 'N/A';
    try {
      const date = new Date(timeString);
      if (isNaN(date.getTime())) {
        return 'Invalid time';
      }
      return format(date, 'HH:mm:ss');
    } catch (error) {
      console.error('Error formatting time:', error, 'Input:', timeString);
      return 'Invalid time';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      return format(date, 'MMM dd, yyyy');
    } catch (error) {
      console.error('Error formatting date:', error, 'Input:', dateString);
      return 'Invalid date';
    }
  };

  const exportToExcel = () => {
    if (!attendanceData || !selectedEmployee || !startDate || !endDate) {
      setError('No data available to export');
      return;
    }

    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Sheet 1: Summary Report
      const summaryData = [
        ['Attendance Analytics Report'],
        [''],
        ['Employee Information'],
        ['Employee Name', selectedEmployee.name],
        ['Employee ID', selectedEmployee.employee_id],
        ['Department', selectedEmployee.department],
        ['Position', selectedEmployee.position],
        [''],
        ['Report Period'],
        ['Start Date', format(startDate, 'MMM dd, yyyy')],
        ['End Date', format(endDate, 'MMM dd, yyyy')],
        [''],
        ['Summary Statistics'],
        ['Metric', 'Value', 'Percentage'],
        ['Total Working Days', attendanceData.summary.totalDays, ''],
        ['Present Days', attendanceData.summary.presentDays, `${attendanceData.summary.attendancePercentage.toFixed(1)}%`],
        ['Absent Days', attendanceData.summary.absentDays, `${((attendanceData.summary.absentDays / attendanceData.summary.totalDays) * 100).toFixed(1)}%`],
        ['Late Days', attendanceData.summary.lateDays, `${attendanceData.summary.latePercentage.toFixed(1)}%`],
        ['Early Exit Days', attendanceData.summary.earlyExitDays, `${attendanceData.summary.presentDays > 0 ? ((attendanceData.summary.earlyExitDays / attendanceData.summary.presentDays) * 100).toFixed(1) : 0}%`],
        ['On-Time Days', attendanceData.summary.onTimeDays, `${attendanceData.summary.presentDays > 0 ? ((attendanceData.summary.onTimeDays / attendanceData.summary.presentDays) * 100).toFixed(1) : 0}%`],
        ['Incomplete Records', attendanceData.summary.incompleteRecords, ''],
        [''],
        ['Absent Dates'],
        ...attendanceData.summary.absentDates.map(date => [format(new Date(date), 'MMM dd, yyyy (EEEE)')])
      ];

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      
      // Auto-size columns
      const summaryColWidths = [
        { wch: 20 }, // Column A
        { wch: 25 }, // Column B
        { wch: 15 }  // Column C
      ];
      summarySheet['!cols'] = summaryColWidths;

      // Add formatting for headers
      summarySheet['A1'] = { v: 'Attendance Analytics Report', t: 's' };
      
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary Report');

      // Sheet 2: Detailed Attendance Records
      if (attendanceData.records.length > 0) {
        const attendanceHeaders = [
          'Date',
          'Employee ID',
          'Employee Name',
          'Entry Time',
          'Exit Time',
          'Status',
          'Late',
          'Early Exit',
          'Late Reason',
          'Early Exit Reason',
          'Confidence',
          'Duration (Hours)'
        ];

        const attendanceRows = attendanceData.records.map(record => {
          const entryTime = new Date(record.entry_time);
          const exitTime = record.exit_time ? new Date(record.exit_time) : null;
          const duration = exitTime ? 
            ((exitTime.getTime() - entryTime.getTime()) / (1000 * 60 * 60)).toFixed(2) : 
            'Incomplete';

          let status = 'Present';
          if (record.is_late && record.is_early_exit) status = 'Late & Early Exit';
          else if (record.is_late) status = 'Late';
          else if (record.is_early_exit) status = 'Early Exit';
          else if (!record.exit_time) status = 'Incomplete';

          return [
            format(entryTime, 'MMM dd, yyyy'),
            record.employee_id,
            record.name,
            format(entryTime, 'HH:mm:ss'),
            exitTime ? format(exitTime, 'HH:mm:ss') : 'N/A',
            status,
            record.is_late ? 'Yes' : 'No',
            record.is_early_exit ? 'Yes' : 'No',
            record.late_message || '',
            record.early_exit_reason || '',
            `${(record.confidence * 100).toFixed(1)}%`,
            duration
          ];
        });

        const attendanceData2D = [attendanceHeaders, ...attendanceRows];
        const attendanceSheet = XLSX.utils.aoa_to_sheet(attendanceData2D);
        
        // Auto-size columns for attendance sheet
        const attendanceColWidths = [
          { wch: 15 }, // Date
          { wch: 12 }, // Employee ID
          { wch: 20 }, // Employee Name
          { wch: 12 }, // Entry Time
          { wch: 12 }, // Exit Time
          { wch: 15 }, // Status
          { wch: 8 },  // Late
          { wch: 12 }, // Early Exit
          { wch: 25 }, // Late Reason
          { wch: 25 }, // Early Exit Reason
          { wch: 12 }, // Confidence
          { wch: 15 }  // Duration
        ];
        attendanceSheet['!cols'] = attendanceColWidths;

        XLSX.utils.book_append_sheet(workbook, attendanceSheet, 'Attendance Records');
      }

      // Sheet 3: Daily Analysis
      const dateRange = eachDayOfInterval({ start: startDate, end: endDate })
        .filter(date => !isWeekend(date));
      
      const dailyAnalysisHeaders = ['Date', 'Day', 'Status', 'Entry Time', 'Exit Time', 'Duration', 'Notes'];
      const dailyAnalysisRows = dateRange.map(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayRecord = attendanceData.records.find(record => 
          format(new Date(record.entry_time), 'yyyy-MM-dd') === dateStr
        );

        if (dayRecord) {
          const entryTime = new Date(dayRecord.entry_time);
          const exitTime = dayRecord.exit_time ? new Date(dayRecord.exit_time) : null;
          const duration = exitTime ? 
            ((exitTime.getTime() - entryTime.getTime()) / (1000 * 60 * 60)).toFixed(2) + ' hours' : 
            'Incomplete';

          let status = 'Present';
          let notes = [];
          if (dayRecord.is_late) {
            status = 'Late';
            notes.push('Late arrival');
          }
          if (dayRecord.is_early_exit) {
            status = status === 'Late' ? 'Late & Early Exit' : 'Early Exit';
            notes.push('Early departure');
          }
          if (!dayRecord.exit_time) {
            notes.push('No exit recorded');
          }

          return [
            format(date, 'MMM dd, yyyy'),
            format(date, 'EEEE'),
            status,
            format(entryTime, 'HH:mm:ss'),
            exitTime ? format(exitTime, 'HH:mm:ss') : 'N/A',
            duration,
            notes.join(', ')
          ];
        } else {
          return [
            format(date, 'MMM dd, yyyy'),
            format(date, 'EEEE'),
            'Absent',
            'N/A',
            'N/A',
            'N/A',
            'No attendance recorded'
          ];
        }
      });

      const dailyAnalysisData = [dailyAnalysisHeaders, ...dailyAnalysisRows];
      const dailyAnalysisSheet = XLSX.utils.aoa_to_sheet(dailyAnalysisData);
      
      const dailyColWidths = [
        { wch: 15 }, // Date
        { wch: 12 }, // Day
        { wch: 15 }, // Status
        { wch: 12 }, // Entry Time
        { wch: 12 }, // Exit Time
        { wch: 15 }, // Duration
        { wch: 30 }  // Notes
      ];
      dailyAnalysisSheet['!cols'] = dailyColWidths;

      XLSX.utils.book_append_sheet(workbook, dailyAnalysisSheet, 'Daily Analysis');

      // Generate filename
      const filename = `Attendance_Report_${selectedEmployee.name.replace(/\s+/g, '_')}_${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}.xlsx`;
      
      // Save the file
      XLSX.writeFile(workbook, filename);
      
      // Show success message
      setError(null);
      setExportSuccess('Report exported successfully');
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      setError('Failed to export data to Excel');
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
        <FilterList 
          fontSize="large" 
          sx={{ 
            color: theme.palette.primary.main,
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            p: 1,
            borderRadius: 2,
            mr: 2
          }} 
        />
        <Typography variant="h4" fontWeight="700" color="text.primary">
          Attendance Filter & Analytics
        </Typography>
      </Box>

      {/* Filter Controls */}
      <Card sx={{ mb: 3, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight="600" sx={{ mb: 3 }}>
            Filter Options
          </Typography>
          
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={4}>
              <Autocomplete
                options={employees}
                getOptionLabel={(option) => `${option.name} (${option.employee_id})`}
                value={selectedEmployee}
                onChange={(_, newValue) => setSelectedEmployee(newValue)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Search Employee"
                    placeholder="Type employee name or ID..."
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: <Person sx={{ mr: 1, color: 'text.secondary' }} />,
                    }}
                  />
                )}
                renderOption={(props, option) => (
                  <Box component="li" {...props}>
                    <Box>
                      <Typography variant="body1" fontWeight="500">
                        {option.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        ID: {option.employee_id} • {option.department}
                      </Typography>
                    </Box>
                  </Box>
                )}
              />
            </Grid>

            <Grid item xs={12} md={3}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Start Date"
                  value={startDate}
                  onChange={setStartDate}
                  slotProps={{
                    textField: {
                      fullWidth: true
                    }
                  }}
                />
              </LocalizationProvider>
            </Grid>

            <Grid item xs={12} md={3}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="End Date"
                  value={endDate}
                  onChange={setEndDate}
                  slotProps={{
                    textField: {
                      fullWidth: true
                    }
                  }}
                />
              </LocalizationProvider>
            </Grid>

            <Grid item xs={12} md={2}>
              <Button
                variant="contained"
                size="large"
                fullWidth
                onClick={handleFilter}
                disabled={loading || !selectedEmployee || !startDate || !endDate}
                startIcon={loading ? <CircularProgress size={20} /> : <Analytics />}
                sx={{ height: 56 }}
              >
                {loading ? 'Filtering...' : 'Filter'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Success Alert */}
      {exportSuccess && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {exportSuccess}
        </Alert>
      )}

      {/* Results */}
      {attendanceData && (
        <Grid container spacing={3}>
          {/* Summary Cards */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h5" fontWeight="600">
                  Summary for {selectedEmployee?.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {startDate && endDate && 
                    `Period: ${format(startDate, 'MMM dd, yyyy')} - ${format(endDate, 'MMM dd, yyyy')}`
                  }
                </Typography>
              </Box>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  startIcon={<FileDownload />}
                  onClick={exportToExcel}
                  sx={{
                    borderRadius: 2,
                    px: 3,
                    py: 1,
                    textTransform: 'none',
                    fontWeight: 600,
                    backgroundColor: theme.palette.success.main,
                    '&:hover': {
                      backgroundColor: theme.palette.success.dark,
                    }
                  }}
                >
                  Export to Excel
                </Button>
              </Stack>
            </Box>
          </Grid>

          {/* Statistics Grid */}
          <Grid item xs={12} md={6} lg={3}>
            <Card sx={{ borderRadius: 2, borderLeft: `4px solid ${theme.palette.success.main}` }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h4" fontWeight="700" color="success.main">
                      {attendanceData.summary.presentDays}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Present Days
                    </Typography>
                  </Box>
                  <CheckCircle sx={{ fontSize: 40, color: 'success.main', opacity: 0.7 }} />
                </Box>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {attendanceData.summary.attendancePercentage.toFixed(1)}% attendance rate
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6} lg={3}>
            <Card sx={{ borderRadius: 2, borderLeft: `4px solid ${theme.palette.warning.main}` }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h4" fontWeight="700" color="warning.main">
                      {attendanceData.summary.lateDays}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Late Days
                    </Typography>
                  </Box>
                  <Schedule sx={{ fontSize: 40, color: 'warning.main', opacity: 0.7 }} />
                </Box>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {attendanceData.summary.latePercentage.toFixed(1)}% of present days
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6} lg={3}>
            <Card sx={{ borderRadius: 2, borderLeft: `4px solid ${theme.palette.error.main}` }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h4" fontWeight="700" color="error.main">
                      {attendanceData.summary.absentDays}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Absent Days
                    </Typography>
                  </Box>
                  <EventBusy sx={{ fontSize: 40, color: 'error.main', opacity: 0.7 }} />
                </Box>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Excluding weekends
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6} lg={3}>
            <Card sx={{ borderRadius: 2, borderLeft: `4px solid ${theme.palette.info.main}` }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h4" fontWeight="700" color="info.main">
                      {attendanceData.summary.earlyExitDays}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Early Exits
                    </Typography>
                  </Box>
                  <ExitToApp sx={{ fontSize: 40, color: 'info.main', opacity: 0.7 }} />
                </Box>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {attendanceData.summary.incompleteRecords} incomplete records
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Additional Statistics */}
          <Grid item xs={12}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="h6" fontWeight="600">
                  Detailed Statistics
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ p: 2, backgroundColor: alpha(theme.palette.success.main, 0.05), borderRadius: 2 }}>
                      <Typography variant="subtitle2" fontWeight="600" color="success.main">
                        On-Time Days
                      </Typography>
                      <Typography variant="h5" fontWeight="700">
                        {attendanceData.summary.onTimeDays}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Days with complete on-time attendance
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ p: 2, backgroundColor: alpha(theme.palette.warning.main, 0.05), borderRadius: 2 }}>
                      <Typography variant="subtitle2" fontWeight="600" color="warning.main">
                        Incomplete Records
                      </Typography>
                      <Typography variant="h5" fontWeight="700">
                        {attendanceData.summary.incompleteRecords}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Records missing exit time
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Grid>

          {/* Absent Dates */}
          {attendanceData.summary.absentDates.length > 0 && (
            <Grid item xs={12}>
              <Card sx={{ borderRadius: 2 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight="600" sx={{ mb: 2 }}>
                    Absent Dates
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                    {attendanceData.summary.absentDates.map(date => (
                      <Chip 
                        key={date} 
                        label={format(new Date(date), 'MMM dd, yyyy (EEEE)')}
                        color="error"
                        variant="outlined"
                        size="small"
                      />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* Attendance Records Table */}
          <Grid item xs={12}>
            <Card sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant="h6" fontWeight="600" sx={{ mb: 2 }}>
                  Detailed Attendance Records
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Entry Time</TableCell>
                        <TableCell>Exit Time</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Late Status</TableCell>
                        <TableCell>Early Exit</TableCell>
                        <TableCell>Confidence</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {attendanceData.records.length > 0 ? (
                        attendanceData.records.map((record) => (
                          <TableRow key={record.objectId} hover>
                            <TableCell>
                              <Typography variant="body2" fontWeight="500">
                                {formatDate(record.entry_time)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <AccessTime sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                                {formatTime(record.entry_time)}
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <ExitToApp sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                                {formatTime(record.exit_time)}
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={record.exit_time ? 'Complete' : 'Incomplete'}
                                color={record.exit_time ? 'success' : 'warning'}
                                size="small"
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              {record.is_late ? (
                                <Chip
                                  label="Late"
                                  color="error"
                                  size="small"
                                  icon={<Warning />}
                                />
                              ) : (
                                <Chip
                                  label="On Time"
                                  color="success"
                                  size="small"
                                  icon={<CheckCircle />}
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              {record.is_early_exit ? (
                                <Box>
                                  <Chip
                                    label="Early Exit"
                                    color="warning"
                                    size="small"
                                    icon={<ExitToApp />}
                                  />
                                  {record.early_exit_reason && (
                                    <Typography variant="caption" color="text.secondary" display="block">
                                      {record.early_exit_reason}
                                    </Typography>
                                  )}
                                </Box>
                              ) : (
                                <Chip
                                  label="Normal"
                                  color="default"
                                  size="small"
                                  variant="outlined"
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {(record.confidence * 100).toFixed(1)}%
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} align="center">
                            <Typography variant="body2" color="text.secondary">
                              No attendance records found for the selected period
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
} 