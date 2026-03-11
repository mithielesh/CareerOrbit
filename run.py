from app import create_app

flask_app = create_app()

celery = flask_app.celery_app

if __name__ == '__main__':
    flask_app.run(debug=True)