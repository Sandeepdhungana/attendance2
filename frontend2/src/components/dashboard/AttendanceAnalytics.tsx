import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Grid,
  Box,
  Chip,
  LinearProgress,
  useTheme,
  alpha,
  Stack,
  Divider,
  Avatar,
  Paper,
} from '@mui/material';
import {
  Schedule as ScheduleIcon,
  EventAvailable as PresentIcon,
  EventBusy as AbsentIcon,
  AccessTime as LateIcon,
  CheckCircle as OnTimeIcon,
  ExitToApp as EarlyExitIcon,
  HourglassEmpty as WorkingHoursIcon,
  Person as PersonIcon,
  Business as DepartmentIcon,
  Group as GroupIcon,
} from '@mui/icons-material';
import { AttendanceAnalytics } from '../../types/dashboard';
import { format } from 'date-fns';

interface AttendanceAnalyticsProps {
  analytics: AttendanceAnalytics;
  loading?: boolean;
}

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  progress?: number;
  unit?: string;
}> = ({ title, value, subtitle, icon, color, progress, unit }) => {
  const theme = useTheme();
  
  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        height: '100%',
        borderLeft: `4px solid ${color}`,
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: theme.shadows[4],
        },
      }}
    >
      <Stack spacing={2}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h4" fontWeight="bold" color={color}>
              {value}{unit}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {title}
            </Typography>
          </Box>
          <Avatar
            sx={{
              bgcolor: alpha(color, 0.1),
              color: color,
              width: 48,
              height: 48,
            }}
          >
            {icon}
          </Avatar>
        </Box>
        
        {progress !== undefined && (
          <Box>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: alpha(color, 0.1),
                '& .MuiLinearProgress-bar': {
                  bgcolor: color,
                  borderRadius: 4,
                },
              }}
            />
            <Typography variant="caption" color="text.secondary" mt={0.5}>
              {progress.toFixed(1)}%
            </Typography>
          </Box>
        )}
        
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
};

