from sqlalchemy import create_engine
from models import Base
import os

# Get the database URL from environment variable or use default
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./attendance.db")

def recreate_database():
    # Create engine
    engine = create_engine(DATABASE_URL)
    
    # Drop all tables
    print("Dropping all tables...")
    Base.metadata.drop_all(engine)
    
    # Create all tables
    print("Creating new tables...")
    Base.metadata.create_all(engine)
    
    print("Database recreated successfully!")

if __name__ == "__main__":
    recreate_database() 