import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Chip,
  Stack,
  Menu,
  MenuItem,
  useTheme,
  alpha,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import {
  CalendarToday as CalendarIcon,
  Today as TodayIcon,
  DateRange as DateRangeIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays, subWeeks, subMonths } from 'date-fns';
import { DateRangeFilter } from '../../types/dashboard';

interface DateRangePickerProps {
  dateRange: DateRangeFilter;
  onDateRangeChange: (range: DateRangeFilter) => void;
  onApply: () => void;
  loading?: boolean;
}

const DateRangePickerComponent: React.FC<DateRangePickerProps> = ({
  dateRange,
  onDateRangeChange,
  onApply,
  loading = false,
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const presetRanges = [
    {
      label: 'Today',
      getValue: () => {
        const today = new Date();
        return { startDate: today, endDate: today };
      },
      icon: <TodayIcon />,
    },
    {
      label: 'This Week',
      getValue: () => ({
        startDate: startOfWeek(new Date()),
        endDate: endOfWeek(new Date()),
      }),
      icon: <ScheduleIcon />,
    },
    {
      label: 'This Month',
      getValue: () => ({
        startDate: startOfMonth(new Date()),
        endDate: endOfMonth(new Date()),
      }),
      icon: <CalendarIcon />,
    },
    {
      label: 'Last 7 Days',
      getValue: () => ({
        startDate: subDays(new Date(), 6),
        endDate: new Date(),
      }),
      icon: <DateRangeIcon />,
    },
    {
      label: 'Last 30 Days',
      getValue: () => ({
        startDate: subDays(new Date(), 29),
        endDate: new Date(),
      }),
      icon: <DateRangeIcon />,
    },
    {
      label: 'Last Week',
      getValue: () => {
        const lastWeek = subWeeks(new Date(), 1);
        return {
          startDate: startOfWeek(lastWeek),
          endDate: endOfWeek(lastWeek),
        };
      },
      icon: <ScheduleIcon />,
    },
    {
      label: 'Last Month',
      getValue: () => {
        const lastMonth = subMonths(new Date(), 1);
        return {
          startDate: startOfMonth(lastMonth),
          endDate: endOfMonth(lastMonth),
        };
      },
      icon: <CalendarIcon />,
    },
  ];

  const handlePresetClick = (preset: typeof presetRanges[0]) => {
    const range = preset.getValue();
    onDateRangeChange(range);
    handleClose();
  };

  const handleStartDateChange = (date: Date | null) => {
    if (date) {
      onDateRangeChange({
        ...dateRange,
        startDate: date,
      });
    }
  };

  const handleEndDateChange = (date: Date | null) => {
    if (date) {
      onDateRangeChange({
        ...dateRange,
        endDate: date,
      });
    }
  };

  const getCurrentRangeLabel = () => {
    const today = new Date();
    const { startDate, endDate } = dateRange;
    
    // Check if it matches any preset
    for (const preset of presetRanges) {
      const presetRange = preset.getValue();
      if (
        format(startDate, 'yyyy-MM-dd') === format(presetRange.startDate, 'yyyy-MM-dd') &&
        format(endDate, 'yyyy-MM-dd') === format(presetRange.endDate, 'yyyy-MM-dd')
      ) {
        return preset.label;
      }
    }
    
    // Custom range
    if (format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd')) {
      return format(startDate, 'MMM dd, yyyy');
    }
    
    return `${format(startDate, 'MMM dd, yyyy')} - ${format(endDate, 'MMM dd, yyyy')}`;
  };

  const isValidRange = dateRange.startDate <= dateRange.endDate;

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h6" display="flex" alignItems="center" gap={1}>
            <DateRangeIcon />
            Select Date Range
          </Typography>
          <Chip
            label={getCurrentRangeLabel()}
            color="primary"
            variant="outlined"
            icon={<CalendarIcon />}
          />
        </Box>

        <Grid container spacing={2} alignItems="center">
          {/* Quick Presets */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" gutterBottom>
              Quick Presets
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={1}>
              {presetRanges.slice(0, 4).map((preset) => (
                <Button
                  key={preset.label}
                  variant="outlined"
                  size="small"
                  startIcon={preset.icon}
                  onClick={() => handlePresetClick(preset)}
                  sx={{
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                    minWidth: 'auto',
                  }}
                >
                  {preset.label}
                </Button>
              ))}
              <Button
                variant="outlined"
                size="small"
                onClick={handleClick}
                sx={{
                  fontSize: '0.75rem',
                  padding: '4px 8px',
                  minWidth: 'auto',
                }}
              >
                More...
              </Button>
            </Box>
          </Grid>

          {/* Custom Date Selection */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" gutterBottom>
              Custom Range
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <DatePicker
                label="Start Date"
                value={dateRange.startDate}
                onChange={handleStartDateChange}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: { minWidth: 140 },
                  },
                }}
                maxDate={dateRange.endDate}
              />
              <Typography variant="body2" color="text.secondary">
                to
              </Typography>
              <DatePicker
                label="End Date"
                value={dateRange.endDate}
                onChange={handleEndDateChange}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: { minWidth: 140 },
                  },
                }}
                minDate={dateRange.startDate}
                maxDate={new Date()}
              />
            </Stack>
          </Grid>

          {/* Apply Button */}
          <Grid item xs={12}>
            <Box display="flex" justifyContent="flex-end" mt={2}>
              <Button
                variant="contained"
                onClick={onApply}
                disabled={!isValidRange || loading}
                sx={{
                  px: 3,
                  py: 1,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 'medium',
                }}
              >
                {loading ? 'Loading...' : 'Apply'}
              </Button>
            </Box>
          </Grid>
        </Grid>

        {/* Additional Preset Menu */}
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          PaperProps={{
            sx: {
              minWidth: 200,
              maxHeight: 300,
            },
          }}
        >
          {presetRanges.slice(4).map((preset) => (
            <MenuItem
              key={preset.label}
              onClick={() => handlePresetClick(preset)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 1,
              }}
            >
              <Box sx={{ color: theme.palette.primary.main }}>
                {preset.icon}
              </Box>
              <Typography variant="body2">{preset.label}</Typography>
            </MenuItem>
          ))}
        </Menu>

        {/* Date Range Info */}
        {isValidRange && (
          <Box
            sx={{
              mt: 2,
              p: 1.5,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
            }}
          >
            <Typography variant="body2" color="primary">
              <strong>Selected Range:</strong> {getCurrentRangeLabel()}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {Math.ceil((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1} days selected
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default DateRangePickerComponent; 