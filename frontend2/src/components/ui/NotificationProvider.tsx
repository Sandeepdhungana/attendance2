import React, { createContext, useContext, useState, useCallback } from 'react';
import { 
  Snackbar, 
  Alert, 
  AlertColor, 
  Box, 
  Typography, 
  IconButton,
  Slide,
  Zoom,
  SlideProps,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import CloseIcon from '@mui/icons-material/Close';

type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface NotificationOptions {
  message: string;
  type?: NotificationType;
  duration?: number;
  position?: 'top' | 'bottom';
  horizontal?: 'left' | 'center' | 'right';
  hasCloseButton?: boolean;
  transition?: 'slide' | 'fade';
  onClose?: () => void;
}

interface NotificationContextType {
  showNotification: (options: NotificationOptions) => void;
}

const defaultDuration = 4000;

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

const TransitionSlideUp = React.forwardRef<HTMLDivElement, SlideProps>((props, ref) => {
  return <Slide {...props} direction="up" ref={ref} />;
});

const TransitionSlideDown = React.forwardRef<HTMLDivElement, SlideProps>((props, ref) => {
  return <Slide {...props} direction="down" ref={ref} />;
});

TransitionSlideUp.displayName = 'TransitionSlideUp';
TransitionSlideDown.displayName = 'TransitionSlideDown';

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<AlertColor>('info');
  const [duration, setDuration] = useState(defaultDuration);
  const [position, setPosition] = useState<{
    vertical: 'top' | 'bottom';
    horizontal: 'left' | 'center' | 'right';
  }>({
    vertical: 'bottom',
    horizontal: 'center',
  });
  const [hasCloseButton, setHasCloseButton] = useState(true);
  const [transitionComponent, setTransitionComponent] = useState<
    React.ComponentType<SlideProps>
  >(TransitionSlideUp);
  const [callback, setCallback] = useState<(() => void) | undefined>(undefined);

  const showNotification = useCallback(
    ({
      message,
      type = 'info',
      duration = defaultDuration,
      position = 'bottom',
      horizontal = 'center',
      hasCloseButton = true,
      transition = 'slide',
      onClose,
    }: NotificationOptions) => {
      setMessage(message);
      setType(type);
      setDuration(duration);
      setPosition({
        vertical: position,
        horizontal,
      });
      setHasCloseButton(hasCloseButton);
      
      // Set transition
      setTransitionComponent(
        transition === 'slide' 
          ? (position === 'top' ? TransitionSlideDown : TransitionSlideUp)
          : Zoom
      );
      
      setCallback(onClose);
      setOpen(true);
    },
    []
  );

  const handleClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);

    // Call the callback after the closing animation
    if (callback) {
      setTimeout(() => {
        callback();
      }, 300);
    }
  };

  // Icon mapping
  const iconMap = {
    success: <CheckCircleIcon fontSize="inherit" />,
    error: <ErrorIcon fontSize="inherit" />,
    info: <InfoIcon fontSize="inherit" />,
    warning: <WarningIcon fontSize="inherit" />,
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={duration}
        onClose={handleClose}
        anchorOrigin={position}
        TransitionComponent={transitionComponent}
        sx={{ 
          maxWidth: '90%',
          width: 'auto',
        }}
      >
        <Alert
          severity={type}
          variant="filled"
          icon={iconMap[type]}
          sx={{ 
            minWidth: '300px',
            boxShadow: 3,
            borderRadius: 2,
            alignItems: 'center',
          }}
          action={
            hasCloseButton ? (
              <IconButton
                size="small"
                aria-label="close"
                color="inherit"
                onClick={handleClose}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            ) : null
          }
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="body2">{message}</Typography>
          </Box>
        </Alert>
      </Snackbar>
    </NotificationContext.Provider>
  );
};

// Example usage:
// const App = () => {
//   return (
//     <NotificationProvider>
//       <YourComponent />
//     </NotificationProvider>
//   );
// };

// Inside YourComponent:
// const { showNotification } = useNotification();
// showNotification({
//   message: 'Operation completed successfully!',
//   type: 'success',
// }); 