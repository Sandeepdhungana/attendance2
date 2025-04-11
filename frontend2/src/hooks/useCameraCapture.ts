import { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { SelectChangeEvent } from '@mui/material';

export const useCameraCapture = () => {
  const [image, setImage] = useState<string | null>(null);
  const [captureType, setCaptureType] = useState<'webcam' | 'upload'>('webcam');
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const webcamRef = useRef<Webcam | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setAvailableCameras(videoDevices);
        
        if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        }
      } catch (error) {
        console.error('Error enumerating cameras:', error);
        throw new Error('Failed to access cameras. Please check your camera permissions.');
      }
    };

    getCameras();
  }, []);

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
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
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