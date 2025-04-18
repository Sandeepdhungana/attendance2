import React, { useState } from 'react';
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
  CircularProgress,
  Typography,
  Box,
  Divider,
  useTheme,
  alpha,
  Skeleton,
  Snackbar,
  Alert,
  TablePagination,
  Chip,
  Fade,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TableChartIcon from '@mui/icons-material/TableChart';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';

export interface Column<T = any> {
  id: keyof T | string;
  label: string;
  minWidth?: number;
  align?: 'right' | 'left' | 'center';
  format?: (value: any, row: T) => React.ReactNode;
}

// Custom row interface to handle optimistic UI flags
export interface OptimisticRow {
  _isNew?: boolean;
  _isUpdated?: boolean;
  _isDeleting?: boolean;
  [key: string]: any;
}

interface OptimisticDataTableProps<T extends OptimisticRow> {
  title: string;
  columns: Column<T>[];
  data: T[];
  loading: boolean;
  error: string | null;
  idField?: keyof T;
  showEditAction?: boolean;
  showDeleteAction?: boolean;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  emptyMessage?: string;
  icon?: React.ReactNode;
  pagination?: boolean;
  additionalActions?: React.ReactNode;
  searchable?: boolean;
  onSearch?: (searchTerm: string) => void;
  filterable?: boolean;
  onFilter?: () => void;
}

