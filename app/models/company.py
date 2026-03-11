from app.extensions import db

class CompanyProfile(db.Model):
    __tablename__ = 'company_profile'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    company_name = db.Column(db.String(150), nullable=False)
    hr_contact = db.Column(db.String(100), nullable=False)
    website = db.Column(db.String(200))
    approval_status = db.Column(db.String(20), default='Pending') # 'Pending', 'Approved', 'Rejected'
    
    # Relationship to drives
    drives = db.relationship('PlacementDrive', backref='company', lazy=True)