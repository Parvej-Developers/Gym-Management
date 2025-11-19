import { supabase } from './supabaseClient.js';

/* =========================================================================
   START: DOM Elements
   ========================================================================= */

const hamburger = document.getElementById('hamburger');
const sidebar = document.getElementById('sidebar');
const closeSidebar = document.getElementById('closeSidebar');
const sidebarLinks = document.querySelectorAll('.sidebar-link');
const views = document.querySelectorAll('.view');
const logoutBtn = document.getElementById('logoutBtn');
const toast = document.getElementById('toast');

const headerUserName = document.getElementById('headerUserName');
const userInitials = document.getElementById('userInitials');
const profileInitials = document.getElementById('profileInitials');
const profileName = document.getElementById('profileName');
const profileEmail = document.getElementById('profileEmail');
const profilePhone = document.getElementById('profilePhone');
const profileJoinedAt = document.getElementById('profileJoinedAt');
const fullName = document.getElementById('fullName');
const emailAddress = document.getElementById('emailAddress');
const phoneNumber = document.getElementById('phoneNumber');
const joinedAtFull = document.getElementById('joinedAtFull');

const updateForm = document.getElementById('updateForm');
const cancelBtn = document.getElementById('cancelBtn');
const updateName = document.getElementById('updateName');
const updateEmail = document.getElementById('updateEmail');
const updatePhone = document.getElementById('updatePhone');
const updateAddress = document.getElementById('updateAddress');

const myPlanContainer = document.getElementById("myPlanContainer");

const totalDays = document.getElementById('totalDays');
const presentDays = document.getElementById('presentDays');
const absentDays = document.getElementById('absentDays');
const attendanceRate = document.getElementById('attendanceRate');
const attendanceBody = document.getElementById('attendanceBody');

/* =========================================================================
   END: DOM Elements
   ========================================================================= */

/* =========================================================================
   START: State Management
   ========================================================================= */

let currentUser = null;
let userProfile = null;
let attendanceRecords = [];
let attendanceChannel = null;

/* =========================================================================
   END: State Management
   ========================================================================= */

/* =========================================================================
   START: Utilities
   ========================================================================= */

function showToast(message, type = 'info') {
  if (toast) {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  } else {
    console[type === 'error' ? 'error' : 'log']('[TOAST]', message);
  }
}

function getInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const d = new Date(dateString);
  if (isNaN(d)) return dateString;
  return d.toLocaleDateString();
}

function formatFullDate(dateString) {
  if (!dateString) return 'N/A';
  const d = new Date(dateString);
  if (isNaN(d)) return dateString;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatTime(timeString) {
  if (!timeString) return '-';
  const t = String(timeString);
  return t.length >= 5 ? t.slice(0, 5) : t;
}

/* =========================================================================
   END: Utilities
   ========================================================================= */

/* =========================================================================
   START: Navigation and View Management
   ========================================================================= */

hamburger?.addEventListener('click', () => sidebar?.classList.toggle('active'));
closeSidebar?.addEventListener('click', () => sidebar?.classList.remove('active'));

sidebarLinks?.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();

    sidebarLinks.forEach(l => l.classList.remove('active'));
    views.forEach(v => v.classList.remove('active'));

    link.classList.add('active');
    const viewId = link.dataset.view + 'View';
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add('active');

    if (window.innerWidth <= 768) sidebar?.classList.remove('active');
  });
});

function initializeInitialView() {
  const urlParams = new URLSearchParams(window.location.search);
  const tab = urlParams.get('tab');
  if (tab) {
    const targetLink = document.querySelector(`.sidebar-link[data-view="${tab}"]`);
    if (targetLink) {
      document.querySelector('.sidebar-link.active')?.classList.remove('active');
      targetLink.click();
    }
  }
}

/* =========================================================================
   END: Navigation and View Management
   ========================================================================= */


/* =========================================================================
   START: Authentication and Initial Data Loading
   ========================================================================= */

async function loadUserData() {
  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      console.error('Authentication Error:', authErr);
      window.location.href = 'index.html';
      return;
    }
    currentUser = user;

    const { data: profile, error: profileErr } = await supabase
      .from('gym_users')
      .select('id,email,full_name,phone,address,role,created_at')
      .eq('id', user.id)
      .single();

    if (profileErr) {
      console.error('Profile Fetch Error:', profileErr);
      showToast('Error loading profile data', 'error');
      return;
    }

    userProfile = profile;
    updateProfileUI();

    await loadUserPlanUI();
    await loadAttendanceData();
    subscribeAttendanceChanges();
    initializeInitialView();

  } catch (err) {
    console.error('Unexpected error in loadUserData:', err);
    showToast('Unexpected error (see console)', 'error');
  }
}

