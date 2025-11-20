import { supabase } from './supabaseClient.js';

/* =========================================================================
   START: Local Cache and State
   ========================================================================= */

let users = [];
let attendance = [];
let dashboardStats = {
  total_users: 0,
  today_attendance: 0,
  active_plans: 89,
  revenue: '$12,450'
};
let attendanceTrend = [];

let currentView = 'dashboard';
let editingUserId = null;
let deleteTarget = null;
let attendanceChart = null;

/* =========================================================================
   END: Local Cache and State
   ========================================================================= */


/* =========================================================================
   START: DOM Elements
   ========================================================================= */

const hamburger = document.getElementById('hamburger');
const sidebar = document.getElementById('sidebar');
const sidebarLinks = document.querySelectorAll('.sidebar-link');
const views = document.querySelectorAll('.view');
const logoutBtn = document.getElementById('logoutBtn');
const sidebarLogout = document.getElementById('sidebarLogout');

const userModal = document.getElementById('userModal');
const attendanceModal = document.getElementById('attendanceModal');
const deleteModal = document.getElementById('deleteModal');

const userSearch = document.getElementById('userSearch');
const attendanceDate = document.getElementById('attendanceDate');
const attendanceSearch = document.getElementById('attendanceSearch');
const usersTableBody = document.getElementById('usersTableBody');
const attendanceTableBody = document.getElementById('attendanceTableBody');
const recentAttendanceTable = document.getElementById('recentAttendanceTable');

/* =========================================================================
   END: DOM Elements
   ========================================================================= */


/* =========================================================================
   START: Utilities
   ========================================================================= */

function showToast(message) {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  if (!toast || !toastMessage) return;

  toastMessage.textContent = message;
  toast.classList.add('active');

  setTimeout(() => toast.classList.remove('active'), 3000);
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d)) return dateString;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(timeString) {
  if (!timeString) return '--';
  if (timeString.includes('AM') || timeString.includes('PM')) return timeString;
  try {
    const parts = timeString.split(':');
    if (parts.length < 2) return timeString;
    let hour = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${minutes} ${ampm}`;
  } catch (e) {
    return timeString;
  }
}

function getStatusClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'present': return 'success';
    case 'absent': return 'warning';
    case 'admin':
    case 'trainer': return 'info';
    case 'active': return 'success';
    default: return 'info';
  }
}

/* =========================================================================
   END: Utilities
   ========================================================================= */


/* =========================================================================
   START: Supabase Data Functions
   ========================================================================= */

async function fetchUsers() {
  try {
    const { data, error } = await supabase
      .from('gym_users')
      .select('id, email, full_name, phone, role, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    users = (data || []).map(u => ({
      id: u.id,
      name: u.full_name || '',
      email: u.email || '',
      phone: u.phone || '',
      role: u.role || 'Member',
      status: 'Active',
      joined: u.created_at ? u.created_at.split('T')[0] : ''
    }));
  } catch (err) {
    console.error('fetchUsers Error', err);
    showToast('Failed to load users from Supabase.');
  }
}

async function fetchAttendanceByDate(dateISO) {
  try {
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        id,
        user_id,
        date,
        status,
        check_in,
        check_out,
        duration,
        gym_users ( full_name )
      `)
      .eq('date', dateISO)
      .order('created_at', { ascending: false });

    if (error) throw error;

    attendance = (data || []).map(row => ({
      id: row.id,
      user_id: row.user_id,
      user_name: (row.gym_users && row.gym_users.full_name) || 'Unknown',
      date: row.date,
      check_in: row.check_in || '',
      check_out: row.check_out || '',
      duration: row.duration || '',
      status: row.status
    }));
  } catch (err) {
    console.error('fetchAttendanceByDate Error', err);
    showToast('Failed to load attendance.');
    attendance = [];
  }
}

async function deleteAttendanceFromDB(attId) {
  try {
    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('id', attId);

    if (error) throw error;
    showToast('Attendance record deleted.');
    renderAttendanceTable();
  } catch (err) {
    console.error('deleteAttendanceFromDB Error', err);
    showToast('Failed to delete attendance.');
  }
}

