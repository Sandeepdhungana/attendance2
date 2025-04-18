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
    error,
    currentTimezone,
    handleTimezoneChange,
  } = useOfficeTimings();


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
      </Box>
    </Container>
  );
};

export default OfficeTimings; 