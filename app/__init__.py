from flask import Flask, render_template
from app.extensions import db, login_manager, cache
from app.config import Config
from celery import Celery, Task

# --- NEW PPA MODEL IMPORTS ---
from app.models.user import User
from app.models.company import CompanyProfile
from app.models.drive import PlacementDrive
from app.models.application import Application

def create_app():
    app = Flask(__name__)
    
    # Load Config from app/config.py (Includes DB, Redis, Celery settings)
    app.config.from_object(Config)

    # ====================================================================
    # REDIS CACHE FOR API PERFORMANCE
    # ====================================================================
    app.config['CACHE_TYPE'] = 'RedisCache'
    app.config['CACHE_REDIS_URL'] = 'redis://localhost:6379/0'
    app.config['CACHE_DEFAULT_TIMEOUT'] = 60

    # Init Extensions
    db.init_app(app)
    cache.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = None 

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    # Register Blueprints
    from app.controllers.auth import bp as auth_bp
    app.register_blueprint(auth_bp)

    from app.controllers.admin import admin_bp
    app.register_blueprint(admin_bp)

    from app.controllers.user import user_bp  # We will use this for the Student role
    app.register_blueprint(user_bp)

    from app.controllers.company import company_bp
    app.register_blueprint(company_bp)
    
    # Note: We will need to create and register a company_bp soon!

    # Main Entry Point for VueJS SPA
    @app.route('/')
    def index():
        return render_template('index.html')

    # Create DB and Admin
    with app.app_context():
        db.create_all()
        # Auto-create Admin (UPDATED to include the required 'name' field)
        if not User.query.filter_by(role='admin').first():
            admin = User(
                email='admin@institute.edu', 
                name='Institute Admin', 
                role='admin'
            )
            admin.set_password('admin123')
            db.session.add(admin)
            db.session.commit()
            print("PPA Database Created & Admin Auto-Provisioned!")

    # Initialize Celery
    app.celery_app = celery_init_app(app)
    from app import tasks
    return app


def celery_init_app(app: Flask) -> Celery:
    class FlaskTask(Task):
        def __call__(self, *args: object, **kwargs: object) -> object:
            with app.app_context():
                return self.run(*args, **kwargs)

    celery_app = Celery(app.name, task_cls=FlaskTask)
    celery_app.conf.update(
        broker_url=app.config['CELERY_BROKER_URL'],
        result_backend=app.config['CELERY_RESULT_BACKEND']
    )
    celery_app.set_default()
    app.extensions["celery"] = celery_app
    return celery_app