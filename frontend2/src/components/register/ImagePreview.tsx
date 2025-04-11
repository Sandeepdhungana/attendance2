import React from 'react';
import { Box, Typography } from '@mui/material';

interface ImagePreviewProps {
  image: string | null;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ image }) => {
  if (!image) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" gutterBottom>
        Preview:
      </Typography>
      <img
        src={image}
        alt="Captured"
        style={{ maxWidth: '100%', maxHeight: 300 }}
      />
    </Box>
  );
}; 