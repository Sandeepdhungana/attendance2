import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Autocomplete,
  TextField,
  Chip,
  Avatar,
  useTheme,
  alpha,
  Stack,
  CircularProgress,
} from '@mui/material';
import {
  Group as GroupIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
} from '@mui/icons-material';
import { Employee } from '../../types/dashboard';
import api from '../../api/config';

interface EmployeeSelectorProps {
  selectedEmployee: Employee | null;
  onEmployeeChange: (employee: Employee | null) => void;
  loading?: boolean;
}

const EmployeeSelectorComponent: React.FC<EmployeeSelectorProps> = ({
  selectedEmployee,
  onEmployeeChange,
  loading = false,
}) => {
  const theme = useTheme();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  // Fetch employees
  useEffect(() => {
    const fetchEmployees = async () => {
      setEmployeesLoading(true);
      try {
        const response = await api.get('/employees');
        const employeeData = response.data.map((emp: any) => ({
          employee_id: emp.employee_id,
          name: emp.name || `Employee ${emp.employee_id}`,
          email: emp.email,
          is_admin: emp.is_admin,
          is_active: emp.is_active,
          objectId: emp.objectId,
        }));
        setEmployees(employeeData);
      } catch (error) {
        console.error('Error fetching employees:', error);
      } finally {
        setEmployeesLoading(false);
      }
    };

    fetchEmployees();
  }, []);

  // Create "All Employees" option
  const allEmployeesOption: Employee = {
    employee_id: 'all',
    name: 'All Employees',
    email: 'all@company.com',
    is_admin: false,
    is_active: true,
    objectId: 'all',
  };

  // Combine all employees option with regular employees
  const employeeOptions = [allEmployeesOption, ...employees.filter(emp => emp.is_active !== false)];

  const handleEmployeeChange = (_: any, newValue: Employee | null) => {
    if (newValue?.employee_id === 'all') {
      onEmployeeChange(null); // null means all employees
    } else {
      onEmployeeChange(newValue);
    }
  };

  const getOptionLabel = (option: Employee) => {
    if (option.employee_id === 'all') {
      return 'All Employees';
    }
    return `${option.name} (${option.employee_id})`;
  };

  const renderOption = (props: any, option: Employee) => (
    <Box component="li" {...props}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%' }}>
        <Avatar
          sx={{
            width: 40,
            height: 40,
            bgcolor: option.employee_id === 'all' 
              ? alpha(theme.palette.primary.main, 0.1)
              : alpha(theme.palette.secondary.main, 0.1),
            color: option.employee_id === 'all' 
              ? theme.palette.primary.main
              : theme.palette.secondary.main,
          }}
        >
          {option.employee_id === 'all' ? <GroupIcon /> : <PersonIcon />}
        </Avatar>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body1" fontWeight="medium">
            {option.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {option.employee_id === 'all' ? 'View all employees data' : `ID: ${option.employee_id}`}
          </Typography>
          {option.email && option.employee_id !== 'all' && (
            <Typography variant="caption" color="text.secondary">
              {option.email} {option.is_admin ? ' • Admin' : ' • Employee'}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );

  const getCurrentDisplayValue = () => {
    if (!selectedEmployee) {
      return allEmployeesOption;
    }
    return selectedEmployee;
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h6" display="flex" alignItems="center" gap={1}>
            <GroupIcon />
            Employee Selection
          </Typography>
          {selectedEmployee ? (
            <Chip
              label={selectedEmployee.name}
              color="primary"
              variant="outlined"
              avatar={<Avatar sx={{ bgcolor: 'primary.main' }}><PersonIcon /></Avatar>}
            />
          ) : (
            <Chip
              label="All Employees"
              color="primary"
              variant="outlined"
              avatar={<Avatar sx={{ bgcolor: 'primary.main' }}><GroupIcon /></Avatar>}
            />
          )}
        </Box>

        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Select Employee
          </Typography>
          <Autocomplete
            options={employeeOptions}
            value={getCurrentDisplayValue()}
            onChange={handleEmployeeChange}
            getOptionLabel={getOptionLabel}
            renderOption={renderOption}
            loading={employeesLoading}
            disabled={loading}
            filterOptions={(options, { inputValue }) => {
              if (!inputValue) return options;
              return options.filter(option =>
                option.name.toLowerCase().includes(inputValue.toLowerCase()) ||
                option.employee_id.toLowerCase().includes(inputValue.toLowerCase()) ||
                (option.email && option.email.toLowerCase().includes(inputValue.toLowerCase()))
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Search employees..."
                size="small"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {employeesLoading ? <CircularProgress color="inherit" size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            sx={{ width: '100%' }}
          />
        </Box>

        {/* Employee Info Display */}
        {selectedEmployee && selectedEmployee.employee_id !== 'all' && (
          <Box
            sx={{
              mt: 2,
              p: 2,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
            }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar
                sx={{
                  bgcolor: theme.palette.primary.main,
                  color: 'white',
                  width: 48,
                  height: 48,
                }}
              >
                <PersonIcon />
              </Avatar>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="body1" fontWeight="medium" color="primary">
                  {selectedEmployee.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ID: {selectedEmployee.employee_id}
                </Typography>
                {selectedEmployee.email && (
                  <Typography variant="caption" color="text.secondary">
                    {selectedEmployee.email} • {selectedEmployee.is_admin ? 'Admin' : 'Employee'}
                  </Typography>
                )}
              </Box>
            </Stack>
          </Box>
        )}

        {!selectedEmployee && (
          <Box
            sx={{
              mt: 2,
              p: 2,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.info.main, 0.1),
              border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
            }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar
                sx={{
                  bgcolor: theme.palette.info.main,
                  color: 'white',
                  width: 48,
                  height: 48,
                }}
              >
                <GroupIcon />
              </Avatar>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="body1" fontWeight="medium" color="info.main">
                  All Employees View
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Showing aggregated data for all employees
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {employees.length} employees • {employees.filter(emp => emp.is_admin).length} admins
                </Typography>
              </Box>
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default EmployeeSelectorComponent; 