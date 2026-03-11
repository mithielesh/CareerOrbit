from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from app.models.user import User
from app.models.company import CompanyProfile
from app.models.drive import PlacementDrive
from app.models.application import Application
from app.extensions import db
from app.extensions import cache 

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')

# --- Helper: Security Check ---
def is_admin():
    return current_user.is_authenticated and current_user.role == 'admin'

# ==========================================
# 1. ADMIN DASHBOARD STATS
# ==========================================
@admin_bp.route('/dashboard', methods=['GET'])
@login_required
@cache.cached(timeout=120, key_prefix='admin_dashboard_counts')
def dashboard_stats():
    if not is_admin():
        return jsonify({"error": "Unauthorized"}), 403

    total_students = User.query.filter_by(role='student').count()
    total_companies = CompanyProfile.query.count()
    total_drives = PlacementDrive.query.count()

    return jsonify({
        "total_students": total_students,
        "total_companies": total_companies,
        "total_drives": total_drives
    }), 200

# ==========================================
# 2. MANAGE COMPANY APPROVALS
# ==========================================
@admin_bp.route('/company/<int:company_id>/status', methods=['PUT'])
@login_required
def update_company_status(company_id):
    if not is_admin():
        return jsonify({"error": "Unauthorized"}), 403

    company = CompanyProfile.query.get_or_404(company_id)
    data = request.get_json()
    new_status = data.get('status') # Should be 'Approved' or 'Rejected'

    if new_status not in ['Approved', 'Rejected']:
        return jsonify({"error": "Invalid status"}), 400

    company.approval_status = new_status
    db.session.commit()
    return jsonify({"message": f"Company profile marked as {new_status}"}), 200

# ==========================================
# 3. MANAGE PLACEMENT DRIVES
# ==========================================
@admin_bp.route('/drive/<int:drive_id>/status', methods=['PUT'])
@login_required
def update_drive_status(drive_id):
    if not is_admin():
        return jsonify({"error": "Unauthorized"}), 403

    drive = PlacementDrive.query.get_or_404(drive_id)
    data = request.get_json()
    new_status = data.get('status') # Should be 'Approved' or 'Rejected'

    if new_status not in ['Approved', 'Rejected']:
        return jsonify({"error": "Invalid status"}), 400

    drive.status = new_status
    db.session.commit()
    return jsonify({"message": f"Placement drive marked as {new_status}"}), 200

# ==========================================
# 4. BLACKLIST / DEACTIVATE USERS
# ==========================================
@admin_bp.route('/user/<int:user_id>/toggle-active', methods=['PUT'])
@login_required
def toggle_user_active(user_id):
    if not is_admin():
        return jsonify({"error": "Unauthorized"}), 403

    # Don't let the admin deactivate themselves!
    if user_id == current_user.id:
        return jsonify({"error": "Cannot deactivate the super admin account."}), 400

    user = User.query.get_or_404(user_id)
    user.is_active = not user.is_active # Flips True to False, or False to True
    
    status_msg = "Activated" if user.is_active else "Deactivated/Blacklisted"
    db.session.commit()
    
    return jsonify({"message": f"User {user.name} has been {status_msg}"}), 200

# ==========================================
# 5. GET ALL PENDING ITEMS (For UI Tables)
# ==========================================
@admin_bp.route('/pending', methods=['GET'])
@login_required
def get_pending_items():
    if not is_admin():
        return jsonify({"error": "Unauthorized"}), 403

    pending_companies = CompanyProfile.query.filter_by(approval_status='Pending').all()
    pending_drives = PlacementDrive.query.filter_by(status='Pending').all()

    # Serialize data for the Vue frontend
    companies_data = [{"id": c.id, "name": c.company_name, "website": c.website} for c in pending_companies]
    drives_data = [{"id": d.id, "title": d.job_title, "company_id": d.company_id} for d in pending_drives]

    return jsonify({
        "pending_companies": companies_data,
        "pending_drives": drives_data
    }), 200

