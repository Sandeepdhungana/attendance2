import React from 'react';
import { Box, Typography, Paper, Chip, LinearProgress, alpha, useTheme } from '@mui/material';
import { Videocam, Person, Check as CheckIcon, Warning as WarningIcon } from '@mui/icons-material';
import { UserResult } from '../../types/attendance';

interface StreamingStatusProps {
  isStreaming: boolean;
  realTimeDetection?: UserResult | null;
}

export const StreamingStatus: React.FC<StreamingStatusProps> = ({ 
  isStreaming, 
  realTimeDetection 
}) => {
  const theme = useTheme();
  
  // Debug log to help diagnose issues
  React.useEffect(() => {
    if (realTimeDetection) {
      console.log('StreamingStatus received detection:', realTimeDetection);
    }
  }, [realTimeDetection]);

  if (!isStreaming) {
    return (
      <Chip 
        icon={<Videocam />}
        label="Ready"
        variant="outlined"
        color="primary"
        size="small"
        sx={{ 
          fontWeight: 600,
          px: 1,
          borderWidth: 2,
        }}
      />
    );
  }

  // Calculate confidence percentage for the progress bar
  const confidencePercent = realTimeDetection?.similarity_percent || 
                           (realTimeDetection?.similarity ? 
                             Math.round((realTimeDetection.similarity) * 100) : 0);
  
  // Determine progress bar color based on confidence
  const getConfidenceColor = () => {
    if (!confidencePercent) return 'primary';
    if (confidencePercent >= 80) return 'success';
    if (confidencePercent >= 60) return 'primary';
    return 'warning';
  };
  
  // Ensure realTimeDetection has required properties
  const isValidDetection = realTimeDetection && 
                          (realTimeDetection.name || realTimeDetection.employee_id);

  return (
    <Chip 
      icon={<Videocam />}
      label="LIVE"
      color="error"
      size="small"
      sx={{ 
        fontWeight: 700,
        px: 1,
        animation: 'pulse 1.5s infinite',
        '@keyframes pulse': {
          '0%': { opacity: 0.7 },
          '50%': { opacity: 1 },
          '100%': { opacity: 0.7 }
        }
      }}
    />
  );
}; 