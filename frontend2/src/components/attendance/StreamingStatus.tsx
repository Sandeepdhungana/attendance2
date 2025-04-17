import React from 'react';
import { Box, Typography, Paper, Chip, LinearProgress } from '@mui/material';
import { UserResult } from '../../types/attendance';

interface StreamingStatusProps {
  isStreaming: boolean;
  realTimeDetection?: UserResult | null;
}

export const StreamingStatus: React.FC<StreamingStatusProps> = ({ 
  isStreaming, 
  realTimeDetection 
}) => {
  // Debug log to help diagnose issues
  React.useEffect(() => {
    if (realTimeDetection) {
      console.log('StreamingStatus received detection:', realTimeDetection);
    }
  }, [realTimeDetection]);

  if (!isStreaming) return null;

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
    <Box sx={{ mb: 3 }}>
      <Paper 
        elevation={3} 
        sx={{ 
          p: 2, 
          backgroundColor: isStreaming ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
          border: '1px solid rgba(25, 118, 210, 0.3)',
          borderRadius: 2,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <Typography 
          variant="body1" 
          color="primary" 
          sx={{ 
            fontWeight: 'medium',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span>📷 Streaming in progress...</span>
          <Chip 
            label="LIVE" 
            color="error" 
            size="small" 
            sx={{ 
              animation: 'pulse 1.5s infinite',
              '@keyframes pulse': {
                '0%': { opacity: 0.6 },
                '50%': { opacity: 1 },
                '100%': { opacity: 0.6 }
              }
            }} 
          />
        </Typography>
        
        {isValidDetection ? (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body1" fontWeight="medium">
                {realTimeDetection?.name || 'Unknown'} ({realTimeDetection?.employee_id || 'Unknown ID'})
              </Typography>
              <Chip 
                label={realTimeDetection?.confidence_str || `${confidencePercent}%`}
                color={getConfidenceColor()}
                size="small"
                sx={{ fontWeight: 'bold' }}
              />
            </Box>
            
            <LinearProgress 
              variant="determinate" 
              value={confidencePercent || 0}
              color={getConfidenceColor()}
              sx={{ height: 8, borderRadius: 4, mb: 1 }} 
            />
            
            <Typography variant="body2" color="text.secondary">
              {realTimeDetection?.message || 'Processing...'}
            </Typography>
            
            {realTimeDetection?.detection_time && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                {new Date(realTimeDetection?.detection_time).toLocaleTimeString()}
              </Typography>
            )}
          </Box>
        ) : (
          <Box sx={{ mt: 1 }}>
            <LinearProgress sx={{ height: 6, borderRadius: 3 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Waiting for faces to detect...
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}; 