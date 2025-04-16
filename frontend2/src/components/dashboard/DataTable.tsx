import React from 'react';
import { DataGrid, GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { Box, CircularProgress, Alert } from '@mui/material';

interface DataTableProps<T> {
  rows: T[];
  columns: GridColDef[];
  loading: boolean;
  paginationModel: GridPaginationModel;
  onPaginationModelChange: (model: GridPaginationModel) => void;
}

export function DataTable<T extends { objectId?: string; id?: number | string; user_id?: string }>({
  rows,
  columns,
  loading,
  paginationModel,
  onPaginationModelChange,
}: DataTableProps<T>) {
  return (
    <Box sx={{ height: 600, width: '100%' }}>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : (
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.objectId || row.id || row.user_id}
          paginationModel={paginationModel}
          onPaginationModelChange={onPaginationModelChange}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
          sx={{
            '& .MuiDataGrid-cell': {
              fontSize: '1rem',
            },
          }}
        />
      )}
    </Box>
  );
} 