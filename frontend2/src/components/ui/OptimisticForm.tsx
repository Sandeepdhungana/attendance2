import React, { useState } from 'react';
import {
  Box,
  Button,
  Snackbar,
  Alert,
  CircularProgress,
  Typography,
  Paper,
  Divider,
  useTheme,
  alpha,
  Grid,
  Collapse,
  IconButton,
  Tooltip,
  Zoom,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SaveIcon from '@mui/icons-material/Save';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ClearIcon from '@mui/icons-material/Clear';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

interface OptimisticFormProps {
  title: string;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  loading: boolean;
  error: string | null;
  children: React.ReactNode;
  submitButtonText?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  successMessage?: string;
  resetForm?: () => void;
  cancelButton?: boolean;
  onCancel?: () => void;
  helpText?: string;
  collapsible?: boolean;
  initialCollapsed?: boolean;
  fullWidth?: boolean;
  actions?: React.ReactNode;
  saveButtonColor?: 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning';
}

export function OptimisticForm({
  title,
  onSubmit,
  loading,
  error,
  children,
  submitButtonText = 'Save',
  icon,
  disabled = false,
  successMessage = 'Saved successfully!',
  resetForm,
  cancelButton = false,
  onCancel,
  helpText,
  collapsible = false,
  initialCollapsed = false,
  fullWidth = false,
  actions,
  saveButtonColor = 'primary',
}: OptimisticFormProps) {
  const theme = useTheme();
  const [success, setSuccess] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await onSubmit(e);
      setSuccess(true);
      if (resetForm) resetForm();
    } catch (error) {
      // Error handling is done in the parent component
      console.error("Form submission failed:", error);
    }
  };

  const handleSuccessClose = () => {
    setSuccess(false);
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    if (resetForm) {
      resetForm();
    }
  };

  const toggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  return (
    <Zoom in={true} style={{ transitionDelay: '50ms' }}>
      <Paper
        component="form"
        onSubmit={handleSubmit}
        sx={{
          p: 3,
          borderRadius: 2,
          boxShadow: theme.shadows[2],
          transition: 'all 0.3s ease-in-out',
          '&:hover': {
            boxShadow: theme.shadows[4],
          },
          position: 'relative',
          overflow: 'hidden',
          width: fullWidth ? '100%' : undefined,
          mb: 2,
        }}
      >
        {/* Form Header */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {icon && (
              <Box
                sx={{
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  borderRadius: '50%',
                  width: 40,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: theme.palette.primary.main,
                  mr: 1,
                }}
              >
                {icon}
              </Box>
            )}
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              {title}
              {helpText && (
                <Tooltip title={helpText} arrow>
                  <IconButton size="small" sx={{ ml: 0.5 }}>
                    <HelpOutlineIcon 
                      fontSize="small" 
                      sx={{ color: theme.palette.text.secondary }} 
                    />
                  </IconButton>
                </Tooltip>
              )}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {collapsible && (
              <IconButton onClick={toggleCollapse} size="small">
                {collapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
              </IconButton>
            )}
            {loading && (
              <CircularProgress size={20} sx={{ ml: 2, mr: 1 }} />
            )}
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Form Content */}
        <Collapse in={!collapsed}>
          <Box sx={{ 
            mt: 3,
            opacity: loading ? 0.7 : 1,
            transition: 'opacity 0.2s ease',
            pointerEvents: loading ? 'none' : 'auto',
          }}>
            {children}
          </Box>

          {/* Form Actions */}
          <Box
            sx={{
              mt: 3,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Box>
              {actions}
            </Box>
            
            <Box sx={{ display: 'flex', gap: 1 }}>
              {cancelButton && (
                <Button
                  type="button"
                  variant="outlined"
                  color="inherit"
                  onClick={handleCancel}
                  disabled={loading}
                  sx={{
                    py: 1,
                    px: 2,
                    textTransform: 'none',
                    borderRadius: theme.shape.borderRadius,
                  }}
                  startIcon={<ClearIcon />}
                >
                  Cancel
                </Button>
              )}
              
              <Button
                type="submit"
                variant="contained"
                color={saveButtonColor}
                disabled={disabled || loading}
                sx={{
                  py: 1,
                  px: 2,
                  textTransform: 'none',
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
                startIcon={
                  loading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <SaveIcon />
                  )
                }
              >
                {loading ? 'Saving...' : submitButtonText}
              </Button>
            </Box>
          </Box>
        </Collapse>

        {error && (
          <Alert
            severity="error"
            sx={{
              mt: 2,
              borderRadius: theme.shape.borderRadius,
              animation: 'fadeIn 0.3s ease-in',
            }}
            onClose={() => {}}
          >
            {error}
          </Alert>
        )}

        <Snackbar
          open={success}
          autoHideDuration={4000}
          onClose={handleSuccessClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          TransitionComponent={Zoom}
        >
          <Alert
            onClose={handleSuccessClose}
            severity="success"
            sx={{ 
              width: '100%',
              boxShadow: theme.shadows[6],
              borderRadius: theme.shape.borderRadius,
            }}
            icon={<CheckCircleIcon fontSize="inherit" />}
          >
            {successMessage}
          </Alert>
        </Snackbar>
      </Paper>
    </Zoom>
  );
} 