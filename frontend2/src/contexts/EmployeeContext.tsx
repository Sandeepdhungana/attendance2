import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import api from '../api/config';

// Employee interface
export interface Employee {
  employee_id: string;
  name: string;
  email: string;
  is_admin: boolean;
  is_active: boolean;
  objectId: string;
  department?: string;
  position?: string;
  shift?: any;
}

// State interface
interface EmployeeState {
  employees: Employee[];
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;
}

// Action types
type EmployeeAction = 
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: Employee[] }
  | { type: 'FETCH_ERROR'; payload: string }
  | { type: 'ADD_EMPLOYEE'; payload: Employee }
  | { type: 'UPDATE_EMPLOYEE'; payload: Employee }
  | { type: 'DELETE_EMPLOYEE'; payload: string }
  | { type: 'CLEAR_ERROR' };

// Context interface
interface EmployeeContextType {
  state: EmployeeState;
  fetchEmployees: () => Promise<void>;
  addEmployee: (employee: Employee) => void;
  updateEmployee: (employee: Employee) => void;
  deleteEmployee: (employeeId: string) => void;
  clearError: () => void;
  getActiveEmployees: () => Employee[];
  getEmployeeById: (id: string) => Employee | undefined;
}

// Initial state
const initialState: EmployeeState = {
  employees: [],
  isLoading: false,
  error: null,
  lastFetched: null,
};

// Reducer
const employeeReducer = (state: EmployeeState, action: EmployeeAction): EmployeeState => {
  switch (action.type) {
    case 'FETCH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    
    case 'FETCH_SUCCESS':
      return {
        ...state,
        employees: action.payload,
        isLoading: false,
        error: null,
        lastFetched: Date.now(),
      };
    
    case 'FETCH_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };
    
    case 'ADD_EMPLOYEE':
      return {
        ...state,
        employees: [...state.employees, action.payload],
      };
    
    case 'UPDATE_EMPLOYEE':
      return {
        ...state,
        employees: state.employees.map(emp => 
          emp.employee_id === action.payload.employee_id ? action.payload : emp
        ),
      };
    
    case 'DELETE_EMPLOYEE':
      return {
        ...state,
        employees: state.employees.filter(emp => emp.employee_id !== action.payload),
      };
    
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    
    default:
      return state;
  }
};

// Context
const EmployeeContext = createContext<EmployeeContextType | undefined>(undefined);

// Provider component
interface EmployeeProviderProps {
  children: ReactNode;
}

export const EmployeeProvider: React.FC<EmployeeProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(employeeReducer, initialState);

  // Cache duration: 10 minutes
  const CACHE_DURATION = 10 * 60 * 1000;

  // Check if cache is still valid
  const isCacheValid = (): boolean => {
    if (!state.lastFetched) return false;
    return Date.now() - state.lastFetched < CACHE_DURATION;
  };

  // Fetch employees from API
  const fetchEmployees = async (force: boolean = false): Promise<void> => {
    // Skip if cache is valid and not forced
    if (!force && isCacheValid() && state.employees.length > 0) {
      console.log('Using cached employee data');
      return;
    }

    dispatch({ type: 'FETCH_START' });

    try {
      console.log('Fetching fresh employee data from API');
      const response = await api.get('/employees');
      
      const employeeData: Employee[] = response.data.map((emp: any) => ({
        employee_id: emp.employee_id,
        name: emp.name || `Employee ${emp.employee_id}`,
        email: emp.email,
        is_admin: emp.is_admin || false,
        is_active: emp.is_active !== false,
        objectId: emp.objectId,
        department: emp.department,
        position: emp.position,
        shift: emp.shift,
      }));

      dispatch({ type: 'FETCH_SUCCESS', payload: employeeData });
    } catch (error: any) {
      console.error('Error fetching employees:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to fetch employees';
      dispatch({ type: 'FETCH_ERROR', payload: errorMessage });
    }
  };

  // Add employee to cache
  const addEmployee = (employee: Employee): void => {
    dispatch({ type: 'ADD_EMPLOYEE', payload: employee });
  };

  // Update employee in cache
  const updateEmployee = (employee: Employee): void => {
    dispatch({ type: 'UPDATE_EMPLOYEE', payload: employee });
  };

  // Delete employee from cache
  const deleteEmployee = (employeeId: string): void => {
    dispatch({ type: 'DELETE_EMPLOYEE', payload: employeeId });
  };

  // Clear error
  const clearError = (): void => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  // Get active employees only
  const getActiveEmployees = (): Employee[] => {
    return state.employees.filter(emp => emp.is_active !== false);
  };

  // Get employee by ID
  const getEmployeeById = (id: string): Employee | undefined => {
    return state.employees.find(emp => emp.employee_id === id);
  };

  // Auto-fetch employees when provider mounts
  useEffect(() => {
    fetchEmployees();
  }, []);

  // Auto-refresh employees every 10 minutes if app is active
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchEmployees();
      }
    }, CACHE_DURATION);

    return () => clearInterval(interval);
  }, []);

  const contextValue: EmployeeContextType = {
    state,
    fetchEmployees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    clearError,
    getActiveEmployees,
    getEmployeeById,
  };

  return (
    <EmployeeContext.Provider value={contextValue}>
      {children}
    </EmployeeContext.Provider>
  );
};

// Custom hook to use employee context
export const useEmployees = (): EmployeeContextType => {
  const context = useContext(EmployeeContext);
  if (context === undefined) {
    throw new Error('useEmployees must be used within an EmployeeProvider');
  }
  return context;
};

export default EmployeeContext; 