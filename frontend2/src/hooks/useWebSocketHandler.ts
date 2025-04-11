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

  const handleWebSocketMessage = (event: MessageEvent) => {
    try {
      const data: WebSocketResponse = JSON.parse(event.data);
      
      if (data.type === 'attendance_update') {
        if (data.data) {
          data.data.forEach((update: any) => {
            const entry_type = update.action === 'delete' ? 'exit' : 
                             update.action === 'early_exit_reason' ? 'exit' : 
                             update.action;
            
            const attendanceUpdate: AttendanceUpdate = {
              user_id: update.user_id,
              name: update.name,
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
              setEarlyExitDialog({
                open: true,
                reason: {
                  id: Number(update.attendance_id) || 0,
                  user_id: update.user_id,
                  name: update.name,
                  timestamp: update.timestamp,
                  early_exit_message: update.early_exit_message || ''
                },
              });
            }

            if (update.action === 'early_exit_reason') {
              setEarlyExitReasons(prev => [{
                id: Number(update.attendance_id) || 0,
                user_id: update.user_id,
                name: update.name,
                timestamp: update.timestamp,
                early_exit_message: update.early_exit_message || ''
              }, ...prev]);
            }
          });
        }
      } 
      else if (data.multiple_users && data.users) {
        setMultipleUsers(data.users);
        setFaceCount(data.users.length);
        
        const successCount = data.users.filter((u: UserResult) => 
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
  };
}; 