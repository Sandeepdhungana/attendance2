# Memory Optimization and Leak Prevention

This document outlines the comprehensive memory optimizations implemented in the Face Attendance system to prevent memory leaks and ensure optimal memory usage.

## Overview

The system has been optimized to prevent memory leaks and manage resources efficiently through several key improvements:

1. **Queue Management Optimization**
2. **Connection Lifecycle Management**
3. **Resource Cleanup and Monitoring**
4. **Cache Size Limits and LRU Eviction**
5. **Background Task Lifecycle Management**
6. **Automatic Garbage Collection**
7. **Memory Monitoring and Alerting**

## Key Optimizations

### 1. Queue Size Limits and Cleanup

**Before:** Unlimited queue sizes could cause memory accumulation
**After:** 
- Maximum queue size of 50 items
- Automatic queue draining on shutdown
- Queue size monitoring and warnings

```python
# Memory optimization constants
MAX_QUEUE_SIZE = 50  # Reduced from 100
MAX_FUTURES_PER_CLIENT = 3  # Limit concurrent futures per client
```

### 2. WebSocket Connection Health Tracking

**Before:** No connection health monitoring
**After:**
- Connection health tracking with ping/pong
- Automatic removal of unhealthy connections
- Failed ping counting and cleanup

```python
# Connection health tracking
_connection_health: Dict[str, Dict] = {}
MAX_FAILED_PINGS = 3  # Max failed pings before cleanup
```

### 3. Periodic Resource Cleanup

**Before:** Resources accumulated without cleanup
**After:**
- Automatic cleanup every 60 seconds
- Memory monitoring every 30 seconds
- Expired futures cleanup
- Disconnected client cleanup

```python
async def _cleanup_resources():
    """Perform periodic cleanup of resources to prevent memory leaks"""
    # Cleanup expired futures
    # Cleanup inactive connections
    # Cleanup client tasks
    # Force garbage collection
```

### 4. Employee Cache Optimization

**Before:** Unlimited cache size and no LRU eviction
**After:**
- Maximum cache size of 500 employees
- LRU eviction when cache is full
- Access frequency tracking
- Automatic TTL cleanup (30 minutes)

```python
class EmployeeCache:
    _max_cache_size = 500  # Limit cache size
    _cache_ttl = 1800  # 30 minutes (reduced from 1 hour)
    _access_count = {}  # Track access frequency for LRU eviction
```

### 5. Process and Thread Pool Management

**Before:** Unlimited workers and no proper shutdown
**After:**
- Limited thread workers (max 8)
- Proper pool shutdown with timeout
- Pool recreation on errors
- Resource cleanup on exit

```python
THREAD_WORKERS = min(CPU_COUNT * 2, 8)  # Limit max threads
MAX_PENDING_FUTURES = 100  # Limit pending futures
```

### 6. Background Task Lifecycle

**Before:** Infinite loops without exit conditions
**After:**
- Shutdown event handling
- Graceful task cancellation
- Timeout-based cleanup
- Signal handlers for shutdown

```python
async def process_queue():
    while not _shutdown_event.is_set():
        # Process with cleanup and exit conditions
        await _cleanup_resources()
        await _monitor_memory()
```

### 7. Memory Monitoring

**Before:** No memory monitoring
**After:**
- Real-time memory usage tracking
- Automatic cleanup on high memory usage
- Memory statistics endpoint
- Alert logging on memory thresholds

```python
async def _monitor_memory():
    if memory_mb > 500:  # 500MB threshold
        logger.warning(f"High memory usage: {memory_mb:.1f} MB")
        await _cleanup_resources()
        gc.collect()
```

## Memory Monitoring Endpoints

### GET `/memory-stats`
Returns comprehensive memory and resource statistics:

```json
{
  "memory": {
    "rss_mb": 245.3,
    "vms_mb": 512.1,
    "percent": 2.4
  },
  "connections": {
    "active_count": 5,
    "pending_futures": 2,
    "client_tasks": 3
  },
  "queues": {
    "processing_results_size": 0,
    "websocket_responses_size": 1
  },
  "cache": {
    "size": 125,
    "max_size": 500,
    "ttl_seconds": 1800
  }
}
```

### POST `/cleanup-resources`
Manually triggers resource cleanup for maintenance:

```json
{
  "status": "success",
  "message": "Cleanup completed, garbage collector freed 42 objects"
}
```

## Configuration Constants

All memory optimization parameters are configurable:

