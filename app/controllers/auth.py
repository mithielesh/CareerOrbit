from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from app.models.user import User
from app.models.company import CompanyProfile
from app.extensions import db

bp = Blueprint('auth', __name__, url_prefix='/api/auth')

@bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(email=data.get('email')).first()
    
    if user and user.check_password(data.get('password')):
        # 1. Global Ban Check (For Students & Suspended Companies)
        if not user.is_active:
            return jsonify({"error": "Account has been deactivated by Admin."}), 403
            
        # 2. STRICT COMPANY LOCK: Block unapproved companies
        if user.role == 'company':
            # Local import to prevent circular import issues just in case
            from app.models.company import CompanyProfile 
            company = CompanyProfile.query.filter_by(user_id=user.id).first()
            
            if company:
                if company.approval_status == 'Pending':
                    return jsonify({"error": "Approval pending. Please wait for the admin to verify your profile."}), 403
                elif company.approval_status == 'Rejected':
                    return jsonify({"error": "Registration rejected. Your access has been revoked."}), 403
        
        login_user(user)
        return jsonify({
            "message": "Login successful", 
            "role": user.role, 
            "name": user.name
        }), 200
        
    return jsonify({"error": "Invalid credentials"}), 401

@bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    role = data.get('role') # Must be 'student' or 'company'
    name = data.get('name')

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 400
    
    if role not in ['student', 'company']:
        return jsonify({"error": "Invalid role"}), 400

    # Create the base user account
    new_user = User(email=email, role=role, name=name)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.flush() # This generates the new_user.id before committing

    # If the user is a Company, we must also create their Company Profile
    if role == 'company':
        company = CompanyProfile(
            user_id=new_user.id,
            company_name=name,
            hr_contact=data.get('hr_contact', 'Not Provided'),
            website=data.get('website', '')
        )
        db.session.add(company)

    db.session.commit()
    return jsonify({"message": f"{role.capitalize()} registration successful"}), 201

@bp.route('/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({"message": "Logged out"}), 200