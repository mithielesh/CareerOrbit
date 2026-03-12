from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from app.models.company import CompanyProfile
from app.models.drive import PlacementDrive
from app.models.application import Application
from app.models.user import User
from app.extensions import db
from datetime import datetime
import json
from app.tasks import export_company_pipeline_csv

company_bp = Blueprint('company', __name__, url_prefix='/api/company')

# ==========================================
# 1. CREATE A PLACEMENT DRIVE
# ==========================================
@company_bp.route('/drives', methods=['POST'])
@login_required
def create_drive():
    if current_user.role != 'company':
        return jsonify({"error": "Unauthorized. Only companies can perform this action."}), 403
        
    company = CompanyProfile.query.filter_by(user_id=current_user.id).first()
    
    if company.approval_status != 'Approved':
        return jsonify({"error": "Your company profile must be approved by the Admin before posting."}), 403

    data = request.get_json()
    
    try:
        start_d = datetime.strptime(data.get('start_date'), '%Y-%m-%d').date()
        deadline = datetime.strptime(data.get('application_deadline'), '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

    new_drive = PlacementDrive(
        company_id=company.id,
        job_title=data.get('job_title'),
        job_description=data.get('job_description'),
        eligibility_criteria=data.get('eligibility_criteria'),
        min_cgpa=float(data.get('min_cgpa', 0.0)),         
        required_skills=data.get('required_skills', ''),  
        salary=float(data.get('salary', 0.0)), 
        start_date=start_d,
        application_deadline=deadline
    )
    
    db.session.add(new_drive)
    db.session.commit()
    return jsonify({"message": "Placement drive created successfully. Pending Admin approval."}), 201

# ==========================================
# 2. VIEW STUDENT APPLICATIONS FOR A DRIVE
# ==========================================
@company_bp.route('/drive/<int:drive_id>/applications', methods=['GET'])
@login_required
def get_drive_applications(drive_id):
    if current_user.role != 'company':
        return jsonify({"error": "Unauthorized"}), 403

    company = CompanyProfile.query.filter_by(user_id=current_user.id).first()
    drive = PlacementDrive.query.get_or_404(drive_id)

    # STRICT SECURITY: Prevent Company A from viewing Company B's applicants
    if drive.company_id != company.id:
        return jsonify({"error": "You do not have permission to view these applications."}), 403

    applications = Application.query.filter_by(drive_id=drive_id).all()

    apps_data = []
    for app in applications:
        student = User.query.get(app.student_id)
        apps_data.append({
            "application_id": app.id,
            "student_name": student.name if student else "Unknown",
            "student_email": student.email if student else "Unknown",
            "applied_on": app.application_date.strftime('%Y-%m-%d'),
            "status": app.status,
            "resume_link": app.resume_link
        })

    return jsonify({"applications": apps_data}), 200

# ==========================================
# 3. UPDATE APPLICATION STATUS (Snake Pipeline)
# ==========================================
@company_bp.route('/application/<int:application_id>/status', methods=['PUT'])
@login_required
def update_application_status(application_id):
    if current_user.role != 'company':
        return jsonify({"error": "Unauthorized"}), 403

    company = CompanyProfile.query.filter_by(user_id=current_user.id).first()
    application = Application.query.get_or_404(application_id)
    drive = PlacementDrive.query.get(application.drive_id)

    if not drive or drive.company_id != company.id:
        return jsonify({"error": "Unauthorized to modify this application."}), 403

    data = request.get_json()
    new_status = data.get('status')
    
    # Capture the interview details if provided
    interview_link = data.get('interview_link', '')
    interview_date = data.get('interview_date', '')

    valid_statuses = ['Applied', 'Shortlisted', 'Round 1', 'Round 2', 'Final Round', 'Accepted', 'Rejected']
    if new_status not in valid_statuses:
        return jsonify({"error": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"}), 400

    application.status = new_status
    
    # Only update the link/date if the company actually provided them (for active rounds)
    if new_status in ['Round 1', 'Round 2', 'Final Round']:
        application.interview_link = interview_link
        application.interview_date = interview_date
    elif new_status in ['Accepted', 'Rejected']:
        # Clear the meeting link if they are at the end of the pipeline
        application.interview_link = ''
        application.interview_date = ''

    db.session.commit()

    return jsonify({"message": f"Student moved to {new_status}"}), 200

# ==========================================
# 4. VIEW COMPANY'S OWN DRIVES
# ==========================================
@company_bp.route('/my-drives', methods=['GET'])
@login_required
def get_my_drives():
    if current_user.role != 'company':
        return jsonify({"error": "Unauthorized"}), 403

    company = CompanyProfile.query.filter_by(user_id=current_user.id).first()
    drives = PlacementDrive.query.filter_by(company_id=company.id).all()
    
    drives_data = [{"id": d.id, "title": d.job_title, "status": d.status, "deadline": d.application_deadline.strftime('%Y-%m-%d')} for d in drives]
    
    return jsonify({"drives": drives_data}), 200

# ==========================================
# 5. COMPANY ANALYTICS DASHBOARD
# ==========================================
@company_bp.route('/analytics', methods=['GET'])
@login_required
def get_analytics():
    if current_user.role != 'company':
        return jsonify({"error": "Unauthorized"}), 403

    company = CompanyProfile.query.filter_by(user_id=current_user.id).first()
    drives = PlacementDrive.query.filter_by(company_id=company.id).all()
    drive_ids = [d.id for d in drives]
    
    apps = Application.query.filter(Application.drive_id.in_(drive_ids)).all() if drive_ids else []
    
    stats = {
        "total_drives": len(drives),
        "total_applicants": len(apps),
        "shortlisted": sum(1 for a in apps if a.status == 'Shortlisted'),
        "selected": sum(1 for a in apps if a.status == 'Selected'),
        "rejected": sum(1 for a in apps if a.status == 'Rejected'),
        "pending": sum(1 for a in apps if a.status == 'Applied')
    }
    return jsonify(stats), 200

@company_bp.route('/drive/<int:drive_id>/export', methods=['POST'])
@login_required
def export_pipeline(drive_id):
    if current_user.role != 'company':
        return jsonify({"error": "Unauthorized"}), 403
    export_company_pipeline_csv.delay(drive_id, current_user.id)
    return jsonify({"message": "Export started"}), 202

@company_bp.route('/notifications', methods=['GET'])
@login_required
def get_company_notifications():
    if current_user.role != 'company':
        return jsonify({"error": "Unauthorized"}), 403
    notifs = json.loads(current_user.notifications) if current_user.notifications else []
    return jsonify({"notifications": notifs}), 200

@company_bp.route('/notification/<int:notif_id>', methods=['DELETE'])
@login_required
def delete_company_notification(notif_id):
    if current_user.role != 'company':
        return jsonify({"error": "Unauthorized"}), 403
    notifs = json.loads(current_user.notifications) if current_user.notifications else []
    updated = [n for n in notifs if n.get('id') != notif_id]
    current_user.notifications = json.dumps(updated)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200