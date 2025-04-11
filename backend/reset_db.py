from models import Base
from database import engine, get_db
from sqlalchemy.orm import Session
from sqlalchemy import text

def reset_db():
    # Drop all tables
    Base.metadata.drop_all(bind=engine)
    print("All tables dropped successfully!")

    # Create all tables
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully!")

    # Create a session to verify tables
    db = next(get_db())
    try:
        # Verify tables exist
        tables = db.execute(text("SELECT name FROM sqlite_master WHERE type='table';")).fetchall()
        print("Existing tables:")
        for table in tables:
            print(f"- {table[0]}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_db() 