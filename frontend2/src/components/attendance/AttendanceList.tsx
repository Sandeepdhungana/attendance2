import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  Divider,
  Box,
  Chip,
  useTheme,
  alpha,
  Paper,
  Grid,
  Avatar,
} from '@mui/material';
import { format } from 'date-fns';
import { 
  LoginOutlined, 
  LogoutOutlined, 
  AccessTime,
  Error as ErrorIcon,
  CheckCircle,
} from '@mui/icons-material';
import { AttendanceUpdate } from '../../types/attendance';

interface AttendanceListProps {
  recentAttendance: AttendanceUpdate[];
}

export const AttendanceList: React.FC<AttendanceListProps> = ({ recentAttendance }) => {
  const theme = useTheme();
  
  if (recentAttendance.length === 0) return null;

  return (
    <Card 
      sx={{ 
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
      }}
    >
      <Box sx={{ 
        p: 3, 
        backgroundColor: alpha(theme.palette.primary.main, 0.05),
        borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`
      }}>
        <Typography variant="h6" fontWeight="600" sx={{ display: 'flex', alignItems: 'center' }}>
          <AccessTime sx={{ mr: 1.5, color: theme.palette.primary.main }} />
          Recent Attendance Updates
        </Typography>
      </Box>
      
      <List sx={{ p: 0 }}>
        {recentAttendance.map((attendance, index) => (
          <React.Fragment key={`${attendance.employee_id}-${attendance.timestamp}-${index}`}>
            <ListItem
              alignItems="flex-start"
              sx={{
                px: 3,
                py: 2,
                transition: 'background-color 0.2s',
                '&:hover': {
                  backgroundColor: alpha(theme.palette.action.hover, 0.1),
                },
              }}
            >
              <Grid container spacing={2} alignItems="center">
                <Grid item>
                  <Avatar
                    sx={{
                      backgroundColor: attendance.entry_type === 'entry'
                        ? alpha(theme.palette.primary.main, 0.1)
                        : alpha(theme.palette.secondary.main, 0.1),
                      color: attendance.entry_type === 'entry'
                        ? theme.palette.primary.main
                        : theme.palette.secondary.main,
                      width: 48,
                      height: 48,
                    }}
                  >
                    {attendance.entry_type === 'entry' ? (
                      <LoginOutlined />
                    ) : (
                      <LogoutOutlined />
                    )}
                  </Avatar>
                </Grid>
                
                <Grid item xs>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="subtitle1" fontWeight="600">
                      {attendance.employee_id}
                    </Typography>
                    
                    <Chip
                      label={attendance.entry_type === 'entry' ? 'Entry' : 'Exit'}
                      size="small"
                      color={attendance.entry_type === 'entry' ? 'primary' : 'secondary'}
                      sx={{ fontWeight: 600, height: 24 }}
                    />
                    
                    {attendance.is_late && (
                      <Chip
                        label="Late"
                        size="small"
                        color="error"
                        variant="outlined"
                        sx={{ fontWeight: 600, height: 24 }}
                      />
                    )}
                    
                    {attendance.is_early_exit && (
                      <Chip
                        label="Early Exit"
                        size="small"
                        color="error"
                        variant="outlined"
                        sx={{ fontWeight: 600, height: 24 }}
                      />
                    )}
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    <AccessTime sx={{ fontSize: '0.8rem', mr: 0.5, verticalAlign: 'middle' }} />
                    {format(new Date(attendance.timestamp), 'PPpp')}
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
                    {attendance.entry_time && (
                      <Paper
                        elevation={0}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 2,
                          backgroundColor: alpha(theme.palette.primary.main, 0.1),
                        }}
                      >
                        <LoginOutlined sx={{ fontSize: '0.875rem', mr: 0.5, color: theme.palette.primary.main }} />
                        <Typography variant="caption" fontWeight="600" color="primary.main">
                          Entry: {format(new Date(attendance.entry_time), 'HH:mm')}
                        </Typography>
                      </Paper>
                    )}
                    
                    {attendance.exit_time && (
                      <Paper
                        elevation={0}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 2,
                          backgroundColor: alpha(theme.palette.secondary.main, 0.1),
                        }}
                      >
                        <LogoutOutlined sx={{ fontSize: '0.875rem', mr: 0.5, color: theme.palette.secondary.main }} />
                        <Typography variant="caption" fontWeight="600" color="secondary.main">
                          Exit: {format(new Date(attendance.exit_time), 'HH:mm')}
                        </Typography>
                      </Paper>
                    )}
                    
                    {attendance.similarity && (
                      <Paper
                        elevation={0}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 2,
                          backgroundColor: alpha(theme.palette.success.main, 0.1),
                        }}
                      >
                        <CheckCircle sx={{ fontSize: '0.875rem', mr: 0.5, color: theme.palette.success.main }} />
                        <Typography variant="caption" fontWeight="600" color="success.main">
                          Confidence: {(attendance.similarity * 100).toFixed(1)}%
                        </Typography>
                      </Paper>
                    )}
                  </Box>
                  
                  {(attendance.is_late && attendance.late_message) || 
                   (attendance.is_early_exit && attendance.early_exit_message) ? (
                    <Box sx={{ 
                      mt: 1, 
                      p: 1.5, 
                      borderRadius: 2, 
                      backgroundColor: alpha(theme.palette.error.main, 0.05),
                      borderLeft: `3px solid ${theme.palette.error.main}`,
                      display: 'flex',
                      alignItems: 'flex-start'
                    }}>
                      <ErrorIcon color="error" sx={{ mr: 1, fontSize: '1rem', mt: 0.2 }} />
                      <Typography variant="caption" color="error">
                        {attendance.late_message || attendance.early_exit_message}
                      </Typography>
                    </Box>
                  ) : null}
                </Grid>
              </Grid>
            </ListItem>
            {index < recentAttendance.length - 1 && <Divider />}
          </React.Fragment>
        ))}
      </List>
    </Card>
  );
}; 