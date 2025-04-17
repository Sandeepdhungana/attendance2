import requests
from datetime import datetime
import pytz

# Back4App Parse API configuration
APPLICATION_ID = "VXlRAyM9B1ejoZuMmMthHVZgaWs0WJf4s9AIN0Be"
REST_API_KEY = "6dALgL7Y4M8qwqAZewdQZBGRKP2DdD9TgXL64qTa"
BASE_URL = "https://parseapi.back4app.com/classes"

# Headers for all requests
HEADERS = {
    "X-Parse-Application-Id": APPLICATION_ID,
    "X-Parse-REST-API-Key": REST_API_KEY,
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
        self.base_url = f"{BASE_URL}/{class_name}"

    def create(self, data):
        response = requests.post(self.base_url, headers=HEADERS, json=data)
        return response.json()

    def get(self, object_id):
        try:
            response = requests.get(f"{self.base_url}/{object_id}", headers=HEADERS)
            if response.status_code == 404:
                return None
            response.raise_for_status()  # Raise exception for other HTTP errors
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error getting {self.class_name} with objectId {object_id}: {str(e)}")
            return None

    def update(self, object_id, data):
        response = requests.put(f"{self.base_url}/{object_id}", headers=HEADERS, json=data)
        return response.json()

    def delete(self, object_id):
        try:
            response = requests.delete(f"{self.base_url}/{object_id}", headers=HEADERS)
            if response.status_code == 404:
                print(f"Object {self.class_name} with ID {object_id} not found for deletion.")
                return {"error": "Object not found"}
            response.raise_for_status()  # Raise exception for other HTTP errors
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error deleting {self.class_name} with objectId {object_id}: {str(e)}")
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
    def __init__(self):
        super().__init__("Attendance")
        self.timestamp = get_local_time()
        self.is_late = False
        self.is_early_exit = False

class OfficeTiming(BaseModel):
    def __init__(self):
        super().__init__("OfficeTiming")
        self.created_at = get_local_time()
        self.updated_at = get_local_time()

class EarlyExitReason(BaseModel):
    def __init__(self):
        super().__init__("EarlyExitReason")
        self.timestamp = get_local_time()

class TimezoneConfig(BaseModel):
    def __init__(self):
        super().__init__("TimezoneConfig")
        self.timezone_name = 'Asia/Kolkata'
        self.timezone_offset = '+05:30'
        self.created_at = get_local_time()
        self.updated_at = get_local_time()

class Shift(BaseModel):
    def __init__(self):
        super().__init__("Shift")
        self.created_at = get_local_time()
        self.updated_at = get_local_time() 