export function OptimisticDataTable<T extends OptimisticRow>({
  title,
  columns,
  data,
  loading,
  error,
  idField = 'id' as keyof T,
  showEditAction = true,
  showDeleteAction = true,
  onEdit,
  onDelete,
  emptyMessage = 'No data available',
  icon = <TableChartIcon color="primary" fontSize="large" />,
  pagination = true,
  additionalActions,
  searchable = false,
  onSearch,
  filterable = false,
  onFilter,
}: OptimisticDataTableProps<T>) {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(+event.target.value);
    setPage(0);
  };

  const handleEdit = (item: T) => {
    if (onEdit) {
      onEdit(item);
    }
  };

  const handleDelete = (item: T) => {
    if (onDelete) {
      setSuccessMessage('Item deleted successfully');
      onDelete(item);
    }
  };

  const handleCloseSuccessMessage = () => {
    setSuccessMessage(null);
  };

  const handleSearch = () => {
    if (onSearch) {
      onSearch(searchTerm);
    }
  };

  const paginatedData = pagination
    ? data.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
    : data;

  return (
    <Paper
      sx={{
        borderRadius: 2,
        boxShadow: theme.shadows[2],
        transition: 'all 0.3s ease-in-out',
        '&:hover': {
          boxShadow: theme.shadows[4],
        },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: alpha(theme.palette.primary.main, 0.03),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {icon && (
            <Box
              sx={{
                mr: 1.5,
                display: 'flex',
                alignItems: 'center',
                color: theme.palette.primary.main,
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
          </Typography>
          {loading && (
            <CircularProgress 
              size={20} 
              sx={{ ml: 2, color: theme.palette.secondary.main }} 
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {searchable && (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Tooltip title="Search">
                <Box
                  component="div"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    bgcolor: 'background.paper',
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 20,
                    px: 1.5,
                    height: 36,
                  }}
                >
                  <SearchIcon
                    fontSize="small"
                    sx={{ color: 'text.secondary', mr: 0.5 }}
                  />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    style={{
                      border: 'none',
                      outline: 'none',
                      background: 'none',
                      fontSize: '0.875rem',
                      width: 120,
                    }}
                  />
                </Box>
              </Tooltip>
            </Box>
          )}

          {filterable && (
            <Tooltip title="Filter list">
              <IconButton
                onClick={onFilter}
                size="small"
                sx={{
                  bgcolor: alpha(theme.palette.primary.main, 0.05),
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.15),
                  },
                }}
              >
                <FilterListIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          {additionalActions}
        </Box>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{
            m: 2,
            borderRadius: theme.shape.borderRadius,
          }}
        >
          {error}
        </Alert>
      )}

      <TableContainer sx={{ maxHeight: 440 }}>
        <Table stickyHeader aria-label={`${title} table`}>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.id.toString()}
                  align={column.align || 'left'}
                  style={{
                    minWidth: column.minWidth,
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    fontWeight: 600,
                    color: theme.palette.text.secondary,
                    padding: '12px 16px',
                  }}
                >
                  {column.label}
                </TableCell>
              ))}
              {(showEditAction || showDeleteAction) && (
                <TableCell
                  align="center"
                  style={{
                    minWidth: 100,
                    backgroundColor: alpha(theme.palette.primary.main, 0.05),
                    fontWeight: 600,
                    color: theme.palette.text.secondary,
                  }}
                >
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              // Loading skeleton
              Array.from(new Array(5)).map((_, index) => (
                <TableRow key={`skeleton-${index}`} hover>
                  {columns.map((column, colIndex) => (
                    <TableCell key={`skeleton-cell-${colIndex}`}>
                      <Skeleton animation="wave" />
                    </TableCell>
                  ))}
                  {(showEditAction || showDeleteAction) && (
                    <TableCell>
                      <Skeleton animation="wave" width={80} />
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : paginatedData.length > 0 ? (
              paginatedData.map((row, rowIndex) => {
                // Calculate row styles based on optimistic flags
                const isNew = row._isNew;
                const isUpdated = row._isUpdated;
                const isDeleting = row._isDeleting;
                
                const rowClasses = [
                  isNew ? 'optimistic-new' : '',
                  isUpdated ? 'optimistic-updated' : '',
                  isDeleting ? 'optimistic-deleted' : '',
                ].filter(Boolean).join(' ');
                
                return (
                  <Fade 
                    in={!isDeleting} 
                    timeout={500} 
                    key={`${String(row[idField])}-${rowIndex}`}
                  >
                    <TableRow
                      hover
                      className={rowClasses}
                      sx={{
                        '&:nth-of-type(odd)': {
                          backgroundColor: alpha(theme.palette.action.hover, 0.05),
                        },
                        // Base styles for all rows
                        transition: 'all 0.3s ease',
                        
                        // Highlighted styles for new or updated rows
                        ...(isNew && {
                          position: 'relative',
                          '&::before': {
                            content: '""',
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: 3,
                            backgroundColor: theme.palette.success.main,
                          },
                          backgroundColor: alpha(theme.palette.success.light, 0.05),
                        }),
                        
                        ...(isUpdated && {
                          position: 'relative',
                          '&::before': {
                            content: '""',
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: 3,
                            backgroundColor: theme.palette.info.main,
                          },
                          backgroundColor: alpha(theme.palette.info.light, 0.05),
                        }),
                      }}
                    >
                      {columns.map((column) => {
                        const id = column.id.toString();
                        const value = row[id];
                        return (
                          <TableCell
                            key={id}
                            align={column.align || 'left'}
                          >
                            {column.format ? column.format(value, row) : (
                              <React.Fragment>
                                {value !== undefined && value !== null ? String(value) : '—'}
                                {isNew && id === 'id' && (
                                  <Chip 
                                    label="NEW" 
                                    size="small" 
                                    color="success" 
                                    variant="outlined"
                                    sx={{ ml: 1, fontSize: '0.6rem', height: 20 }}
                                  />
                                )}
                                {isUpdated && id === 'updated_at' && (
                                  <Chip 
                                    label="UPDATED" 
                                    size="small" 
                                    color="info" 
                                    variant="outlined"
                                    sx={{ ml: 1, fontSize: '0.6rem', height: 20 }}
                                  />
                                )}
                              </React.Fragment>
                            )}
                          </TableCell>
                        );
                      })}
                      {(showEditAction || showDeleteAction) && (
                        <TableCell align="center">
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'center',
                              gap: 1,
                            }}
                          >
                            {showEditAction && onEdit && (
                              <Tooltip title="Edit">
                                <IconButton
                                  size="small"
                                  onClick={() => handleEdit(row)}
                                  sx={{
                                    color: theme.palette.primary.main,
                                    '&:hover': {
                                      backgroundColor: alpha(
                                        theme.palette.primary.main,
                                        0.1
                                      ),
                                    },
                                    width: 28,
                                    height: 28,
                                  }}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {showDeleteAction && onDelete && (
                              <Tooltip title="Delete">
                                <IconButton
                                  size="small"
                                  onClick={() => handleDelete(row)}
                                  sx={{
                                    color: theme.palette.error.main,
                                    '&:hover': {
                                      backgroundColor: alpha(
                                        theme.palette.error.main,
                                        0.1
                                      ),
                                    },
                                    width: 28,
                                    height: 28,
                                  }}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      )}
                    </TableRow>
                  </Fade>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={
                    columns.length +
                    (showEditAction || showDeleteAction ? 1 : 0)
                  }
                  align="center"
                  sx={{ py: 4 }}
                >
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    py: 2
                  }}>
                    <TableChartIcon 
                      sx={{ 
                        fontSize: 48, 
                        color: alpha(theme.palette.text.secondary, 0.3),
                        mb: 1 
                      }} 
                    />
                    <Typography variant="body1" color="text.secondary">
                      {emptyMessage}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {pagination && data.length > 0 && (
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={data.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          sx={{
            borderTop: `1px solid ${theme.palette.divider}`,
            bgcolor: alpha(theme.palette.background.default, 0.5),
          }}
        />
      )}

      <Snackbar
        open={!!successMessage}
        autoHideDuration={4000}
        onClose={handleCloseSuccessMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseSuccessMessage}
          severity="success"
          sx={{ width: '100%' }}
          icon={<CheckCircleIcon fontSize="inherit" />}
        >
          {successMessage}
        </Alert>
      </Snackbar>
    </Paper>
  );
} 