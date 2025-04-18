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
  Tooltip,
  Typography,
  Box,
  alpha,
  useTheme,
  Card,
  Chip,
  Avatar,
  Skeleton,
  Stack,
  TablePagination
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoIcon from '@mui/icons-material/Info';
import PersonIcon from '@mui/icons-material/Person';
import BadgeIcon from '@mui/icons-material/Badge';
import EventNoteIcon from '@mui/icons-material/EventNote';
import { format } from 'date-fns';
import { useState } from 'react';

interface EarlyExitReason {
  id: string;
  user_id: string;
  user_name?: string;
  attendance_id: string;
  reason: string;
  timestamp: string;
}

interface ReasonsTableProps {
  reasons: EarlyExitReason[] | null;
  onDelete: (reason: EarlyExitReason) => void;
  isLoading?: boolean;
}

export const ReasonsTable: React.FC<ReasonsTableProps> = ({ 
  reasons, 
  onDelete,
  isLoading = false
}) => {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  if (isLoading) {
    return (
      <Box>
        <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 1 }}>
          <Table size="medium">
            <TableHead>
              <TableRow sx={{ 
                backgroundColor: theme => alpha(theme.palette.primary.main, 0.08),
              }}>
                <TableCell sx={{ fontWeight: 'bold' }}>User</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Attendance ID</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Reason</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Timestamp</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Array.from(new Array(3)).map((_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Skeleton variant="circular" width={32} height={32} />
                      <Skeleton variant="text" width={120} />
                    </Stack>
                  </TableCell>
                  <TableCell><Skeleton variant="text" width={80} /></TableCell>
                  <TableCell><Skeleton variant="text" width={200} /></TableCell>
                  <TableCell><Skeleton variant="text" width={150} /></TableCell>
                  <TableCell align="right"><Skeleton variant="circular" width={32} height={32} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  }

  if (!Array.isArray(reasons)) {
    return (
      <Card 
        variant="outlined" 
        sx={{ 
          p: 3, 
          textAlign: 'center',
          borderColor: alpha(theme.palette.warning.main, 0.3),
          bgcolor: alpha(theme.palette.warning.main, 0.05) 
        }}
      >
        <InfoIcon color="warning" sx={{ fontSize: 40, mb: 1 }} />
        <Typography variant="h6" color="warning.main" gutterBottom>
          Invalid Data Format
        </Typography>
        <Typography color="text.secondary">
          The server returned data in an unexpected format. Please try refreshing the page.
        </Typography>
      </Card>
    );
  }

  if (reasons.length === 0) {
    return (
      <Card 
        variant="outlined" 
        sx={{ 
          p: 4, 
          textAlign: 'center', 
          borderStyle: 'dashed',
          borderColor: alpha(theme.palette.primary.main, 0.2),
          bgcolor: alpha(theme.palette.primary.main, 0.03)
        }}
      >
        <InfoIcon color="info" sx={{ fontSize: 48, mb: 2, opacity: 0.7 }} />
        <Typography variant="h6" color="primary" gutterBottom fontWeight="medium">
          No Early Exit Reasons Found
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 450, mx: 'auto' }}>
          Early exit reasons will appear here when employees log them. You can manage and delete them from this table.
        </Typography>
      </Card>
    );
  }

  // Calculate pagination
  const emptyRows = page > 0 ? Math.max(0, (1 + page) * rowsPerPage - reasons.length) : 0;
  const visibleReasons = reasons.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const formatTimestamp = (timestamp: string | { __type: string; iso: string }) => {
    try {
      if (typeof timestamp === 'string') {
        return format(new Date(timestamp), 'PPp');
      } else if (timestamp && typeof timestamp === 'object' && 'iso' in timestamp) {
        return format(new Date(timestamp.iso), 'PPp');
      }
      return 'Invalid date';
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  return (
    <Box>
      <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 1, mb: 1 }}>
        <Table size="medium">
          <TableHead>
            <TableRow sx={{ 
              backgroundColor: theme => alpha(theme.palette.primary.main, 0.08),
            }}>
              <TableCell sx={{ fontWeight: 'bold' }}>User</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Attendance ID</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Reason</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Timestamp</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleReasons.map((reason) => (
              <TableRow 
                key={reason.id} 
                sx={{ 
                  '&:hover': { bgcolor: 'action.hover' },
                  transition: 'background-color 0.2s ease'
                }}
              >
                <TableCell>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Avatar 
                      sx={{ 
                        width: 32, 
                        height: 32,
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        color: theme.palette.primary.main
                      }}
                    >
                      <PersonIcon fontSize="small" />
                    </Avatar>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">
                        {reason.user_name || 'User ' + reason.user_id}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ID: {reason.user_id}
                      </Typography>
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip 
                    icon={<BadgeIcon fontSize="small" />}
                    label={reason.attendance_id} 
                    size="small"
                    sx={{ 
                      fontWeight: 'medium', 
                      bgcolor: alpha(theme.palette.info.main, 0.1),
                      color: theme.palette.info.dark,
                      border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Tooltip 
                    title={reason.reason}
                    placement="top"
                    arrow
                    enterDelay={500}
                  >
                    <Typography 
                      variant="body2"
                      sx={{ 
                        maxWidth: 250,
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {reason.reason}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Box display="flex" alignItems="center" gap={1}>
                    <EventNoteIcon 
                      fontSize="small" 
                      sx={{ color: theme.palette.text.secondary, opacity: 0.7 }}
                    />
                    <Typography variant="body2">
                      {formatTimestamp(reason.timestamp)}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Delete reason">
                    <IconButton 
                      size="small" 
                      color="error" 
                      onClick={() => onDelete(reason)}
                      sx={{ 
                        '&:hover': { 
                          backgroundColor: alpha(theme.palette.error.main, 0.1) 
                        },
                        transition: 'background-color 0.2s ease'
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {emptyRows > 0 && (
              <TableRow style={{ height: 53 * emptyRows }}>
                <TableCell colSpan={5} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={reasons.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        sx={{
          border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
          borderRadius: 1,
          '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
            fontSize: '0.875rem'
          },
          '& .MuiTablePagination-select': {
            fontSize: '0.875rem',
            fontWeight: 'medium'
          }
        }}
      />
    </Box>
  );
};