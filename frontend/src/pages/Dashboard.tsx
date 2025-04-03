import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { format } from 'date-fns';
import axios from 'axios';

interface AttendanceRecord {
  id: number;
  user_id: string;
  timestamp: string;
  confidence: number;
}

export default function Dashboard() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const columns: GridColDef[] = [
    {
      field: 'user_id',
      headerName: 'User ID',
      width: 150,
    },
    {
      field: 'timestamp',
      headerName: 'Time',
      width: 200,
      valueFormatter: (params) => format(new Date(params.value), 'PPpp'),
    },
    {
      field: 'confidence',
      headerName: 'Confidence',
      width: 130,
      valueFormatter: (params) => `${(params.value * 100).toFixed(1)}%`,
    },
  ];

  const fetchRecords = async () => {
    try {
      const response = await axios.get('/api/attendance');
      setRecords(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch attendance records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
    // Set up polling for real-time updates
    const interval = setInterval(fetchRecords, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <Typography variant="h4" gutterBottom>
        Attendance Dashboard
      </Typography>

      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : (
            <Box sx={{ height: 600, width: '100%' }}>
              <DataGrid
                rows={records}
                columns={columns}
                pageSize={10}
                rowsPerPageOptions={[10, 25, 50]}
                disableSelectionOnClick
                sx={{
                  '& .MuiDataGrid-cell': {
                    fontSize: '1rem',
                  },
                }}
              />
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
} 