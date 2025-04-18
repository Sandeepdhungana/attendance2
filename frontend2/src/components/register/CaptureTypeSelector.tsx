import React from 'react';
import { ToggleButton, ToggleButtonGroup, alpha, useTheme } from '@mui/material';
import { PhotoCamera, CloudUpload } from '@mui/icons-material';

interface CaptureTypeSelectorProps {
  captureType: 'webcam' | 'upload';
  onChange: (
    event: React.MouseEvent<HTMLElement>,
    newCaptureType: 'webcam' | 'upload'
  ) => void;
}

export const CaptureTypeSelector: React.FC<CaptureTypeSelectorProps> = ({
  captureType,
  onChange,
}) => {
  const theme = useTheme();
  
  return (
    <ToggleButtonGroup
      value={captureType}
      exclusive
      onChange={onChange}
      fullWidth
      aria-label="capture method"
      sx={{
        '& .MuiToggleButtonGroup-grouped': {
          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
          '&:not(:first-of-type)': {
            borderLeft: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
          },
          borderRadius: 2,
          py: 1.2,
          fontWeight: 600,
          textTransform: 'none',
          '&.Mui-selected': {
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            color: theme.palette.primary.main,
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.15),
            }
          },
          '&:hover': {
            backgroundColor: alpha(theme.palette.action.hover, 0.15),
          }
        }
      }}
    >
      <ToggleButton value="webcam" aria-label="use webcam">
        <PhotoCamera sx={{ mr: 1 }} />
        Use Webcam
      </ToggleButton>
      <ToggleButton value="upload" aria-label="upload photo">
        <CloudUpload sx={{ mr: 1 }} />
        Upload Photo
      </ToggleButton>
    </ToggleButtonGroup>
  );
}; 