async function upsertAttendanceRecords(records) {
  try {
    if (!Array.isArray(records)) records = [records];

    const invalid = records.find(r => !r.user_id || !r.date);
    if (invalid) {
      showToast('Developer: Invalid attendance record (missing user_id/date).');
      return { success: false, error: 'invalid_record' };
    }

    const payload = records.map(r => ({
      user_id: r.user_id,
      date: r.date,
      status: r.status || 'absent',
      check_in: r.check_in || null,
      check_out: r.check_out || null,
      duration: r.duration || null
    }));

    const { error } = await supabase
      .from('attendance')
      .upsert(payload, { onConflict: ['user_id', 'date'] });

    if (error) {
      console.error('Supabase upsert Error:', error);
      showToast('Failed to save attendance (DB error).');
      return { success: false, error: error };
    }

    return { success: true };
  } catch (err) {
    console.error('upsertAttendanceRecords Exception:', err);
    showToast('Unexpected error while saving attendance.');
    return { success: false, error: err };
  }
}
/* =========================================================================
   END: Supabase Data Functions
   ========================================================================= */


/* =========================================================================
   START: Dashboard & Chart Logic
   ========================================================================= */

async function fetchDashboardStats() {
  try {
    const { count: totalUsers, error: userErr } = await supabase
      .from('gym_users')
      .select('id', { count: 'exact', head: true });
    if (userErr) throw userErr;

    const today = new Date().toISOString().split('T')[0];
    const { count: todayCount, error: todayErr } = await supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('date', today)
      .eq('status', 'present');
    if (todayErr) throw todayErr;

    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const display = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const { count, error } = await supabase
        .from('attendance')
        .select('id', { count: 'exact', head: true })
        .eq('date', dateStr)
        .eq('status', 'present');

      if (error) trend.push({ date: display, count: 0 });
      else trend.push({ date: display, count: count || 0 });
    }

    dashboardStats.total_users = totalUsers || 0;
    dashboardStats.today_attendance = todayCount || 0;
    attendanceTrend.length = 0;
    attendanceTrend.push(...trend);
  } catch (err) {
    console.warn('fetchDashboardStats Error', err);
  }
}

function initializeChart() {
  const ctx = document.getElementById('attendanceChart');
  if (!ctx) return;

  if (attendanceChart) attendanceChart.destroy();

  attendanceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: attendanceTrend.map(d => d.date),
      datasets: [{
        label: 'Daily Attendance',
        data: attendanceTrend.map(d => d.count),
        borderColor: '#ff4545',
        backgroundColor: 'rgba(255, 69, 69, 0.1)',
        tension: 0.4,
        fill: true,
        pointStyle: 'circle',
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
}

function updateDashboardUI() {
  document.getElementById('statTotalUsers').textContent = dashboardStats.total_users;
  document.getElementById('statTodayAttendance').textContent = dashboardStats.today_attendance;
  document.getElementById('statActivePlans').textContent = dashboardStats.active_plans;
  document.getElementById('statRevenue').textContent = dashboardStats.revenue;

  const tbody = recentAttendanceTable;
  if (!tbody) return;

  const rows = attendance.slice(0, 5);
  tbody.innerHTML = rows.map(record => `
    <tr>
      <td>${record.user_name}</td>
      <td>${formatDate(record.date)}</td>
      <td>${formatTime(record.check_in)}</td>
      <td>${formatTime(record.check_out)}</td>
      <td>${record.duration || '--'}</td>
      <td><span class="status-badge ${getStatusClass(record.status)}">${record.status}</span></td>
    </tr>
  `).join('');
}
/* =========================================================================
   END: Dashboard & Chart Logic
   ========================================================================= */


/* =========================================================================
   START: Navigation and Logout
   ========================================================================= */

function initializeNavigation() {

  /* >>> FIXED HAMBURGER MENU <<< */
  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    sidebar.classList.toggle('active');   // THE FIX
  });

  sidebarLinks &&
    sidebarLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.dataset.view;
        renderView(view);
        sidebar.classList.remove('active');
      });
    });

  logoutBtn?.addEventListener('click', handleLogout);
  sidebarLogout?.addEventListener('click', handleLogout);
}

