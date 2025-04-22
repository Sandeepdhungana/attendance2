import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../App';
import { WebSocketResponse, UserResult, AttendanceUpdate, EarlyExitReason, MessageState } from '../types/attendance';

// Helper for debugging
const logAttendanceState = (label: string, items: AttendanceUpdate[]) => {
  console.log(`${label} (${items.length} items):`);
  items.forEach((item, i) => {
    console.log(`  ${i + 1}. ID: ${item.objectId || 'missing'}, Employee: ${item.employee_id}, Type: ${item.entry_type}, Time: ${new Date(item.timestamp).toLocaleTimeString()}`);
  });
};

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
          console.log("Received attendance data: ", data.data);
          const updateData = Array.isArray(data.data) ? data.data : [data.data];
          
          // Process all updates at once
          const newAttendances: AttendanceUpdate[] = [];
          
          updateData.forEach((update: any) => {
            console.log("Processing attendance update:", update);
            
            const entry_type = update.action === 'delete' ? 'exit' : 
                             update.action === 'early_exit_reason' ? 'exit' : 
                             update.action;
            
            // Normalize employee_id/user_id fields
            const employeeId = update.employee_id || update.user_id;
            
            // Normalize attendance_id/objectId more consistently
            let attendanceId = null;
            if (update.objectId) {
              attendanceId = update.objectId.toString();
              console.log(`Using objectId for attendance record: ${attendanceId}`);
            } else if (update.attendance_id) {
              attendanceId = update.attendance_id.toString();
              console.log(`Using attendance_id field: ${attendanceId}`);
              
              // Validate that attendance_id is not the same as employee_id (which would be incorrect)
              if (attendanceId === employeeId) {
                console.error(`WARNING: attendance_id "${attendanceId}" is the same as employee_id - this is likely incorrect!`);
              }
            } else if (update.id) {
              attendanceId = update.id.toString();
              console.log(`Using id field for attendance: ${attendanceId}`);
              
              // Validate that id is not the same as employee_id (which would be incorrect)
              if (attendanceId === employeeId) {
                console.error(`WARNING: id "${attendanceId}" is the same as employee_id - this is likely incorrect!`);
              }
            }
            
            console.log(`Normalized IDs - Employee: ${employeeId}, Attendance: ${attendanceId}`);
            
            // Create a synthetic ID if no ID is available
            if (!attendanceId && employeeId) {
              const timestamp = update.timestamp || new Date().toISOString();
              attendanceId = `synthetic-${employeeId}-${entry_type}-${timestamp}`;
              console.log(`Created synthetic ID: ${attendanceId}`);
            }
            
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
              exit_time: update.exit_time,
              objectId: attendanceId // Use objectId to track the attendance ID
            };
            
            // Add to our local collection
            newAttendances.push(attendanceUpdate);

            if (update.action === 'exit' && update.is_early_exit) {
              console.log("Early exit detected, update data:", update);
              
              // Use employee_id directly from the update
              const employeeId = update.employee_id || update.user_id || '';
              
              if (!employeeId) {
                console.error("Missing employee_id for early exit dialog");
                return;
              }
              
              // Find the ACTUAL attendance objectId - this is critical
              // It should be the ID of the attendance record, not the employee ID
              let attendanceId = null;
              
              // First priority: Use the actual objectId of the attendance record
              if (update.objectId) {
                attendanceId = update.objectId.toString();
                console.log(`Using objectId for attendance ID: ${attendanceId}`);
              } 
              // Second priority: Use attendance_id field if available 
              else if (update.attendance_id && update.attendance_id !== employeeId) {
                attendanceId = update.attendance_id.toString();
                console.log(`Using attendance_id field: ${attendanceId}`);
              }
              // Last resort: Use synthetic ID (but log a warning)
              else {
                console.warn("Could not find a valid attendance objectId - early exit reason submission may fail!");
                if (attendanceId === employeeId) {
                  console.error("Attendance ID incorrectly set to employee ID!");
                }
              }
              
              console.log("Setting early exit dialog with employee ID:", employeeId, "and attendance ID:", attendanceId);
              
              // Only open the dialog if we have a valid attendance objectId
              if (attendanceId) {
                setEarlyExitDialog({
                  open: true,
                  reason: {
                    id: attendanceId, // The ID of this reason record
                    user_id: employeeId, // The employee ID
                    user_name: update.name || "Unknown",
                    attendance_id: attendanceId, // The attendance objectId
                    name: update.name || "Unknown",
                    timestamp: update.timestamp || new Date().toISOString(),
                    reason: update.reason || ''
                  },
                });
              } else {
                console.error("Cannot open early exit dialog - missing valid attendance objectId");
                setMessage({
                  type: 'error',
                  text: 'Unable to submit early exit reason - system error. Please contact admin.',
                });
              }
            }

            if (update.action === 'early_exit_reason') {
              console.log("Early exit reason update received:", update);
              
              // Extract attendance_id from various possible sources - this must be the actual objectId of the attendance record
              let attendanceId = '';
              let reasonId = '';
              
              // For the reasonId (the ID of the early exit reason record)
              if (update.objectId) {
                reasonId = update.objectId.toString();
              }
              
              // For the attendanceId (the ID of the attendance record)
              if (update.attendance_id && update.attendance_id !== update.employee_id) {
                attendanceId = update.attendance_id.toString();
                console.log(`Using attendance_id for reference: ${attendanceId}`);
              } else {
                console.warn("Early exit reason might have missing or incorrect attendance ID reference");
              }
              
              console.log(`Adding early exit reason with ID: ${reasonId}, attendance ID: ${attendanceId}, employee ID: ${employeeId}`);
                            
              setEarlyExitReasons(prev => [{
                id: reasonId, // This is the ID of the early exit reason record
                user_id: employeeId,
                user_name: update.name || "Unknown",
                attendance_id: attendanceId,
                name: update.name || "Unknown",
                timestamp: update.timestamp || new Date().toISOString(),
                reason: update.reason || ''
              }, ...prev]);
            }
          });
          
          // Update the state with new attendances at the beginning
          setRecentAttendance(prev => {
            // Log current state for debugging
            logAttendanceState('Current attendance state', prev);
            logAttendanceState('New attendance updates', newAttendances);
            
            // Create a new array with new updates at the top
            const newList = [...newAttendances, ...prev];
            // Remove duplicates based on objectId if present, otherwise use employee_id + timestamp
            const uniqueList = newList.filter((item, index, self) => {
              if (item.objectId) {
                // If item has objectId, use that for uniqueness
                return index === self.findIndex(t => 
                  t.objectId && t.objectId === item.objectId
                );
              } else {
                // If no objectId, use combination of employee_id and timestamp for uniqueness
                return index === self.findIndex(t => 
                  t.employee_id === item.employee_id && 
                  t.timestamp === item.timestamp && 
                  t.entry_type === item.entry_type
                );
              }
            });
            
            // Log the deduplicated state
            logAttendanceState('After deduplication', uniqueList);
            
            return uniqueList.slice(0, 10);
          });
        }
      } 
      else if (data.type === 'detection_result' || (data.multiple_users && data.users)) {
        setMultipleUsers(data.users || []);
        setFaceCount(data.users?.length || 0);
        
        const successCount = (data.users || []).filter((u: UserResult) => 
          u.message && (u.message.includes('successfully') || u.message.includes('already marked'))
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