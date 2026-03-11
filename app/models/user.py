from app.extensions import db
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import json

class User(db.Model, UserMixin):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'admin', 'company', 'student'
    name = db.Column(db.String(100), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    cgpa = db.Column(db.Float, nullable=True)
    skills = db.Column(db.String(255), nullable=True)
    resume_link = db.Column(db.String(255), nullable=True)
    
    # Store notifications as a JSON string to keep SQLite simple and fast
    notifications = db.Column(db.Text, default='[]')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
        
    def add_notification(self, message, action_link=None):
        """Helper to safely append a new notification to the JSON array"""
        notifs = json.loads(self.notifications) if self.notifications else []
        notifs.append({
            "id": len(notifs) + 1,
            "message": message,
            "action_link": action_link,
            "is_read": False,
            "date": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        })
        # Re-serialize to string so SQLAlchemy detects the change
        self.notifications = json.dumps(notifs)