function renderView(viewName) {
  currentView = viewName;

  sidebarLinks.forEach(link => {
    if (link.dataset.view === viewName) link.classList.add('active');
    else link.classList.remove('active');
  });

  views.forEach(view => {
    if (view.id === `${viewName}View`) view.classList.add('active');
    else view.classList.remove('active');
  });

  if (viewName === 'dashboard') {
    (async () => {
        const today = new Date().toISOString().split('T')[0];
        await fetchAttendanceByDate(today);
        updateDashboardUI();
        initializeChart();
    })();
} else if (viewName === 'users') {
    renderUsersTable();
  } else if (viewName === 'attendance') {
    renderAttendanceTable();
  }
}

async function handleLogout() {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Logout Error:', error);
      showToast('Logout failed. Check console.');
      return;
    }

    showToast('Successfully logged out.');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 600);
  } catch (err) {
    console.error('Unexpected logout error:', err);
    showToast('Unexpected error during logout.');
  }
}
/* =========================================================================
   END: Navigation and Logout
   ========================================================================= */


/* =========================================================================
   START: Users Management Logic
   ========================================================================= */

function initializeUsers() {
  const addUserBtn = document.getElementById('addUserBtn');

  if (addUserBtn) {
    addUserBtn.disabled = true;
    addUserBtn.title = 'User creation is disabled in this admin panel';
  }

  userSearch?.addEventListener('input', (e) => renderUsersTable(e.target.value));
  renderUsersTable();
}

function renderUsersTable(searchTerm = '') {
  if (!usersTableBody) return;

  const filtered = users.filter(u => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (u.name || '').toLowerCase().includes(term) ||
      (u.email || '').toLowerCase().includes(term) ||
      (u.phone || '').includes(term)
    );
  });

  usersTableBody.innerHTML = filtered.map(u => `
    <tr>
      <td>${u.id}</td>
      <td>${u.name}</td>
      <td>${u.email}</td>
      <td>${u.phone}</td>
      <td><span class="status-badge info">${u.role}</span></td>
      <td><span class="status-badge ${u.status === 'Active' ? 'success' : 'warning'}">${u.status}</span></td>
      <td>
        <button class="btn btn--outline btn--sm btn-icon" onclick="window.editUser('${u.id}')" title="Edit">✏️</button>
        <button class="btn btn--outline btn--sm btn-icon" disabled title="Delete is disabled">🗑️</button>
      </td>
    </tr>
  `).join('');
}

window.editUser = function(userId) {
  openUserModal(userId);
};
/* =========================================================================
   END: Users Management Logic
   ========================================================================= */


/* =========================================================================
   START: Attendance Management Logic
   ========================================================================= */

function initializeAttendanceUI() {
  const markAttendanceBtn = document.getElementById('markAttendanceBtn');

  if (attendanceDate) attendanceDate.valueAsDate = new Date();

  markAttendanceBtn?.addEventListener('click', () => {
    deleteTarget = null;
    openAttendanceModal();
  });

  attendanceDate?.addEventListener('change', () => renderAttendanceTable());
  attendanceSearch?.addEventListener('input', () => renderAttendanceTable());
}

