import requests
from datetime import datetime, timedelta
import pytz
import logging

# Back4App Parse API configuration
from app.config import BACK4APP_APPLICATION_ID, BACK4APP_REST_API_KEY, BACK4APP_SERVER_URL
import logging
from datetime import datetime, time, timedelta
from app.utils.time_utils import convert_to_local_time, get_local_date, get_local_time
from app.database import query as db_query


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
# Headers for all requests
HEADERS = {
    "X-Parse-Application-Id": BACK4APP_APPLICATION_ID,
    "X-Parse-REST-API-Key": BACK4APP_REST_API_KEY,
    "Content-Type": "application/json"
}

# Get local timezone
try:
    local_tz = pytz.timezone('Asia/Kolkata')
except:
    from datetime import timezone, timedelta
    local_tz = timezone(timedelta(hours=5, minutes=30))


def get_local_time():
    """Get current time in local timezone"""
    return datetime.now(local_tz)


class BaseModel:
    def __init__(self, class_name):
        self.class_name = class_name
        self.base_url = f"{BACK4APP_SERVER_URL}/classes/{class_name}"

    def create(self, data):
        response = requests.post(self.base_url, headers=HEADERS, json=data)
        return response.json()

    def get(self, object_id):
        try:
            response = requests.get(
                f"{self.base_url}/{object_id}", headers=HEADERS)
            if response.status_code == 404:
                return None
            response.raise_for_status()  # Raise exception for other HTTP errors
            return response.json()
        except requests.exceptions.RequestException as e:
            print(
                f"Error getting {self.class_name} with objectId {object_id}: {str(e)}")
            return None

    def update(self, object_id, data):
        response = requests.put(
            f"{self.base_url}/{object_id}", headers=HEADERS, json=data)
        return response.json()

    def delete(self, object_id):
        try:
            response = requests.delete(
                f"{self.base_url}/{object_id}", headers=HEADERS)
            if response.status_code == 404:
                print(
                    f"Object {self.class_name} with ID {object_id} not found for deletion.")
                return {"error": "Object not found"}
            response.raise_for_status()  # Raise exception for other HTTP errors
            return response.json()
        except requests.exceptions.RequestException as e:
            print(
                f"Error deleting {self.class_name} with objectId {object_id}: {str(e)}")
            raise

    def query(self, where=None, order=None, limit=None):
        params = {}
        if where:
            params["where"] = where
        if order:
            params["order"] = order
        if limit:
            params["limit"] = limit

        response = requests.get(self.base_url, headers=HEADERS, params=params)
        data = response.json()
        return data.get("results", [])


class Employee(BaseModel):
    def __init__(self):
        super().__init__("Employee")
        self.created_at = get_local_time()


