import { useState, useRef, useCallback } from 'react';
import { useWebSocket } from '../App';

export const useStreaming = (entryType: 'entry' | 'exit') => {
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
          sendMessage({ 
            image: imageSrc,
            entry_type: entryType 
          });
        }
      };
      
      sendFrame();
      streamIntervalRef.current = setInterval(sendFrame, 1000);
    }
  }, [entryType, isConnected, sendMessage]);

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
              entry_type: entryType 
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
      streamIntervalRef.current = setInterval(sendFrame, 750);
      
      return () => {
        if (videoRef.current) {
          videoRef.current.removeEventListener('ended', handleVideoEnd);
        }
      };
    }
  }, [entryType, isConnected, sendMessage, stopStreaming]);

  return {
    isStreaming,
    startStreaming,
    stopStreaming,
    startVideoStream,
  };
}; 