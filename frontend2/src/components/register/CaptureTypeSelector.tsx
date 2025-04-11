import React from 'react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';

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
  return (
    <ToggleButtonGroup
      value={captureType}
      exclusive
      onChange={onChange}
      fullWidth
    >
      <ToggleButton value="webcam">Use Webcam</ToggleButton>
      <ToggleButton value="upload">Upload Photo</ToggleButton>
    </ToggleButtonGroup>
  );
}; 