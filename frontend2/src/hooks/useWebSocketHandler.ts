import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../App';
import { WebSocketResponse, UserResult, AttendanceUpdate, EarlyExitReason, MessageState } from '../types/attendance';

export const useWebSocketHandler = () => {
  const { ws, isConnected, sendMessage } = useWebSocket();
  const [message, setMessage] = useState<MessageState>({ type: null, text: '' });
  const [multipleUsers, setMultipleUsers] = useState<UserResult[]>([]);
  const [faceCount, setFaceCount] = useState<number>(0);
  const [recentAttendance, setRecentAttendance] = useState<AttendanceUpdate[]>([]);
  const [earlyExitReasons, setEarlyExitReasons] = useState<EarlyExitReason[]>([]);
  const [earlyExitDialog, setEarlyExitDialog] = useState<{
    open: boolean;
    reason: EarlyExitReason | null;
  }>({
    open: false,
    reason: null,
  });
  const [realTimeDetection, setRealTimeDetection] = useState<UserResult | null>(null);

  const handleWebSocketMessage = (event: MessageEvent) => {
    try {
      const data: WebSocketResponse = JSON.parse(event.data);
      console.log('Received WebSocket message type:', data.type || data.status || 'unknown');
      
      // Handle real-time detection messages
      if (data.type === 'real_time_detection') {
        console.log('Received real-time detection:', data);
        
        // Validate the data
        if (!data.name && !data.employee_id) {
          console.warn('Received real-time detection with missing name and employee_id:', data);
        }
        
        const detectionResult: UserResult = {
          name: data.name || '',
          employee_id: data.employee_id || '',
          similarity: data.confidence || 0,
          similarity_percent: data.confidence_percent,
          confidence_str: data.confidence_str,
          detection_time: data.timestamp,
          message: data.message || `Detected with ${data.confidence_str || ''}`,
          is_streaming: true
        };
        
        // Update both real-time detection and also add to multiple users list
        setRealTimeDetection(detectionResult);
        console.log('Setting real-time detection:', detectionResult);
        
        setMultipleUsers(prev => {
          // Avoid duplicates by removing previous detections with same ID
          const filtered = prev.filter(u => 
            u.employee_id !== detectionResult.employee_id || 
            !u.is_streaming
          );
          return [detectionResult, ...filtered].slice(0, 10);
        });
        
        // Update face count for streaming
        setFaceCount(prev => Math.max(prev, 1));
        
        // Show success message in UI
        setMessage({
          type: 'success',
          text: `Detected: ${data.name} (${data.confidence_str})`,
        });
      }
      else if (data.type === 'notification') {
        // Handle notification messages
        setMessage({
          type: data.notification_type === 'success' ? 'success' : 
                data.notification_type === 'error' ? 'error' : 
                data.notification_type === 'warning' ? 'error' : null,
          text: data.message || '',
        });
      }
      else if (data.type === 'attendance_update') {
        if (data.data) {
          // Check if data.data is an array or a single object
          console.log("The attendance data is ", data.data);
          const updateData = Array.isArray(data.data) ? data.data : [data.data];
          
          updateData.forEach((update: any) => {
            console.log("Processing attendance update:", update);
            
            const entry_type = update.action === 'delete' ? 'exit' : 
                             update.action === 'early_exit_reason' ? 'exit' : 
                             update.action;
            
            // Normalize employee_id/user_id fields
            const employeeId = update.employee_id || update.user_id;
            
            const attendanceUpdate: AttendanceUpdate = {
              employee_id: employeeId,
              entry_type: entry_type as 'entry' | 'exit',
              timestamp: update.timestamp,
              is_late: update.is_late,
              is_early_exit: update.is_early_exit,
              late_message: update.late_message,
              early_exit_message: update.early_exit_message,
              similarity: update.similarity,
              entry_time: update.entry_time,
              exit_time: update.exit_time
            };
            
            setRecentAttendance(prev => {
              const newList = [attendanceUpdate, ...prev];
              return newList.slice(0, 10);
            });

            if (update.action === 'exit' && update.is_early_exit) {
              console.log("The early exit dialog is ", update);
              
              // Use employee_id directly from the update
              const employeeId = update.employee_id || update.user_id || '';
              
              if (!employeeId) {
                console.error("Missing employee_id for early exit dialog");
                return;
              }
              
              // Try to find attendance_id if available
              let attendanceId = null;
              if (update.attendance_id) {
                try {
                  attendanceId = parseInt(update.attendance_id.toString(), 10);
                } catch (err) {
                  console.error("Failed to parse attendance_id:", err);
                }
              } else if (update.id) {
                try {
                  attendanceId = parseInt(update.id.toString(), 10);
                } catch (err) {
                  console.error("Failed to parse id as attendance_id:", err);
                }
              } else if (update.objectId) {
                try {
                  attendanceId = parseInt(update.objectId.toString(), 10);
                } catch (err) {
                  console.error("Failed to parse objectId as attendance_id:", err);
                }
              }
              
              console.log("Setting early exit dialog with employee ID:", employeeId, "and attendance ID:", attendanceId);
              
              setEarlyExitDialog({
                open: true,
                reason: {
                  id: attendanceId || 0,
                  user_id: employeeId,
                  user_name: update.name || "Unknown",
                  attendance_id: attendanceId || 0,
                  name: update.name || "Unknown",
                  timestamp: update.timestamp || new Date().toISOString(),
                  reason: update.reason || ''
                },
              });
            }

            if (update.action === 'early_exit_reason') {
              console.log("The early exit reason is ", update);
              
              // Extract attendance_id from various possible sources
              let attendanceId: number | string = 0;
              if (update.attendance_id) {
                attendanceId = update.attendance_id;
              } else if (update.id) {
                attendanceId = update.id;
              } else if (update.objectId) {
                attendanceId = update.objectId;
              }
              
              setEarlyExitReasons(prev => [{
                id: Number(update.objectId || attendanceId) || 0,
                user_id: employeeId,
                user_name: update.name || "Unknown",
                attendance_id: Number(attendanceId) || 0,
                name: update.name || "Unknown",
                timestamp: update.timestamp || new Date().toISOString(),
                reason: update.reason || ''
              }, ...prev]);
            }
          });
        }
      } 
      else if (data.type === 'detection_result' || (data.multiple_users && data.users)) {
        setMultipleUsers(data.users || []);
        setFaceCount(data.users?.length || 0);
        
        const successCount = (data.users || []).filter((u: UserResult) => 
          u.message.includes('successfully') || 
          u.message.includes('already marked')
        ).length;
        
        if (successCount > 0) {
          setMessage({
            type: 'success',
            text: `Successfully processed ${successCount} user${successCount > 1 ? 's' : ''}`,
          });
        }
      }
      else if (data.status === 'processing') {
        // Image is being processed
        setMessage({
          type: 'success',
          text: data.message || 'Processing image...',
        });
      }
      else if (data.status === 'queued') {
        // Image is queued
        setMessage({
          type: 'success',
          text: data.message || 'Image queued for processing',
        });
      }
      else if (data.status === 'no_face_detected') {
        setFaceCount(0);
        setMultipleUsers([]);
        setMessage({
          type: 'error',
          text: 'No face detected in the image',
        });
      }
      else if (data.status === 'no_matching_users') {
        setMultipleUsers([]);
        setFaceCount(0);
        setMessage({
          type: 'error',
          text: 'No matching users found',
        });
      }
      else if (data.status === 'error') {
        setMessage({
          type: 'error',
          text: data.message || 'An error occurred',
        });
      }
      else if (data.status === 'success') {
        setMessage({
          type: 'success',
          text: data.message || 'Operation successful',
        });
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
      setMessage({
        type: 'error',
        text: 'Error processing server response',
      });
    }
  };

  useEffect(() => {
    if (!ws) return;

    ws.onmessage = handleWebSocketMessage;

    if (isConnected) {
      sendMessage({ type: 'get_attendance' });
      sendMessage({ type: 'get_users' });
      sendMessage({ type: 'get_early_exit_reasons' });
    }

    return () => {
      ws.onmessage = null;
    };
  }, [ws, isConnected, sendMessage]);

  return {
    message,
    multipleUsers,
    faceCount,
    recentAttendance,
    earlyExitReasons,
    earlyExitDialog,
    setEarlyExitDialog,
    sendMessage,
    isConnected,
    realTimeDetection,
  };
}; 