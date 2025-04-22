import { Routes, Route } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { createTheme, responsiveFontSizes } from '@mui/material/styles';
import Layout from './components/Layout';
import Register from './pages/Register';
import Attendance from './pages/Attendance';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Debug from './pages/Debug';
import OfficeTimings from './pages/OfficeTimings';
import EarlyExitReasons from './pages/EarlyExitReasons';
import Shift from './pages/Shift';
import Shifts from './pages/Shifts';
import EmployeeShifts from './pages/EmployeeShifts';
import AttendanceByDate from './pages/AttendanceByDate';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { NotificationProvider } from './components/ui/NotificationProvider';

// Create WebSocket context
const WebSocketContext = createContext<{
  ws: WebSocket | null;
  isConnected: boolean;
  sendMessage: (message: any) => void;
}>({
  ws: null,
  isConnected: false,
  sendMessage: () => {},
});

// WebSocket provider component
function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const MAX_RECONNECT_ATTEMPTS = 5;

  const connectWebSocket = () => {
    // Prevent multiple connection attempts
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Close any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket('ws://localhost:8000/ws/attendance');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connection established');
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    ws.onclose = (event) => {
      console.log('WebSocket connection closed', event.code, event.reason);
      setIsConnected(false);
      
      // Attempt to reconnect if not manually closed
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connectWebSocket();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Try to reconnect on error
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        connectWebSocket();
      }
    };
  };

  const sendMessage = (message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('Sending WebSocket message:', message.type || 'image data');
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('Cannot send message - WebSocket not connected. State:', 
        wsRef.current ? 
        ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][wsRef.current.readyState] : 
        'null');
    }
  };

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ ws: wsRef.current, isConnected, sendMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
}

// Custom hook to use WebSocket context
export function useWebSocket() {
  return useContext(WebSocketContext);
}

// Create a custom theme
let theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
    },
    secondary: {
      main: '#9c27b0',
      light: '#ba68c8',
      dark: '#7b1fa2',
    },
    success: {
      main: '#2e7d32',
      light: '#4caf50',
      dark: '#1b5e20',
    },
    error: {
      main: '#d32f2f',
      light: '#ef5350',
      dark: '#c62828',
    },
    warning: {
      main: '#ed6c02',
      light: '#ff9800',
      dark: '#e65100',
    },
    info: {
      main: '#0288d1',
      light: '#03a9f4',
      dark: '#01579b',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 700,
    },
    h2: {
      fontWeight: 700,
    },
    h3: {
      fontWeight: 600,
    },
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0px 1px 8px rgba(0, 0, 0, 0.08)',
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: {
          padding: '16px 24px',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: '24px',
          '&:last-child': {
            paddingBottom: '24px',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '12px 16px',
        },
      },
    },
  },
});

