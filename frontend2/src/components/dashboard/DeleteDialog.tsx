import React from 'react';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
  CircularProgress,
  IconButton,
  Box,
  Typography,
  useTheme,
  alpha,
} from '@mui/material';
import { Close as CloseIcon, DeleteForever as DeleteIcon } from '@mui/icons-material';
import { DeleteDialogState } from '../../types/dashboard';

interface DeleteDialogProps<T> {
  dialog: DeleteDialogState<T>;
  title: string;
  getContentText: (item: T) => string;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteDialog<T>({
  dialog,
  title,
  getContentText,
  onClose,
  onConfirm,
}: DeleteDialogProps<T>) {
  const theme = useTheme();
  
  if (!dialog.item) return null;

  return (
    <Dialog 
      open={dialog.open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        p: 3,
        backgroundColor: alpha(theme.palette.error.main, 0.05),
        borderBottom: `1px solid ${alpha(theme.palette.error.main, 0.1)}`
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <DeleteIcon 
            color="error" 
            sx={{ mr: 1, fontSize: 28 }} 
          />
          <Typography variant="h6" fontWeight="600" color="error.main">
            {title}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent sx={{ p: 3, pt: 3 }}>
        <DialogContentText sx={{ color: 'text.primary', fontSize: '1rem' }}>
          {getContentText(dialog.item)}
        </DialogContentText>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
        <Button 
          onClick={onClose} 
          color="inherit"
          variant="outlined"
          sx={{ 
            borderRadius: 2, 
            textTransform: 'none',
            fontWeight: 600,
            borderColor: alpha(theme.palette.text.secondary, 0.3),
            px: 3
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={dialog.loading}
          startIcon={dialog.loading ? <CircularProgress size={20} color="inherit" /> : <DeleteIcon />}
          sx={{ 
            borderRadius: 2, 
            textTransform: 'none',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(211, 47, 47, 0.2)',
            px: 3
          }}
        >
          {dialog.loading ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
} 