const AttendanceAnalyticsComponent: React.FC<AttendanceAnalyticsProps> = ({
  analytics,
  loading = false,
}) => {
  const theme = useTheme();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Typography>Loading analytics...</Typography>
      </Box>
    );
  }

  const getColorByPercentage = (percentage: number) => {
    if (percentage >= 90) return theme.palette.success.main;
    if (percentage >= 70) return theme.palette.warning.main;
    return theme.palette.error.main;
  };

  const dateRangeText = `${format(new Date(analytics.date_range.start_date), 'MMM dd, yyyy')} - ${format(new Date(analytics.date_range.end_date), 'MMM dd, yyyy')}`;
  const isAggregated = analytics.employee_info.is_aggregated;

  return (
    <Box>
      {/* Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Typography variant="h5" fontWeight="bold">
              {isAggregated ? 'Company-Wide Analytics' : 'Employee Analytics'}
            </Typography>
            <Chip
              label={dateRangeText}
              color="primary"
              variant="outlined"
              icon={<ScheduleIcon />}
            />
          </Box>
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Box display="flex" alignItems="center" gap={1}>
                {isAggregated ? <GroupIcon color="primary" /> : <PersonIcon color="primary" />}
                <Box>
                  <Typography variant="body1" fontWeight="medium">
                    {analytics.employee_info.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {isAggregated ? 'All Employees' : `ID: ${analytics.employee_info.employee_id}`}
                  </Typography>
                </Box>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Box display="flex" alignItems="center" gap={1}>
                <DepartmentIcon color="primary" />
                <Box>
                  <Typography variant="body1" fontWeight="medium">
                    {analytics.employee_info.department || 'N/A'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {isAggregated ? 'All Departments' : 'Department'}
                  </Typography>
                </Box>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Box display="flex" alignItems="center" gap={1}>
                <ScheduleIcon color="primary" />
                <Box>
                  <Typography variant="body1" fontWeight="medium">
                    {analytics.employee_info.shift?.name || 'Multiple'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {isAggregated ? 'Multiple Shifts' : 
                      `${analytics.employee_info.shift?.login_time || '09:00'} - ${analytics.employee_info.shift?.logout_time || '17:00'}`
                    }
                  </Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Metrics Cards */}
      <Grid container spacing={3}>
        {/* Attendance Summary */}
        <Grid item xs={12} md={isAggregated ? 2.4 : 3}>
          <MetricCard
            title="Present Days"
            value={analytics.attendance_summary.present_days}
            subtitle={`Out of ${analytics.date_range.working_days} working days`}
            icon={<PresentIcon />}
            color={theme.palette.success.main}
            progress={analytics.attendance_summary.attendance_percentage}
            unit=""
          />
        </Grid>
        
        <Grid item xs={12} md={isAggregated ? 2.4 : 3}>
          <MetricCard
            title="Absent Days"
            value={analytics.attendance_summary.absent_days}
            subtitle={`${analytics.date_range.total_days} total days in range`}
            icon={<AbsentIcon />}
            color={theme.palette.error.main}
            unit=""
          />
        </Grid>
        
        <Grid item xs={12} md={isAggregated ? 2.4 : 3}>
          <MetricCard
            title="On-Time Arrivals"
            value={analytics.punctuality.on_time_arrivals}
            subtitle={`${analytics.punctuality.late_arrivals} late arrivals`}
            icon={<OnTimeIcon />}
            color={getColorByPercentage(analytics.punctuality.on_time_percentage)}
            progress={analytics.punctuality.on_time_percentage}
            unit=""
          />
        </Grid>
        
        <Grid item xs={12} md={isAggregated ? 2.4 : 3}>
          <MetricCard
            title="Early Exits"
            value={analytics.punctuality.early_exits}
            subtitle={`Out of ${analytics.attendance_summary.total_records} records`}
            icon={<EarlyExitIcon />}
            color={analytics.punctuality.early_exits > 0 ? theme.palette.warning.main : theme.palette.success.main}
            unit=""
          />
        </Grid>
        
        {/* Show total employees card only for aggregated view */}
        {isAggregated && analytics.attendance_summary.total_employees && (
          <Grid item xs={12} md={2.4}>
            <MetricCard
              title="Total Employees"
              value={analytics.attendance_summary.total_employees}
              subtitle="Active employees"
              icon={<GroupIcon />}
              color={theme.palette.info.main}
              unit=""
            />
          </Grid>
        )}
        
        {/* Working Hours */}
        <Grid item xs={12} md={4}>
          <MetricCard
            title="Total Hours"
            value={analytics.working_hours.total_hours}
            subtitle={`Expected: ${analytics.working_hours.expected_total_hours}h`}
            icon={<WorkingHoursIcon />}
            color={getColorByPercentage(analytics.working_hours.hours_completion_percentage)}
            progress={analytics.working_hours.hours_completion_percentage}
            unit="h"
          />
        </Grid>
        
        <Grid item xs={12} md={4}>
          <MetricCard
            title="Average Daily Hours"
            value={analytics.working_hours.average_daily_hours}
            subtitle={`Expected: ${analytics.working_hours.expected_daily_hours}h per day`}
            icon={<ScheduleIcon />}
            color={theme.palette.info.main}
            unit="h"
          />
        </Grid>
        
        <Grid item xs={12} md={4}>
          <MetricCard
            title="Attendance Rate"
            value={analytics.attendance_summary.attendance_percentage}
            subtitle={isAggregated ? "Overall company attendance" : "Personal attendance rate"}
            icon={<PresentIcon />}
            color={getColorByPercentage(analytics.attendance_summary.attendance_percentage)}
            progress={analytics.attendance_summary.attendance_percentage}
            unit="%"
          />
        </Grid>
      </Grid>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {isAggregated ? 'Company Punctuality' : 'Punctuality Summary'}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={2}>
                <Box display="flex" justifyContent="space-between">
                  <Typography>On-Time Percentage</Typography>
                  <Chip
                    label={`${analytics.punctuality.on_time_percentage.toFixed(1)}%`}
                    color={analytics.punctuality.on_time_percentage >= 90 ? 'success' : 'warning'}
                    size="small"
                  />
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography>Late Arrivals</Typography>
                  <Chip
                    label={analytics.punctuality.late_arrivals}
                    color={analytics.punctuality.late_arrivals === 0 ? 'success' : 'error'}
                    size="small"
                  />
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography>Early Exits</Typography>
                  <Chip
                    label={analytics.punctuality.early_exits}
                    color={analytics.punctuality.early_exits === 0 ? 'success' : 'warning'}
                    size="small"
                  />
                </Box>
                {isAggregated && analytics.attendance_summary.total_employees && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography>Total Employees</Typography>
                    <Typography fontWeight="medium">
                      {analytics.attendance_summary.total_employees}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {isAggregated ? 'Company Working Hours' : 'Working Hours Summary'}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Stack spacing={2}>
                <Box display="flex" justifyContent="space-between">
                  <Typography>Hours Completion</Typography>
                  <Chip
                    label={`${analytics.working_hours.hours_completion_percentage.toFixed(1)}%`}
                    color={analytics.working_hours.hours_completion_percentage >= 90 ? 'success' : 'warning'}
                    size="small"
                  />
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography>Average Daily</Typography>
                  <Typography fontWeight="medium">
                    {analytics.working_hours.average_daily_hours.toFixed(1)}h
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography>Total Hours</Typography>
                  <Typography fontWeight="medium">
                    {analytics.working_hours.total_hours.toFixed(1)}h
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography>Total Records</Typography>
                  <Typography fontWeight="medium">
                    {analytics.attendance_summary.total_records}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AttendanceAnalyticsComponent; 