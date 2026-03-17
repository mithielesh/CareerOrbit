from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from app.models.drive import PlacementDrive
from app.models.application import Application
from app.models.company import CompanyProfile
from app.extensions import db
from app.tasks import export_student_applications_csv
import json
from app.extensions import cache 

user_bp = Blueprint('user', __name__, url_prefix='/api/student')

# --- Helper: Security Check ---
def is_student():
    return current_user.is_authenticated and current_user.role == 'student'

# ==========================================
# 1. VIEW JOB BOARD (Approved Drives Only)
# ==========================================
@user_bp.route('/drives', methods=['GET'])
@login_required
@cache.cached(timeout=60, key_prefix='all_approved_drives')
def get_approved_drives():
    if not is_student():
        return jsonify({"error": "Unauthorized"}), 403

    # Only show drives that the Admin has explicitly approved
    drives = PlacementDrive.query.filter_by(status='Approved').all()
    
    drives_data = []
    for d in drives:
        # Fetch company name for the UI
        company = CompanyProfile.query.get(d.company_id)
        drives_data.append({
            "id": d.id,
            "company_name": company.company_name if company else "Unknown",
            "job_title": d.job_title,
            "job_description": d.job_description,
            "eligibility_criteria": d.eligibility_criteria,
            "min_cgpa": d.min_cgpa,                       
            "required_skills": d.required_skills, 
            "salary": d.salary,        
            "start_date": d.start_date.strftime('%Y-%m-%d'),
            "application_deadline": d.application_deadline.strftime('%Y-%m-%d')
        })

    return jsonify({"drives": drives_data}), 200

# ==========================================
# 2. APPLY FOR A PLACEMENT DRIVE
# ==========================================
@user_bp.route('/drive/<int:drive_id>/apply', methods=['POST'])
@login_required
def apply_for_drive(drive_id):
    if not is_student():
        return jsonify({"error": "Unauthorized"}), 403

    # Check if drive exists and is actually approved
    drive = PlacementDrive.query.get_or_404(drive_id)
    if drive.status != 'Approved':
        return jsonify({"error": "You can only apply to approved placement drives."}), 400
    
    if current_user.cgpa is None or current_user.cgpa < drive.min_cgpa:
        return jsonify({"error": f"Blocked by ATS: A minimum CGPA of {drive.min_cgpa} is required for this role."}), 403

    # Prevent multiple applications (Core Requirement)
    existing_application = Application.query.filter_by(
        student_id=current_user.id, 
        drive_id=drive_id
    ).first()
    
    if existing_application:
        return jsonify({"error": "You have already applied for this drive."}), 400

    # Get optional resume link from the request
    data = request.get_json() or {}
    resume_link = data.get('resume_link', '')

    # Create the application
    new_application = Application(
        student_id=current_user.id,
        drive_id=drive_id,
        resume_link=resume_link,
        status='Applied' # Defaults to Applied
    )
    
    db.session.add(new_application)
    db.session.commit()
    
    return jsonify({"message": f"Successfully applied for {drive.job_title}!"}), 201

# ==========================================
# 3. VIEW APPLICATION HISTORY
# ==========================================
@user_bp.route('/applications', methods=['GET'])
@login_required
def get_application_history():
    if not is_student():
        return jsonify({"error": "Unauthorized"}), 403

    applications = Application.query.filter_by(student_id=current_user.id).all()
    
    history_data = []
    for app in applications:
        drive = PlacementDrive.query.get(app.drive_id)
        company = CompanyProfile.query.get(drive.company_id) if drive else None
        
        history_data.append({
            "application_id": app.id,
            "drive_id": app.drive_id,
            "company_name": company.company_name if company else "Unknown",
            "job_title": drive.job_title if drive else "Unknown",
            "applied_on": app.application_date.strftime('%Y-%m-%d %H:%M'),
            "status": app.status,
            "interview_link": app.interview_link, 
            "interview_date": app.interview_date  
        })

    return jsonify({"history": history_data}), 200

# ==========================================
# STUDENT PROFILE MANAGEMENT
# ==========================================
@user_bp.route('/profile', methods=['GET', 'PUT'])
@login_required
def manage_profile():
    if current_user.role != 'student':
        return jsonify({"error": "Unauthorized"}), 403
    
    if request.method == 'GET':
        # Parse the JSON string back into a Python list
        notifications_list = []
        if current_user.notifications:
            try:
                notifications_list = json.loads(current_user.notifications)
            except Exception:
                notifications_list = []

    if request.method == 'GET':
        return jsonify({
            "name": current_user.name,
            "email": current_user.email,
            "cgpa": current_user.cgpa or '',
            "skills": current_user.skills or '',
            "resume_link": current_user.resume_link or '',
            "notifications": notifications_list or ''
        }), 200

    if request.method == 'PUT':
        data = request.get_json()
        current_user.name = data.get('name', current_user.name)
        current_user.cgpa = data.get('cgpa')
        current_user.skills = data.get('skills')
        current_user.resume_link = data.get('resume_link')
        db.session.commit()
        return jsonify({"message": "Profile updated successfully!"}), 200
    

@user_bp.route('/export', methods=['POST'])
@login_required
def trigger_csv_export():
    if current_user.role != 'student':
        return jsonify({"error": "Unauthorized"}), 403
        
    # The .delay() command sends the job to Redis/Celery!
    export_student_applications_csv.delay(current_user.id)
    
    return jsonify({"message": "Export job queued successfully."}), 200

@user_bp.route('/notification/<int:notif_id>', methods=['DELETE'])
@login_required
def delete_notification(notif_id):
    if current_user.role != 'student':
        return jsonify({"error": "Unauthorized"}), 403

    if not current_user.notifications:
        return jsonify({"message": "No notifications to delete."}), 200

    try:
        # 1. Load the current list
        notifs = json.loads(current_user.notifications)
        
        # 2. Keep everything EXCEPT the one with the matching ID
        updated_notifs = [n for n in notifs if n.get('id') != notif_id]
        
        # 3. Save it back to the database
        current_user.notifications = json.dumps(updated_notifs)
        db.session.commit()
        
        return jsonify({"message": "Notification deleted successfully!"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500