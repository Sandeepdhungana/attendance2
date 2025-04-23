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
      style={{ 
        width: '100%',
        height: '100%',
        overflow: 'hidden'
      }}
      {...other}
    >
      {value === index && (
        <Box 
          sx={{ 
            p: { xs: 1, sm: 2 },
            transition: 'all 0.2s ease-in-out',
            bgcolor: theme.palette.background.paper,
            height: '100%',
            overflow: 'auto',
            '&::-webkit-scrollbar': {
              width: '8px',
              height: '8px',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: theme.palette.mode === 'light' 
                ? 'rgba(0,0,0,0.2)' 
                : 'rgba(255,255,255,0.2)',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: theme.palette.mode === 'light'
                ? 'rgba(0,0,0,0.05)'
                : 'rgba(255,255,255,0.05)',
            }
          }}
        >
          {children}
        </Box>
      )}
    </div>
  );
}; 