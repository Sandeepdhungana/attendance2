from app.database import query, create
from app.models import User, Attendance, OfficeTiming, EarlyExitReason, TimezoneConfig
from app.utils.time_utils import get_local_time

def init_db():
    """Initialize Back4App database with default data"""
    print("Initializing Back4App database...")

    # Check and create default office timings if not exists
    office_timings = query("OfficeTiming", limit=1)
    if not office_timings:
        create("OfficeTiming", {
            "login_time": "09:00",
            "logout_time": "18:00",
            "created_at": get_local_time().isoformat(),
            "updated_at": get_local_time().isoformat()
        })
        print("Created default office timings")

    # Check and create default timezone config if not exists
    timezone_config = query("TimezoneConfig", limit=1)
    if not timezone_config:
        create("TimezoneConfig", {
            "timezone_name": "Asia/Kolkata",
            "timezone_offset": "+05:30",
            "created_at": get_local_time().isoformat(),
            "updated_at": get_local_time().isoformat()
        })
        print("Created default timezone configuration")

    # Verify all classes exist
    classes = ["User", "Attendance", "OfficeTiming", "EarlyExitReason", "TimezoneConfig"]
    print("\nAvailable classes in Back4App:")
    for class_name in classes:
        try:
            # Try to query each class to verify it exists
            query(class_name, limit=1)
            print(f"- {class_name}")
        except Exception as e:
            print(f"Error accessing {class_name}: {str(e)}")

    print("\nDatabase initialization completed!")

if __name__ == "__main__":
    init_db() 