class Attendance(BaseModel):
    # Class-level cache for employee and shift information
    _employee_cache = {}
    _shift_cache = {}
    _office_timing_cache = None
    _daily_employee_cache = {}  # Cache for daily employee data
    _daily_cache_date = None    # Track which date the cache is for

    def __init__(self):
        super().__init__("Attendance")
        self.timestamp = get_local_time()
        self.is_late = False
        self.is_early_exit = False
        # Clear caches periodically (e.g., every hour)
        self._last_cache_clear = get_local_time()
        self._cache_ttl = 3600  # 1 hour in seconds

    def _clear_caches_if_needed(self):
        """Clear caches if they are too old"""
        current_time = get_local_time()
        if (current_time - self._last_cache_clear).total_seconds() > self._cache_ttl:
            self._employee_cache.clear()
            self._shift_cache.clear()
            self._office_timing_cache = None
            self._daily_employee_cache.clear()
            self._daily_cache_date = None
            self._last_cache_clear = current_time

    def _get_daily_employee_data(self, date=None):
        """Get or cache employee data for a specific date
        
        Args:
            date: The date to get employee data for. Defaults to today.
            
        Returns:
            dict: Dictionary mapping employee_id to employee data
        """
        if date is None:
            date = get_local_date()
            
        # Clear cache if it's for a different date
        if self._daily_cache_date != date:
            self._daily_employee_cache.clear()
            self._daily_cache_date = date
            
        # If cache is empty, fetch all employees
        if not self._daily_employee_cache:
            employees = db_query("Employee", limit=1000)  # Adjust limit as needed
            self._daily_employee_cache = {emp["employee_id"]: emp for emp in employees}
            
        return self._daily_employee_cache

    def check_late_arrival(
        self,
        employee_id: str,
        entry_time: None
    ):
        """
        Determine if the attendance entry is late based on the employee's shift.

        Args:
            employee_id (str): ID of the employee
            entry_time (datetime, optional): Entry time to check. Defaults to current local time.

        Returns:
            tuple: (is_late, message, minutes_late, time_components)
        """
        # 1. Determine the punch time (localized)
        if entry_time is None:
            entry_time = get_local_time()
        else:
            entry_time = convert_to_local_time(entry_time)

        today = get_local_date()

        # 2. Fetch the employee record to get their shift pointer
        employees = db_query("Employee", where={
                             "employee_id": employee_id}, limit=1)
        if not employees:
            return False, None, None, None
        emp = employees[0]

        # 3. Resolve shift ID (pointer vs. direct)
        shift_ptr = emp.get("shift")
        shift_id = (
            shift_ptr.get("objectId")
            if isinstance(shift_ptr, dict) and shift_ptr.get("objectId")
            else shift_ptr
        )
        shifts = db_query("Shift", where={"objectId": shift_id}, limit=1)
        if not shifts:
            return False, None, None, None
        shift = shifts[0]

        login_time_str = shift.get("login_time")
        grace_period = int(shift.get("grace_period", 0))
        if not login_time_str:
            return False, None, None, None

        # 4. Parse scheduled login hour/minute
        login_h, login_m = map(int, login_time_str.split(":"))

        # 5. Build a datetime for today's scheduled start and localize
        scheduled_start = datetime.combine(today, time(login_h, login_m))
        scheduled_start = convert_to_local_time(scheduled_start)

        # 6. Adjust for overnight shifts: if the scheduled start is more than 12h
        #    in the future relative to the punch, assume it was actually yesterday.
        if scheduled_start - entry_time > timedelta(hours=12):
            scheduled_start -= timedelta(days=1)

        # 7. Apply the grace period
        start_with_grace = scheduled_start + timedelta(minutes=grace_period)

        logging.debug(f"Adjusted scheduled start: {scheduled_start}")
        logging.debug(f"Start + grace period:     {start_with_grace}")
        logging.debug(f"Entry time (local):       {entry_time}")

        # 8. Determine lateness
        if entry_time > start_with_grace:
            # minutes late measured from the official shift start
            delta = entry_time - scheduled_start
            total_minutes = int(delta.total_seconds() // 60)
            time_components = {
                "hours": total_minutes // 60,
                "minutes": total_minutes % 60,
                "seconds": int(delta.total_seconds() % 60)
            }
            grace_text = f" (Grace period: {grace_period}m)" if grace_period else ""
            message = (
                f"Late by {total_minutes} minute{'s' if total_minutes != 1 else ''}. "
                f"Shift start: {scheduled_start.strftime('%H:%M')}{grace_text}"
            )
            return True, message, total_minutes, time_components

        return False, None, None, None

    def check_early_exit(self, employee_id: str, exit_time: datetime = None) -> tuple[bool, str]:
        """Check if an employee's exit is early based on their shift timing
        
        Args:
            employee_id: The employee's ID
            exit_time: Optional exit time to check. If not provided, will check if exit_time exists in attendance record
            
        Returns:
            tuple[bool, str]: (is_early_exit, message)
        """
        try:
            # Get employee data from daily cache
            employee_data = self._get_daily_employee_data()
            if employee_id not in employee_data:
                return False, "Employee not found"
            
            employee = employee_data[employee_id]
            shift_id = employee.get("shift")
            
            # Get today's date in local timezone
            today = get_local_date()
            
            # Get attendance record for today
            today_start = datetime.combine(today, datetime.min.time())
            today_start = convert_to_local_time(today_start)
            today_end = datetime.combine(today, datetime.max.time())
            today_end = convert_to_local_time(today_end)
            
            attendance = db_query("Attendance", 
                where={
                    "employee_id": employee_id,
                    "timestamp": {
                        "$gte": {"__type": "Date", "iso": today_start.isoformat()},
                        "$lte": {"__type": "Date", "iso": today_end.isoformat()}
                    }
                },
                limit=1
            )
            
            if not attendance:
                return False, "No attendance record found for today"
            
            attendance = attendance[0]
            
            # If no exit time is provided and no exit time in record, mark as early exit
            if not exit_time and not attendance.get("exit_time"):
                return True, "No exit time given"
            
            # Get entry and exit times
            entry_time = attendance.get("timestamp", {}).get("iso")
            if not entry_time:
                return False, "No entry time found"
            
            # Convert entry time to datetime
            entry_datetime = datetime.fromisoformat(entry_time.replace('Z', '+00:00'))
            entry_datetime = convert_to_local_time(entry_datetime)
            
            # Get exit time (either provided or from record)
            if exit_time:
                exit_datetime = convert_to_local_time(exit_time)
            else:
                exit_time = attendance.get("exit_time", {}).get("iso")
                if not exit_time:
                    return True, "No exit time given"
                exit_datetime = datetime.fromisoformat(exit_time.replace('Z', '+00:00'))
                exit_datetime = convert_to_local_time(exit_datetime)
            
            # Calculate actual time spent (x)
            time_spent = (exit_datetime - entry_datetime).total_seconds()
            
            # Get shift timing
            shift_start = None
            shift_end = None
            
            if shift_id and isinstance(shift_id, dict) and shift_id.get("objectId"):
                shift_object_id = shift_id.get("objectId")
                # Check shift cache first
                if shift_object_id not in self._shift_cache:
                    shift = db_query("Shift", where={"objectId": shift_object_id}, limit=1)
                    if shift:
                        self._shift_cache[shift_object_id] = shift[0]
                
                shift = self._shift_cache.get(shift_object_id)
                if shift and shift.get("login_time") and shift.get("logout_time"):
                    # Parse shift times
                    login_time_str = shift.get("login_time")
                    logout_time_str = shift.get("logout_time")
                    
                    # Convert to datetime objects for the attendance date
                    login_hours, login_minutes = map(int, login_time_str.split(":"))
                    logout_hours, logout_minutes = map(int, logout_time_str.split(":"))
                    
                    # Create datetime objects for the attendance date
                    shift_start = datetime.combine(entry_datetime.date(), 
                                                 datetime.min.time().replace(hour=login_hours, 
                                                                           minute=login_minutes))
                    shift_end = datetime.combine(entry_datetime.date(), 
                                               datetime.min.time().replace(hour=logout_hours, 
                                                                         minute=logout_minutes))
                    
                    # Make timezone-aware
                    shift_start = convert_to_local_time(shift_start)
                    shift_end = convert_to_local_time(shift_end)
            else:
                # Check office timing cache first
                if self._office_timing_cache is None:
                    office_timings = db_query("OfficeTiming", limit=1)
                    if office_timings:
                        self._office_timing_cache = office_timings[0]
                
                if self._office_timing_cache and self._office_timing_cache.get("login_time") and self._office_timing_cache.get("logout_time"):
                    # Parse office times
                    login_time_str = self._office_timing_cache.get("login_time")
                    logout_time_str = self._office_timing_cache.get("logout_time")
                    
                    # Convert to datetime objects for the attendance date
                    login_hours, login_minutes = map(int, login_time_str.split(":"))
                    logout_hours, logout_minutes = map(int, logout_time_str.split(":"))
                    
                    # Create datetime objects for the attendance date
                    shift_start = datetime.combine(entry_datetime.date(), 
                                                 datetime.min.time().replace(hour=login_hours, 
                                                                           minute=login_minutes))
                    shift_end = datetime.combine(entry_datetime.date(), 
                                               datetime.min.time().replace(hour=logout_hours, 
                                                                         minute=logout_minutes))
                    
                    # Make timezone-aware
                    shift_start = convert_to_local_time(shift_start)
                    shift_end = convert_to_local_time(shift_end)
            
            if not shift_start or not shift_end:
                return False, "No shift timing found"
            
            # Calculate expected shift duration (y)
            shift_duration = (shift_end - shift_start).total_seconds()
            
            # Check if early exit
            is_early_exit = time_spent < shift_duration
            
            if is_early_exit:
                # Calculate how early they left
                early_minutes = int((shift_duration - time_spent) / 60)
                return True, f"Left {early_minutes} minutes early"
            
            return False, "Not an early exit"
            
        except Exception as e:
            logger.error(f"Error checking early exit: {str(e)}")
            return False, f"Error checking early exit: {str(e)}"


class OfficeTiming(BaseModel):
    def __init__(self):
        super().__init__("OfficeTiming")


class EarlyExitReason(BaseModel):
    def __init__(self):
        super().__init__("EarlyExitReason")
        self.timestamp = get_local_time()


class TimezoneConfig(BaseModel):
    def __init__(self):
        super().__init__("TimezoneConfig")
        self.timezone_name = 'Asia/Kolkata'
        self.timezone_offset = '+05:30'


class Shift(BaseModel):
    def __init__(self):
        super().__init__("Shift")
