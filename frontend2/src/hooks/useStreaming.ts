import { useState, useRef, useCallback } from 'react';
import { useWebSocket } from '../App';

export const useStreaming = (
  onStreamingStart?: () => void,
  onStreamingStop?: () => void
) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const { sendMessage, isConnected } = useWebSocket();
  const streamIntervalRef = useRef<number | null>(null);
  const isStreamingRef = useRef<boolean>(false);

  const startStreaming = useCallback((getScreenshot: () => string | null) => {
    if (isConnected) {
      console.log('🚀 Starting streaming...');
      setIsStreaming(true);
      isStreamingRef.current = true;
      
      // Call the start callback if provided
      if (onStreamingStart) {
        console.log('🔄 Calling onStreamingStart callback');
        onStreamingStart();
      } else {
        console.log('⚠️ No onStreamingStart callback provided');
      }
      
      const sendFrame = () => {
        if (!isStreamingRef.current) return;
        
        const imageSrc = getScreenshot();
        if (imageSrc) {
          console.log('📷 Sending streaming frame');
          sendMessage({ 
            image: imageSrc,
            entry_type: 'entry',
            streaming: true
          });
        }
      };
      
      sendFrame();
      streamIntervalRef.current = setInterval(sendFrame, 2500);
      console.log('✅ Streaming started successfully');
    } else {
      console.log('❌ Cannot start streaming - not connected');
    }
  }, [isConnected, sendMessage, onStreamingStart]);

  const stopStreaming = useCallback(() => {
    console.log('🛑 Stopping streaming...');
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    
    isStreamingRef.current = false;
    setIsStreaming(false);
    
    // Call the stop callback if provided
    if (onStreamingStop) {
      console.log('🔄 Calling onStreamingStop callback');
      onStreamingStop();
    } else {
      console.log('⚠️ No onStreamingStop callback provided');
    }
    console.log('✅ Streaming stopped successfully');
  }, [onStreamingStop]);

  const startVideoStream = useCallback((videoRef: React.RefObject<HTMLVideoElement | null>) => {
    if (videoRef.current && isConnected) {
      console.log('🎥 Starting video streaming...');
      setIsStreaming(true);
      isStreamingRef.current = true;
      
      // Call the start callback if provided
      if (onStreamingStart) {
        console.log('🔄 Calling onStreamingStart callback for video');
        onStreamingStart();
      } else {
        console.log('⚠️ No onStreamingStart callback provided for video');
      }
      
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
        console.log('🎬 Video ended, stopping streaming');
        stopStreaming();
      };
      
      videoRef.current.addEventListener('ended', handleVideoEnd);
      
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
      }
      
      sendFrame();
      streamIntervalRef.current = setInterval(sendFrame, 2500);
      console.log('✅ Video streaming started successfully');
      
      return () => {
        if (videoRef.current) {
          videoRef.current.removeEventListener('ended', handleVideoEnd);
        }
      };
    } else {
      console.log('❌ Cannot start video streaming - no video ref or not connected');
    }
  }, [isConnected, sendMessage, stopStreaming, onStreamingStart]);

  return {
    isStreaming,
    startStreaming,
    stopStreaming,
    startVideoStream,
  };
}; 