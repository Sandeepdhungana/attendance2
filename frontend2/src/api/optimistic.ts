import { useState } from 'react';
import api from './config';

// Type for pending operations
export type PendingOperation = {
  id: string;
  operationType: 'create' | 'update' | 'delete';
  endpoint: string;
  data: any;
  timestamp: number;
  retry: () => Promise<void>;
};

// Cache of pending operations
const pendingOperationsCache: Record<string, PendingOperation> = {};

// Generate a unique ID for operations
const generateOperationId = (): string => {
  return Date.now().toString() + Math.random().toString(36).substring(2);
};

/**
 * Makes an API call with optimistic updates
 * @param endpoint The API endpoint
 * @param method The HTTP method
 * @param data The data to send
 * @param optimisticData The optimistic data to update locally immediately
 * @param onSuccess Callback for successful API call
 * @param onError Callback for API errors
 * @param updateLocalState Function to update local state
 */
export const optimisticApiCall = async <T>({
  endpoint,
  method = 'POST',
  data,
  optimisticData,
  onSuccess,
  onError,
  updateLocalState,
}: {
  endpoint: string;
  method?: string;
  data: any;
  optimisticData: T;
  onSuccess?: (response: any) => void;
  onError?: (error: any) => void;
  updateLocalState: (data: T) => void;
}): Promise<void> => {
  // Generate a unique operation ID
  const operationId = generateOperationId();
  
  // Immediately update the local state with optimistic data
  updateLocalState(optimisticData);
  
  // Define retry function
  const retry = async () => {
    try {
      let response;
      
      // Format data based on content type
      const isFormData = data instanceof FormData;
      const headers = isFormData 
        ? { 'Content-Type': 'multipart/form-data' }
        : { 'Content-Type': 'application/json' };
      
      // Make the API call
      if (method === 'GET') {
        response = await api.get(endpoint);
      } else if (method === 'POST') {
        response = await api.post(endpoint, data, { headers });
      } else if (method === 'PUT') {
        response = await api.put(endpoint, data, { headers });
      } else if (method === 'DELETE') {
        response = await api.delete(endpoint);
      } else {
        throw new Error(`Unsupported method: ${method}`);
      }
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess(response.data);
      }
      
      // Remove from pending operations on success
      delete pendingOperationsCache[operationId];
    } catch (error) {
      // Call onError callback if provided
      if (onError) {
        onError(error);
      }
      
      // Keep in pending operations for later retry
      pendingOperationsCache[operationId] = {
        id: operationId,
        operationType: method === 'POST' ? 'create' : method === 'PUT' ? 'update' : method === 'DELETE' ? 'delete' : 'create',
        endpoint,
        data,
        timestamp: Date.now(),
        retry,
      };
      
      console.error('API error:', error);
    }
  };
  
  // Store the operation initially
  pendingOperationsCache[operationId] = {
    id: operationId,
    operationType: method === 'POST' ? 'create' : method === 'PUT' ? 'update' : method === 'DELETE' ? 'delete' : 'create',
    endpoint,
    data,
    timestamp: Date.now(),
    retry,
  };
  
  // Execute the API call
  await retry();
};

/**
 * Custom hook for optimistic API state management
 */
export function useOptimisticState<T>(initialState: T) {
  const [state, setState] = useState<T>(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optimisticUpdate = async ({
    endpoint,
    method = 'POST',
    data,
    optimisticUpdate,
  }: {
    endpoint: string;
    method?: string;
    data: any;
    optimisticUpdate: (currentState: T) => T;
  }) => {
    setError(null);
    
    // Calculate the optimistic state update
    const updatedState = optimisticUpdate(state);
    
    try {
      await optimisticApiCall({
        endpoint,
        method,
        data,
        optimisticData: updatedState,
        onSuccess: () => setIsLoading(false),
        onError: (error) => {
          setError(typeof error === 'string' ? error : 'An error occurred');
          setIsLoading(false);
        },
        updateLocalState: setState,
      });
    } catch (err) {
      setError('Failed to process request');
      setIsLoading(false);
    }
  };

  return {
    state,
    setState,
    isLoading,
    setIsLoading,
    error,
    setError,
    optimisticUpdate,
  };
}

// Function to retry all pending operations
export const retryPendingOperations = () => {
  Object.values(pendingOperationsCache).forEach(operation => {
    operation.retry();
  });
};

// Auto-retry operations on window focus
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    retryPendingOperations();
  });
} 