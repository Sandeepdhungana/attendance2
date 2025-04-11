import { useState, useEffect } from 'react';
import api from '../api/config';
import { OfficeTiming, OfficeTimingFormData } from '../types/officeTimings';

export const useOfficeTimings = () => {
  const [timings, setTimings] = useState<OfficeTiming[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTimezone, setCurrentTimezone] = useState('');
  const [newTiming, setNewTiming] = useState<OfficeTimingFormData>({
    login_time: '',
    logout_time: '',
  });

  const fetchTimings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/office-timings');
      const timingsData = Array.isArray(response.data) ? response.data : [response.data];
      setTimings(timingsData);
      setError(null);
    } catch (err) {
      setError('Failed to fetch office timings');
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentTimezone = async () => {
    try {
      const response = await api.get('/timezone');
      setCurrentTimezone(response.data.timezone);
    } catch (err) {
      setError('Failed to fetch current timezone');
    }
  };

  const handleAddTiming = async () => {
    try {
      // Validate the timing data
      if (!newTiming.login_time || !newTiming.logout_time) {
        setError('Please provide both login and logout times');
        return;
      }

      // Create FormData object
      const formData = new FormData();
      formData.append('login_time', newTiming.login_time);
      formData.append('logout_time', newTiming.logout_time);

      console.log('Sending data to server:', {
        login_time: newTiming.login_time,
        logout_time: newTiming.logout_time
      }); // Debug log

      setLoading(true);
      const response = await api.post('/office-timings', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      console.log('Server response:', response.data); // Debug log

      if (response.status === 200 || response.status === 201) {
        await fetchTimings();
        setNewTiming({ login_time: '', logout_time: '' });
        setError(null);
      } else {
        setError('Failed to add office timing: Invalid response from server');
      }
    } catch (err: any) {
      console.error('Full error object:', err); // Debug log
      console.error('Error response data:', err.response?.data); // Debug log
      
      if (err.response?.data?.detail) {
        setError(`Failed to add office timing: ${err.response.data.detail}`);
      } else if (err.response?.data?.message) {
        setError(`Failed to add office timing: ${err.response.data.message}`);
      } else if (err.response?.data) {
        setError(`Failed to add office timing: ${JSON.stringify(err.response.data)}`);
      } else {
        setError('Failed to add office timing. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTimezoneChange = (timezone: string) => {
    setCurrentTimezone(timezone);
    fetchTimings(); // Refresh timings after timezone change
  };

  useEffect(() => {
    fetchTimings();
    fetchCurrentTimezone();
  }, []);

  return {
    timings,
    loading,
    error,
    currentTimezone,
    newTiming,
    setNewTiming,
    handleAddTiming,
    handleTimezoneChange,
  };
}; 