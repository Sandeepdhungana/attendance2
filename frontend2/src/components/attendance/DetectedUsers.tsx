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
import { UserResult } from '../../types/attendance';

interface DetectedUsersProps {
  users: UserResult[];
}

export const DetectedUsers: React.FC<DetectedUsersProps> = ({ users }) => {
  if (users.length === 0) return null;

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Detected Users ({users.length})
        </Typography>
        <List>
          {users.map((user, index) => (
            <div key={`${user.employee_id}-${index}`}>
              <ListItem>
                <ListItemText
                  primary={`${user.name} (${user.employee_id})`}
                  secondary={
                    <>
                      <Typography component="span" variant="body2" color="text.primary">
                        {user.message}
                      </Typography>
                      {user.timestamp && (
                        <Typography component="span" variant="body2" color="text.secondary">
                          {' at '}
                          {format(new Date(user.timestamp), 'PPpp')}
                        </Typography>
                      )}
                      {user.similarity !== undefined && (
                        <Typography component="span" variant="body2" color="text.secondary">
                          {' • Confidence: '}
                          {(user.similarity * 100).toFixed(1)}%
                        </Typography>
                      )}
                    </>
                  }
                />
              </ListItem>
              {index < users.length - 1 && <Divider />}
            </div>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}; 