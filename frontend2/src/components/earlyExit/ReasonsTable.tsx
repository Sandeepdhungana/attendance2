import React from 'react';
import {
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  IconButton,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { EarlyExitReason } from '../../types/earlyExit';

interface ReasonsTableProps {
  reasons: EarlyExitReason[];
  onDelete: (reason: EarlyExitReason) => void;
}

export const ReasonsTable: React.FC<ReasonsTableProps> = ({
  reasons,
  onDelete,
}) => {
  return (
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
                    onClick={() => onDelete(reason)}
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
  );
}; 