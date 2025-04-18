import React from 'react';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
  CircularProgress,
  Typography,
  useTheme,
  alpha,
  Box,
  IconButton,
  Divider,
  Zoom,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';

type DialogVariant = 'delete' | 'warning' | 'confirm' | 'info' | 'error';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  variant?: DialogVariant;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
  disableBackdropClick?: boolean;
  disableEscapeKeyDown?: boolean;
  customIcon?: React.ReactNode;
  optimistic?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
  variant = 'confirm',
  size = 'sm',
  fullWidth = true,
  disableBackdropClick = false,
  disableEscapeKeyDown = false,
  customIcon,
  optimistic = false,
}: ConfirmDialogProps) {
  const theme = useTheme();

  // Determine action colors and icons based on variant
  const getVariantConfig = () => {
    switch (variant) {
      case 'delete':
        return {
          color: 'error',
          icon: <DeleteIcon fontSize="large" color="error" />,
          buttonColor: 'error',
        };
      case 'warning':
        return {
          color: 'warning',
          icon: <WarningIcon fontSize="large" color="warning" />,
          buttonColor: 'warning',
        };
      case 'error':
        return {
          color: 'error',
          icon: <ErrorIcon fontSize="large" color="error" />,
          buttonColor: 'error',
        };
      case 'info':
        return {
          color: 'info',
          icon: <InfoIcon fontSize="large" color="info" />,
          buttonColor: 'info',
        };
      default:
        return {
          color: 'primary',
          icon: <CheckCircleIcon fontSize="large" color="primary" />,
          buttonColor: 'primary',
        };
    }
  };

  const { color, icon, buttonColor } = getVariantConfig();
  const confirmIcon = customIcon || icon;

  // Close dialog on backdrop click
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disableBackdropClick) return;
    onCancel();
  };

  // Handle optimistic confirmation
  const handleConfirm = () => {
    onConfirm();
    if (optimistic) {
      onCancel(); // Close the dialog immediately for optimistic UX
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth={size}
      fullWidth={fullWidth}
      disableEscapeKeyDown={disableEscapeKeyDown || loading}
      onClick={handleBackdropClick}
      TransitionComponent={Zoom}
      PaperProps={{
        elevation: 5,
        sx: {
          borderRadius: 2,
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          bgcolor: alpha(theme.palette[color as 'primary'].main, 0.05),
          px: 3,
          py: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: '50%',
              bgcolor: alpha(theme.palette[color as 'primary'].main, 0.1),
              color: theme.palette[color as 'primary'].main,
            }}
          >
            {confirmIcon}
          </Box>
          <Typography variant="h6" component="div" fontWeight={600}>
            {title}
          </Typography>
        </Box>
        <IconButton
          edge="end"
          color="inherit"
          onClick={onCancel}
          disabled={loading}
          aria-label="close"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <Divider />
      
      <DialogContent sx={{ px: 3, py: 2.5 }}>
        {typeof message === 'string' ? (
          <DialogContentText>{message}</DialogContentText>
        ) : (
          message
        )}
      </DialogContent>
      
      <Divider />
      
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button
          onClick={onCancel}
          color="inherit"
          disabled={loading}
          variant="outlined"
          sx={{
            textTransform: 'none',
            minWidth: 100,
            fontWeight: 500,
            borderRadius: theme.shape.borderRadius,
          }}
        >
          {cancelText}
        </Button>
        <Button
          onClick={handleConfirm}
          color={buttonColor as 'primary'}
          variant="contained"
          disabled={loading}
          sx={{
            textTransform: 'none',
            minWidth: 100,
            fontWeight: 600,
            borderRadius: theme.shape.borderRadius,
            position: 'relative',
            overflow: 'hidden',
            '&::after': loading ? {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.common.white, 0.2)}, transparent)`,
              animation: 'shine 1.5s infinite',
            } : {},
          }}
          startIcon={loading && <CircularProgress size={16} color="inherit" />}
        >
          {loading ? 'Processing...' : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
} 