function updateProfileUI() {
  if (!userProfile) return;

  const name = userProfile.full_name || 'User';
  const email = userProfile.email || 'N/A';
  const phone = userProfile.phone || 'N/A';
  const joinedAt = userProfile.created_at || null;
  const initials = getInitials(name);

  if (userInitials) userInitials.textContent = initials;
  if (profileInitials) profileInitials.textContent = initials;
  if (headerUserName) headerUserName.textContent = name;
  if (profileName) profileName.textContent = name;
  if (profileEmail) profileEmail.textContent = email;
  if (profilePhone) profilePhone.textContent = phone;
  if (profileJoinedAt) profileJoinedAt.textContent = formatDate(joinedAt);

  if (fullName) fullName.textContent = name;
  if (emailAddress) emailAddress.textContent = email;
  if (phoneNumber) phoneNumber.textContent = phone;
  if (joinedAtFull) joinedAtFull.textContent = formatFullDate(joinedAt);

  if (updateName) updateName.value = name;
  if (updateEmail) updateEmail.value = email;
  if (updatePhone) updatePhone.value = phone;
  if (updateAddress) updateAddress.value = userProfile.address || '';
}

logoutBtn?.addEventListener('click', async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout Error:', error);
      showToast('Error logging out', 'error');
      return;
    }
    showToast('Successfully logged out', 'success');
    setTimeout(() => window.location.href = 'index.html', 500);
  } catch (err) {
    console.error('Unexpected Logout Error:', err);
    showToast('Error logging out', 'error');
  }
});

/* =========================================================================
   END: Authentication and Initial Data Loading
   ========================================================================= */


/* =========================================================================
   START: Profile Update Handling
   ========================================================================= */

updateForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!userProfile) {
    showToast('User profile not loaded', 'error');
    return;
  }

  try {
    const updatedData = {
      full_name: updateName?.value?.trim() || userProfile.full_name,
      email: updateEmail?.value?.trim() || userProfile.email,
      phone: updatePhone?.value?.trim() || userProfile.phone,
      address: updateAddress?.value?.trim() || userProfile.address
    };

    const { error } = await supabase
      .from('gym_users')
      .update(updatedData)
      .eq('id', userProfile.id);

    if (error) {
      console.error('Update Error:', error);
      showToast('Error updating profile', 'error');
      return;
    }

    userProfile = { ...userProfile, ...updatedData };
    updateProfileUI();
    showToast('Profile successfully updated!', 'success');

    document.querySelector('[data-view="profile"]')?.click();

  } catch (err) {
    console.error('Error updating profile:', err);
    showToast('Error updating profile', 'error');
  }
});

cancelBtn?.addEventListener('click', () => {
  if (userProfile) {
    updateProfileUI();
  }
  document.querySelector('[data-view="profile"]')?.click();
});

/* =========================================================================
   END: Profile Update Handling
   ========================================================================= */


/* =========================================================================
   START: Plan View Logic
   ========================================================================= */

async function loadUserPlanUI() {
  if (!currentUser || !myPlanContainer) return;

  const { data, error } = await supabase
    .from("user_plans")
    .select(`
      *,
      plans (
        title,
        price,
        duration,
        features
      )
    `)
    .eq("user_id", currentUser.id)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    myPlanContainer.innerHTML = `
      <div class="plan-card">
        <h3>No Active Plan</h3>
        <p>You have not purchased any plan yet. Please visit the <a href="index.html#plans" style="color:#ff4545;">Plans section</a> on the home page.</p>
      </div>`;
    return;
  }

  const p = data.plans;

  myPlanContainer.innerHTML = `
    <div class="plan-card">
      <div class="plan-card-header">
        <h3>${p.title}</h3>
        <span class="status-badge status-active">Active</span>
      </div>

      <div class="plan-details">
        <div class="plan-detail-item">
          <span class="detail-label">Price</span>
          <span class="detail-value">${p.price}</span>
        </div>

        <div class="plan-detail-item">
          <span class="detail-label">Duration</span>
          <span class="detail-value">${p.duration}</span>
        </div>

        <div class="plan-detail-item">
          <span class="detail-label">Start Date</span>
          <span class="detail-value">${formatDate(data.start_date)}</span>
        </div>

        <div class="plan-detail-item">
          <span class="detail-label">End Date</span>
          <span class="detail-value">${formatDate(data.end_date)}</span>
        </div>

        <div class="plan-detail-item details-list-item">
          <span class="detail-label">Features</span>
          <ul class="detail-value">
            ${p.features.map(f => `<li>${f}</li>`).join("")}
          </ul>
        </div>
      </div>
    </div>
  `;
}
/* =========================================================================
   END: Plan View Logic
   ========================================================================= */


