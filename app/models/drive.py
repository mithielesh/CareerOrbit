from app.extensions import db
from datetime import datetime

class PlacementDrive(db.Model):
    __tablename__ = 'placement_drive'
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, db.ForeignKey('company_profile.id'), nullable=False)
    
    job_title = db.Column(db.String(100), nullable=False)
    job_description = db.Column(db.Text, nullable=False)
    eligibility_criteria = db.Column(db.String(255), nullable=False)
    
    # --- NEW: STRICT ATS FILTERS ---
    min_cgpa = db.Column(db.Float, default=0.0)
    required_skills = db.Column(db.String(255), nullable=True) 
    # -------------------------------
    
    start_date = db.Column(db.Date, nullable=False)
    application_deadline = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(20), default='Pending')
    salary = db.Column(db.Float, nullable=False, default=0.0)