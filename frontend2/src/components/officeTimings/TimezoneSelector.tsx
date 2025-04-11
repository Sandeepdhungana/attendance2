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
} from '@mui/material';
import api from '../../api/config';

interface TimezoneSelectorProps {
  currentTimezone: string;
  onTimezoneChange: (timezone: string) => void;
}

export function TimezoneSelector({ currentTimezone, onTimezoneChange }: TimezoneSelectorProps) {
  const [availableTimezones, setAvailableTimezones] = useState<string[]>([]);
  const [selectedTimezone, setSelectedTimezone] = useState(currentTimezone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTimezones();
  }, []);

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
    try {
      const formData = new FormData();
      formData.append('timezone', selectedTimezone);
      await api.post('/timezone', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      onTimezoneChange(selectedTimezone);
    } catch (err) {
      setError('Failed to update timezone');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Timezone Configuration
      </Typography>
      <Typography variant="body1" gutterBottom>
        Current Timezone: {currentTimezone}
      </Typography>
      <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <FormControl fullWidth>
          <InputLabel>Select Timezone</InputLabel>
          <Select
            value={selectedTimezone}
            label="Select Timezone"
            onChange={(e) => setSelectedTimezone(e.target.value)}
          >
            {availableTimezones.map((tz) => (
              <MenuItem key={tz} value={tz}>
                {tz}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="contained"
          color="primary"
          onClick={handleTimezoneChange}
          disabled={selectedTimezone === currentTimezone || loading}
        >
          Update Timezone
        </Button>
      </Box>
      {error && (
        <Typography color="error" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
    </Paper>
  );
} 