/* =========================================================================
   START: Attendance Logic
   ========================================================================= */

async function loadAttendanceData({ startDate = null, endDate = null } = {}) {
  if (!userProfile) return;

  try {
    let q = supabase
      .from('attendance')
      .select('id,user_id,date,status,check_in,check_out,duration,created_at')
      .order('date', { ascending: false })
      .eq('user_id', userProfile.id);

    if (startDate) q = q.gte('date', startDate);
    if (endDate) q = q.lte('date', endDate);

    const { data, error } = await q;
    if (error) {
      console.error('Attendance Fetch Error:', error);
      showToast('Error loading attendance', 'error');
      return;
    }

    attendanceRecords = Array.isArray(data) ? data : [];
    attendanceRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

    updateAttendanceStats();
    renderAttendanceTable();

  } catch (err) {
    console.error('Unexpected error loading attendance:', err);
    showToast('Unexpected error', 'error');
  }
}

function updateAttendanceStats() {
  const total = attendanceRecords.length;
  const present = attendanceRecords.filter(r => (r.status || '').toLowerCase() === 'present').length;
  const absent = total - present;
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;

  if (totalDays) totalDays.textContent = total;
  if (presentDays) presentDays.textContent = present;
  if (absentDays) absentDays.textContent = absent;
  if (attendanceRate) attendanceRate.textContent = `${rate}%`;
}

function renderAttendanceTable(limit = 10) {
  if (!attendanceBody) return;

  if (!attendanceRecords || attendanceRecords.length === 0) {
    attendanceBody.innerHTML = `<tr><td colspan="4" class="empty-state">No attendance records found</td></tr>`;
    return;
  }

  const rows = attendanceRecords.slice(0, limit).map(r => {
    const statusText = r.status || 'Absent';
    const statusClass = (statusText || '').toLowerCase() === 'present' ? 'status-present' : 'status-absent';
    return `
      <tr data-id="${r.id}">
        <td>${formatDate(r.date)}</td>
        <td>${formatTime(r.check_in)}</td>
        <td>${formatTime(r.check_out)}</td>
        <td><span class="${statusClass}">${statusText}</span></td>
      </tr>
    `;
  }).join('');
  attendanceBody.innerHTML = rows;
}
/* =========================================================================
   END: Attendance Logic
   ========================================================================= */

/* =========================================================================
   START: Realtime Subscription
   ========================================================================= */

function subscribeAttendanceChanges() {
  if (!userProfile) return;

  if (attendanceChannel) {
    try { supabase.removeChannel(attendanceChannel); } catch (e) { /* ignore */ }
    attendanceChannel = null;
  }

  attendanceChannel = supabase.channel(`public:attendance:user:${userProfile.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'attendance',
      filter: `user_id=eq.${userProfile.id}`
    }, (payload) => {
      console.log('Attendance Realtime Payload', payload);
      const type = payload.event || payload.type || payload.action;
      const newRow = payload.new || payload.record || payload.new_record;
      const oldRow = payload.old || payload.old_record;

      if (type && (type.toLowerCase() === 'insert')) {
        if (newRow) attendanceRecords.unshift(newRow);
      } else if (type && (type.toLowerCase() === 'update')) {
        if (newRow) {
          const idx = attendanceRecords.findIndex(r => r.id === newRow.id);
          if (idx >= 0) attendanceRecords[idx] = newRow;
          else attendanceRecords.unshift(newRow);
        }
      } else if (type && (type.toLowerCase() === 'delete')) {
        const idToRemove = oldRow?.id || (payload.record && payload.record.id);
        attendanceRecords = attendanceRecords.filter(r => r.id !== idToRemove);
      } else {
        loadAttendanceData();
        return;
      }

      attendanceRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
      updateAttendanceStats();
      renderAttendanceTable();
      showToast('Attendance updated in real-time.', 'info');
    })
    .subscribe((status) => {
      console.log('Attendance subscription status:', status);
    });
}
/* =========================================================================
   END: Realtime Subscription
   ========================================================================= */

/* =========================================================================
   START: Initialization
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  loadUserData();
});
/* =========================================================================
   END: Initialization
   ========================================================================= */