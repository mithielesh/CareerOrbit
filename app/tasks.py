from celery import shared_task
from app.extensions import db
from app.models.user import User
from app.models.company import CompanyProfile
from app.models.drive import PlacementDrive
from app.models.application import Application
from datetime import datetime, timedelta
import csv
import os

# ====================================================================
# REQUIREMENT 5.c: USER-TRIGGERED ASYNC JOB (CSV EXPORT)
# ====================================================================
@shared_task(ignore_result=False)
def export_student_applications_csv(student_id):
    """
    Generates a CSV report of the student's placement applications
    and pushes a UI Notification with the download link.
    """
    student = db.session.get(User, student_id)
    if not student: 
        return "Student not found"
    
    applications = Application.query.filter_by(student_id=student_id).all()
    
    # Safe absolute path for Celery (Bypasses Flask current_app context)
    base_dir = os.path.abspath(os.path.dirname(__file__))
    export_dir = os.path.join(base_dir, 'static', 'exports')
    os.makedirs(export_dir, exist_ok=True) 
    
    filename = f"student_{student_id}_applications_{datetime.now().strftime('%Y%m%d%H%M%S')}.csv"
    filepath = os.path.join(export_dir, filename)
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Student ID', 'Company Name', 'Drive Title', 'Application Status', 'Application Date'])
        
        for app in applications:
            drive = db.session.get(PlacementDrive, app.drive_id)
            company = db.session.get(CompanyProfile, drive.company_id) if drive else None
            
            writer.writerow([
                student.id,
                company.company_name if company else "Unknown",
                drive.job_title if drive else "Unknown",
                app.status,
                app.application_date.strftime('%Y-%m-%d %H:%M:%S')
            ])
            
    print(f"EXPORT COMPLETE: Saved to {filepath}")
    
    # Push In-App Notification using your custom JSON helper
    student.add_notification(
        message="Your requested Application History CSV is ready to download.",
        action_link=f"/static/exports/{filename}"
    )
    db.session.commit()
    
    return f"/static/exports/{filename}"

# ====================================================================
# REQUIREMENT 5.a: SCHEDULED JOB (DAILY REMINDERS)
# ====================================================================
@shared_task
def send_daily_reminders():
    """
    Finds drives closing tomorrow and pushes a UI notification to 
    students who have not yet applied.
    """
    tomorrow = (datetime.now() + timedelta(days=1)).date()
    closing_drives = PlacementDrive.query.filter_by(application_deadline=tomorrow, status='Approved').all()

    if not closing_drives:
        return "No drives closing tomorrow."

    students = User.query.filter_by(role='student').all()
    reminders_sent = 0

    for student in students:
        pending_count = 0
        
        for drive in closing_drives:
            has_applied = Application.query.filter_by(student_id=student.id, drive_id=drive.id).first()
            if not has_applied:
                pending_count += 1
                
        # Group reminders so we don't spam the student
        if pending_count > 0:
            word = "drive closes" if pending_count == 1 else "drives close"
            
            student.add_notification(
                message=f"URGENT: {pending_count} placement {word} tomorrow! Check your dashboard and apply before it's too late."
            )
            reminders_sent += 1

    db.session.commit()
    print(f"Daily reminders pushed to {reminders_sent} student dashboards.")
    return f"Daily reminders sent to {reminders_sent} students."