# ==========================================
# 6. ADMIN: COMPANY DIRECTORY & PIPELINES
# ==========================================
@admin_bp.route('/companies', methods=['GET'])
@login_required
def get_all_companies():
    if not is_admin(): return jsonify({"error": "Unauthorized"}), 403
    
    companies = CompanyProfile.query.all()
    data = []
    for c in companies:
        drives = PlacementDrive.query.filter_by(company_id=c.id).all()
        drive_ids = [d.id for d in drives]
        apps = Application.query.filter(Application.drive_id.in_(drive_ids)).all() if drive_ids else []
        
        data.append({
            "id": c.id, "name": c.company_name, "status": c.approval_status,
            "stats": {
                "total_drives": len(drives),
                "applied": len([a for a in apps if a.status == 'Applied']),
                "interviews": len([a for a in apps if a.status in ['Round 1', 'Round 2', 'Final Round']]),
                "hired": len([a for a in apps if a.status in ['Selected', 'Accepted']]),
                "rejected": len([a for a in apps if a.status == 'Rejected'])
            }
        })
    return jsonify({"companies": data}), 200

# ==========================================
# 7. ADMIN: STUDENT DIRECTORY
# ==========================================
@admin_bp.route('/students', methods=['GET'])
@login_required
def get_all_students():
    if not is_admin(): return jsonify({"error": "Unauthorized"}), 403
    
    students = User.query.filter_by(role='student').all()
    data = []
    for s in students:
        apps = Application.query.filter_by(student_id=s.id).all()
        selected_apps = [a for a in apps if a.status in ['Selected', 'Accepted']]
        
        secured_salaries = []
        for sa in selected_apps:
            d = PlacementDrive.query.get(sa.drive_id)
            if d: secured_salaries.append(d.salary)

        data.append({
            "id": s.id, "name": s.name, "email": s.email, "is_active": s.is_active,
            "cgpa": s.cgpa or 0.0,
            "stats": {
                "applied": len(apps),
                "offers": len(selected_apps),
                "max_salary": max(secured_salaries) if secured_salaries else 0.0
            }
        })
    return jsonify({"students": data}), 200

# ==========================================
# 8. ADMIN: GLOBAL ANALYTICS
# ==========================================
@admin_bp.route('/global-analytics', methods=['GET'])
@login_required
@cache.cached(timeout=300, key_prefix='admin_global_metrics')
def get_global_analytics():
    if not is_admin(): return jsonify({"error": "Unauthorized"}), 403
    
    highest_drive = PlacementDrive.query.order_by(PlacementDrive.salary.desc()).first()
    highest_package = highest_drive.salary if highest_drive else 0.0

    total_students = User.query.filter_by(role='student').count()
    placed_students = db.session.query(Application.student_id).filter(Application.status.in_(['Selected', 'Accepted'])).distinct().count()
    placement_ratio = round((placed_students / total_students * 100) if total_students > 0 else 0, 1)

    accepted_apps = Application.query.filter(Application.status.in_(['Selected', 'Accepted'])).all()
    distribution = {"<5 LPA": 0, "5-10 LPA": 0, "10-15 LPA": 0, "15-20 LPA": 0, "20+ LPA": 0}
    
    top_company = "N/A"
    company_hires = {}

    for a in accepted_apps:
        d = PlacementDrive.query.get(a.drive_id)
        if d:
            # Salary Bins
            sal = d.salary
            if sal < 5: distribution["<5 LPA"] += 1
            elif 5 <= sal < 10: distribution["5-10 LPA"] += 1
            elif 10 <= sal < 15: distribution["10-15 LPA"] += 1
            elif 15 <= sal < 20: distribution["15-20 LPA"] += 1
            else: distribution["20+ LPA"] += 1
            
            # Top Recruiter Tracking
            c = CompanyProfile.query.get(d.company_id)
            if c:
                company_hires[c.company_name] = company_hires.get(c.company_name, 0) + 1

    if company_hires:
        top_company = max(company_hires, key=company_hires.get)

    return jsonify({
        "highest_package": highest_package,
        "top_recruiter": top_company,
        "placement_ratio": placement_ratio,
        "salary_distribution": distribution
    }), 200