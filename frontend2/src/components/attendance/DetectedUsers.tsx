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
  LinearProgress,
  Avatar
} from '@mui/material';
import { format } from 'date-fns';
import { UserResult } from '../../types/attendance';

interface DetectedUsersProps {
  users: UserResult[];
}

export const DetectedUsers: React.FC<DetectedUsersProps> = ({ users }) => {
  // Filter out invalid users to prevent rendering errors
  const validUsers = React.useMemo(() => {
    return (users || []).filter(user => 
      user && typeof user === 'object'
    );
  }, [users]);
  
  if (validUsers.length === 0) return null;

  // Function to get confidence level color
  const getConfidenceColor = (similarity: number | undefined) => {
    if (!similarity) return 'primary';
    const percent = similarity * 100;
    if (percent >= 80) return 'success';
    if (percent >= 60) return 'primary';
    return 'warning';
  };

  // Format similarity as percentage
  const formatConfidence = (user: UserResult) => {
    if (user.confidence_str) return user.confidence_str;
    if (user.similarity_percent) return `${user.similarity_percent}%`;
    if (user.similarity) return `${(user.similarity * 100).toFixed(1)}%`;
    return 'N/A';
  };

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
          Detected Users
          <Chip 
            label={validUsers.length} 
            size="small" 
            color="primary" 
            sx={{ ml: 1, fontWeight: 'bold' }} 
          />
        </Typography>
        <List>
          {validUsers.map((user, index) => (
            <div key={`${user.employee_id}-${index}`}>
              <ListItem sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <Box sx={{ display: 'flex', width: '100%', mb: 1 }}>
                  <Avatar sx={{ mr: 2, bgcolor: getConfidenceColor(user.similarity) }}>
                    {user.name && user.name.charAt(0).toUpperCase() || '?'}
                  </Avatar>
                  <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="subtitle1" fontWeight="medium">
                        {user.name || 'Unknown User'}
                      </Typography>
                      <Chip 
                        label={user.confidence_str || formatConfidence(user)}
                        size="small"
                        color={getConfidenceColor(user.similarity)}
                        sx={{ fontWeight: 'bold' }}
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      ID: {user.employee_id || 'Unknown'}
                    </Typography>
                  </Box>
                </Box>

                {user.similarity && (
                  <LinearProgress
                    variant="determinate"
                    value={user.similarity_percent || user.similarity * 100}
                    color={getConfidenceColor(user.similarity)}
                    sx={{ height: 6, borderRadius: 3, mb: 1 }}
                  />
                )}
                
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {user.message}
                </Typography>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                  {user.detection_time ? (
                    <Typography variant="caption" color="text.secondary">
                      Detected: {format(new Date(user.detection_time), 'p')}
                    </Typography>
                  ) : user.timestamp ? (
                    <Typography variant="caption" color="text.secondary">
                      {format(new Date(user.timestamp), 'PPp')}
                    </Typography>
                  ) : (
                    <span></span>
                  )}
                  
                  {user.is_streaming && (
                    <Chip
                      label="LIVE"
                      size="small"
                      color="error"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  )}
                </Box>
              </ListItem>
              {index < validUsers.length - 1 && <Divider />}
            </div>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}; 