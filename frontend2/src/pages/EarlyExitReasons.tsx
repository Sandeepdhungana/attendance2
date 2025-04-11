import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../api/config';
import { useWebSocket } from '../App';

interface EarlyExitReason {
  id: number;
  user_id: string;
  user_name: string;
  attendance_id: number;
  reason: string;
  timestamp: string;
}

export default function EarlyExitReasons() {
  const [reasons, setReasons] = useState<EarlyExitReason[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    reason: EarlyExitReason | null;
  }>({
    open: false,
    reason: null,
  });
  const { ws, isConnected, sendMessage } = useWebSocket();

  useEffect(() => {
    fetchReasons();
  }, []);

  const fetchReasons = async () => {
    try {
      const response = await api.get('/early-exit-reasons');
      setReasons(response.data);
    } catch (error) {
      setError('Failed to fetch early exit reasons');
    }
  };

  const handleDeleteClick = (reason: EarlyExitReason) => {
    setDeleteDialog({
      open: true,
      reason,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.reason) return;

    try {
      // Send WebSocket message to delete the reason
      sendMessage({
        type: 'delete_early_exit_reason',
        reason_id: deleteDialog.reason.id,
      });

      // Close the dialog
      setDeleteDialog({
        open: false,
        reason: null,
      });

      // Remove the reason from the local state
      setReasons((prev) => prev.filter((r) => r.id !== deleteDialog.reason?.id));
    } catch (error) {
      setError('Failed to delete early exit reason');
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Early Exit Reasons
      </Typography>

      <Card>
        <CardContent>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reasons.map((reason) => (
                  <TableRow key={reason.id}>
                    <TableCell>{reason.user_name}</TableCell>
                    <TableCell>{reason.reason}</TableCell>
                    <TableCell>
                      {new Date(reason.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Delete reason">
                        <IconButton
                          color="error"
                          onClick={() => handleDeleteClick(reason)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {reasons.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      No early exit reasons found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, reason: null })}
      >
        <DialogTitle>Delete Early Exit Reason</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this early exit reason for{' '}
            {deleteDialog.reason?.user_name}?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteDialog({ open: false, reason: null })}
          >
            Cancel
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 