```python
# WebSocket optimizations
MAX_QUEUE_SIZE = 50
MAX_FUTURES_PER_CLIENT = 3
CLEANUP_INTERVAL = 60  # seconds
MEMORY_CHECK_INTERVAL = 30  # seconds
PING_INTERVAL = 30  # seconds
MAX_FAILED_PINGS = 3

# Cache optimizations
MAX_EMPLOYEE_CACHE_SIZE = 500
EMPLOYEE_CACHE_TTL = 1800  # 30 minutes
CACHE_CLEANUP_INTERVAL = 600  # 10 minutes

# Resource limits
MAX_PENDING_FUTURES = 100
MAX_CLIENT_TASKS = 1000
THREAD_WORKERS = min(CPU_COUNT * 2, 8)
```

## Shutdown Procedures

### Graceful Shutdown Sequence

1. **Signal Handling**: SIGINT/SIGTERM triggers graceful shutdown
2. **Background Tasks**: Cancel all background tasks with timeout
3. **WebSocket Cleanup**: Close all connections and cleanup resources
4. **Pool Shutdown**: Shutdown thread and process pools
5. **Cache Clearing**: Clear all caches and data structures
6. **Garbage Collection**: Force final garbage collection

```python
async def shutdown_all():
    await shutdown_websocket_tasks()
    await shutdown_thread_pool()
    await cleanup_all_resources()
```

## Memory Leak Prevention Checklist

✅ **Queue Size Limits**: Queues have maximum size limits
✅ **Connection Cleanup**: Automatic cleanup of disconnected clients  
✅ **Future Management**: Expired futures are automatically cleaned
✅ **Cache Limits**: Caches have size limits and LRU eviction
✅ **Resource Monitoring**: Memory usage is continuously monitored
✅ **Garbage Collection**: Automatic and manual garbage collection
✅ **Background Task Management**: Proper lifecycle for all background tasks
✅ **Signal Handling**: Graceful shutdown on system signals
✅ **Thread Pool Limits**: Limited number of worker threads
✅ **Error Handling**: Comprehensive error handling prevents resource leaks

## Best Practices for Development

1. **Always use context managers** for resource management
2. **Implement proper cleanup** in `finally` blocks
3. **Monitor memory usage** during development and testing
4. **Use the memory monitoring endpoints** to track resource usage
5. **Test shutdown procedures** to ensure proper cleanup
6. **Limit collection sizes** to prevent unbounded growth
7. **Use weak references** where appropriate to prevent circular references

## Monitoring and Alerting

### Memory Thresholds
- **Warning**: 500MB RSS memory usage
- **Critical**: Queue sizes approaching limits
- **Alert**: Too many pending futures or connections

### Log Messages to Monitor
- `"High memory usage detected"`
- `"Queue full, cannot process"`
- `"Too many pending futures"`
- `"Removing unhealthy connection"`

### Performance Metrics
- Memory usage over time
- Queue sizes and processing rates
- Connection count and health
- Cache hit rates and eviction frequency

## Testing Memory Optimizations

### Load Testing
```bash
# Test with multiple concurrent connections
# Monitor memory usage with /memory-stats endpoint
# Verify cleanup after disconnections
```

### Memory Profiling
```python
# Use memory profilers to verify optimizations
import psutil
import gc

# Monitor before and after optimizations
process = psutil.Process()
print(f"Memory: {process.memory_info().rss / 1024 / 1024:.1f} MB")
```

## Troubleshooting

### High Memory Usage
1. Check `/memory-stats` endpoint
2. Trigger manual cleanup via `/cleanup-resources`
3. Monitor log messages for memory warnings
4. Verify proper connection cleanup

### Connection Issues
1. Monitor connection health tracking
2. Check for unhealthy connection removal
3. Verify ping/pong functionality
4. Monitor client task cleanup

### Performance Issues
1. Check queue sizes and processing rates
2. Monitor cache statistics and hit rates
3. Verify background task performance
4. Check garbage collection frequency

## Summary

These optimizations ensure the Face Attendance system maintains optimal memory usage by:

- **Preventing resource accumulation** through size limits and cleanup
- **Monitoring memory usage** with real-time tracking and alerts
- **Managing connection lifecycle** with health tracking and cleanup
- **Optimizing caches** with LRU eviction and TTL
- **Ensuring graceful shutdown** with proper resource cleanup
- **Providing monitoring tools** for ongoing maintenance

The system is now memory-efficient and suitable for long-running production deployments without memory leaks. 