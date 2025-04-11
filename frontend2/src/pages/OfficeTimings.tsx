import React from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Container, 
  Alert, 
  Button, 
  TextField, 
  Grid,
  Divider,
  Stack,
  Card,
  CardContent,
  CardHeader,
} from '@mui/material';
import { useOfficeTimings } from '../hooks/useOfficeTimings';
import { TimingsTable } from '../components/officeTimings/TimingsTable';
import { TimezoneSelector } from '../components/officeTimings/TimezoneSelector';
import { OfficeTiming } from '../types/officeTimings';

const OfficeTimings: React.FC = () => {
  const {
    timings,
    loading,
    error,
    currentTimezone,
    handleAddTiming,
    handleTimezoneChange,
    newTiming,
    setNewTiming,
  } = useOfficeTimings();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAddTiming();
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography 
          variant="h4" 
          component="h1" 
          gutterBottom
          sx={{ 
            fontWeight: 600,
            color: 'primary.main',
            mb: 4
          }}
        >
          Office Timings
        </Typography>

        {error && (
          <Alert 
            severity="error" 
            sx={{ 
              mb: 3,
              borderRadius: 2
            }}
          >
            {error}
          </Alert>
        )}

        <Card 
          elevation={2}
          sx={{ 
            mb: 4,
            borderRadius: 2,
            overflow: 'hidden'
          }}
        >
          <CardHeader 
            title="Timezone Settings"
            titleTypographyProps={{
              variant: 'h6',
              fontWeight: 600
            }}
          />
          <Divider />
          <CardContent>
            <TimezoneSelector
              currentTimezone={currentTimezone}
              onTimezoneChange={handleTimezoneChange}
            />
          </CardContent>
        </Card>

        <Card 
          elevation={2}
          sx={{ 
            mb: 4,
            borderRadius: 2,
            overflow: 'hidden'
          }}
        >
          <CardHeader 
            title="Add New Timing"
            titleTypographyProps={{
              variant: 'h6',
              fontWeight: 600
            }}
          />
          <Divider />
          <CardContent>
            <form onSubmit={handleSubmit}>
              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} sm={5}>
                  <TextField
                    fullWidth
                    label="Login Time"
                    type="time"
                    value={newTiming.login_time}
                    onChange={(e) => setNewTiming(prev => ({ ...prev, login_time: e.target.value }))}
                    InputLabelProps={{
                      shrink: true,
                    }}
                    inputProps={{
                      step: 300, // 5 min
                    }}
                    size="medium"
                  />
                </Grid>
                <Grid item xs={12} sm={5}>
                  <TextField
                    fullWidth
                    label="Logout Time"
                    type="time"
                    value={newTiming.logout_time}
                    onChange={(e) => setNewTiming(prev => ({ ...prev, logout_time: e.target.value }))}
                    InputLabelProps={{
                      shrink: true,
                    }}
                    inputProps={{
                      step: 300, // 5 min
                    }}
                    size="medium"
                  />
                </Grid>
                <Grid item xs={12} sm={2}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    fullWidth
                    disabled={loading}
                    sx={{
                      height: '100%',
                      py: 1.5
                    }}
                  >
                    Add
                  </Button>
                </Grid>
              </Grid>
            </form>
          </CardContent>
        </Card>

        <Card 
          elevation={2}
          sx={{ 
            borderRadius: 2,
            overflow: 'hidden'
          }}
        >
          <CardHeader 
            title="Office Timings List"
            titleTypographyProps={{
              variant: 'h6',
              fontWeight: 600
            }}
          />
          <Divider />
          <CardContent>
            <TimingsTable
              timings={timings}
              loading={loading}
            />
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
};

export default OfficeTimings; 