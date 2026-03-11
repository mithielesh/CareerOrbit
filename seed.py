from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.company import CompanyProfile
from app.models.drive import PlacementDrive
from app.models.application import Application
from datetime import datetime, timedelta

app = create_app()

def run_seed():
    with app.app_context():
        print("Booting God-Mode Database Seed...")
        
        # 1. CLEAN SLATE
        db.drop_all()
        db.create_all()
        print("Old data wiped. Tables recreated.")

        # =============================================
        # 2. CREATE ADMIN
        # =============================================
        admin = User(email='admin@institute.edu', name='Institute Placement Cell', role='admin')
        admin.set_password('admin123')
        db.session.add(admin)

        # =============================================
        # 3. CREATE COMPANIES (5 Diverse Entities)
        # =============================================
        companies_data = [
            {'email': 'hr@globaltech.com', 'name': 'Global Tech Inc.', 'salary': 18.5, 'contact': 'Sarah Connor', 'web': 'www.globaltech.com'},
            {'email': 'hr@finsolutions.com', 'name': 'FinSolutions', 'salary': 12.0, 'contact': 'Mark Baum', 'web': 'www.finsol.com'},
            {'email': 'hr@creative.io', 'name': 'Creative Agency', 'salary': 6.5, 'contact': 'Ari Gold', 'web': 'www.creative.io'},
            {'email': 'hr@cloudsys.com', 'name': 'CloudSystems', 'salary': 24.0, 'contact': 'Elon Tusk', 'web': 'www.cloudsys.com'},
            {'email': 'hr@startupx.com', 'name': 'StartupX', 'salary': 4.5, 'contact': 'Richard Hendricks', 'web': 'www.startupx.com'}
        ]

        company_users = []
        company_profiles = []

        for c in companies_data:
            u = User(email=c['email'], name=c['name'] + " HR", role='company')
            u.set_password('company123')
            db.session.add(u)
            company_users.append(u)
            db.session.flush()

            prof = CompanyProfile(
                user_id=u.id, 
                company_name=c['name'], 
                hr_contact=c['contact'], 
                website=c['web'], 
                approval_status='Approved'
            )
            db.session.add(prof)
            company_profiles.append(prof)

        # =============================================
        # 4. CREATE STUDENTS (15 Diverse Profiles)
        # =============================================
        students = []
        # Student 1: The Legend (Main User)
        main_student = User(
            email='student1@demo.com', name='Rahul Kumar', role='student', 
            cgpa=9.2, skills='Python, Vue.js, Flask, AWS', 
            resume_link='https://drive.google.com/resume_rahul.pdf'
        )
        main_student.set_password('student123')
        db.session.add(main_student)
        students.append(main_student)

        # 14 more students with varying CGPAs and skills
        student_names = [
            "Ananya Singh", "Vikram Rathore", "Sanya Mirza", "Arjun Reddy", 
            "Zoya Khan", "Ishaan Bhat", "Kriti Sanon", "Varun Dhawan", 
            "Alia Bhatt", "Ranbir Kapoor", "Deepika P.", "Sid M.", "Kiara A.", "Kartik A."
        ]
        
        for i, name in enumerate(student_names):
            # Range CGPA from 5.5 to 9.8
            cgpa = round(6.0 + (i * 0.25), 2)
            if cgpa > 10: cgpa = 9.9
            
            s = User(
                email=f'student{i+2}@demo.com', name=name, role='student',
                cgpa=cgpa, skills='Java, React, SQL, C++',
                resume_link=f'https://drive.google.com/resume_{i}.pdf'
            )
            s.set_password('student123')
            db.session.add(s)
            students.append(s)

        db.session.commit()

        # =============================================
        # 5. CREATE PLACEMENT DRIVES (Expired, Ongoing, Upcoming)
        # =============================================
        today = datetime.utcnow().date()

        # DRIVE 1: Expired (Main student ACCEPTED here)
        d1 = PlacementDrive(
            company_id=company_profiles[0].id, job_title='Senior SDE', 
            job_description='High performance backend systems.', eligibility_criteria='B.Tech',
            min_cgpa=8.0, required_skills='Python, Flask', salary=18.5,
            start_date=today - timedelta(days=30), application_deadline=today - timedelta(days=15), 
            status='Approved'
        )

        # DRIVE 2: Expired (Main student MISSED this)
        d2 = PlacementDrive(
            company_id=company_profiles[1].id, job_title='Data Analyst', 
            job_description='Work with big data.', eligibility_criteria='B.Tech/M.Tech',
            min_cgpa=7.0, required_skills='SQL, Excel', salary=12.0,
            start_date=today - timedelta(days=20), application_deadline=today - timedelta(days=5), 
            status='Approved'
        )

        # DRIVE 3: Ongoing (Main student REJECTED here after Round 2)
        d3 = PlacementDrive(
            company_id=company_profiles[2].id, job_title='UI Designer', 
            job_description='Create beautiful interfaces.', eligibility_criteria='Any Degree',
            min_cgpa=6.0, required_skills='Vue.js, CSS', salary=6.5,
            start_date=today - timedelta(days=2), application_deadline=today + timedelta(days=5), 
            status='Approved'
        )

        # DRIVE 4: Ongoing (Main student currently in ROUND 1)
        d4 = PlacementDrive(
            company_id=company_profiles[3].id, job_title='Cloud Architect', 
            job_description='AWS infrastructure management.', eligibility_criteria='B.Tech CS',
            min_cgpa=8.5, required_skills='AWS, Terraform', salary=24.0,
            start_date=today - timedelta(days=1), application_deadline=today + timedelta(days=10), 
            status='Approved'
        )

        # DRIVE 5: Upcoming (Visible only in sidebar)
        d5 = PlacementDrive(
            company_id=company_profiles[4].id, job_title='Junior Developer', 
            job_description='Entry level role.', eligibility_criteria='B.Tech',
            min_cgpa=5.5, required_skills='JavaScript', salary=4.5,
            start_date=today + timedelta(days=5), application_deadline=today + timedelta(days=20), 
            status='Approved'
        )

        db.session.add_all([d1, d2, d3, d4, d5])
        db.session.commit()

        # =============================================
        # 6. CREATE APPLICATIONS (The Snake Pipeline Test)
        # =============================================
        
        # --- Main Student (Rahul) ---
        # 1. Accepted at Global Tech
        db.session.add(Application(student_id=main_student.id, drive_id=d1.id, status='Accepted', resume_link=main_student.resume_link))
        # 2. Rejected at Creative Agency after Round 2
        db.session.add(Application(student_id=main_student.id, drive_id=d3.id, status='Rejected', resume_link=main_student.resume_link))
        # 3. Ongoing at CloudSystems (In Round 1)
        db.session.add(Application(
            student_id=main_student.id, drive_id=d4.id, status='Round 1', 
            resume_link=main_student.resume_link, 
            interview_link='https://meet.google.com/abc-defg-hij', 
            interview_date='Wednesday, March 11th at 10:00 AM'
        ))

        # --- Randomize others for Admin Analytics ---
        for i in range(1, 15):
            s = students[i]
            # Everyone applies to d1 (Expired)
            db.session.add(Application(student_id=s.id, drive_id=d1.id, status='Rejected' if i % 2 == 0 else 'Shortlisted'))
            
            # High GPA students get selected for d4
            if s.cgpa >= 8.5:
                db.session.add(Application(student_id=s.id, drive_id=d4.id, status='Selected'))
            
            # Others in different stages for d3
            db.session.add(Application(student_id=s.id, drive_id=d3.id, status='Round 2' if i % 3 == 0 else 'Applied'))

        db.session.commit()
        
        print("\nSEED COMPLETE! GOD MODE ACTIVE.")
        print("================================================")
        print(f"MAIN STUDENT: {main_student.email} / student123")
        print(f"ADMIN:        admin@institute.edu / admin123")
        print(f"COMPANIES:    hr@globaltech.com (and 4 others)")
        print("================================================\n")

if __name__ == '__main__':
    run_seed()