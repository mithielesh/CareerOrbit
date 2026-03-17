from app.extensions import db
from datetime import datetime

class Application(db.Model):
    __tablename__ = 'application'
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    drive_id = db.Column(db.Integer, db.ForeignKey('placement_drive.id'), nullable=False)
    
    resume_link = db.Column(db.String(255), nullable=True)
    
    # Status can now be: Applied, Shortlisted, Round 1, Round 2, Final Round, Accepted, Rejected
    status = db.Column(db.String(50), default='Applied') 
    
    # --- NEW: INTERVIEW DETAILS ---
    interview_link = db.Column(db.String(255), nullable=True)
    interview_date = db.Column(db.String(100), nullable=True)
    # ------------------------------
    
    application_date = db.Column(db.DateTime, default=datetime.now)