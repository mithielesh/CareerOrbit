import os
import sys
import time

# GOD MODE FIX: Automatically add the current folder to Python's path.
# This completely eliminates the need for the PowerShell $env:PYTHONPATH hack!
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app import create_app
from app.tasks import send_daily_reminders, generate_monthly_report

app = create_app()

def trigger_notifications():
    with app.app_context():
        print("\n" + "="*60)
        print("CAREER ORBIT: MANUAL TASK DISPATCHER")
        print("="*60)
        
        try:
            # 1. Trigger the Monthly Report (Visual Analytics & HTML Reports)
            print("\n[1/2] Dispatching Global Monthly Analytics...")
            report_job = generate_monthly_report.delay()
            print(f"Queued! Task ID: {report_job.id}")
            
            time.sleep(1.5) # Dramatic pause
            
            # 2. Trigger the Daily Reminders (ATS Deadline Nudges)
            print("\n[2/2] Dispatching Daily Student Reminders...")
            reminder_job = send_daily_reminders.delay()
            print(f"Queued! Task ID: {reminder_job.id}")

            print("\n" + "="*60)
            print("ALL SYSTEMS OPERATIONAL")
            print("-" * 60)
            print("1. Check CELERY WORKER terminal for real-time logs.")
            print("2. Log in as ADMIN to view Global Placement Reports.")
            print("3. Log in as STUDENT to check the 'Alerts' bell.")
            print("="*60 + "\n")
            
        except Exception as e:
            # X-RAY VISION: Show the actual error trace instead of hiding it
            print(f"\nCRITICAL ERROR: Task dispatch failed.")
            print(f"Reason: {str(e)}")
            print("-" * 60)
            import traceback
            traceback.print_exc()
            sys.exit(1)

if __name__ == '__main__':
    trigger_notifications()