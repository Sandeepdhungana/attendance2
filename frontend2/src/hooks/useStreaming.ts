import { useState, useRef, useCallback } from 'react';
import { useWebSocket } from '../App';

export const useStreaming = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const { sendMessage, isConnected } = useWebSocket();
  const streamIntervalRef = useRef<number | null>(null);
  const isStreamingRef = useRef<boolean>(false);

  const startStreaming = useCallback((getScreenshot: () => string | null) => {
    if (isConnected) {
      setIsStreaming(true);
      isStreamingRef.current = true;
      
      const sendFrame = () => {
        if (!isStreamingRef.current) return;
        
        const imageSrc = getScreenshot();
        if (imageSrc) {
          console.log('Sending streaming frame');
          sendMessage({ 
            image: imageSrc,
            entry_type: 'entry',
            streaming: true
          });
        }
      };
      
      sendFrame();
      streamIntervalRef.current = setInterval(sendFrame, 2500);
    }
  }, [isConnected, sendMessage]);

  const stopStreaming = useCallback(() => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, []);

  const startVideoStream = useCallback((videoRef: React.RefObject<HTMLVideoElement | null>) => {
    if (videoRef.current && isConnected) {
      setIsStreaming(true);
      isStreamingRef.current = true;
      
      const sendFrame = () => {
        if (!isStreamingRef.current) return;
        
        if (videoRef.current) {
          if (videoRef.current.ended) {
            stopStreaming();
            return;
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0);
            const imageSrc = canvas.toDataURL('image/jpeg');
            sendMessage({ 
              image: imageSrc,
              entry_type: 'entry',
              streaming: true
            });
          }
        }
      };
      
      const handleVideoEnd = () => {
        stopStreaming();
      };
      
      videoRef.current.addEventListener('ended', handleVideoEnd);
      
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
      }
      
      sendFrame();
      streamIntervalRef.current = setInterval(sendFrame, 2500);
      
      return () => {
        if (videoRef.current) {
          videoRef.current.removeEventListener('ended', handleVideoEnd);
        }
      };
    }
  }, [isConnected, sendMessage, stopStreaming]);

  return {
    isStreaming,
    startStreaming,
    stopStreaming,
    startVideoStream,
  };
}; 