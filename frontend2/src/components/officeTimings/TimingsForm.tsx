import { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Paper,
  Typography,
} from '@mui/material';
import { OfficeTimingFormData } from '../../types/officeTimings';

interface TimingsFormProps {
  onSubmit: (data: OfficeTimingFormData) => void;
  loading: boolean;
}

export function TimingsForm({ onSubmit, loading }: TimingsFormProps) {
  const [formData, setFormData] = useState<OfficeTimingFormData>({
    login_time: '',
    logout_time: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({ login_time: '', logout_time: '' });
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Add Office Timing
      </Typography>
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', gap: 2 }}>
        <TextField
          label="Login Time"
          type="time"
          value={formData.login_time}
          onChange={(e) => setFormData({ ...formData, login_time: e.target.value })}
          InputLabelProps={{ shrink: true }}
          required
          sx={{ flex: 1 }}
        />
        <TextField
          label="Logout Time"
          type="time"
          value={formData.logout_time}
          onChange={(e) => setFormData({ ...formData, logout_time: e.target.value })}
          InputLabelProps={{ shrink: true }}
          required
          sx={{ flex: 1 }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={loading}
          sx={{ minWidth: 120 }}
        >
          Add
        </Button>
      </Box>
    </Paper>
  );
} 