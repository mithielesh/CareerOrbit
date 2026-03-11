import os
from celery.schedules import crontab

class Config:
    SECRET_KEY = 'dev-key-123'
    SQLALCHEMY_DATABASE_URI = 'sqlite:///career_orbit.sqlite3'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # --- REDIS & CACHING CONFIG ---
    CACHE_TYPE = 'RedisCache'
    CACHE_REDIS_HOST = 'localhost'
    CACHE_REDIS_PORT = 6379
    
    # --- CELERY CONFIG ---
    CELERY_BROKER_URL = 'redis://localhost:6379/0'
    CELERY_RESULT_BACKEND = 'redis://localhost:6379/0'
    
    @property
    def CELERY(self):
        return {
            "broker_url": self.CELERY_BROKER_URL,
            "result_backend": self.CELERY_RESULT_BACKEND,
            "timezone": "Asia/Kolkata",
            "beat_schedule": {
                # Task 1: Daily Reminders at 6:00 PM
                "daily-reminder-task": {
                    "task": "app.tasks.send_daily_reminders",
                    "schedule": crontab(hour=18, minute=0), 
                },
                # Task 2: Monthly Activity Report on the 1st of every month
                "monthly-report-task": {
                    "task": "app.tasks.generate_monthly_report",
                    "schedule": crontab(day_of_month=1, hour=0, minute=0),
                },
            },
        }