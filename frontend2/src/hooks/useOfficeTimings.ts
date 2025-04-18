import { useState, useEffect } from 'react';
import api from '../api/config';
import { OfficeTiming, OfficeTimingFormData } from '../types/officeTimings';
import { optimisticApiCall, useOptimisticState } from '../api/optimistic';

export const useOfficeTimings = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTimezone, setCurrentTimezone] = useState('');
  const [newTiming, setNewTiming] = useState<OfficeTimingFormData>({
    login_time: '',
    logout_time: '',
  });
  
  // Use optimistic state for timings
  const {
    state: timings,
    setState: setTimings,
    optimisticUpdate
  } = useOptimisticState<OfficeTiming[]>([]);

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
    // Validate the timing data
    if (!newTiming.login_time || !newTiming.logout_time) {
      setError('Please provide both login and logout times');
      return;
    }

    // Create FormData object
    const formData = new FormData();
    formData.append('login_time', newTiming.login_time);
    formData.append('logout_time', newTiming.logout_time);
    
    // Create an optimistic timing object
    const optimisticTiming: OfficeTiming = {
      id: `temp-${Date.now()}`,
      login_time: newTiming.login_time,
      logout_time: newTiming.logout_time,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    setLoading(true);
    
    // Update optimistically
    await optimisticUpdate({
      endpoint: '/office-timings',
      method: 'POST',
      data: formData,
      optimisticUpdate: (currentTimings) => [...currentTimings, optimisticTiming],
    });
    
    // Reset form
    setNewTiming({ login_time: '', logout_time: '' });
    setLoading(false);
  };

  const handleDeleteTiming = async (id: string) => {
    setLoading(true);
    
    // Update optimistically
    await optimisticUpdate({
      endpoint: `/office-timings/${id}`,
      method: 'DELETE',
      data: null,
      optimisticUpdate: (currentTimings) => currentTimings.filter(t => t.id !== id),
    });
    
    setLoading(false);
  };

  const handleUpdateTiming = async (id: string, data: Partial<OfficeTimingFormData>) => {
    // Create FormData object
    const formData = new FormData();
    if (data.login_time) formData.append('login_time', data.login_time);
    if (data.logout_time) formData.append('logout_time', data.logout_time);
    
    setLoading(true);
    
    // Update optimistically
    await optimisticUpdate({
      endpoint: `/office-timings/${id}`,
      method: 'PUT',
      data: formData,
      optimisticUpdate: (currentTimings) => 
        currentTimings.map(t => t.id === id ? { ...t, ...data, updated_at: new Date().toISOString() } : t),
    });
    
    setLoading(false);
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
    handleDeleteTiming,
    handleUpdateTiming,
    handleTimezoneChange,
  };
}; 