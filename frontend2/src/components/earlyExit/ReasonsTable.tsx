import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { EarlyExitReason } from '../../types/attendance';
import { format } from 'date-fns';

interface ReasonsTableProps {
  reasons: EarlyExitReason[];
  onDelete: (reasonId: string) => void;
}

export const ReasonsTable: React.FC<ReasonsTableProps> = ({ reasons, onDelete }) => {
  if (!Array.isArray(reasons)) {
    return (
      <Typography variant="body1" color="error" align="center">
        Invalid data format
      </Typography>
    );
  }

  if (reasons.length === 0) {
    return (
      <Typography variant="body1" color="textSecondary" align="center">
        No early exit reasons found
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>User ID</TableCell>
            <TableCell>Attendance ID</TableCell>
            <TableCell>Reason</TableCell>
            <TableCell>Timestamp</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {reasons.map((reason) => (
            <TableRow key={reason.id}>
              <TableCell>{reason.user_id}</TableCell>
              <TableCell>{reason.attendance_id}</TableCell>
              <TableCell>{reason.reason}</TableCell>
              <TableCell>
                {format(
                  new Date(
                    typeof reason.timestamp === 'object' && 'iso' in reason.timestamp
                      ? reason.timestamp.iso as string
                      : reason.timestamp as string
                  ), 
                  'MMM dd, yyyy hh:mm a'
                )}
              </TableCell>
              <TableCell align="right">
                <IconButton
                  onClick={() => onDelete(reason.id)}
                  color="error"
                  size="small"
                >
                  <DeleteIcon />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}; 