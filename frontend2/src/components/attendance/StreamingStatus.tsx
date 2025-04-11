import React from 'react';
import { Typography } from '@mui/material';

interface StreamingStatusProps {
  isStreaming: boolean;
}

export const StreamingStatus: React.FC<StreamingStatusProps> = ({ isStreaming }) => {
  if (!isStreaming) return null;

  return (
    <Typography variant="body2" color="primary" sx={{ mb: 2, textAlign: 'center' }}>
      Streaming in progress...
    </Typography>
  );
}; 