import { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';

export const useCamera = () => {
  const [isVideoMode, setIsVideoMode] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string>('');
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const webcamRef = useRef<Webcam>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoPreview(url);
      setIsVideoMode(true);
    }
  };

  const handleCameraChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    setSelectedCamera(event.target.value as string);
  };

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
      }
    };

    getCameras();
  }, []);

  return {
    isVideoMode,
    videoFile,
    videoPreview,
    availableCameras,
    selectedCamera,
    webcamRef,
    videoRef,
    handleVideoChange,
    handleCameraChange,
    setIsVideoMode,
  };
}; 