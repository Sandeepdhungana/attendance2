import React from 'react';
import { Box, Typography, Paper, alpha, useTheme } from '@mui/material';
import { CheckCircle, Image } from '@mui/icons-material';

interface ImagePreviewProps {
  image: string | null;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ image }) => {
  const theme = useTheme();
  
  if (!image) return null;

  return (
    <Box sx={{ mt: 3 }}>
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'space-between',
        mb: 1,
      }}>
        <Typography variant="subtitle1" fontWeight="600" sx={{ display: 'flex', alignItems: 'center' }}>
          <CheckCircle color="success" sx={{ mr: 1, fontSize: '1.2rem' }} />
          Photo Captured
        </Typography>
        <Typography variant="caption" color="text.secondary">
          This photo will be used for face recognition
        </Typography>
      </Box>
      <Paper 
        elevation={0}
        sx={{ 
          p: 0.5, 
          overflow: 'hidden',
          borderRadius: 2,
          border: `1px solid ${alpha(theme.palette.success.main, 0.3)}`,
          backgroundColor: alpha(theme.palette.success.main, 0.05),
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <img
          src={image}
          alt="Captured"
          style={{ 
            maxWidth: '100%', 
            maxHeight: 300,
            borderRadius: 8,
            display: 'block',
          }}
        />
      </Paper>
    </Box>
  );
}; 