import React, { useEffect, useState } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  CircularProgress,
  Container,
  Paper,
  Alert,
  AlertTitle,
  Divider,
  useTheme,
  alpha,
  Button,
  Grid,
  Breadcrumbs,
  Link,
  IconButton,
  Tooltip
} from '@mui/material';
import { useEarlyExitReasons } from '../hooks/useEarlyExitReasons';
import { ReasonsTable } from '../components/earlyExit/ReasonsTable';
import { DeleteConfirmationDialog } from '../components/earlyExit/DeleteConfirmationDialog';
import HomeIcon from '@mui/icons-material/Home';
import RefreshIcon from '@mui/icons-material/Refresh';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

export default function EarlyExitReasons() {
  const theme = useTheme();
  const {
    reasons,
    error,
    deleteDialog,
    handleDeleteClick,
    handleDeleteConfirm,
    handleCloseDialog,
    fetchReasons,
  } = useEarlyExitReasons();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await fetchReasons();
      setIsLoading(false);
    };
    
    loadData();
  }, []);

  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchReasons();
    setIsLoading(false);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Page header with breadcrumbs */}
      <Box sx={{ mb: 4 }}>
        <Breadcrumbs
          separator={<NavigateNextIcon fontSize="small" />}
          aria-label="breadcrumb"
          sx={{ mb: 2 }}
        >
          <Link 
            color="inherit" 
            href="/" 
            sx={{ 
              display: 'flex', 
              alignItems: 'center',
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline' }
            }}
          >
            <HomeIcon sx={{ mr: 0.5 }} fontSize="inherit" />
            Home
          </Link>
          <Typography 
            color="text.primary" 
            sx={{ 
              display: 'flex', 
              alignItems: 'center',
              fontWeight: 'medium' 
            }}
          >
            <FormatListBulletedIcon sx={{ mr: 0.5 }} fontSize="inherit" />
            Early Exit Reasons
          </Typography>
        </Breadcrumbs>

        <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
          <Grid item>
            <Typography 
              variant="h4" 
              color="primary"
              fontWeight="medium"
            >
              Early Exit Reasons
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
              View and manage employee early exit reasons
            </Typography>
          </Grid>
          <Grid item>
            <Tooltip title="Refresh list">
              <IconButton 
                onClick={handleRefresh} 
                disabled={isLoading}
                color="primary"
                sx={{ 
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                  borderRadius: 1,
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.1)
                  }
                }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Grid>
        </Grid>
      </Box>

      <Paper 
        elevation={0} 
        sx={{ 
          p: { xs: 2, sm: 3 }, 
          borderRadius: 2,
          bgcolor: 'background.paper',
          mb: 3,
          boxShadow: theme.shadows[1]
        }}
      >
        {error && !isLoading && !deleteDialog.isDeleting && (
          <Alert 
            severity="error" 
            sx={{ 
              mb: 3,
              borderRadius: 1,
              '& .MuiAlert-icon': {
                fontSize: 28
              }
            }}
          >
            <AlertTitle>Error</AlertTitle>
            {error}
          </Alert>
        )}

        <Card 
          variant="outlined" 
          sx={{ 
            boxShadow: 'none',
            overflow: 'hidden',
            border: `1px solid ${alpha(theme.palette.divider, 0.7)}`
          }}
        >
          <CardContent sx={{ p: { xs: 0, sm: 0 } }}>
            <ReasonsTable
              reasons={reasons}
              onDelete={(reason) => handleDeleteClick(reason.id)}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>
      </Paper>

      <DeleteConfirmationDialog
        deleteDialog={deleteDialog}
        onClose={handleCloseDialog}
        onConfirm={handleDeleteConfirm}
      />
    </Container>
  );
} 