// Override shadows - using createTheme again to properly type shadows
theme = createTheme({
  ...theme,
  shadows: [
    'none',
    '0px 2px 1px -1px rgba(0,0,0,0.05),0px 1px 1px 0px rgba(0,0,0,0.03),0px 1px 3px 0px rgba(0,0,0,0.05)',
    '0px 3px 3px -2px rgba(0,0,0,0.06),0px 2px 6px 0px rgba(0,0,0,0.04),0px 1px 8px 0px rgba(0,0,0,0.06)',
    '0px 3px 4px -2px rgba(0,0,0,0.07),0px 3px 8px 0px rgba(0,0,0,0.05),0px 1px 12px 0px rgba(0,0,0,0.07)',
    '0px 4px 5px -2px rgba(0,0,0,0.08),0px 4px 10px 0px rgba(0,0,0,0.06),0px 1px 16px 0px rgba(0,0,0,0.08)',
    '0px 5px 6px -3px rgba(0,0,0,0.09),0px 5px 12px 1px rgba(0,0,0,0.07),0px 2px 20px 0px rgba(0,0,0,0.09)',
    '0px 6px 7px -4px rgba(0,0,0,0.1),0px 6px 14px 1px rgba(0,0,0,0.08),0px 2px 24px 2px rgba(0,0,0,0.1)',
    '0px 7px 8px -4px rgba(0,0,0,0.1),0px 7px 16px 2px rgba(0,0,0,0.08),0px 3px 28px 3px rgba(0,0,0,0.1)',
    '0px 8px 9px -5px rgba(0,0,0,0.1),0px 8px 18px 3px rgba(0,0,0,0.08),0px 4px 32px 3px rgba(0,0,0,0.1)',
    '0px 9px 10px -6px rgba(0,0,0,0.1),0px 9px 20px 3px rgba(0,0,0,0.08),0px 5px 36px 4px rgba(0,0,0,0.1)',
    '0px 10px 11px -6px rgba(0,0,0,0.1),0px 10px 22px 4px rgba(0,0,0,0.08),0px 6px 40px 5px rgba(0,0,0,0.1)',
    '0px 11px 12px -7px rgba(0,0,0,0.1),0px 11px 24px 4px rgba(0,0,0,0.08),0px 7px 44px 6px rgba(0,0,0,0.1)',
    '0px 12px 13px -7px rgba(0,0,0,0.1),0px 12px 26px 5px rgba(0,0,0,0.08),0px 8px 48px 6px rgba(0,0,0,0.1)',
    '0px 13px 14px -7px rgba(0,0,0,0.1),0px 13px 28px 5px rgba(0,0,0,0.08),0px 9px 52px 7px rgba(0,0,0,0.1)',
    '0px 14px 15px -8px rgba(0,0,0,0.1),0px 14px 30px 6px rgba(0,0,0,0.08),0px 10px 56px 8px rgba(0,0,0,0.1)',
    '0px 15px 16px -8px rgba(0,0,0,0.1),0px 15px 32px 6px rgba(0,0,0,0.08),0px 11px 60px 9px rgba(0,0,0,0.1)',
    '0px 16px 17px -8px rgba(0,0,0,0.1),0px 16px 34px 7px rgba(0,0,0,0.08),0px 12px 64px 10px rgba(0,0,0,0.1)',
    '0px 17px 18px -9px rgba(0,0,0,0.1),0px 17px 36px 7px rgba(0,0,0,0.08),0px 13px 68px 10px rgba(0,0,0,0.1)',
    '0px 18px 19px -9px rgba(0,0,0,0.1),0px 18px 38px 8px rgba(0,0,0,0.08),0px 14px 72px 11px rgba(0,0,0,0.1)',
    '0px 19px 20px -9px rgba(0,0,0,0.1),0px 19px 40px 8px rgba(0,0,0,0.08),0px 15px 76px 12px rgba(0,0,0,0.1)',
    '0px 20px 21px -10px rgba(0,0,0,0.1),0px 20px 42px 9px rgba(0,0,0,0.08),0px 16px 80px 13px rgba(0,0,0,0.1)',
    '0px 21px 22px -10px rgba(0,0,0,0.1),0px 21px 44px 9px rgba(0,0,0,0.08),0px 17px 84px 13px rgba(0,0,0,0.1)',
    '0px 22px 23px -10px rgba(0,0,0,0.1),0px 22px 46px 10px rgba(0,0,0,0.08),0px 18px 88px 14px rgba(0,0,0,0.1)',
    '0px 23px 24px -11px rgba(0,0,0,0.1),0px 23px 48px 10px rgba(0,0,0,0.08),0px 19px 92px 15px rgba(0,0,0,0.1)',
    '0px 24px 25px -11px rgba(0,0,0,0.1),0px 24px 50px 11px rgba(0,0,0,0.08),0px 20px 96px 16px rgba(0,0,0,0.1)',
  ],
});

// Make the theme responsive
theme = responsiveFontSizes(theme);

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NotificationProvider>
        <WebSocketProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/register" element={<Register />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/employees" element={<Users />} />
              <Route path="/debug" element={<Debug />} />
              <Route path="/office-timings" element={<OfficeTimings />} />
              <Route path="/early-exit-reasons" element={<EarlyExitReasons />} />
              <Route path="/shift" element={<Shift />} />
              <Route path="/shifts" element={<Shifts />} />
              <Route path="/employee-shifts" element={<EmployeeShifts />} />
              <Route path="/attendance-by-date" element={<AttendanceByDate />} />
            </Routes>
          </Layout>
        </WebSocketProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App; 