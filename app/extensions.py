from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_security import Security
from flask_caching import Cache

db = SQLAlchemy()
login_manager = LoginManager()
security = Security()
cache = Cache()