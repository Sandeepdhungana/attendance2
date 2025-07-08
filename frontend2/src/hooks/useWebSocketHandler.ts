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
  
  // Track streaming session for persistent detected users
  const streamingSessionRef = useRef<string | null>(null);
  const isStreamingActiveRef = useRef<boolean>(false);

  // Function to clear detected users (called when starting a new streaming session)
  const clearDetectedUsers = () => {
    console.log('🧹 Clearing detected users for new streaming session');
    
    // Generate new session ID FIRST
    const newSessionId = `session-${Date.now()}`;
    streamingSessionRef.current = newSessionId;
    isStreamingActiveRef.current = true;
    
    console.log(`🆔 NEW streaming session started: ${newSessionId}`);
    console.log(`🔄 Streaming state set to: ${isStreamingActiveRef.current}`);
    
    // Clear the UI state AFTER setting up session
    setMultipleUsers([]);
    setFaceCount(0);
    setRealTimeDetection(null);
    
    console.log(`📊 Users list cleared for new session, current length: 0`);
  };

  // Function to end streaming session
  const endStreamingSession = () => {
    console.log('🛑 Ending streaming session');
    console.log(`📊 Users detected in session: ${multipleUsers.length}`);
    console.log(`🆔 Ending session: ${streamingSessionRef.current}`);
    
    isStreamingActiveRef.current = false;
    console.log(`🔄 Streaming state set to: ${isStreamingActiveRef.current}`);
    // Keep the detected users visible but mark session as ended
  };

  // Helper function to log current state (for debugging)
  const logCurrentState = () => {
    console.log('📊 Current State Summary:');
    console.log(`   🔄 Streaming Active: ${isStreamingActiveRef.current}`);
    console.log(`   🆔 Session ID: ${streamingSessionRef.current}`);
    console.log(`   👥 Users Count: ${multipleUsers.length}`);
    console.log(`   🎯 Face Count: ${faceCount}`);
  };

  const handleWebSocketMessage = (event: MessageEvent) => {
    try {
      const data: WebSocketResponse = JSON.parse(event.data);
      console.log('📨 Received WebSocket message type:', data.type || data.status || 'unknown');
      
      // Handle real-time detection messages
      if (data.type === 'real_time_detection') {
        console.log('👤 Received real-time detection:', data);
        console.log(`🔄 Current streaming state: ${isStreamingActiveRef.current}, Session: ${streamingSessionRef.current}`);
        
        // Check if this is an already-marked user
        if (data.message && data.message.includes('already marked')) {
          console.log('🔄 Already-marked user detected:', data.name, data.employee_id);
        }
        
        // Validate the data
        if (!data.name && !data.employee_id) {
          console.warn('⚠️ Received real-time detection with missing name and employee_id:', data);
          return; // Skip this detection if critical data is missing
        }
        
        // Ensure we have a session ID - create one if streaming but no session exists
        let currentSessionId = streamingSessionRef.current;
        if (!currentSessionId) {
          currentSessionId = `session-${Date.now()}`;
          streamingSessionRef.current = currentSessionId;
          console.log(`🆔 Created session ID for real-time detection: ${currentSessionId}`);
        }
        
        const detectionResult: UserResult = {
          name: data.name || 'Unknown',
          employee_id: data.employee_id || '',
          similarity: data.confidence || 0,
          similarity_percent: data.confidence_percent,
          confidence_str: data.confidence_str,
          detection_time: data.timestamp,
          message: data.message || `Detected with ${data.confidence_str || 'N/A'}`,
          is_streaming: true,
          session_id: currentSessionId // Use current session ID
        };
        
        console.log('🎯 Created detection result:', {
          name: detectionResult.name,
          employee_id: detectionResult.employee_id,
          session_id: detectionResult.session_id,
          message: detectionResult.message
        });
        
        // Update real-time detection
        setRealTimeDetection(detectionResult);
        console.log('✅ Setting real-time detection:', detectionResult.name);
        
        // ALWAYS add to multipleUsers for persistent display
        setMultipleUsers(prev => {
          console.log(`📝 Before update - Users list length: ${prev.length}`);
          if (prev.length > 0) {
            console.log('📝 Current users:', prev.map(u => `${u.name} (${u.employee_id})`).join(', '));
          }
          
          // Check if this user is already in the list (by employee_id)
          const existingUserIndex = prev.findIndex(u => 
            u.employee_id === detectionResult.employee_id
          );
          
          if (existingUserIndex >= 0) {
            // Update existing user with latest detection info
            const updatedUsers = [...prev];
            updatedUsers[existingUserIndex] = {
              ...updatedUsers[existingUserIndex],
              ...detectionResult,
              detection_time: data.timestamp, // Always update with latest detection time
              message: data.message || updatedUsers[existingUserIndex].message,
              session_id: currentSessionId // Update session ID
            };
            console.log(`🔄 Updated existing user: ${detectionResult.name} (position ${existingUserIndex})`);
            console.log(`📊 After update - Users list length: ${updatedUsers.length}`);
            return updatedUsers;
          } else {
            // Add new user to the list
            const newUsersList = [detectionResult, ...prev];
            console.log(`✨ Adding NEW user: ${detectionResult.name}`);
            console.log(`📊 After adding - Users list length: ${newUsersList.length}`);
            console.log(`📝 New users list:`, newUsersList.map(u => `${u.name} (${u.employee_id})`).join(', '));
            return newUsersList;
          }
        });
        
        // Update face count for streaming
        setFaceCount(prev => {
          const newCount = Math.max(prev, 1);
          console.log(`👥 Face count updated from ${prev} to ${newCount}`);
          return newCount;
        });
        
        // Show success message in UI
        setMessage({
          type: 'success',
          text: `Detected: ${data.name} (${data.confidence_str})`,
        });
      }
      else if (data.type === 'notification') {
        console.log('📢 Received notification:', data.message);
        // Handle notification messages
        setMessage({
          type: data.notification_type === 'success' ? 'success' : 
                data.notification_type === 'error' ? 'error' : 
                data.notification_type === 'warning' ? 'error' : 
                data.notification_type === 'info' ? 'success' : null,
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
                             update.action === 'exit_update' ? 'exit' :
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

            // Early exit dialog disabled - just log for debugging
            if (update.is_early_exit) {
              console.log("Early exit detected but dialog disabled:", update);
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
                employee_id: employeeId,
                employee_name: update.name || "Unknown",
                attendance_id: attendanceId,
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
        console.log(`🎯 Detection result received. Streaming active: ${isStreamingActiveRef.current}`);
        // Only replace if not in active streaming session (this handles non-streaming detections)
        if (!isStreamingActiveRef.current) {
          console.log('🔄 Not streaming, replacing users list with detection result');
          setMultipleUsers(data.users || []);
          setFaceCount(data.users?.length || 0);
        } else {
          console.log('🚫 Streaming active, ignoring detection result to preserve persistent users');
        }
        
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
        console.log(`😞 No face detected. Streaming active: ${isStreamingActiveRef.current}, Users count: ${multipleUsers.length}`);
        // Only clear if not in active streaming session AND no users are currently detected
        if (!isStreamingActiveRef.current && multipleUsers.length === 0) {
          console.log('🧹 Not streaming and no users, clearing face count');
          setFaceCount(0);
        } else {
          console.log('🚫 Streaming active or users detected, preserving state');
        }
        // Always show the "no face detected" message, but don't clear users
        setMessage({
          type: 'error',
          text: 'No face detected in the image',
        });
      }
      else if (data.status === 'no_matching_users') {
        console.log(`🤷 No matching users. Streaming active: ${isStreamingActiveRef.current}, Users count: ${multipleUsers.length}`);
        // NEVER clear users during streaming - this message might be a race condition
        if (!isStreamingActiveRef.current && multipleUsers.length === 0) {
          console.log('🧹 Not streaming and no users, safe to reset state');
          setFaceCount(0);
        } else {
          console.log('🚫 Preserving detected users (streaming or users exist)');
        }
        // Show message but don't interfere with detected users
        setMessage({
          type: 'error',
          text: 'No matching users found',
        });
      }
      else if (data.status === 'anti_spoofing_failed') {
        console.log(`🚨 Anti-spoofing failed. Streaming active: ${isStreamingActiveRef.current}`);
        // Only clear if not in active streaming session
        if (!isStreamingActiveRef.current) {
          console.log('🧹 Not streaming, clearing users list');
          setFaceCount(0);
          setMultipleUsers([]);
        } else {
          console.log('🚫 Streaming active, preserving detected users');
        }
        setMessage({
          type: 'error',
          text: 'Show your real face',
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

  // Debug: Track changes to multipleUsers state
  useEffect(() => {
    console.log(`🔍 MultipleUsers state changed! New count: ${multipleUsers.length}`);
    if (multipleUsers.length > 0) {
      console.log('👥 Current users:');
      multipleUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.name} (${user.employee_id}) - Session: ${user.session_id}`);
      });
    } else {
      console.log('📝 Users list is empty');
    }
    logCurrentState();
  }, [multipleUsers]);

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
    clearDetectedUsers,
    endStreamingSession,
    logCurrentState,
  };
}; 