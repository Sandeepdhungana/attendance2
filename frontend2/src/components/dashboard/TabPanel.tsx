import React from 'react';
import { Box, useTheme } from '@mui/material';
import { TabPanelProps } from '../../types/dashboard';

export const TabPanel: React.FC<TabPanelProps> = ({
  children,
  value,
  index,
  ...other
}) => {
  const theme = useTheme();
  
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`dashboard-tabpanel-${index}`}
      aria-labelledby={`dashboard-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box 
          sx={{ 
            p: { xs: 1, sm: 2 },
            transition: 'all 0.2s ease-in-out',
            bgcolor: theme.palette.background.paper 
          }}
        >
          {children}
        </Box>
      )}
    </div>
  );
}; 