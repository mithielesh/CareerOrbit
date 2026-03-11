# CareerOrbit - Placement Portal Application

[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-2.3+-000000?style=flat-square&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Vue.js](https://img.shields.io/badge/Vue.js-3.0-4FC08D?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3.0-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Redis](https://img.shields.io/badge/Redis-7.0+-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![Celery](https://img.shields.io/badge/Celery-5.3-37814A?style=flat-square&logo=celery&logoColor=white)](https://docs.celeryproject.org/)
[![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952B3?style=flat-square&logo=bootstrap&logoColor=white)](https://getbootstrap.com/)
[![Chart.js](https://img.shields.io/badge/Chart.js-4.0-FF6384?style=flat-square&logo=chart.js&logoColor=white)](https://www.chartjs.org/)

A full-stack, multi-role campus placement management system with real-time analytics, automated recruitment pipelines, and asynchronous background jobs.

## System Architecture

```mermaid
flowchart LR
    flowchart LR
    %% Styling
    classDef admin fill:#0f172a,stroke:#fff,stroke-width:2px,color:#fff
    classDef company fill:#0284c7,stroke:#fff,stroke-width:2px,color:#fff
    classDef student fill:#16a34a,stroke:#fff,stroke-width:2px,color:#fff
    classDef bgTask fill:#b91c1c,stroke:#fff,stroke-width:2px,color:#fff

    %% Entry
    Auth([Login]) --> Role{Role?}

    %% Admin Flow
    Role -->|Admin| ADash[Admin Dash]:::admin
    ADash --> Manage[Approvals & Directories]:::admin & Analytics[Global Analytics]:::admin
    Manage --> Approve[Approve Companies & Drives]:::admin
    Analytics --> Stats[Salary & Placement Ratios]:::admin

    %% Company Flow
    Role -->|Company| CDash[Company Dash]:::company
    CDash --> Drives[Manage Drives]:::company & ATS[Applicant Pipeline]:::company
    Drives --> Launch[Launch Campaign]:::company
    ATS --> Screen[Shortlist/Interview/Hire]:::company

    %% Student Flow
    Role -->|Student| SDash[Student Dash]:::student
    SDash --> Jobs[Live Job Board]:::student & History[My Pipeline]:::student
    Jobs --> Apply{Apply (CGPA Check)}:::student -->|Success| History
    History --> Export[CSV Export]:::student

    %% Background Tasks
    Worker((Celery Workers)):::bgTask -.->|Scheduled/Async| Notifications[In-App Alerts & Reports]:::bgTask -.-> SDash & CDash
```

## Core Features

### Administrator
- Approval Workflow: Control gate for new company registrations and placement drive campaigns.
- Global Analytics: High-level dashboard tracking highest packages, top recruiters, and campus salary distribution charts.
- Directory Management: Comprehensive view of all students and companies with the ability to suspend/unban user accounts.

### Company (Recruiter)
- Campaign Management: Launch targeted job drives with strict eligibility criteria (e.g., Min CGPA, Key Skills).
- ATS Pipeline: Interactive Kanban-style recruitment funnel (Screening → Interviews → Decisions).
- Recruitment Analytics: Visual dashboards tracking application conversions, shortlists, and hiring statistics.

### Student
- Smart Job Board: Auto-filtering job board categorized into Active, Upcoming, and Missed opportunities.
- Application Tracking: Real-time visual timeline of application statuses and interview schedules.
- Profile & Export: Resume management, strict eligibility validation, and asynchronous CSV generation of application history.

### Background Processing
- Scheduled daily reminders at 18:00
- Automated monthly report generation
- User-triggered asynchronous exports

## Technology Stack

**Backend**
- Flask 2.3+ with SQLAlchemy ORM
- Flask-Login for session management
- Flask-Caching with Redis backend
- Celery 5.3 for distributed task processing

**Frontend**
- Vue.js 3 (CDN-based SPA)
- Bootstrap 5 for responsive UI
- Chart.js for data visualization

**Data Layer**
- SQLite 3 for relational storage
- Redis 7.0+ for caching and message brokering

## Project Structure

```
Career Orbit/
├── app/
│   ├── controllers/       # API endpoints (auth, admin, company, user)
│   ├── models/            # Database schemas (User, CompanyProfile, PlacementDrive, Application)
│   ├── static/
│   │   ├── js/            # Vue.js SPA (app.js)
│   │   └── exports/       # Generated CSV/HTML reports
│   ├── templates/         # Entry point (index.html)
│   ├── tasks.py           # Celery background jobs
│   ├── config.py          # Application & Celery configuration
│   └── extensions.py      # Flask extensions (DB, Cache, Login)
├── instance/              # SQLite database (auto-generated)
├── run.py                 # Flask application entry point
├── trigger_tasks.py       # Manual task testing script
└── requirements.txt       # Python dependencies
```

## API Overview

### Authentication (`/api/auth`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/register` | POST | Register new student or company account |
| `/login` | POST | Unified authentication logic across all 3 roles |
| `/logout` | POST | Terminate active user session securely |

### Administrator (`/api/admin`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/dashboard` | GET | Fetch high-level platform metric counts (Cached) |
| `/global-analytics` | GET | Fetch placement ratios and salary stats (Cached) |
| `/pending` | GET | Fetch companies and drives awaiting approval |
| `/companies` | GET | Fetch master list and stats for all registered companies |
| `/students` | GET | Fetch master list and stats for all registered students |
| `/company/<id>/status` | PUT | Approve or reject company registrations |
| `/drive/<id>/status` | PUT | Approve or reject placement drives |
| `/user/<id>/toggle-active` | PUT | Suspend or unban student/company accounts |

### Company / Recruiter (`/api/company`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/analytics` | GET | Fetch ATS funnel statistics for the dashboard |
| `/my-drives` | GET | List all campaigns created by the active company |
| `/drives` | POST | Submit a new placement drive for admin review |
| `/drive/<id>/applications` | GET | Fetch all student applications for a specific drive |
| `/application/<id>/status` | PUT | Move candidate through ATS pipeline & schedule interviews |

### Student (`/api/student`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/profile` | GET / PUT | Fetch or update professional profile and resume link |
| `/drives` | GET | Fetch all active, approved job drives (Cached) |
| `/drive/<id>/apply` | POST | Submit application (triggers backend CGPA/eligibility validation) |
| `/applications` | GET | Fetch personal application timeline and status history |
| `/notifications` | GET | Fetch in-app alerts (e.g., ready downloads, reports) |
| `/notification/<id>` | DELETE | Dismiss and permanently delete a specific notification |
| `/export` | POST | Trigger async Celery job for CSV history export |

## License

![MIT License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)

