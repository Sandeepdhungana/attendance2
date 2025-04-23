import React from 'react';
import { Box, CircularProgress, useTheme, alpha } from '@mui/material';
import { DataGrid, GridColDef, GridPaginationModel } from '@mui/x-data-grid';

interface DataTableProps<T> {
  rows: T[];
  columns: GridColDef[];
  loading: boolean;
  paginationModel: GridPaginationModel;
  onPaginationModelChange: (model: GridPaginationModel) => void;
}

export function DataTable<T>({ 
  rows, 
  columns, 
  loading, 
  paginationModel,
  onPaginationModelChange
}: DataTableProps<T>) {
  const theme = useTheme();

  return (
    <Box sx={{ 
      height: '100%', 
      width: '100%',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      '& .MuiDataGrid-root': {
        border: 'none',
        '& .MuiDataGrid-cell:focus-within': {
          outline: 'none',
        },
      },
      '& .MuiDataGrid-columnHeaders': {
        backgroundColor: alpha(theme.palette.primary.main, 0.05),
        borderRadius: 0,
        '& .MuiDataGrid-columnHeader': {
          fontWeight: 700,
          color: theme.palette.text.primary,
        },
      },
      '& .MuiDataGrid-row': {
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        '&:hover': {
          backgroundColor: alpha(theme.palette.primary.main, 0.04),
        },
        '&.Mui-selected': {
          backgroundColor: alpha(theme.palette.primary.main, 0.08),
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.12),
          },
        },
      }
    }}>
      <DataGrid
        rows={rows}
        columns={columns}
        loading={loading}
        disableRowSelectionOnClick
        pageSizeOptions={[5, 10, 25, 50]}
        paginationModel={paginationModel}
        onPaginationModelChange={onPaginationModelChange}
        autoHeight={false}
        getRowId={(row: any) => row.id || row.objectId || row.employee_id}
        slots={{
          loadingOverlay: () => (
            <Box
              sx={{
                display: 'flex',
                height: '100%',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: alpha(theme.palette.background.paper, 0.7),
              }}
            >
              <CircularProgress size={40} thickness={4} />
            </Box>
          ),
        }}
        sx={{
          height: '100%',
          width: '100%',
          flex: 1,
          '& .MuiDataGrid-virtualScroller': {
            overflow: 'auto',
            '&::-webkit-scrollbar': {
              width: '8px',
              height: '8px',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: alpha(theme.palette.primary.main, 0.2),
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: alpha(theme.palette.primary.main, 0.05),
            },
          },
          '& .MuiDataGrid-footerContainer': {
            borderTop: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
          },
          '& .MuiTablePagination-root': {
            '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
              fontSize: '0.875rem',
            },
          }
        }}
      />
    </Box>
  );
} 