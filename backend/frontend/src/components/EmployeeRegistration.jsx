import React, { useState, useEffect } from 'react';
import {
    Box,
    Button,
    TextField,
    Typography,
    Paper,
    CircularProgress,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem
} from '@mui/material';
import axios from 'axios';

const EmployeeRegistration = () => {
    const [formData, setFormData] = useState({
        name: '',
        employee_id: '',
        department: '',
        position: '',
        status: 'active',
        shift_id: '',
        image: null
    });
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [ws, setWs] = useState(null);

    useEffect(() => {
        fetchShifts();
        setupWebSocket();
        return () => {
            if (ws) {
                ws.close();
            }
        };
    }, []);

    const setupWebSocket = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/attendance`;
        const newWs = new WebSocket(wsUrl);

        newWs.onopen = () => {
            console.log('WebSocket connection established');
        };

        newWs.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'error') {
                setError(data.message);
                setLoading(false);
            } else if (data.type === 'success') {
                setSuccess(true);
                setLoading(false);
                setFormData({
                    name: '',
                    employee_id: '',
                    department: '',
                    position: '',
                    status: 'active',
                    shift_id: '',
                    image: null
                });
            }
        };

        newWs.onerror = (error) => {
            console.error('WebSocket error:', error);
            setError('WebSocket connection error');
            setLoading(false);
        };

        newWs.onclose = () => {
            console.log('WebSocket connection closed');
        };

        setWs(newWs);
    };

    const fetchShifts = async () => {
        try {
            const response = await axios.get('/shifts');
            setShifts(response.data);
        } catch (error) {
            console.error('Error fetching shifts:', error);
            setError('Failed to load shifts');
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleImageChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFormData(prev => ({
                ...prev,
                image: e.target.files[0]
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(false);

        try {
            const formDataToSend = new FormData();
            Object.keys(formData).forEach(key => {
                if (formData[key] !== null) {
                    formDataToSend.append(key, formData[key]);
                }
            });

            await axios.post('/register', formDataToSend, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            setSuccess(true);
            setFormData({
                name: '',
                employee_id: '',
                department: '',
                position: '',
                status: 'active',
                shift_id: '',
                image: null
            });
        } catch (error) {
            setError(error.response?.data?.detail || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Paper sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
                <Typography variant="h5" gutterBottom>
                    Employee Registration
                </Typography>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {success && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                        Employee registered successfully!
                    </Alert>
                )}

                <form onSubmit={handleSubmit}>
                    <TextField
                        fullWidth
                        label="Name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        margin="normal"
                        required
                    />

                    <TextField
                        fullWidth
                        label="Employee ID"
                        name="employee_id"
                        value={formData.employee_id}
                        onChange={handleChange}
                        margin="normal"
                        required
                    />

                    <TextField
                        fullWidth
                        label="Department"
                        name="department"
                        value={formData.department}
                        onChange={handleChange}
                        margin="normal"
                        required
                    />

                    <TextField
                        fullWidth
                        label="Position"
                        name="position"
                        value={formData.position}
                        onChange={handleChange}
                        margin="normal"
                        required
                    />

                    <FormControl fullWidth margin="normal">
                        <InputLabel>Status</InputLabel>
                        <Select
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            label="Status"
                        >
                            <MenuItem value="active">Active</MenuItem>
                            <MenuItem value="inactive">Inactive</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl fullWidth margin="normal">
                        <InputLabel>Shift</InputLabel>
                        <Select
                            name="shift_id"
                            value={formData.shift_id}
                            onChange={handleChange}
                            label="Shift"
                            required
                        >
                            {shifts.map((shift) => (
                                <MenuItem key={shift.objectId} value={shift.objectId}>
                                    {shift.name} ({shift.login_time} - {shift.logout_time})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Box sx={{ mt: 2 }}>
                        <input
                            accept="image/*"
                            style={{ display: 'none' }}
                            id="employee-image"
                            type="file"
                            onChange={handleImageChange}
                        />
                        <label htmlFor="employee-image">
                            <Button variant="contained" component="span">
                                Upload Photo
                            </Button>
                        </label>
                        {formData.image && (
                            <Typography variant="body2" sx={{ mt: 1 }}>
                                {formData.image.name}
                            </Typography>
                        )}
                    </Box>

                    <Box sx={{ mt: 3 }}>
                        <Button
                            type="submit"
                            variant="contained"
                            color="primary"
                            disabled={loading}
                            fullWidth
                        >
                            {loading ? <CircularProgress size={24} /> : 'Register'}
                        </Button>
                    </Box>
                </form>
            </Paper>
        </Box>
    );
};

export default EmployeeRegistration; 