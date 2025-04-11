import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import { format } from 'date-fns';
import { AttendanceUpdate } from '../../types/attendance';

interface AttendanceListProps {
  recentAttendance: AttendanceUpdate[];
}

export const AttendanceList: React.FC<AttendanceListProps> = ({ recentAttendance }) => {
  if (recentAttendance.length === 0) return null;

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Recent Attendance Updates
        </Typography>
        <List>
          {recentAttendance.map((attendance, index) => (
            <div key={`${attendance.user_id}-${attendance.timestamp}-${index}`}>
              <ListItem>
                <ListItemText
                  primary={`${attendance.name} (${attendance.user_id})`}
                  secondary={
                    <>
                      <Typography component="span" variant="body2" color="text.primary">
                        {attendance.entry_type === 'entry' ? 'Entry' : 'Exit'} Recorded
                      </Typography>
                      <Typography component="span" variant="body2" color="text.secondary">
                        {' at '}
                        {format(new Date(attendance.timestamp), 'PPpp')}
                      </Typography>
                      {attendance.entry_time && (
                        <Typography component="span" variant="body2" color="text.secondary">
                          {' • Entry: '}
                          {format(new Date(attendance.entry_time), 'HH:mm')}
                        </Typography>
                      )}
                      {attendance.exit_time && (
                        <Typography component="span" variant="body2" color="text.secondary">
                          {' • Exit: '}
                          {format(new Date(attendance.exit_time), 'HH:mm')}
                        </Typography>
                      )}
                      {attendance.similarity && (
                        <Typography component="span" variant="body2" color="text.secondary">
                          {' • Confidence: '}
                          {(attendance.similarity * 100).toFixed(1)}%
                        </Typography>
                      )}
                      {attendance.is_late && attendance.late_message && (
                        <Typography component="span" variant="body2" color="error">
                          {' • '}
                          {attendance.late_message}
                        </Typography>
                      )}
                      {attendance.is_early_exit && attendance.early_exit_message && (
                        <Typography component="span" variant="body2" color="error">
                          {' • '}
                          {attendance.early_exit_message}
                        </Typography>
                      )}
                    </>
                  }
                />
              </ListItem>
              {index < recentAttendance.length - 1 && <Divider />}
            </div>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}; 