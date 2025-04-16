import React, { useState, useEffect } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Typography
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import axios from 'axios';

const ShiftManagement = () => {
    const [shifts, setShifts] = useState([]);
    const [open, setOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [currentShift, setCurrentShift] = useState({
        name: '',
        login_time: '',
        logout_time: ''
    });
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchShifts();
    }, []);

    const fetchShifts = async () => {
        try {
            const response = await axios.get('/shifts');
            setShifts(response.data);
        } catch (error) {
            console.error('Error fetching shifts:', error);
            setError('Failed to load shifts');
        }
    };

    const handleOpen = (shift = null) => {
        if (shift) {
            setCurrentShift(shift);
            setEditMode(true);
        } else {
            setCurrentShift({
                name: '',
                login_time: '',
                logout_time: ''
            });
            setEditMode(false);
        }
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
        setEditMode(false);
        setCurrentShift({
            name: '',
            login_time: '',
            logout_time: ''
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editMode) {
                await axios.put(`/shifts/${currentShift.id}`, currentShift);
            } else {
                await axios.post('/shifts', currentShift);
            }
            handleClose();
            fetchShifts();
        } catch (error) {
            console.error('Error saving shift:', error);
            setError('Failed to save shift');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this shift?')) {
            try {
                await axios.delete(`/shifts/${id}`);
                fetchShifts();
            } catch (error) {
                console.error('Error deleting shift:', error);
                setError('Failed to delete shift');
            }
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h5">Shift Management</Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpen()}
                >
                    Add Shift
                </Button>
            </Box>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Login Time</TableCell>
                            <TableCell>Logout Time</TableCell>
                            <TableCell>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {shifts.map((shift) => (
                            <TableRow key={shift.id}>
                                <TableCell>{shift.name}</TableCell>
                                <TableCell>{shift.login_time}</TableCell>
                                <TableCell>{shift.logout_time}</TableCell>
                                <TableCell>
                                    <IconButton onClick={() => handleOpen(shift)}>
                                        <EditIcon />
                                    </IconButton>
                                    <IconButton onClick={() => handleDelete(shift.id)}>
                                        <DeleteIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={open} onClose={handleClose}>
                <DialogTitle>{editMode ? 'Edit Shift' : 'Add New Shift'}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Shift Name"
                        fullWidth
                        value={currentShift.name}
                        onChange={(e) => setCurrentShift({ ...currentShift, name: e.target.value })}
                    />
                    <TextField
                        margin="dense"
                        label="Login Time (HH:MM)"
                        fullWidth
                        value={currentShift.login_time}
                        onChange={(e) => setCurrentShift({ ...currentShift, login_time: e.target.value })}
                    />
                    <TextField
                        margin="dense"
                        label="Logout Time (HH:MM)"
                        fullWidth
                        value={currentShift.logout_time}
                        onChange={(e) => setCurrentShift({ ...currentShift, logout_time: e.target.value })}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained">
                        {editMode ? 'Update' : 'Add'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ShiftManagement; 