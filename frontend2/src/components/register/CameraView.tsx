import React from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from '@mui/material';
import Webcam from 'react-webcam';

interface CameraViewProps {
  webcamRef: React.RefObject<Webcam | null>;
  availableCameras: MediaDeviceInfo[];
  selectedCamera: string;
  onCameraChange: (event: SelectChangeEvent) => void;
  onCapture: () => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  webcamRef,
  availableCameras,
  selectedCamera,
  onCameraChange,
  onCapture,
}) => {
  return (
    <>
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="camera-select-label">Select Camera</InputLabel>
        <Select
          labelId="camera-select-label"
          value={selectedCamera}
          label="Select Camera"
          onChange={onCameraChange}
        >
          {availableCameras.map((camera) => (
            <MenuItem key={camera.deviceId} value={camera.deviceId}>
              {camera.label || `Camera ${camera.deviceId}`}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Box sx={{ mb: 2 }}>
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          width="100%"
          videoConstraints={{
            width: 640,
            height: 480,
            deviceId: selectedCamera
          }}
        />
      </Box>
      <Button
        variant="contained"
        onClick={onCapture}
        fullWidth
      >
        Capture Photo
      </Button>
    </>
  );
}; 