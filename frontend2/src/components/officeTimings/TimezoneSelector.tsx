import { useState, useEffect } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Typography,
  Paper,
  CircularProgress,
  Chip,
  Grid,
  Autocomplete,
  TextField,
  Snackbar,
  Alert,
  useTheme,
  alpha,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PublicIcon from '@mui/icons-material/Public';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import api from '../../api/config';
import { optimisticApiCall } from '../../api/optimistic';

interface TimezoneSelectorProps {
  currentTimezone: string;
  onTimezoneChange: (timezone: string) => void;
}

export function TimezoneSelector({ currentTimezone, onTimezoneChange }: TimezoneSelectorProps) {
  const theme = useTheme();
  const [availableTimezones, setAvailableTimezones] = useState<string[]>([]);
  const [selectedTimezone, setSelectedTimezone] = useState(currentTimezone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Get current time in the selected timezone
  const [currentTime, setCurrentTime] = useState<string>('');
  
  useEffect(() => {
    fetchTimezones();
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { timeZone: selectedTimezone }));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [selectedTimezone]);

  const fetchTimezones = async () => {
    try {
      const response = await api.get('/timezones');
      setAvailableTimezones(response.data.timezones);
    } catch (err) {
      setError('Failed to fetch available timezones');
    }
  };

  const handleTimezoneChange = async () => {
    if (selectedTimezone === currentTimezone) return;
    
    setLoading(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('timezone', selectedTimezone);
    
    // Optimistically update the UI
    const previousTimezone = currentTimezone;
    onTimezoneChange(selectedTimezone);
    
    try {
      await optimisticApiCall({
        endpoint: '/timezone',
        method: 'POST',
        data: formData,
        optimisticData: selectedTimezone,
        onSuccess: () => {
          setSuccess(true);
          setLoading(false);
        },
        onError: (err) => {
          setError('Failed to update timezone');
          // Revert to previous timezone
          onTimezoneChange(previousTimezone);
          setSelectedTimezone(previousTimezone);
          setLoading(false);
        },
        updateLocalState: () => {} // Already handled with onTimezoneChange
      });
    } catch (err) {
      setError('Failed to update timezone');
      // Revert to previous timezone
      onTimezoneChange(previousTimezone);
      setSelectedTimezone(previousTimezone);
      setLoading(false);
    }
  };

  const handleCloseSuccess = () => {
    setSuccess(false);
  };

  return (
    <Paper 
      sx={{ 
        p: 3, 
        mb: 3, 
        borderRadius: 2,
        boxShadow: theme.shadows[2],
        transition: 'all 0.3s ease-in-out',
        '&:hover': {
          boxShadow: theme.shadows[5],
        },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box 
        sx={{ 
          position: 'absolute', 
          top: 0, 
          right: 0, 
          width: 60, 
          height: 60, 
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomLeftRadius: theme.shape.borderRadius,
        }}
      >
        <PublicIcon color="primary" fontSize="large" />
      </Box>
      
      <Typography 
        variant="h6" 
        gutterBottom
        sx={{ 
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}
      >
        Timezone Configuration
      </Typography>
      
      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6}>
          <Box 
            sx={{ 
              p: 2, 
              bgcolor: alpha(theme.palette.primary.main, 0.05), 
              borderRadius: theme.shape.borderRadius,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Typography variant="subtitle2" color="textSecondary">
              Current Timezone
            </Typography>
            <Typography 
              variant="h6" 
              sx={{ 
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}
            >
              <Chip 
                icon={<AccessTimeIcon />} 
                label={currentTimezone} 
                variant="outlined" 
                color="primary" 
              />
            </Typography>
            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
              <AccessTimeIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                Current time: {currentTime}
              </Typography>
            </Box>
          </Box>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Autocomplete
              value={selectedTimezone}
              onChange={(_, newValue) => {
                if (newValue) setSelectedTimezone(newValue);
              }}
              options={availableTimezones}
              renderInput={(params) => (
                <TextField 
                  {...params} 
                  label="Select Timezone" 
                  fullWidth 
                  variant="outlined"
                />
              )}
              sx={{ mb: 2 }}
            />
            
            <Button
              variant="contained"
              color="primary"
              onClick={handleTimezoneChange}
              disabled={selectedTimezone === currentTimezone || loading}
              sx={{ 
                mt: 'auto',
                py: 1.5,
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: theme.shape.borderRadius,
              }}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <CheckCircleIcon />}
            >
              {loading ? 'Updating...' : 'Update Timezone'}
            </Button>
          </Box>
        </Grid>
      </Grid>
      
      {error && (
        <Alert 
          severity="error" 
          sx={{ 
            mt: 2,
            borderRadius: theme.shape.borderRadius,
          }}
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}
      
      <Snackbar
        open={success}
        autoHideDuration={4000}
        onClose={handleCloseSuccess}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseSuccess} 
          severity="success" 
          sx={{ width: '100%' }}
        >
          Timezone updated successfully
        </Alert>
      </Snackbar>
    </Paper>
  );
} 