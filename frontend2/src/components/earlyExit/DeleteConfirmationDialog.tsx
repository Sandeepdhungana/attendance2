import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  CircularProgress,
  Box,
  Typography,
  alpha,
  useTheme,
  Paper,
  Slide,
  Divider
} from '@mui/material';
import { TransitionProps } from '@mui/material/transitions';
import WarningIcon from '@mui/icons-material/Warning';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';

// Add transition for a smoother dialog appearance
const Transition = React.forwardRef(function Transition(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

interface DeleteConfirmationDialogProps {
  deleteDialog: {
    open: boolean;
    reasonId: string | null;
    isDeleting: boolean;
  };
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
  deleteDialog,
  onClose,
  onConfirm,
}) => {
  const theme = useTheme();
  const { open, isDeleting } = deleteDialog;

  return (
    <Dialog
      open={open}
      onClose={isDeleting ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      TransitionComponent={Transition}
      PaperProps={{
        elevation: 6,
        sx: { 
          borderRadius: 2,
          overflow: 'hidden'
        }
      }}
    >
      <Paper 
        elevation={0} 
        sx={{ 
          bgcolor: alpha(theme.palette.error.light, 0.05),
          borderBottom: `1px solid ${alpha(theme.palette.error.main, 0.1)}`,
          py: 2, 
          px: 3
        }}
      >
        <DialogTitle sx={{ p: 0 }}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <Box
              sx={{
                bgcolor: alpha(theme.palette.error.main, 0.1),
                borderRadius: '50%',
                p: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <DeleteOutlinedIcon color="error" />
            </Box>
            <Typography variant="h6" component="span" fontWeight="medium">
              Delete Early Exit Reason
            </Typography>
          </Box>
        </DialogTitle>
      </Paper>

      <DialogContent sx={{ px: 3, py: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1 }}>
          <WarningIcon color="warning" fontSize="small" sx={{ mt: 0.5 }} />
          <Typography variant="body1" color="text.primary" fontWeight="medium">
            This action cannot be undone
          </Typography>
        </Box>
        
        <DialogContentText color="text.secondary" sx={{ ml: 5 }}>
          Are you sure you want to delete this early exit reason? 
          Once deleted, this information will be permanently removed from the system.
        </DialogContentText>
      </DialogContent>
      
      <Divider />
      
      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'flex-end' }}>
        <Button 
          onClick={onClose} 
          disabled={isDeleting}
          variant="outlined"
          color="inherit"
          size="medium"
          sx={{ 
            mr: 1,
            fontWeight: 500,
            borderRadius: 1,
            px: 2
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={isDeleting}
          variant="contained"
          color="error"
          size="medium"
          sx={{ 
            fontWeight: 500,
            borderRadius: 1,
            px: 2,
            '&:hover': {
              bgcolor: theme.palette.error.dark
            }
          }}
          startIcon={
            isDeleting ? <CircularProgress size={20} color="inherit" /> : <DeleteOutlinedIcon />
          }
        >
          {isDeleting ? 'Deleting...' : 'Delete Permanently'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}; 