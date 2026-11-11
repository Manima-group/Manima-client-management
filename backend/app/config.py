import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./manima.db")
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret-in-production")
TOKEN_HOURS = int(os.getenv("TOKEN_HOURS", "72"))
ADMIN_NAME = os.getenv("ADMIN_NAME", "Sai Naveen")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "business@manima.co.in")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "manima@123")
SEED_DEMO_DATA = os.getenv("SEED_DEMO_DATA", "true").lower() == "true"
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
