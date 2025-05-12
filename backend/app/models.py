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
            self._last_cache_clear = current_time

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

    def check_early_exit(self, employee_id, exit_time=None):
        """
        Determine if the attendance exit is early based on employee's shift

        Args:
            employee_id (str): ID of the employee
            exit_time (datetime, optional): Exit time to check. Defaults to current time.

        Returns:
            tuple: (is_early_exit, message)
        """
        from app.utils.time_utils import convert_to_local_time, get_local_date
        from app.database import query as db_query

        if exit_time is None:
            exit_time = get_local_time()

        today = get_local_date()
        self._clear_caches_if_needed()

        # Check employee cache first
        if employee_id not in self._employee_cache:
            # Query for employee data to get their shift
            employees = db_query("Employee", where={"employee_id": employee_id}, limit=1)
            if not employees:
                return False, None
            self._employee_cache[employee_id] = employees[0]

        employee = self._employee_cache[employee_id]
        shift_id = employee.get("shift")

        # If no shift assigned, use default office timings
        if not shift_id or not isinstance(shift_id, dict) or not shift_id.get("objectId"):
            # Check office timing cache
            if self._office_timing_cache is None:
                office_timings = db_query("OfficeTiming", limit=1)
                if not office_timings:
                    return False, None
                self._office_timing_cache = office_timings[0]

            logout_time_str = self._office_timing_cache.get("logout_time")
        else:
            # Get shift details from cache or query
            shift_object_id = shift_id.get("objectId")
            if shift_object_id not in self._shift_cache:
                shifts = db_query("Shift", where={"objectId": shift_object_id}, limit=1)
                if not shifts:
                    return False, None
                self._shift_cache[shift_object_id] = shifts[0]

            logout_time_str = self._shift_cache[shift_object_id].get("logout_time")

        if not logout_time_str:
            return False, None

        # Parse logout time
        logout_time_hours, logout_time_minutes = map(int, logout_time_str.split(":"))

        # Create datetime object for the logout time today
        logout_time = datetime.combine(today,
                                       datetime.min.time().replace(hour=logout_time_hours,
                                                                   minute=logout_time_minutes))
        logout_time = convert_to_local_time(logout_time)

        # Check if exit is early
        is_early_exit = exit_time < logout_time

        if is_early_exit:
            # Calculate how early in minutes
            early_seconds = (logout_time - exit_time).total_seconds()
            early_minutes = int(early_seconds / 60)

            # Generate message
            message = f"Early exit by {early_minutes} minutes. Shift end: {logout_time.strftime('%H:%M')}"

            return is_early_exit, message

        return False, None


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
