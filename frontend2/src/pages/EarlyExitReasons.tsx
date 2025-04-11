import React from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import { useEarlyExitReasons } from '../hooks/useEarlyExitReasons';
import { ReasonsTable } from '../components/earlyExit/ReasonsTable';
import { DeleteConfirmationDialog } from '../components/earlyExit/DeleteConfirmationDialog';

export default function EarlyExitReasons() {
  const {
    reasons,
    error,
    deleteDialog,
    handleDeleteClick,
    handleDeleteConfirm,
    handleCloseDialog,
  } = useEarlyExitReasons();

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Early Exit Reasons
      </Typography>

      <Card>
        <CardContent>
          <ReasonsTable
            reasons={reasons}
            onDelete={handleDeleteClick}
          />
        </CardContent>
      </Card>

      <DeleteConfirmationDialog
        deleteDialog={deleteDialog}
        onClose={handleCloseDialog}
        onConfirm={handleDeleteConfirm}
      />
    </Box>
  );
} 