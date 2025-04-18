import React from 'react';
import {
  Typography,
  List,
  ListItem,
  Divider,
  Box,
  Chip,
  LinearProgress,
  Avatar,
  useTheme,
  alpha,
  Paper,
} from '@mui/material';
import { format } from 'date-fns';
import { 
  Person,
  CheckCircle, 
  Warning, 
  Videocam,
  AccessTime,
} from '@mui/icons-material';
import { UserResult } from '../../types/attendance';

interface DetectedUsersProps {
  users: UserResult[];
}

export const DetectedUsers: React.FC<DetectedUsersProps> = ({ users }) => {
  const theme = useTheme();
  
  // Filter out invalid users to prevent rendering errors
  const validUsers = React.useMemo(() => {
    return (users || []).filter(user => 
      user && typeof user === 'object'
    );
  }, [users]);
  
  if (validUsers.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary" variant="body2">
          No users detected
        </Typography>
      </Box>
    );
  }

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

  // Get the appropriate icon based on confidence
  const getConfidenceIcon = (similarity: number | undefined) => {
    if (!similarity) return <Person fontSize="small" />;
    const percent = similarity * 100;
    if (percent >= 80) return <CheckCircle fontSize="small" />;
    if (percent >= 60) return <Person fontSize="small" />;
    return <Warning fontSize="small" />;
  };

  return (
    <List sx={{ p: 0 }}>
      {validUsers.map((user, index) => (
        <React.Fragment key={`${user.employee_id || index}-${index}`}>
          <ListItem 
            sx={{ 
              p: 2,
              transition: 'background-color 0.2s',
              '&:hover': {
                backgroundColor: alpha(theme.palette.action.hover, 0.1),
              },
            }}
          >
            <Box sx={{ width: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                <Avatar 
                  sx={{ 
                    mr: 2, 
                    bgcolor: alpha(theme.palette[getConfidenceColor(user.similarity)].main, 0.15),
                    color: theme.palette[getConfidenceColor(user.similarity)].main,
                    fontWeight: 'bold'
                  }}
                >
                  {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                </Avatar>
                
                <Box sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle1" fontWeight="600">
                      {user.name || 'Unknown User'}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Chip 
                        icon={getConfidenceIcon(user.similarity)}
                        label={formatConfidence(user)}
                        size="small"
                        color={getConfidenceColor(user.similarity)}
                        sx={{ fontWeight: 600, height: 24 }}
                      />
                      
                      {user.is_streaming && (
                        <Chip
                          icon={<Videocam fontSize="small" />}
                          label="LIVE"
                          size="small"
                          color="error"
                          sx={{ 
                            fontWeight: 600, 
                            height: 24,
                            animation: 'pulse 1.5s infinite',
                            '@keyframes pulse': {
                              '0%': { opacity: 0.7 },
                              '50%': { opacity: 1 },
                              '100%': { opacity: 0.7 }
                            }
                          }}
                        />
                      )}
                    </Box>
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary">
                    ID: {user.employee_id || 'Unknown'}
                  </Typography>
                </Box>
              </Box>

              {user.similarity && (
                <Box sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight="500">
                      Confidence Level
                    </Typography>
                    <Typography 
                      variant="caption" 
                      fontWeight="600"
                      color={theme.palette[getConfidenceColor(user.similarity)].main}
                    >
                      {formatConfidence(user)}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={user.similarity_percent || user.similarity * 100}
                    color={getConfidenceColor(user.similarity)}
                    sx={{ 
                      height: 6, 
                      borderRadius: 3,
                      backgroundColor: alpha(theme.palette[getConfidenceColor(user.similarity)].main, 0.1)
                    }}
                  />
                </Box>
              )}
              
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  backgroundColor: alpha(theme.palette.background.default, 0.7),
                  border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                  mt: 1
                }}
              >
                <Typography variant="body2">
                  {user.message}
                </Typography>
              </Paper>
              
              {(user.detection_time || user.timestamp) && (
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 1.5 }}>
                  <AccessTime sx={{ fontSize: '0.8rem', mr: 0.5, color: theme.palette.text.secondary }} />
                  <Typography variant="caption" color="text.secondary">
                    {user.detection_time 
                      ? `Detected: ${format(new Date(user.detection_time), 'p')}`
                      : user.timestamp 
                        ? format(new Date(user.timestamp), 'PPp')
                        : ''
                    }
                  </Typography>
                </Box>
              )}
            </Box>
          </ListItem>
          {index < validUsers.length - 1 && <Divider />}
        </React.Fragment>
      ))}
    </List>
  );
}; 