async function renderAttendanceTable() {
  if (!attendanceTableBody) return;

  const dateFilter = attendanceDate.value;
  const searchTerm = (attendanceSearch.value || '').toLowerCase();

  if (!dateFilter) {
    attendanceTableBody.innerHTML = '<tr><td colspan="8">Select a date to load attendance.</td></tr>';
    attendance = [];
    return;
  }

  await fetchAttendanceByDate(dateFilter);

  let filtered = attendance;

  if (searchTerm) {
    filtered = filtered.filter(a =>
      (a.user_name || '').toLowerCase().includes(searchTerm)
    );
  }

  if (!filtered.length) {
    attendanceTableBody.innerHTML = '<tr><td colspan="8">No attendance records for this date.</td></tr>';
    return;
  }

  attendanceTableBody.innerHTML = filtered.map(record => `
    <tr>
      <td>${record.id}</td>
      <td>${record.user_name}</td>
      <td>${formatDate(record.date)}</td>
      <td>${formatTime(record.check_in)}</td>
      <td>${formatTime(record.check_out)}</td>
      <td>${record.duration || '--'}</td>
      <td><span class="status-badge ${getStatusClass(record.status)}">${record.status}</span></td>
      <td>
        <button class="btn btn--outline btn--sm btn-icon" onclick="window.confirmDeleteAttendance('${record.id}')" title="Delete">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function calculateDuration() {
  const checkIn = document.getElementById('checkInTime').value;
  const checkOut = document.getElementById('checkOutTime').value;
  const display = document.getElementById('durationDisplay');

  if (checkIn && checkOut) {
    const start = new Date(`2000-01-01 ${checkIn}`);
    const end = new Date(`2000-01-01 ${checkOut}`);
    const diff = end - start;

    if (diff > 0) {
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      display.textContent = `${hours}h ${remainingMinutes}m`;
    } else {
      display.textContent = 'Invalid time range';
    }
  } else {
    display.textContent = '--';
  }
}
/* =========================================================================
   END: Attendance Management Logic
   ========================================================================= */


/* =========================================================================
   START: Modal Logic
   ========================================================================= */

function initializeModals() {
  document.getElementById('userModalClose')?.addEventListener('click', closeUserModal);
  document.getElementById('userModalOverlay')?.addEventListener('click', closeUserModal);
  document.getElementById('userModalCancel')?.addEventListener('click', closeUserModal);
  document.getElementById('userModalSave')?.addEventListener('click', saveUser);

  document.getElementById('attendanceModalClose')?.addEventListener('click', closeAttendanceModal);
  document.getElementById('attendanceModalOverlay')?.addEventListener('click', closeAttendanceModal);
  document.getElementById('attendanceModalCancel')?.addEventListener('click', closeAttendanceModal);
  document.getElementById('attendanceModalSave')?.addEventListener('click', saveAttendanceFromModal);

  document.getElementById('deleteModalClose')?.addEventListener('click', closeDeleteModal);
  document.getElementById('deleteModalOverlay')?.addEventListener('click', closeDeleteModal);
  document.getElementById('deleteModalCancel')?.addEventListener('click', closeDeleteModal);
  document.getElementById('deleteModalConfirm')?.addEventListener('click', confirmDelete);
}

function openUserModal(userId = null) {
  const title = document.getElementById('userModalTitle');
  const form = document.getElementById('userForm');
  if (!userModal || !form) return;
  form.reset();

  if (userId) {
    const user = users.find(u => u.id === userId);
    if (user) {
      title.textContent = 'Edit User';
      document.getElementById('userId').value = user.id;
      document.getElementById('userName').value = user.name;
      document.getElementById('userEmail').value = user.email;
      document.getElementById('userPhone').value = user.phone;
      document.getElementById('userRole').value = user.role;
      document.getElementById('userStatus').value = user.status;
      editingUserId = userId;
    }
  }

  userModal.classList.add('active');
}

function closeUserModal() {
  if (userModal) userModal.classList.remove('active');
  editingUserId = null;
}

async function saveUser() {
  const form = document.getElementById('userForm');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const name = document.getElementById('userName').value;
  const email = document.getElementById('userEmail').value;
  const phone = document.getElementById('userPhone').value;
  const role = document.getElementById('userRole').value;

  try {
    if (!editingUserId) {
      showToast('User creation is disabled in this admin panel.');
      return;
    }

    const { error } = await supabase
      .from('gym_users')
      .update({ full_name: name, phone: phone, role: role, email: email })
      .eq('id', editingUserId);

    if (error) throw error;

    await fetchUsers();
    renderUsersTable();
    closeUserModal();
    showToast('User updated successfully!');
  } catch (err) {
    console.error('saveUser Error', err);
    showToast('Failed to save user.');
  }
}

function openAttendanceModal() {
  const form = document.getElementById('attendanceForm');
  if (!attendanceModal || !form) return;
  form.reset();

  const userSelect = document.getElementById('attendanceUser');
  if (userSelect) {
    userSelect.innerHTML =
      '<option value="">Choose a user</option>' +
      users
        .filter(u => u.status === 'Active')
        .map(u => `<option value="${u.id}">${u.name}</option>`)
        .join('');
  }

  let markAllRow = document.getElementById('attendanceMarkAllRow');
  if (!markAllRow) {
    const formElement = document.getElementById('attendanceForm');
    markAllRow = document.createElement('div');
    markAllRow.className = 'form-group';
    markAllRow.id = 'attendanceMarkAllRow';
    markAllRow.innerHTML = `
      <label class="form-label">
        <input type="checkbox" id="markAllUsers" /> Mark attendance for ALL active users
      </label>
    `;
    formElement.querySelector('input[type="hidden"]')?.insertAdjacentElement('afterend', markAllRow);
  }

  const topDate = attendanceDate.value;
  const formDate = document.getElementById('attendanceFormDate');
  if (formDate) formDate.value = topDate || new Date().toISOString().split('T')[0];

  document.getElementById('checkInTime').value = '';
  document.getElementById('checkOutTime').value = '';
  document.getElementById('durationDisplay').textContent = '--';

  const checkInTime = document.getElementById('checkInTime');
  const checkOutTime = document.getElementById('checkOutTime');
  checkInTime.removeEventListener('change', calculateDuration);
  checkOutTime.removeEventListener('change', calculateDuration);
  checkInTime.addEventListener('change', calculateDuration);
  checkOutTime.addEventListener('change', calculateDuration);

  attendanceModal.classList.add('active');
}

function closeAttendanceModal() {
  if (attendanceModal) attendanceModal.classList.remove('active');
}

async function saveAttendanceFromModal() {
  try {
    const form = document.getElementById('attendanceForm');
    if (!form) return;

    const date = document.getElementById('attendanceFormDate').value;
    const status = document.getElementById('attendanceStatus').value || 'absent';
    const checkIn = document.getElementById('checkInTime').value || null;
    const checkOut = document.getElementById('checkOutTime').value || null;
    const duration = document.getElementById('durationDisplay').textContent || null;

    if (!date) {
      showToast('Select a date.');
      return;
    }

    const markAll = document.getElementById('markAllUsers').checked;

    if (markAll) {
      const activeUsers = users.filter(u => u.status === 'Active');

      const records = activeUsers.map(u => ({
        user_id: u.id,
        date,
        status,
        check_in: checkIn,
        check_out: checkOut,
        duration
      }));

      const res = await upsertAttendanceRecords(records);
      if (!res.success) throw new Error('Bulk save failed.');

      showToast(`Saved attendance for ${records.length} users.`);
    } else {
      const userId = document.getElementById('attendanceUser').value;
      if (!userId) {
        showToast('Select a user.');
        return;
      }

      const rec = {
        user_id: userId,
        date,
        status,
        check_in: checkIn,
        check_out: checkOut,
        duration
      };

      const res = await upsertAttendanceRecords(rec);
      if (!res.success) throw new Error('Single save failed.');
      showToast('Attendance saved.');
    }

    await fetchAttendanceByDate(date);
    renderAttendanceTable();
    closeAttendanceModal();

  } catch (err) {
    console.error(err);
    showToast('Error saving attendance.');
  }
}

window.confirmDeleteAttendance = function (attendanceId) {
  deleteTarget = { type: 'attendance', id: attendanceId };
  document.getElementById('deleteMessage').textContent =
    'Are you sure you want to delete this attendance record?';
  deleteModal.classList.add('active');
};

async function confirmDelete() {
  if (!deleteTarget) return closeDeleteModal();
  if (deleteTarget.type === 'attendance') {
    await deleteAttendanceFromDB(deleteTarget.id);
  } else if (deleteTarget.type === 'user') {
    showToast('Deleting users is disabled from this admin panel.');
  }
  closeDeleteModal();
  await fetchDashboardStats();
}

function closeDeleteModal() {
  if (deleteModal) deleteModal.classList.remove('active');
  deleteTarget = null;
}
/* =========================================================================
   END: Modal Logic
   ========================================================================= */


/* =========================================================================
   START: Initialization
   ========================================================================= */

async function boot() {
  initializeNavigation();
  initializeModals();
  initializeAttendanceUI();

  await fetchUsers();
  await fetchDashboardStats();

  initializeChart();
  renderView('dashboard');

  renderAttendanceTable();
}

document.addEventListener('DOMContentLoaded', boot);

/* =========================================================================
   END: Initialization
   ========================================================================= */