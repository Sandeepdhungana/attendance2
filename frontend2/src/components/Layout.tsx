import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useTheme,
  Divider,
  Avatar,
  Badge,
  Tooltip,
  alpha,
  Collapse,
  LinearProgress,
  useMediaQuery,
  Paper,
  Container,
  Chip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Face as FaceIcon,
  Settings as SettingsIcon,
  AccessTime as AccessTimeIcon,
  ExitToApp as ExitToAppIcon,
  Schedule as ScheduleIcon,
  PersonAdd as PersonAddIcon,
  SwapHoriz as SwapHorizIcon,
  Notifications as NotificationsIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  AccountCircle as AccountCircleIcon,
  WifiOff as WifiOffIcon,
  Wifi as WifiIcon,
  ChevronLeft as ChevronLeftIcon,
  CalendarMonth as CalendarMonthIcon,
} from '@mui/icons-material';
import { useWebSocket } from '../App';

const drawerWidth = 260;

interface LayoutProps {
  children: React.ReactNode;
}

// Navigation menu structure
const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
  { text: 'Register Employee', icon: <PersonAddIcon />, path: '/register' },
  { text: 'Attendance', icon: <AccessTimeIcon />, path: '/attendance' },
  { text: 'Employee Shifts', icon: <SwapHorizIcon />, path: '/employee-shifts' },
];

const adminItems = [
  { text: 'Attendance by Date', icon: <CalendarMonthIcon />, path: '/attendance-by-date' },
  { text: 'Office Timings', icon: <AccessTimeIcon />, path: '/office-timings' },
  { text: 'Early Exit Reasons', icon: <ExitToAppIcon />, path: '/early-exit-reasons' },
  { text: 'Shifts', icon: <ScheduleIcon />, path: '/shifts' },
];

export default function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const location = useLocation();
  const theme = useTheme();
  const { isConnected } = useWebSocket();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));

  // Get current page title from path
  const pageTitle = useMemo(() => {
    if (location.pathname === '/') return 'Dashboard';
    const adminMatch = adminItems.find(item => item.path === location.pathname);
    const menuMatch = menuItems.find(item => item.path === location.pathname);
    return adminMatch?.text || menuMatch?.text || 'Dashboard';
  }, [location.pathname]);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  // Show loading indicator on route change
  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [location.pathname]);

  // Auto-close mobile drawer after navigation
  useEffect(() => {
    if (isSmallScreen && mobileOpen) {
      setMobileOpen(false);
    }
  }, [location.pathname, isSmallScreen]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleAdminToggle = () => {
    setAdminOpen(!adminOpen);
  };

  const NavItem = ({ item, selected }: { item: typeof menuItems[0], selected: boolean }) => (
    <ListItem disablePadding sx={{ mb: 0.5 }}>
      <ListItemButton
        component={Link}
        to={item.path}
        selected={selected}
        sx={{
          borderRadius: 2,
          py: 1.2,
          transition: 'all 0.2s',
          '&.Mui-selected': {
            bgcolor: alpha(theme.palette.primary.main, 0.15),
            '&:hover': {
              bgcolor: alpha(theme.palette.primary.main, 0.25),
            },
            '& .MuiListItemIcon-root': {
              color: theme.palette.primary.main,
            },
            '& .MuiListItemText-primary': {
              fontWeight: 'bold',
              color: theme.palette.primary.main,
            },
          },
          '&:hover': {
            bgcolor: alpha(theme.palette.primary.main, 0.08),
          }
        }}
      >
        <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
        <ListItemText primary={item.text} />
        {item.path === location.pathname && (
          <Box
            sx={{
              width: 4,
              height: 28,
              borderRadius: 4,
              bgcolor: theme.palette.primary.main,
              ml: 1,
            }}
          />
        )}
      </ListItemButton>
    </ListItem>
  );

  const drawer = (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      bgcolor: theme.palette.background.paper,
    }}>
      <Box sx={{ 
        py: 2, 
        px: 3, 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'space-between',
        bgcolor: alpha(theme.palette.primary.main, 0.1),
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Avatar 
            sx={{ 
              bgcolor: theme.palette.primary.main,
              color: '#fff',
              width: 40,
              height: 40,
              mr: 2,
              transition: 'transform 0.3s ease',
              '&:hover': {
                transform: 'scale(1.05)',
              }
            }}
          >
            <FaceIcon />
          </Avatar>
          <Box>
            <Typography variant="subtitle1" fontWeight="bold" noWrap>
              Face Attendance
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Employee Management
            </Typography>
          </Box>
        </Box>
        {isSmallScreen && (
          <IconButton onClick={handleDrawerToggle} sx={{ ml: 1 }}>
            <ChevronLeftIcon />
          </IconButton>
        )}
      </Box>

      <Divider />
      
      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 1, py: 1.5 }}>
        <List>
          {menuItems.map((item) => (
            <NavItem 
              key={item.text} 
              item={item} 
              selected={location.pathname === item.path} 
            />
          ))}
          
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton 
              onClick={handleAdminToggle}
              sx={{
                borderRadius: 2,
                py: 1.2,
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <SettingsIcon />
              </ListItemIcon>
              <ListItemText primary="Admin Settings" />
              {adminOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </ListItemButton>
          </ListItem>
          
          <Collapse in={adminOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding sx={{ pl: 2 }}>
              {adminItems.map((item) => (
                <NavItem 
                  key={item.text} 
                  item={item} 
                  selected={location.pathname === item.path} 
                />
              ))}
            </List>
          </Collapse>
        </List>
      </Box>
      
      <Divider />
      
      <Paper 
        elevation={0} 
        sx={{ 
          p: 2, 
          m: 1.5, 
          mb: 2, 
          borderRadius: 2, 
          bgcolor: alpha(theme.palette.background.default, 0.7),
          border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
        }}
      >
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          mb: 1.5,
        }}>
          <Chip
            size="small"
            icon={isConnected ? <WifiIcon fontSize="small" /> : <WifiOffIcon fontSize="small" />}
            label={isConnected ? 'Connected' : 'Disconnected'}
            color={isConnected ? 'success' : 'error'}
            variant="outlined"
            sx={{ fontSize: '0.75rem' }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          Current Time: {currentTime}
        </Typography>
      </Paper>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          bgcolor: '#fff',
          color: 'text.primary',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          zIndex: theme.zIndex.drawer + 1,
          transition: 'width 0.2s ease',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography 
            variant="h6" 
            noWrap 
            component="div" 
            sx={{ 
              flexGrow: 1, 
              fontWeight: 600,
              fontSize: { xs: '1.1rem', sm: '1.25rem' }
            }}
          >
            {pageTitle}
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Tooltip title="Notifications">
              <IconButton color="inherit" sx={{ mr: 1 }}>
                <Badge badgeContent={0} color="error">
                  <NotificationsIcon />
                </Badge>
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Account">
              <IconButton 
                color="inherit"
                sx={{
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.2),
                  }
                }}
              >
                <AccountCircleIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
        {isLoading && <LinearProgress sx={{ height: 2 }} />}
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderRadius: 0,
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderRight: `1px solid ${theme.palette.divider}`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.035)',
              transition: 'box-shadow 0.3s ease',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          backgroundColor: alpha(theme.palette.background.default, 0.4),
          transition: 'all 0.3s',
        }}
      >
        <Toolbar />
        <Container 
          maxWidth="xl" 
          sx={{ 
            pt: { xs: 2, sm: 3 }, 
            pb: { xs: 4, sm: 5 },
            px: { xs: 2, sm: 3, md: 4 },
          }}
        >
          {children}
        </Container>
      </Box>
    </Box>
  );
} 