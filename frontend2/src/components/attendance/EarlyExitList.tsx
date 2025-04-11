import React from 'react';
import {
  Box,
  Typography,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Tooltip,
  Paper,
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { EarlyExitReason } from '../../types/attendance';

interface EarlyExitListProps {
  earlyExitReasons: EarlyExitReason[];
  onDelete: (reason: EarlyExitReason) => void;
}

export const EarlyExitList: React.FC<EarlyExitListProps> = ({
  earlyExitReasons,
  onDelete,
}) => {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" gutterBottom>
        Recent Early Exit Reasons
      </Typography>
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
            {earlyExitReasons.map((reason) => (
              <TableRow key={reason.id}>
                <TableCell>{reason.name}</TableCell>
                <TableCell>{reason.early_exit_message}</TableCell>
                <TableCell>
                  {new Date(reason.timestamp).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Tooltip title="Delete reason">
                    <IconButton
                      color="error"
                      onClick={() => onDelete(reason)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {earlyExitReasons.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  No early exit reasons found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}; 