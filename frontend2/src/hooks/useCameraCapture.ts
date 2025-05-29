import { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { SelectChangeEvent } from '@mui/material';

export const useCameraCapture = () => {
  const [image, setImage] = useState<string | File | null>(null);
  const [captureType, setCaptureType] = useState<'webcam' | 'upload'>('webcam');
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const webcamRef = useRef<Webcam | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const getCameras = async () => {
      try {
        // Request permission first before enumerating devices
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop()); // Stop the stream immediately
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        console.log('Available cameras:', videoDevices);
        setAvailableCameras(videoDevices);
        
        if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        } else {
          console.warn('No video input devices found');
        }
      } catch (error) {
        console.error('Error accessing cameras:', error);
        // Don't throw error to prevent component crash, just log it
        setAvailableCameras([]);
      }
    };

    if (captureType === 'webcam') {
      getCameras();
    }
  }, [captureType]);

  const handleCameraChange = (event: SelectChangeEvent) => {
    setSelectedCamera(event.target.value);
  };

  const handleCaptureTypeChange = (
    _event: React.MouseEvent<HTMLElement>,
    newCaptureType: 'webcam' | 'upload'
  ) => {
    if (newCaptureType !== null) {
      setCaptureType(newCaptureType);
      setImage(null);
    }
  };

  const handleCapture = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setImage(imageSrc);
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log('File selected:', file.name, file.type, file.size);
      // Store the file object directly for form submission
      setImage(file);
    }
    // Clear the input to allow selecting the same file again
    if (event.target) {
      event.target.value = '';
    }
  };

  return {
    image,
    captureType,
    availableCameras,
    selectedCamera,
    webcamRef,
    fileInputRef,
    handleCameraChange,
    handleCaptureTypeChange,
    handleCapture,
    handleFileUpload,
    setImage,
  };
}; 