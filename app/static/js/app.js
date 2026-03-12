const { createApp, ref, reactive, onMounted, computed, nextTick, watch } = Vue;

const App = {
    setup() {
        // ==========================================
        // 1. GLOBAL STATE & MODALS
        // ==========================================
        const user = reactive({
            isAuthenticated: !!localStorage.getItem('auth_token'),
            token: localStorage.getItem('auth_token') || null,
            role: localStorage.getItem('user_role') || null,
            email: localStorage.getItem('user_email') || null,
            name: localStorage.getItem('user_name') || 'User'
        });

        const modal = reactive({ 
            isVisible: false, 
            title: '', 
            message: '', 
            type: 'primary', 
            onConfirm: null 
        });

        const showModal = (title, message, type = 'primary', callback = null) => { 
            modal.title = title; 
            modal.message = message; 
            modal.type = type; 
            modal.onConfirm = callback; 
            modal.isVisible = true; 
        };

        const closeModal = () => { modal.isVisible = false; };
        const confirmAction = () => { if (modal.onConfirm) modal.onConfirm(); closeModal(); };

        // ==========================================
        // 2. AUTHENTICATION & BAN CHECK
        // ==========================================
        const isRegistering = ref(false); 
        const credentials = reactive({ 
            role: 'student', 
            email: '', 
            password: '', 
            name: '', 
            hr_contact: '', 
            website: '' 
        });
        
        const toggleAuthMode = () => { 
            isRegistering.value = !isRegistering.value; 
            credentials.email = ''; 
            credentials.password = ''; 
        };

        const authAction = async () => {
            const endpoint = isRegistering.value ? '/api/auth/register' : '/api/auth/login';
            try {
                const res = await fetch(endpoint, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify(credentials) 
                });
                
                const data = await res.json();
                
                if (res.ok) {
                    if (isRegistering.value) { 
                        showModal('Success', 'Registration successful! Please login.', 'success'); 
                        toggleAuthMode(); 
                    } else {
                        user.isAuthenticated = true; 
                        user.role = data.role; 
                        user.email = credentials.email; 
                        user.name = data.name || 'User'; 
                        
                        localStorage.setItem('auth_token', 'true'); 
                        localStorage.setItem('user_role', data.role); 
                        localStorage.setItem('user_name', user.name); 
                        
                        loadDashboard();
                    }
                } else { 
                    // Intercept Banned Students
                    if (data.error && data.error.toLowerCase().includes("deactivated")) {
                        showModal('Account Suspended', 'Your account has been restricted by the Institute Admin. Please contact the placement cell immediately.', 'danger');
                    } else {
                        showModal('Error', data.error || data.message, 'danger'); 
                    }
                }
            } catch (e) { 
                showModal('Error', 'Connection failed.', 'danger'); 
            }
        };

        const logout = async () => { 
            try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) { console.error(e); } 
            
            user.isAuthenticated = false; 
            localStorage.clear(); 
            
            credentials.email = ''; credentials.password = ''; credentials.name = ''; 
            credentials.hr_contact = ''; credentials.website = ''; isRegistering.value = false;
            
            studentState.profile = { cgpa: '', skills: '', resume_link: '' };
            studentState.allDrives = []; studentState.applicationHistory = [];
            companyState.stats = null; companyState.myDrives = []; companyState.applicants = [];
            companyState.currentDriveTitle = ''; companyState.currentDriveId = null;
            notifications.value = [];
        };

        // ==========================================
        // 3. UNIVERSAL IN-APP NOTIFICATIONS
        // ==========================================
        const notifications = ref([]);
        const showNotifModal = ref(false);

        const fetchNotifications = async () => {
            if (user.role === 'admin') return;

            if (user.role === 'student') {
                // FORCE FETCH: Grab the fresh profile data which contains the notifications
                try {
                    const res = await fetch('/api/student/profile', { cache: 'no-store' });
                    if (res.ok) {
                        const data = await res.json();
                        studentState.profile = data; // Keep profile data in sync
                        notifications.value = data.notifications || []; // Populate the universal bell!
                    }
                } catch(e) { console.error(e); }
            } 
            else if (user.role === 'company') {
                // Company uses the dedicated endpoint we built earlier
                try {
                    const res = await fetch('/api/company/notifications', { cache: 'no-store' });
                    if (res.ok) {
                        const data = await res.json();
                        notifications.value = data.notifications || [];
                    }
                } catch(e) { console.error(e); }
            }
        };

        const openNotifications = async () => {
            await fetchNotifications();
            showNotifModal.value = true; 
        };
        const closeNotifModal = () => { showNotifModal.value = false; };
        
        const deleteNotification = async (notifId) => {
            // Instantly remove it from the UI for a snappy feel
            notifications.value = notifications.value.filter(n => n.id !== notifId);
            
            // Tell the Flask backend to delete it permanently
            const endpoint = user.role === 'student' ? `/api/student/notification/${notifId}` : `/api/company/notification/${notifId}`;
            try {
                await fetch(endpoint, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (error) {
                console.error("Failed to delete notification:", error);
            }
        };

        // ==========================================
        // 4. ADMIN DASHBOARD
        // ==========================================
        const adminState = reactive({ 
            view: 'approvals', 
            stats: {}, 
            pendingCompanies: [], 
            pendingDrives: [],
            allCompanies: [],
            companySearch: '',
            allStudents: [],
            studentSearch: '',
            globalAnalytics: null
        });
        
        let adminChartInstance = null;

        const fetchAdminData = async () => {
            if (user.role !== 'admin') return;
            try {
                const statsRes = await fetch('/api/admin/dashboard');
                if (statsRes.ok) adminState.stats = await statsRes.json();

                const pendingRes = await fetch('/api/admin/pending');
                if (pendingRes.ok) {
                    const data = await pendingRes.json();
                    adminState.pendingCompanies = data.pending_companies;
                    adminState.pendingDrives = data.pending_drives;
                }
            } catch(e) { console.error(e); }
        };

        const fetchAdminDirectories = async () => {
            try {
                const cRes = await fetch('/api/admin/companies');
                if (cRes.ok) {
                    const data = await cRes.json();
                    adminState.allCompanies = data.companies;
                }
                
                const sRes = await fetch('/api/admin/students');
                if (sRes.ok) {
                    const data = await sRes.json();
                    adminState.allStudents = data.students;
                }
            } catch(e) { console.error(e); }
        };

        const fetchGlobalAnalytics = async () => {
            try {
                const res = await fetch('/api/admin/global-analytics');
                if (res.ok) {
                    adminState.globalAnalytics = await res.json();
                    nextTick(() => renderAdminChart());
                }
            } catch(e) { console.error(e); }
        };

        const renderAdminChart = () => {
            const ctx = document.getElementById('salaryDistChart');
            if (!ctx || !adminState.globalAnalytics) return;
            if (adminChartInstance) adminChartInstance.destroy();
            
            const dist = adminState.globalAnalytics.salary_distribution;
            adminChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: Object.keys(dist),
                    datasets: [{
                        label: 'Number of Students Placed',
                        data: Object.values(dist),
                        backgroundColor: '#0d6efd'
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } 
                }
            });
        };

        watch(() => adminState.view, (newVal) => { 
            if (newVal === 'directories') fetchAdminDirectories();
            if (newVal === 'analytics') fetchGlobalAnalytics();
        });

        const updateStatus = async (type, id, status) => {
            try {
                const res = await fetch(`/api/admin/${type}/${id}/status`, { 
                    method: 'PUT', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ status }) 
                });
                if (res.ok) { 
                    showModal('Success', `${type} marked as ${status}`, 'success'); 
                    fetchAdminData(); 
                }
            } catch(e) { console.error(e); }
        };

        const toggleStudentBan = async (studentId) => {
            try {
                const res = await fetch(`/api/admin/user/${studentId}/toggle-active`, { method: 'PUT' });
                if (res.ok) {
                    showModal('Success', 'Student access status updated.', 'success');
                    fetchAdminDirectories();
                }
            } catch(e) { console.error(e); }
        };

        const filteredAdminCompanies = computed(() => {
            return adminState.allCompanies.filter(c => c.name.toLowerCase().includes(adminState.companySearch.toLowerCase()));
        });

        const filteredAdminStudents = computed(() => {
            return adminState.allStudents.filter(s => 
                s.name.toLowerCase().includes(adminState.studentSearch.toLowerCase()) || 
                s.email.toLowerCase().includes(adminState.studentSearch.toLowerCase())
            );
        });

        // ==========================================
        // 5. COMPANY DASHBOARD
        // ==========================================
        const companyState = reactive({ 
            view: 'analytics', 
            stats: null, 
            myDrives: [], 
            applicants: [], 
            currentDriveTitle: '', 
            currentDriveId: null,
            newDrive: { 
                job_title: '', job_description: '', eligibility_criteria: '', 
                min_cgpa: 0.0, required_skills: '', salary: '', start_date: '', application_deadline: '' 
            },
            interviewPrompt: { isVisible: false, appId: null, newStatus: '', link: '', date: '' }
        });
        
        let companyChartInstance = null;

        const fetchCompanyAnalytics = async () => {
            try {
                const res = await fetch('/api/company/analytics');
                if (res.ok) { 
                    companyState.stats = await res.json(); 
                    nextTick(() => renderCompanyChart()); 
                }
            } catch(e) { console.error(e); }
        };

        const renderCompanyChart = () => {
            const ctx = document.getElementById('companyFunnelChart');
            if (!ctx || !companyState.stats) return;
            if (companyChartInstance) companyChartInstance.destroy();
            
            companyChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Pending Review', 'Shortlisted', 'Selected', 'Rejected'],
                    datasets: [{
                        data: [companyState.stats.pending, companyState.stats.shortlisted, companyState.stats.selected, companyState.stats.rejected],
                        backgroundColor: ['#ffc107', '#0dcaf0', '#198754', '#dc3545']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        };

        watch(() => companyState.view, (newVal) => { 
            if (newVal === 'analytics') fetchCompanyAnalytics(); 
        });

        const fetchMyDrives = async () => { 
            try { 
                const res = await fetch('/api/company/my-drives'); 
                if (res.ok) {
                    const data = await res.json();
                    companyState.myDrives = data.drives; 
                }
            } catch(e) { console.error(e); } 
        };

        const createDrive = async () => {
            if (parseFloat(companyState.newDrive.salary) <= 3.0) {
                showModal('Invalid Salary', 'Institute policy dictates that the offered package must be strictly greater than 3.0 LPA.', 'danger');
                return;
            }

            try {
                const res = await fetch('/api/company/drives', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify(companyState.newDrive) 
                });
                
                if (res.ok) {
                    showModal('Success', 'Drive submitted for Admin approval!', 'success');
                    companyState.newDrive = { 
                        job_title: '', job_description: '', eligibility_criteria: '', 
                        min_cgpa: 0.0, required_skills: '', salary: '', start_date: '', application_deadline: '' 
                    };
                    fetchMyDrives();
                }
            } catch(e) { console.error(e); }
        };

        const fetchApplicants = async (driveId, title) => {
            try {
                const res = await fetch(`/api/company/drive/${driveId}/applications`);
                if (res.ok) {
                    const data = await res.json();
                    companyState.applicants = data.applications;
                    companyState.currentDriveTitle = title;
                    companyState.currentDriveId = driveId;
                    companyState.view = 'pipeline';
                }
            } catch(e) { console.error(e); }
        };

        const handleStatusChange = (appId, event) => {
            const newStatus = event.target.value;
            if (['Round 1', 'Round 2', 'Final Round'].includes(newStatus)) {
                companyState.interviewPrompt.appId = appId;
                companyState.interviewPrompt.newStatus = newStatus;
                companyState.interviewPrompt.link = '';
                companyState.interviewPrompt.date = '';
                companyState.interviewPrompt.isVisible = true;
                event.target.value = ""; 
            } else {
                updateApplicationStatus(appId, newStatus, '', '');
            }
        };

        const submitInterviewDetails = () => {
            updateApplicationStatus(
                companyState.interviewPrompt.appId, 
                companyState.interviewPrompt.newStatus, 
                companyState.interviewPrompt.link, 
                companyState.interviewPrompt.date
            );
            companyState.interviewPrompt.isVisible = false;
        };

        const updateApplicationStatus = async (appId, newStatus, link = '', date = '') => {
            try {
                const res = await fetch(`/api/company/application/${appId}/status`, { 
                    method: 'PUT', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ status: newStatus, interview_link: link, interview_date: date }) 
                });
                if (res.ok) { 
                    fetchApplicants(companyState.currentDriveId, companyState.currentDriveTitle);
                    showModal('Success', `Candidate successfully moved to ${newStatus}`, 'success');
                }
            } catch(e) { console.error(e); }
        };

        // Company CSV Export
        const triggerCompanyExport = async () => {
            if (!companyState.currentDriveId) return;
            try {
                const res = await fetch(`/api/company/drive/${companyState.currentDriveId}/export`, { method: 'POST' });
                if (res.ok) {
                    showModal('Export Started', 'Your ATS Pipeline CSV is being generated. The Alerts bell will update automatically in a moment.', 'success');
                    setTimeout(() => { fetchNotifications(); }, 2000);
                }
            } catch(e) { console.error(e); }
        };

        const pipelineNew = computed(() => companyState.applicants.filter(a => ['Applied', 'Shortlisted'].includes(a.status)));
        const pipelineInterviews = computed(() => companyState.applicants.filter(a => ['Round 1', 'Round 2', 'Final Round'].includes(a.status)));
        const pipelineDecisions = computed(() => companyState.applicants.filter(a => ['Selected', 'Rejected'].includes(a.status)));

        // ==========================================
        // 6. STUDENT DASHBOARD
        // ==========================================
        const studentState = reactive({ 
            view: 'jobs', 
            profile: { cgpa: '', skills: '', resume_link: '' }, 
            allDrives: [], 
            applicationHistory: [] 
        });
        
        const fetchStudentData = async () => {
            if (user.role !== 'student') return;
            try {
                const profRes = await fetch('/api/student/profile');
                if (profRes.ok) studentState.profile = await profRes.json();

                const drivesRes = await fetch('/api/student/drives');
                if (drivesRes.ok) {
                    const data = await drivesRes.json();
                    studentState.allDrives = data.drives;
                }

                const appsRes = await fetch('/api/student/applications');
                if (appsRes.ok) {
                    const data = await appsRes.json();
                    studentState.applicationHistory = data.history;
                }
            } catch(e) { console.error(e); }
        };

        const updateProfile = async () => {
            try {
                const res = await fetch('/api/student/profile', { 
                    method: 'PUT', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify(studentState.profile) 
                });
                if (res.ok) showModal('Success', 'Profile updated successfully!', 'success');
            } catch(e) { console.error(e); }
        };

        const applyForDrive = async (drive) => {
            const p = studentState.profile;
            
            if (!p.resume_link || !p.cgpa || !p.skills || p.resume_link.trim() === '' || p.skills.trim() === '') {
                showModal('Profile Incomplete', 'You must fill all profile fields (Marks, Degree/Branch, and Resume Link) before you can apply for any placement drive.', 'warning');
                return;
            }

            const cgpaVal = parseFloat(p.cgpa);

            if (isNaN(cgpaVal) || cgpaVal <= 5.0 || cgpaVal > 10.0) {
                showModal('Invalid Marks', 'Your CGPA must be strictly greater than 5 and less than or equal to 10.', 'danger');
                return;
            }

            if (cgpaVal < parseFloat(drive.min_cgpa)) {
                showModal('ATS Rejected', `This role requires a minimum CGPA of ${drive.min_cgpa}. Your current CGPA is ${p.cgpa}. You are ineligible to apply.`, 'danger');
                return;
            }

            const studentSkills = p.skills.toLowerCase();
            const driveSkills = drive.required_skills ? drive.required_skills.toLowerCase() : '';
            
            let hasSkillWarning = false;
            if (driveSkills) {
                const reqArr = driveSkills.split(',').map(s => s.trim());
                const hasMatch = reqArr.some(s => studentSkills.includes(s));
                if (!hasMatch) hasSkillWarning = true;
            }

            const proceedWithApplication = async () => {
                try {
                    const res = await fetch(`/api/student/drive/${drive.id}/apply`, { 
                        method: 'POST', 
                        headers: {'Content-Type': 'application/json'}, 
                        body: JSON.stringify({ resume_link: p.resume_link }) 
                    });
                    const data = await res.json();
                    if (res.ok) { 
                        showModal('Success', 'Application submitted successfully!', 'success'); 
                        fetchStudentData(); 
                    } else { 
                        showModal('Error', data.error, 'danger'); 
                    }
                } catch(e) { console.error(e); }
            };

            if (hasSkillWarning) {
                showModal('Skill Gap Detected', `Warning: Your profile does not contain the specific skills/branch requested (${drive.required_skills}). Do you still wish to apply?`, 'warning', proceedWithApplication);
            } else {
                proceedWithApplication();
            }
        };

        const triggerExport = async () => { 
            try { 
                const res = await fetch('/api/student/export', { method: 'POST' }); 
                if (res.ok){
                     showModal('Export Started', 'Your CSV is generating. The Alerts bell will update automatically in a moment.', 'success'); 
                     
                     setTimeout(() => { fetchNotifications(); }, 2000);
                     setTimeout(() => { fetchNotifications(); }, 4000);
                }
            } catch (e) { console.error(e); } 
        };

        const getPipelineWidth = (status) => {
            const steps = { 
                'Applied': '16%', 'Shortlisted': '33%', 'Round 1': '50%', 
                'Round 2': '66%', 'Final Round': '83%', 'Accepted': '100%', 'Selected': '100%', 'Rejected': '100%' 
            };
            return steps[status] || '16%';
        };

        const todayStr = new Date().toISOString().split('T')[0];

        const appliedDriveIds = computed(() => {
            return studentState.applicationHistory.map(app => app.drive_id);
        });

        const availableDrives = computed(() => {
            return studentState.allDrives.filter(d => 
                d.start_date <= todayStr && 
                d.application_deadline >= todayStr && 
                !appliedDriveIds.value.includes(d.id)
            );
        });

        const upcomingDrives = computed(() => {
            return studentState.allDrives.filter(d => 
                d.start_date > todayStr && 
                !appliedDriveIds.value.includes(d.id)
            );
        });

        const expiredDrives = computed(() => {
            return studentState.allDrives.filter(d => 
                d.application_deadline < todayStr && 
                !appliedDriveIds.value.includes(d.id)
            );
        });

        const appliedDrives = computed(() => {
            return studentState.allDrives.filter(d => appliedDriveIds.value.includes(d.id)).map(d => {
                const appInfo = studentState.applicationHistory.find(a => a.drive_id === d.id);
                return { 
                    ...d, 
                    my_status: appInfo ? appInfo.status : 'Applied' 
                };
            });
        });

        const loadDashboard = async () => { 
            if (user.role === 'admin') fetchAdminData(); 
            if (user.role === 'company') { fetchMyDrives(); fetchCompanyAnalytics(); fetchNotifications(); }
            if (user.role === 'student') { fetchStudentData(); fetchNotifications(); } 
        };

        onMounted(() => { if (user.isAuthenticated) loadDashboard(); });

        return { 
            user, credentials, isRegistering, toggleAuthMode, authAction, logout, 
            modal, closeModal, confirmAction,
            notifications, showNotifModal, openNotifications, closeNotifModal, deleteNotification,
            adminState, updateStatus, fetchAdminData, toggleStudentBan, filteredAdminCompanies, filteredAdminStudents,
            companyState, createDrive, fetchApplicants, handleStatusChange, submitInterviewDetails, pipelineNew, pipelineInterviews, pipelineDecisions, triggerCompanyExport,
            studentState, updateProfile, applyForDrive, triggerExport, availableDrives, upcomingDrives, appliedDrives, expiredDrives, getPipelineWidth
        };
    },
    template: `
        <div class="d-flex flex-column min-vh-100 bg-light" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
            
            <nav class="navbar navbar-expand-lg navbar-light bg-white border-bottom py-3 sticky-top">
                <div class="container">
                    <span class="navbar-brand fw-bold fs-5 mb-0" style="color: #0f172a;">
                        <i class="bi bi-briefcase-fill text-primary me-2"></i>
                        CareerOrbit<span class="text-primary">.</span>
                    </span>
                    
                    <div class="d-flex align-items-center" v-if="user.isAuthenticated">
                        <button @click="openNotifications" class="btn btn-light border btn-sm me-3 position-relative rounded-3 px-3 fw-medium text-secondary">
                            <i class="bi bi-bell-fill me-1"></i> Alerts
                            
                            <span v-if="notifications && notifications.length > 0" 
                                  class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-2 border-white"
                                  style="font-size: 0.65rem;">
                                {{ notifications.length }}
                            </span>
                        </button>
                        
                        <span class="text-secondary me-4 small d-none d-md-block fw-medium">
                            {{ user.name }} <span class="badge bg-light border text-secondary ms-1 text-uppercase">{{ user.role }}</span>
                        </span>
                        
                        <button @click="logout" class="btn btn-outline-secondary btn-sm rounded-3 px-3 fw-medium">
                            Logout
                        </button>
                    </div>
                </div>
            </nav>

            <main class="container flex-grow-1 py-4">
                
                <div v-if="!user.isAuthenticated" class="row justify-content-center align-items-center mt-5">
                    <div class="col-md-5">
                        <div class="card border shadow-sm rounded-3 overflow-hidden">
                            <div class="card-header bg-white text-dark text-center py-4 border-bottom">
                                <h5 class="mb-0 fw-bold">{{ isRegistering ? 'Create Your Account' : 'Sign in to CareerOrbit' }}</h5>
                            </div>
                            
                            <div class="card-body p-4 p-md-5 bg-white">
                                <form @submit.prevent="authAction">
                                    
                                    <div v-if="isRegistering" class="mb-4 d-flex justify-content-center">
                                        <div class="btn-group w-100">
                                            <input type="radio" class="btn-check" name="role" id="role-student" value="student" v-model="credentials.role">
                                            <label class="btn border fw-medium" :class="credentials.role === 'student' ? 'btn-primary border-primary' : 'btn-light text-secondary'" for="role-student">Student</label>
                                            
                                            <input type="radio" class="btn-check" name="role" id="role-company" value="company" v-model="credentials.role">
                                            <label class="btn border fw-medium" :class="credentials.role === 'company' ? 'btn-primary border-primary' : 'btn-light text-secondary'" for="role-company">Company</label>
                                        </div>
                                    </div>

                                    <div class="mb-3">
                                        <label class="small fw-semibold text-secondary mb-1">Email Address</label>
                                        <input v-model="credentials.email" type="email" class="form-control bg-white border" required>
                                    </div>
                                    
                                    <div class="mb-4">
                                        <label class="small fw-semibold text-secondary mb-1">Password</label>
                                        <input v-model="credentials.password" type="password" class="form-control bg-white border" required>
                                    </div>

                                    <div v-if="isRegistering">
                                        <div class="mb-3">
                                            <label class="small fw-semibold text-secondary mb-1">{{ credentials.role === 'company' ? 'Company Name' : 'Full Name' }}</label>
                                            <input v-model="credentials.name" class="form-control bg-white border" required>
                                        </div>
                                        
                                        <div v-if="credentials.role === 'company'">
                                            <div class="mb-3">
                                                <label class="small fw-semibold text-secondary mb-1">HR Contact Person</label>
                                                <input v-model="credentials.hr_contact" class="form-control bg-white border" required>
                                            </div>
                                            <div class="mb-4">
                                                <label class="small fw-semibold text-secondary mb-1">Company Website</label>
                                                <input v-model="credentials.website" class="form-control bg-white border">
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <button class="btn btn-primary w-100 mb-3 rounded-3 fw-medium">
                                        {{ isRegistering ? 'Create Account' : 'Sign In' }}
                                    </button>
                                    
                                    <div class="text-center small">
                                        <a href="#" class="text-decoration-none text-primary fw-medium" @click.prevent="toggleAuthMode">
                                            {{ isRegistering ? 'Already have an account? Sign In' : 'New to CareerOrbit? Create an Account' }}
                                        </a>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-else>
                    
                    <div v-if="user.role === 'admin'">
                        <div class="mb-4 bg-white p-1 rounded-3 border d-inline-flex shadow-sm">
                            <button class="btn border-0 rounded-2 fw-medium px-4" :class="adminState.view === 'approvals' ? 'btn-light text-dark' : 'bg-transparent text-secondary'" @click="adminState.view = 'approvals'; fetchAdminData();">
                                Pending Approvals
                            </button>
                            <button class="btn border-0 rounded-2 fw-medium px-4" :class="adminState.view === 'directories' ? 'btn-light text-dark' : 'bg-transparent text-secondary'" @click="adminState.view = 'directories'">
                                Directories
                            </button>
                            <button class="btn border-0 rounded-2 fw-medium px-4" :class="adminState.view === 'analytics' ? 'btn-light text-dark' : 'bg-transparent text-secondary'" @click="adminState.view = 'analytics'">
                                Global Analytics
                            </button>
                        </div>
                        
                        <div v-if="adminState.view === 'approvals'" class="row">
                            <div class="col-md-6 mb-4">
                                <div class="card border rounded-3 shadow-none">
                                    <div class="card-header bg-light border-bottom py-3">
                                        <h6 class="fw-bold mb-0 text-dark">Pending Companies</h6>
                                    </div>
                                    <ul class="list-group list-group-flush">
                                        <li v-for="c in adminState.pendingCompanies" :key="c.id" class="list-group-item d-flex justify-content-between align-items-center py-3">
                                            <div>
                                                <strong class="d-block text-dark">{{ c.name }}</strong>
                                                <small class="text-secondary">{{ c.website }}</small>
                                            </div>
                                            <div class="d-flex gap-2">
                                                <button @click="updateStatus('company', c.id, 'Approved')" class="btn btn-sm btn-outline-success rounded-3 px-3 fw-medium">Approve</button>
                                                <button @click="updateStatus('company', c.id, 'Rejected')" class="btn btn-sm btn-outline-danger rounded-3 px-3 fw-medium">Reject</button>
                                            </div>
                                        </li>
                                        <li v-if="adminState.pendingCompanies.length === 0" class="list-group-item py-4 text-center text-secondary">
                                            No pending company registrations.
                                        </li>
                                    </ul>
                                </div>
                            </div>
                            
                            <div class="col-md-6 mb-4">
                                <div class="card border rounded-3 shadow-none">
                                    <div class="card-header bg-light border-bottom py-3">
                                        <h6 class="fw-bold mb-0 text-dark">Pending Job Drives</h6>
                                    </div>
                                    <ul class="list-group list-group-flush">
                                        <li v-for="d in adminState.pendingDrives" :key="d.id" class="list-group-item d-flex justify-content-between align-items-center py-3">
                                            <div>
                                                <strong class="d-block text-dark">{{ d.title }}</strong>
                                                <small class="text-secondary">Company ID: {{ d.company_id }}</small>
                                            </div>
                                            <div class="d-flex gap-2">
                                                <button @click="updateStatus('drive', d.id, 'Approved')" class="btn btn-sm btn-outline-success rounded-3 px-3 fw-medium">Approve</button>
                                                <button @click="updateStatus('drive', d.id, 'Rejected')" class="btn btn-sm btn-outline-danger rounded-3 px-3 fw-medium">Reject</button>
                                            </div>
                                        </li>
                                        <li v-if="adminState.pendingDrives.length === 0" class="list-group-item py-4 text-center text-secondary">
                                            No pending placement drives.
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div v-if="adminState.view === 'directories'" class="row">
                            <div class="col-md-6 mb-4">
                                <div class="card border rounded-3 shadow-none h-100">
                                    <div class="card-header bg-light border-bottom py-3 d-flex justify-content-between align-items-center">
                                        <h6 class="fw-bold mb-0 text-dark">Company Directory</h6>
                                        <input v-model="adminState.companySearch" type="text" class="form-control form-control-sm w-50 border rounded-2 shadow-none" placeholder="Search...">
                                    </div>
                                    <div class="card-body p-0" style="max-height: 600px; overflow-y: auto;">
                                        <div class="list-group list-group-flush">
                                            <div v-for="c in filteredAdminCompanies" :key="c.id" class="list-group-item p-3 border-bottom">
                                                <div class="d-flex justify-content-between align-items-center mb-2">
                                                    <strong class="mb-0 text-dark">{{ c.name }}</strong>
                                                    <span class="badge rounded-pill fw-normal" :class="c.status === 'Approved' ? 'bg-success bg-opacity-10 text-success' : 'bg-warning bg-opacity-10 text-warning'">{{ c.status }}</span>
                                                </div>
                                                <div class="d-flex gap-2 text-secondary small">
                                                    <span>Jobs: <strong>{{ c.stats.total_drives }}</strong></span> &bull;
                                                    <span>Apps: <strong>{{ c.stats.applied }}</strong></span> &bull;
                                                    <span>Int: <strong>{{ c.stats.interviews }}</strong></span> &bull;
                                                    <span>Hired: <strong>{{ c.stats.hired }}</strong></span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="col-md-6 mb-4">
                                <div class="card border rounded-3 shadow-none h-100">
                                    <div class="card-header bg-light border-bottom py-3 d-flex justify-content-between align-items-center">
                                        <h6 class="fw-bold mb-0 text-dark">Student Directory</h6>
                                        <input v-model="adminState.studentSearch" type="text" class="form-control form-control-sm w-50 border rounded-2 shadow-none" placeholder="Search...">
                                    </div>
                                    <div class="card-body p-0" style="max-height: 600px; overflow-y: auto;">
                                        <table class="table table-hover mb-0">
                                            <thead class="bg-light text-secondary small text-uppercase" style="font-size: 0.75rem;">
                                                <tr>
                                                    <th class="ps-3 fw-semibold">Student</th>
                                                    <th class="fw-semibold">Performance</th>
                                                    <th class="fw-semibold pe-3 text-end">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr v-for="s in filteredAdminStudents" :key="s.id">
                                                    <td class="ps-3 py-3">
                                                        <strong class="d-block text-dark small">{{ s.name }}</strong>
                                                        <small class="text-secondary d-block">{{ s.email }}</small>
                                                        <small class="text-primary fw-medium mt-1 d-block">CGPA: {{ s.cgpa }}</small>
                                                    </td>
                                                    <td class="py-3">
                                                        <small class="d-block text-secondary">Applied: {{ s.stats.applied }}</small>
                                                        <small class="d-block text-success fw-medium">Offers: {{ s.stats.offers }}</small>
                                                        <small class="d-block text-dark fw-medium">Max Sal: {{ s.stats.max_salary }} LPA</small>
                                                    </td>
                                                    <td class="align-middle pe-3 text-end">
                                                        <button @click="toggleStudentBan(s.id)" class="btn btn-sm rounded-3 fw-medium border" :class="s.is_active ? 'btn-light text-danger border-light' : 'btn-danger text-white'">
                                                            {{ s.is_active ? 'Suspend' : 'Unban' }}
                                                        </button>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div v-if="adminState.view === 'analytics' && adminState.globalAnalytics" class="row">
                            <div class="col-md-4 mb-4">
                                <div class="card bg-white border-start border-success border-4 rounded-3 shadow-sm h-100 p-4">
                                    <small class="text-uppercase fw-semibold text-secondary mb-1" style="font-size: 0.75rem;">Highest Package Secured</small>
                                    <h2 class="fw-bold text-dark mb-0">{{ adminState.globalAnalytics.highest_package }} <span class="fs-5 text-secondary fw-normal">LPA</span></h2>
                                </div>
                            </div>
                            <div class="col-md-4 mb-4">
                                <div class="card bg-white border-start border-primary border-4 rounded-3 shadow-sm h-100 p-4">
                                    <small class="text-uppercase fw-semibold text-secondary mb-1" style="font-size: 0.75rem;">Top Hiring Recruiter</small>
                                    <h2 class="fw-bold text-dark mb-0 text-truncate">{{ adminState.globalAnalytics.top_recruiter }}</h2>
                                </div>
                            </div>
                            <div class="col-md-4 mb-4">
                                <div class="card bg-white border-start border-info border-4 rounded-3 shadow-sm h-100 p-4">
                                    <small class="text-uppercase fw-semibold text-secondary mb-1" style="font-size: 0.75rem;">Global Placement Ratio</small>
                                    <h2 class="fw-bold text-dark mb-0">{{ adminState.globalAnalytics.placement_ratio }}%</h2>
                                </div>
                            </div>
                            
                            <div class="col-12">
                                <div class="card border shadow-sm rounded-3 p-4 bg-white">
                                    <h6 class="fw-bold text-dark border-bottom pb-3 mb-4">Campus Salary Distribution (LPA)</h6>
                                    <div style="height: 300px;">
                                        <canvas id="salaryDistChart"></canvas>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="user.role === 'company'">
                        <div class="mb-4 bg-white p-1 rounded-3 border d-inline-flex shadow-sm">
                            <button class="btn border-0 rounded-2 fw-medium px-4" :class="companyState.view === 'analytics' ? 'btn-light text-dark' : 'bg-transparent text-secondary'" @click="companyState.view = 'analytics'; companyState.currentDriveTitle = ''; companyState.currentDriveId = null;">Analytics Hub</button>
                            <button class="btn border-0 rounded-2 fw-medium px-4" :class="companyState.view === 'drives' ? 'btn-light text-dark' : 'bg-transparent text-secondary'" @click="companyState.view = 'drives'; companyState.currentDriveTitle = ''; companyState.currentDriveId = null;">Manage Drives</button>
                            <button class="btn border-0 rounded-2 fw-medium px-4" :class="companyState.view === 'pipeline' ? 'btn-light text-dark' : 'bg-transparent text-secondary'" @click="companyState.view = 'pipeline'; companyState.currentDriveTitle = ''; companyState.currentDriveId = null;">Applicant Pipeline</button>
                        </div>

                        <div v-if="companyState.view === 'analytics' && companyState.stats" class="row">
                            <div class="col-md-8 mb-4">
                                <div class="row h-100">
                                    <div class="col-md-6 mb-3">
                                        <div class="card border rounded-3 shadow-sm h-100 bg-white p-4 justify-content-center">
                                            <h2 class="text-primary fw-bold mb-1">{{ companyState.stats.total_applicants }}</h2>
                                            <span class="text-secondary fw-semibold text-uppercase" style="font-size: 0.75rem;">Total Resumes Received</span>
                                        </div>
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <div class="card border rounded-3 shadow-sm h-100 bg-white p-4 justify-content-center">
                                            <h2 class="text-success fw-bold mb-1">{{ companyState.stats.selected }}</h2>
                                            <span class="text-secondary fw-semibold text-uppercase" style="font-size: 0.75rem;">Candidates Hired</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-4 mb-4">
                                <div class="card border shadow-sm rounded-3 p-4 h-100 bg-white">
                                    <h6 class="fw-bold text-dark border-bottom pb-2 mb-3">Recruitment Funnel</h6>
                                    <div style="height: 200px;">
                                        <canvas id="companyFunnelChart"></canvas>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div v-if="companyState.view === 'drives'" class="row">
                            <div class="col-md-5 mb-4">
                                <div class="card border shadow-sm rounded-3 bg-white p-4">
                                    <h6 class="fw-bold mb-3 border-bottom pb-3 text-dark">Launch New Campaign</h6>
                                    <form @submit.prevent="createDrive">
                                        <div class="mb-3">
                                            <label class="small fw-semibold text-secondary mb-1">Job Title</label>
                                            <input v-model="companyState.newDrive.job_title" class="form-control bg-white border" required>
                                        </div>
                                        
                                        <div class="mb-3">
                                            <label class="small fw-semibold text-secondary mb-1">Job Description</label>
                                            <textarea v-model="companyState.newDrive.job_description" class="form-control bg-white border" rows="3" required></textarea>
                                        </div>
                                        
                                        <div class="mb-3">
                                            <label class="small fw-semibold text-secondary mb-1">Eligibility Criteria</label>
                                            <input v-model="companyState.newDrive.eligibility_criteria" class="form-control bg-white border" placeholder="e.g., B.Tech CS" required>
                                        </div>
                                        
                                        <div class="row mb-3">
                                            <div class="col-4">
                                                <label class="small fw-semibold text-secondary mb-1">Min CGPA</label>
                                                <input v-model="companyState.newDrive.min_cgpa" type="number" step="0.1" max="10" class="form-control bg-white border" required>
                                            </div>
                                            <div class="col-4">
                                                <label class="small fw-semibold text-secondary mb-1">Salary (LPA)</label>
                                                <input v-model="companyState.newDrive.salary" type="number" step="0.1" class="form-control bg-white border" required>
                                            </div>
                                            <div class="col-4">
                                                <label class="small fw-semibold text-secondary mb-1">Key Skills</label>
                                                <input v-model="companyState.newDrive.required_skills" class="form-control bg-white border" placeholder="Comma separated" required>
                                            </div>
                                        </div>
                                        
                                        <div class="row mb-4">
                                            <div class="col-6">
                                                <label class="small fw-semibold text-secondary mb-1">Start Date</label>
                                                <input v-model="companyState.newDrive.start_date" type="date" class="form-control bg-white border" required>
                                            </div>
                                            <div class="col-6">
                                                <label class="small fw-semibold text-secondary mb-1">End Date</label>
                                                <input v-model="companyState.newDrive.application_deadline" type="date" class="form-control bg-white border" required>
                                            </div>
                                        </div>
                                        
                                        <button class="btn btn-dark w-100 rounded-3 fw-medium py-2">Submit for Approval</button>
                                    </form>
                                </div>
                            </div>
                            
                            <div class="col-md-7 mb-4">
                                <div class="card border shadow-sm rounded-3 bg-white">
                                    <div class="card-header bg-white border-bottom py-3">
                                        <h6 class="fw-bold mb-0 text-dark">Active Campaigns</h6>
                                    </div>
                                    <ul class="list-group list-group-flush pb-2">
                                        <li v-for="d in companyState.myDrives" :key="d.id" class="list-group-item d-flex justify-content-between align-items-center p-4 border-bottom">
                                            <div>
                                                <strong class="d-block text-dark fw-bold mb-1">{{ d.title }}</strong>
                                                <div class="d-flex align-items-center gap-3 small">
                                                    <span class="text-secondary"><i class="bi bi-calendar me-1"></i>Ends: {{ d.deadline }}</span>
                                                    <span class="badge rounded-pill fw-normal" :class="d.status === 'Approved' ? 'bg-success bg-opacity-10 text-success' : 'bg-warning bg-opacity-10 text-warning'">{{ d.status }}</span>
                                                </div>
                                            </div>
                                            <button v-if="d.status === 'Approved'" @click="fetchApplicants(d.id, d.title)" class="btn btn-outline-dark rounded-3 px-3 py-1 fw-medium text-sm">
                                                Pipeline &rarr;
                                            </button>
                                        </li>
                                        <li v-if="companyState.myDrives.length === 0" class="list-group-item py-5 text-center text-secondary">
                                            No campaigns launched yet.
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div v-if="companyState.view === 'pipeline'" class="card border shadow-sm rounded-3 overflow-hidden bg-white">
                            <div class="card-header bg-light border-bottom p-4 d-flex justify-content-between align-items-center">
                                <div>
                                    <small class="text-uppercase fw-semibold text-secondary">ATS Pipeline</small>
                                    <h5 class="fw-bold text-dark mb-0">{{ companyState.currentDriveTitle || 'No Drive Selected' }}</h5>
                                </div>
                                <div v-if="companyState.currentDriveTitle" class="d-flex gap-2">
                                    <button @click="triggerCompanyExport" class="btn btn-sm btn-outline-success rounded-3 px-3 fw-medium"><i class="bi bi-download me-1"></i> Export Pipeline</button>
                                    <button class="btn btn-sm btn-outline-secondary rounded-3 px-3 fw-medium" @click="companyState.view = 'drives'; companyState.currentDriveTitle = ''; companyState.currentDriveId = null;">&larr; Back</button>
                                </div>
                                <div v-else>
                                    <button class="btn btn-sm btn-outline-secondary rounded-3 px-3 fw-medium" @click="companyState.view = 'drives'">&larr; Back</button>
                                </div>
                            </div>
                            
                            <div v-if="!companyState.currentDriveTitle" class="p-5 text-center text-secondary">
                                Please select 'Pipeline' from the Manage Drives tab.
                            </div>
                            
                            <div v-else class="card-body p-4 row bg-light bg-opacity-50">
                                <div class="col-md-4 mb-3">
                                    <h6 class="fw-semibold text-secondary mb-3 d-flex align-items-center">
                                        <span class="badge bg-secondary bg-opacity-25 text-dark rounded-pill me-2">{{ pipelineNew.length }}</span> Screening
                                    </h6>
                                    <div v-for="app in pipelineNew" :key="app.application_id" class="card mb-3 border shadow-sm rounded-3 border-top border-3 border-warning">
                                        <div class="card-body p-3">
                                            <strong class="d-block text-dark">{{ app.student_name }}</strong>
                                            <small class="text-secondary d-block mb-2">{{ app.student_email }}</small>
                                            <span class="badge bg-light border text-dark mb-3 fw-normal">{{ app.status }}</span>
                                            
                                            <div class="d-flex justify-content-between align-items-center gap-2">
                                                <a :href="app.resume_link" target="_blank" class="btn btn-sm btn-light border text-primary fw-medium py-1 px-2 rounded-2 flex-grow-1 text-center">Resume</a>
                                                <select class="form-select form-select-sm border shadow-none rounded-2 flex-grow-1" @change="handleStatusChange(app.application_id, $event)">
                                                    <option value="" disabled selected>Action...</option>
                                                    <option value="Shortlisted">Shortlist</option>
                                                    <option value="Round 1">Invite R1</option>
                                                    <option value="Rejected">Reject</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="col-md-4 mb-3">
                                    <h6 class="fw-semibold text-secondary mb-3 d-flex align-items-center">
                                        <span class="badge bg-info bg-opacity-25 text-dark rounded-pill me-2">{{ pipelineInterviews.length }}</span> Interviews
                                    </h6>
                                    <div v-for="app in pipelineInterviews" :key="app.application_id" class="card mb-3 border shadow-sm rounded-3 border-top border-3 border-info">
                                        <div class="card-body p-3">
                                            <strong class="d-block text-dark">{{ app.student_name }}</strong>
                                            <span class="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25 mb-2 fw-normal">{{ app.status }}</span>
                                            <small class="d-block text-secondary mb-3"><i class="bi bi-calendar me-1"></i> {{ app.interview_date }}</small>
                                            
                                            <select class="form-select form-select-sm border shadow-none rounded-2 w-100" @change="handleStatusChange(app.application_id, $event)">
                                                <option value="" disabled selected>Update Stage...</option>
                                                <option value="Round 2">Advance to R2</option>
                                                <option value="Final Round">Advance to Final</option>
                                                <option value="Selected">Hire Candidate</option>
                                                <option value="Rejected">Reject</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="col-md-4 mb-3">
                                    <h6 class="fw-semibold text-secondary mb-3 d-flex align-items-center">
                                        <span class="badge bg-dark bg-opacity-10 text-dark rounded-pill me-2">{{ pipelineDecisions.length }}</span> Decisions
                                    </h6>
                                    <div v-for="app in pipelineDecisions" :key="app.application_id" class="card mb-3 border shadow-sm rounded-3">
                                        <div class="card-body p-3 d-flex justify-content-between align-items-center" :class="app.status === 'Selected' ? 'bg-success bg-opacity-10' : 'bg-danger bg-opacity-10'">
                                            <strong class="d-block mb-0 text-dark">{{ app.student_name }}</strong>
                                            <span class="badge rounded-pill fw-normal" :class="app.status === 'Selected' ? 'bg-success' : 'bg-danger'">{{ app.status === 'Selected' ? 'Hired' : 'Rejected' }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="user.role === 'student'">
                        <div class="mb-4 d-flex flex-wrap justify-content-between align-items-center bg-white p-1 rounded-3 border shadow-sm gap-2">
                            <div class="d-flex">
                                <button class="btn border-0 rounded-2 fw-medium px-4" :class="studentState.view === 'jobs' ? 'btn-light text-dark' : 'bg-transparent text-secondary'" @click="studentState.view = 'jobs'">Job Board</button>
                                <button class="btn border-0 rounded-2 fw-medium px-4" :class="studentState.view === 'history' ? 'btn-light text-dark' : 'bg-transparent text-secondary'" @click="studentState.view = 'history'">My Pipeline</button>
                                <button class="btn border-0 rounded-2 fw-medium px-4" :class="studentState.view === 'profile' ? 'btn-light text-dark' : 'bg-transparent text-secondary'" @click="studentState.view = 'profile'">Profile</button>
                            </div>
                            <button @click="triggerExport" class="btn btn-outline-secondary btn-sm rounded-3 px-3 fw-medium me-1 bg-white">
                                <i class="bi bi-download me-1"></i> Export Data
                            </button>
                         </div>

                         <div v-if="studentState.view === 'jobs'" class="row">
                            <div class="col-md-8">
                                <h6 class="fw-bold mb-3 text-dark border-bottom pb-2 d-flex align-items-center">
                                    Open Opportunities <span class="badge bg-primary bg-opacity-10 text-primary rounded-pill ms-2 fw-normal">{{ availableDrives.length }}</span>
                                </h6>
                                
                                <div v-for="drive in availableDrives" :key="drive.id" class="card mb-4 shadow-sm border rounded-3">
                                    <div class="card-body p-4">
                                        <div class="d-flex justify-content-between align-items-start mb-3">
                                            <div>
                                                <h5 class="card-title fw-bold text-dark mb-1">{{ drive.job_title }}</h5>
                                                <h6 class="text-secondary fw-medium mb-0">{{ drive.company_name }}</h6>
                                            </div>
                                            <div class="text-end">
                                                <span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1 rounded-2 mb-2 fw-medium">Accepting Applications</span>
                                                <h5 class="fw-bold text-dark mb-0">{{ drive.salary }} <span class="text-secondary fs-6 fw-normal">LPA</span></h5>
                                            </div>
                                        </div>
                                        
                                        <p class="text-secondary small mb-4 lh-lg">{{ drive.job_description }}</p>
                                        
                                        <div class="bg-light p-3 rounded-2 mb-4 d-flex justify-content-between border">
                                            <div>
                                                <small class="d-block text-secondary fw-semibold text-uppercase" style="font-size: 0.65rem;">Min CGPA</small>
                                                <span class="text-dark fw-medium">{{ drive.min_cgpa }}+</span>
                                            </div>
                                            <div class="border-start ps-3">
                                                <small class="d-block text-secondary fw-semibold text-uppercase" style="font-size: 0.65rem;">Eligibility</small>
                                                <span class="text-dark fw-medium">{{ drive.eligibility_criteria }}</span>
                                            </div>
                                            <div class="border-start ps-3">
                                                <small class="d-block text-secondary fw-semibold text-uppercase" style="font-size: 0.65rem;">Key Skills</small>
                                                <span class="text-dark fw-medium">{{ drive.required_skills || 'Any' }}</span>
                                            </div>
                                        </div>
                                        
                                        <button @click="applyForDrive(drive)" class="btn btn-dark w-100 rounded-3 fw-medium py-2">Submit Application</button>
                                    </div>
                                </div>
                                
                                <div v-if="availableDrives.length === 0" class="text-center py-5 text-secondary border rounded-3 bg-white mb-4 shadow-sm">
                                    <p class="mb-0 fw-medium">No open jobs currently matching your profile.</p>
                                </div>

                                <div v-if="appliedDrives.length > 0">
                                    <h6 class="fw-bold mb-3 mt-5 text-dark border-bottom pb-2">Active Applications</h6>
                                    <div class="row">
                                        <div v-for="drive in appliedDrives" :key="'applied-'+drive.id" class="col-md-6 mb-3">
                                            <div class="card h-100 shadow-sm border rounded-3 bg-white">
                                                <div class="card-body p-3 d-flex flex-column">
                                                    <strong class="d-block text-dark">{{ drive.job_title }}</strong>
                                                    <small class="text-secondary d-block mb-3">{{ drive.company_name }}</small>
                                                    
                                                    <div class="mt-auto">
                                                        <div class="bg-light border rounded-2 px-2 py-1 mb-2 text-center">
                                                            <small class="text-secondary fw-semibold text-uppercase" style="font-size: 0.65rem;">Status</small>
                                                            <span class="d-block text-dark fw-medium small">{{ drive.my_status }}</span>
                                                        </div>
                                                        
                                                        <button @click="studentState.view = 'history'" class="btn btn-sm btn-outline-dark w-100 rounded-3 fw-medium">
                                                            View Pipeline
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="col-md-4">
                                <div class="card shadow-sm border rounded-3 mb-4 overflow-hidden">
                                    <div class="card-header bg-light border-bottom py-3">
                                        <h6 class="fw-bold text-dark mb-0">Upcoming Schedule</h6>
                                    </div>
                                    <div class="card-body p-0">
                                        <div v-for="drive in upcomingDrives" :key="'upcoming-'+drive.id" class="p-3 border-bottom bg-white">
                                            <strong class="d-block text-dark small">{{ drive.job_title }}</strong>
                                            <span class="text-secondary d-block mb-2" style="font-size: 0.8rem;">{{ drive.company_name }}</span>
                                            <span class="badge bg-light text-secondary border fw-normal"><i class="bi bi-calendar me-1"></i> {{ drive.start_date }}</span>
                                        </div>
                                        <div v-if="upcomingDrives.length === 0" class="p-4 text-center text-secondary small">No upcoming drives scheduled.</div>
                                    </div>
                                </div>

                                <div v-if="expiredDrives.length > 0" class="card shadow-sm border rounded-3 overflow-hidden bg-light bg-opacity-50">
                                    <div class="card-header bg-transparent border-bottom py-3">
                                        <h6 class="fw-bold text-secondary mb-0">Missed / Closed</h6>
                                    </div>
                                    <div class="card-body p-0">
                                        <div v-for="drive in expiredDrives" :key="'expired-'+drive.id" class="p-3 border-bottom text-secondary opacity-75">
                                            <strong class="d-block small">{{ drive.job_title }}</strong>
                                            <span class="d-block" style="font-size: 0.8rem;">{{ drive.company_name }}</span>
                                            <small class="text-danger mt-1 d-block" style="font-size: 0.75rem;">Closed: {{ drive.application_deadline }}</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                         </div>

                         <div v-if="studentState.view === 'history'" class="card shadow-sm border rounded-3 overflow-hidden bg-white p-0">
                            <div class="p-4 border-bottom bg-light">
                                <h5 class="fw-bold mb-0 text-dark">Application Pipeline</h5>
                            </div>
                            
                            <div class="p-4">
                                <div v-if="studentState.applicationHistory.length === 0" class="text-center py-5 text-secondary">
                                    You have no active applications in the pipeline.
                                </div>
                                
                                <div v-for="app in studentState.applicationHistory" :key="app.application_id" class="mb-5 pb-4 border-bottom">
                                    <div class="d-flex justify-content-between align-items-start mb-4">
                                        <div>
                                            <h5 class="fw-bold text-dark mb-1">{{ app.job_title }}</h5>
                                            <h6 class="text-secondary fw-medium">{{ app.company_name }}</h6>
                                        </div>
                                        <div class="text-end bg-light border px-3 py-2 rounded-2">
                                            <small class="text-secondary fw-semibold text-uppercase d-block mb-1" style="font-size: 0.65rem;">Applied On</small>
                                            <span class="text-dark small fw-medium">{{ app.applied_on }}</span>
                                        </div>
                                    </div>
                                    
                                    <div class="position-relative mt-5 pt-2 mb-2">
                                        <div class="progress position-absolute border" style="height: 4px; top: 12px; width: 100%; z-index: 1; background-color: #e2e8f0;">
                                            <div class="progress-bar" :class="app.status === 'Rejected' ? 'bg-danger' : 'bg-primary'" role="progressbar" :style="{ width: getPipelineWidth(app.status) }"></div>
                                        </div>
                                        
                                        <div class="d-flex justify-content-between position-relative" style="z-index: 2;">
                                            <div class="text-center" style="width: 60px;">
                                                <div class="rounded-circle mx-auto d-flex align-items-center justify-content-center fw-bold shadow-sm border border-2 border-white" :class="'bg-primary text-white'" style="width: 28px; height: 28px; font-size: 0.75rem;">✓</div>
                                                <small class="d-block mt-2 fw-medium text-primary" style="font-size: 0.7rem;">Applied</small>
                                            </div>
                                            
                                            <div class="text-center" style="width: 60px;">
                                                <div class="rounded-circle mx-auto d-flex align-items-center justify-content-center fw-bold shadow-sm border border-2 border-white" :class="['Shortlisted', 'Round 1', 'Round 2', 'Final Round', 'Accepted', 'Selected', 'Rejected'].includes(app.status) ? (app.status==='Rejected'?'bg-danger text-white':'bg-primary text-white') : 'bg-light text-secondary border'" style="width: 28px; height: 28px; font-size: 0.75rem;">2</div>
                                                <small class="d-block mt-2 fw-medium" :class="['Shortlisted', 'Round 1', 'Round 2', 'Final Round', 'Accepted', 'Selected', 'Rejected'].includes(app.status) ? (app.status==='Rejected'?'text-danger':'text-primary') : 'text-secondary'" style="font-size: 0.7rem;">Shortlist</small>
                                            </div>
                                            
                                            <div class="text-center" style="width: 60px;">
                                                <div class="rounded-circle mx-auto d-flex align-items-center justify-content-center fw-bold shadow-sm border border-2 border-white" :class="['Round 1', 'Round 2', 'Final Round', 'Accepted', 'Selected', 'Rejected'].includes(app.status) ? (app.status==='Rejected'?'bg-danger text-white':'bg-primary text-white') : 'bg-light text-secondary border'" style="width: 28px; height: 28px; font-size: 0.75rem;">3</div>
                                                <small class="d-block mt-2 fw-medium" :class="['Round 1', 'Round 2', 'Final Round', 'Accepted', 'Selected', 'Rejected'].includes(app.status) ? (app.status==='Rejected'?'text-danger':'text-primary') : 'text-secondary'" style="font-size: 0.7rem;">Round 1</small>
                                            </div>

                                            <div class="text-center" style="width: 60px;">
                                                <div class="rounded-circle mx-auto d-flex align-items-center justify-content-center fw-bold shadow-sm border border-2 border-white" :class="['Round 2', 'Final Round', 'Accepted', 'Selected', 'Rejected'].includes(app.status) ? (app.status==='Rejected'?'bg-danger text-white':'bg-primary text-white') : 'bg-light text-secondary border'" style="width: 28px; height: 28px; font-size: 0.75rem;">4</div>
                                                <small class="d-block mt-2 fw-medium" :class="['Round 2', 'Final Round', 'Accepted', 'Selected', 'Rejected'].includes(app.status) ? (app.status==='Rejected'?'text-danger':'text-primary') : 'text-secondary'" style="font-size: 0.7rem;">Round 2</small>
                                            </div>

                                            <div class="text-center" style="width: 60px;">
                                                <div class="rounded-circle mx-auto d-flex align-items-center justify-content-center fw-bold shadow-sm border border-2 border-white" :class="['Final Round', 'Accepted', 'Selected', 'Rejected'].includes(app.status) ? (app.status==='Rejected'?'bg-danger text-white':'bg-primary text-white') : 'bg-light text-secondary border'" style="width: 28px; height: 28px; font-size: 0.75rem;">5</div>
                                                <small class="d-block mt-2 fw-medium" :class="['Final Round', 'Accepted', 'Selected', 'Rejected'].includes(app.status) ? (app.status==='Rejected'?'text-danger':'text-primary') : 'text-secondary'" style="font-size: 0.7rem;">Final</small>
                                            </div>
                                            
                                            <div class="text-center" style="width: 60px;">
                                                <div v-if="app.status !== 'Rejected'" class="rounded-circle mx-auto d-flex align-items-center justify-content-center fw-bold shadow-sm border border-2 border-white" :class="app.status === 'Accepted' || app.status === 'Selected' ? 'bg-success text-white' : 'bg-light text-secondary border'" style="width: 28px; height: 28px; font-size: 0.75rem;">★</div>
                                                <div v-else class="rounded-circle bg-danger text-white mx-auto d-flex align-items-center justify-content-center fw-bold shadow-sm border border-2 border-white" style="width: 28px; height: 28px; font-size: 0.75rem;">X</div>
                                                <small class="d-block mt-2 fw-medium" :class="app.status === 'Accepted' || app.status === 'Selected' ? 'text-success' : (app.status === 'Rejected' ? 'text-danger' : 'text-secondary')" style="font-size: 0.7rem;">{{ app.status === 'Rejected' ? 'Rejected' : 'Hired' }}</small>
                                            </div>
                                        </div>
                                    </div>

                                    <div v-if="app.interview_link && app.status !== 'Selected' && app.status !== 'Rejected'" class="mt-4 p-4 bg-light border rounded-3 d-flex justify-content-between align-items-center">
                                        <div>
                                            <span class="badge bg-dark text-white mb-2 text-uppercase fw-normal" style="font-size: 0.65rem;">Action Required</span>
                                            <h6 class="fw-bold text-dark mb-1"><i class="bi bi-camera-video me-2 text-secondary"></i>{{ app.status }} Interview Scheduled</h6>
                                            <small class="text-secondary fw-medium">{{ app.interview_date }}</small>
                                        </div>
                                        <a :href="app.interview_link" target="_blank" class="btn btn-dark text-white fw-medium px-4 py-2 rounded-2 shadow-sm">
                                            Join Meeting
                                        </a>
                                    </div>
                                </div>
                            </div>
                         </div>

                         <div v-if="studentState.view === 'profile'" class="row justify-content-center">
                            <div class="col-md-8">
                                <div class="card shadow-sm border rounded-3">
                                    <div class="card-header bg-light py-4 border-bottom">
                                        <h5 class="mb-1 fw-bold text-dark">Professional Profile</h5>
                                        <small class="text-secondary">Please ensure your details match your resume accurately.</small>
                                    </div>
                                    <div class="card-body p-4 p-md-5">
                                        <form @submit.prevent="updateProfile">
                                            <div class="mb-3">
                                                <label class="small fw-semibold text-secondary mb-2">Full Name</label>
                                                <input v-model="studentState.profile.name" class="form-control bg-white border" required>
                                            </div>
                                            
                                            <div class="mb-3">
                                                <label class="small fw-semibold text-secondary mb-2">Email Address</label>
                                                <input v-model="studentState.profile.email" class="form-control bg-light border text-secondary" disabled>
                                            </div>
                                            
                                            <div class="row mb-3">
                                                <div class="col-md-6">
                                                    <label class="small fw-semibold text-secondary mb-2">Current Marks / CGPA (Max 10)</label>
                                                    <input v-model="studentState.profile.cgpa" type="number" step="0.01" min="5" max="10" class="form-control bg-white border" placeholder="e.g. 8.5" required>
                                                </div>
                                            </div>
                                            
                                            <div class="mb-3">
                                                <label class="small fw-semibold text-secondary mb-2">Degree, Branch & Key Skills</label>
                                                <input v-model="studentState.profile.skills" class="form-control bg-white border" placeholder="B.Tech CS, Python, Vue.js" required>
                                            </div>
                                            
                                            <div class="mb-4">
                                                <label class="small fw-semibold text-secondary mb-2">Resume URL Link</label>
                                                <input v-model="studentState.profile.resume_link" type="url" class="form-control bg-white border border-start border-3 border-primary" placeholder="https://drive.google.com/..." required>
                                            </div>
                                            
                                            <button class="btn btn-dark w-100 rounded-3 py-2 fw-medium shadow-sm">
                                                Save Profile Changes
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </div>
                         </div>
                    </div>
                </div>
            </main>

            <footer class="bg-white border-top py-4 mt-auto">
                <div class="container d-flex flex-column flex-md-row justify-content-between align-items-center">
                    <span class="text-secondary small fw-medium mb-2 mb-md-0">
                        &copy; 2026 CareerOrbit. All rights reserved.
                    </span>
                    <div class="d-flex gap-3 small fw-medium">
                        <a href="#" class="text-secondary text-decoration-none">Privacy Policy</a>
                        <a href="#" class="text-secondary text-decoration-none">Terms of Service</a>
                        <a href="#" class="text-secondary text-decoration-none">Help Center</a>
                    </div>
                </div>
            </footer>

            <div v-if="modal.isVisible" class="modal fade show" style="display: block; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(2px); z-index: 1050;">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow rounded-3 overflow-hidden">
                        <div class="modal-header border-bottom px-4 py-3 bg-light d-flex align-items-center">
                            <h6 class="modal-title fw-bold text-dark mb-0">{{modal.title}}</h6>
                            <button class="btn-close shadow-none" @click="closeModal"></button>
                        </div>
                        <div class="modal-body p-4 text-center bg-white">
                            <p class="mb-0 text-dark">{{modal.message}}</p>
                        </div>
                        <div class="modal-footer border-top bg-light p-3 d-flex justify-content-center">
                            <button v-if="modal.onConfirm" class="btn btn-light border text-secondary px-4 rounded-2 fw-medium me-2" @click="closeModal">Cancel</button>
                            <button class="btn px-4 rounded-2 shadow-sm fw-medium" :class="'btn-'+modal.type" @click="confirmAction">Confirm</button>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="showNotifModal" class="modal fade show" style="display: block; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(2px); z-index: 1055;">
                <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content border-0 shadow rounded-3 overflow-hidden">
                        <div class="modal-header bg-white border-bottom px-4 py-3">
                            <h6 class="modal-title fw-bold text-dark mb-0">
                                <i class="bi bi-bell text-secondary me-2"></i>Notifications
                            </h6>
                            <button class="btn-close shadow-none" @click="closeNotifModal"></button>
                        </div>
                        
                        <div class="modal-body p-0 bg-light">
                            <div v-if="!notifications || notifications.length === 0" class="text-center text-secondary py-5">
                                <p class="mb-0 fw-medium">No new alerts right now.</p>
                            </div>
                            
                            <div class="list-group list-group-flush">
                                <div v-for="n in notifications" :key="n.id" class="list-group-item bg-white px-4 py-3 border-bottom">
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <small class="text-secondary fw-semibold" style="font-size: 0.7rem;">{{ n.date }}</small>
                                        <button @click="deleteNotification(n.id)" class="btn-close btn-close-sm shadow-none" style="font-size: 0.6rem;"></button>
                                    </div>
                                    <p class="mb-2 text-dark fs-6">{{ n.message }}</p>
                                    <a v-if="n.action_link" :href="n.action_link" target="_blank" class="btn btn-sm btn-outline-dark rounded-2 px-3 fw-medium mt-1">
                                        Download File <i class="bi bi-download ms-1"></i>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="companyState.interviewPrompt.isVisible" class="modal fade show" style="display: block; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(2px); z-index: 1060;">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow rounded-3 overflow-hidden">
                        <div class="modal-header bg-light border-bottom px-4 py-3">
                            <h6 class="modal-title fw-bold text-dark mb-0">Schedule {{ companyState.interviewPrompt.newStatus }}</h6>
                            <button class="btn-close shadow-none" @click="companyState.interviewPrompt.isVisible = false"></button>
                        </div>
                        <div class="modal-body p-4 bg-white">
                            <p class="small text-secondary mb-4">Provide meeting details to automatically notify the candidate via their dashboard.</p>
                            
                            <label class="small fw-semibold text-secondary mb-1">Meeting Link / Test URL</label>
                            <input v-model="companyState.interviewPrompt.link" type="url" class="form-control bg-white border mb-3" placeholder="https://meet.google.com/..." required>
                            
                            <label class="small fw-semibold text-secondary mb-1">Date & Time</label>
                            <input v-model="companyState.interviewPrompt.date" type="text" class="form-control bg-white border mb-2" placeholder="e.g. Monday, Oct 15th at 2:00 PM" required>
                        </div>
                        <div class="modal-footer border-top bg-light p-3 d-flex justify-content-between">
                            <button class="btn btn-light border text-secondary px-4 rounded-2 fw-medium" @click="companyState.interviewPrompt.isVisible = false">Cancel</button>
                            <button class="btn btn-dark text-white px-4 rounded-2 shadow-sm fw-medium" @click="submitInterviewDetails">Send Invite</button>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    `
};

const app = createApp(App);
app.mount('#app');