# ====================================================================
# REQUIREMENT 5.b: SCHEDULED JOB (MONTHLY ACTIVITY REPORT)
# ====================================================================
@shared_task
def generate_monthly_report():
    """
    Generates HTML Reports and pushes UI Notifications for Admin, Companies, and Students.
    """
    base_dir = os.path.abspath(os.path.dirname(__file__))
    export_dir = os.path.join(base_dir, 'static', 'exports')
    os.makedirs(export_dir, exist_ok=True)
    
    # ---------------------------------------------------------
    # 1. ADMIN GLOBAL REPORT
    # ---------------------------------------------------------
    admin = User.query.filter_by(role='admin').first()
    total_drives = PlacementDrive.query.count()
    total_apps = Application.query.count()
    total_selected = Application.query.filter_by(status='Selected').count()

    admin_html = f"""
    <!DOCTYPE html><html><head><title>Admin Monthly Report</title>
    <style>body {{ font-family: Arial; padding: 40px; background: #f4f7f6; }} .box {{ background: white; padding: 30px; border-radius: 8px; border-top: 5px solid #dc3545; }}</style></head>
    <body><div class="box"><h2 style="color: #dc3545;">Global Placement Report</h2>
    <p><strong>Total Drives Conducted:</strong> {total_drives}</p>
    <p><strong>Total Applications Processed:</strong> {total_apps}</p>
    <p><strong>Total Students Selected:</strong> {total_selected}</p>
    </div></body></html>
    """
    admin_file = f"admin_report_{datetime.now().strftime('%b%Y')}.html"
    with open(os.path.join(export_dir, admin_file), 'w', encoding='utf-8') as f: f.write(admin_html)
    
    if admin:
        admin.add_notification(
            message="Your automated Monthly Global Placement Report is ready.", 
            action_link=f"/static/exports/{admin_file}"
        )

    # ---------------------------------------------------------
    # 2. COMPANY ENGAGEMENT REPORTS
    # ---------------------------------------------------------
    companies = CompanyProfile.query.all()
    for comp in companies:
        comp_user = db.session.get(User, comp.user_id)
        drives = PlacementDrive.query.filter_by(company_id=comp.id).all()
        drive_ids = [d.id for d in drives]
        comp_apps = Application.query.filter(Application.drive_id.in_(drive_ids)).count() if drive_ids else 0
        comp_selected = Application.query.filter(Application.drive_id.in_(drive_ids), Application.status=='Selected').count() if drive_ids else 0
        
        comp_html = f"""
        <!DOCTYPE html><html><head><title>Company Report</title>
        <style>body {{ font-family: Arial; padding: 40px; background: #f4f7f6; }} .box {{ background: white; padding: 30px; border-radius: 8px; border-top: 5px solid #0d6efd; }}</style></head>
        <body><div class="box"><h2 style="color: #0d6efd;">{comp.company_name} - Monthly Engagement</h2>
        <p><strong>Drives Hosted:</strong> {len(drives)}</p>
        <p><strong>Total Applicants:</strong> {comp_apps}</p>
        <p><strong>Candidates Selected:</strong> {comp_selected}</p>
        </div></body></html>
        """
        comp_file = f"company_{comp.id}_report_{datetime.now().strftime('%b%Y')}.html"
        with open(os.path.join(export_dir, comp_file), 'w', encoding='utf-8') as f: f.write(comp_html)
        
        if comp_user:
            comp_user.add_notification(
                message=f"Your Monthly Engagement Report for {comp.company_name} has been generated.",
                action_link=f"/static/exports/{comp_file}"
            )

    # ---------------------------------------------------------
    # 3. STUDENT PERFORMANCE REPORTS
    # ---------------------------------------------------------
    students = User.query.filter_by(role='student').all()
    for student in students:
        apps = Application.query.filter_by(student_id=student.id).all()
        selected_count = sum(1 for a in apps if a.status == 'Selected')
        
        student_html = f"""
        <!DOCTYPE html><html><head><title>Student Report</title>
        <style>body {{ font-family: Arial; padding: 40px; background: #f4f7f6; }} .box {{ background: white; padding: 30px; border-radius: 8px; border-top: 5px solid #198754; }}</style></head>
        <body><div class="box"><h2 style="color: #198754;">{student.name} - Placement Summary</h2>
        <p><strong>Total Applications Sent:</strong> {len(apps)}</p>
        <p><strong>Total Offers (Selected):</strong> {selected_count}</p>
        </div></body></html>
        """
        student_file = f"student_{student.id}_report_{datetime.now().strftime('%b%Y')}.html"
        with open(os.path.join(export_dir, student_file), 'w', encoding='utf-8') as f: f.write(student_html)
        
        student.add_notification(
            message="Your personalized Monthly Placement Summary is ready to view!",
            action_link=f"/static/exports/{student_file}"
        )

    db.session.commit()
    print("UI Notifications and Reports pushed for Admin, Companies, and Students.")
    return "Monthly reports created and notifications sent successfully."