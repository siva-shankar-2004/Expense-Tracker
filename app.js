// ==========================================
// SPENDORBIT — APP.JS
// ==========================================

// ==========================================
// 1. GLOBAL CONFIG & STATE
// ==========================================
const CATEGORIES = {
  Food:          { emoji: '🍔', color: '#7c3aed', icon: 'fa-hamburger' },
  Transport:     { emoji: '🚗', color: '#00f5ff', icon: 'fa-car' },
  Housing:       { emoji: '🏠', color: '#00ffaa', icon: 'fa-house' },
  Entertainment: { emoji: '🎮', color: '#ff006e', icon: 'fa-gamepad' },
  Health:        { emoji: '💊', color: '#3b82f6', icon: 'fa-suitcase-medical' },
  Shopping:      { emoji: '🛍️', color: '#f59e0b', icon: 'fa-bag-shopping' },
  Utilities:     { emoji: '⚡', color: '#eab308', icon: 'fa-bolt' },
  Other:         { emoji: '➕', color: '#8a8ab0', icon: 'fa-circle-nodes' }
};

const DEFAULT_BUDGETS = {
  Food: 500, Transport: 200, Housing: 1200, Entertainment: 300,
  Health: 150, Shopping: 400, Utilities: 250, Other: 200
};

let state = {
  view: 'landing',
  subview: 'dashboard',
  authMode: 'login',
  user: null,
  expenses: [],
  budgets: {},
  monthlyIncome: 0,
  storageMode: 'local',
  supabaseUrl: '',
  supabaseAnonKey: '',
  supabaseClient: null,
  historySort: { key: 'date', dir: 'desc' }
};

// ==========================================
// 2. INIT
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  initStarfield();
  initCardTilt();
  loadDbSettings();
  checkActiveSession();
  updateDateStrings();

  window.addEventListener('resize', () => {
    resizeStarfieldCanvas();
    if (state.user) triggerChartRenders();
  });
});

function updateDateStrings() {
  const d = new Date();
  const stardate = (d.getFullYear() + (d.getMonth() + 1) / 12 + d.getDate() / 365).toFixed(4);
  const el = document.getElementById('header-date');
  if (el) el.innerText = `Solar Cycle STARDATE: ${stardate} | ${d.toLocaleDateString()}`;
}

// ==========================================
// 3. SPA NAVIGATION
// ==========================================
function navigateTo(targetView) {
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active-view'));
  const targetSec = document.getElementById(`view-${targetView}`);
  if (targetSec) { targetSec.classList.add('active-view'); state.view = targetView; }
  if (targetView === 'dashboard-shell') navigateToView(state.subview);
}

function navigateToView(subviewName) {
  state.subview = subviewName;
  document.querySelectorAll('.subview-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.nav-item').forEach(li => li.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-item').forEach(a => a.classList.remove('active'));

  const targetPanel = document.getElementById(`subview-${subviewName}`);
  if (targetPanel) {
    targetPanel.style.display = 'block';
    const sideNav = document.getElementById(`nav-${subviewName}`);
    if (sideNav) sideNav.classList.add('active');
    const mobNav = document.getElementById(`mobile-nav-${subviewName}`);
    if (mobNav) mobNav.classList.add('active');

    if (subviewName === 'dashboard') loadDataAndSyncDash();
    else if (subviewName === 'history') { populateMonthFilter(); renderHistoryTable(); }
    else if (subviewName === 'budgets') renderBudgetsPanel();
    else if (subviewName === 'settings') renderCloudSettings();
  }
}

// ==========================================
// 4. STARFIELD CANVAS
// ==========================================
let stars = [];
function initStarfield() {
  resizeStarfieldCanvas();
  const canvas = document.getElementById('starfield-canvas');
  stars = [];
  for (let i = 0; i < 130; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 1.5 + 0.2,
      speed: Math.random() * 0.4 + 0.05,
      glow: Math.random() > 0.8,
      alpha: Math.random()
    });
  }
  animateStars();
}
function resizeStarfieldCanvas() {
  const canvas = document.getElementById('starfield-canvas');
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
function animateStars() {
  const canvas = document.getElementById('starfield-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  stars.forEach(s => {
    s.y += s.speed;
    if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; }
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    if (s.glow) { ctx.fillStyle = `rgba(0, 245, 255, ${s.alpha})`; ctx.shadowBlur = 6; ctx.shadowColor = '#00f5ff'; }
    else { ctx.fillStyle = `rgba(240, 240, 255, ${s.alpha})`; ctx.shadowBlur = 0; }
    ctx.fill();
    s.alpha += (Math.random() > 0.5 ? 0.02 : -0.02);
    if (s.alpha > 1) s.alpha = 1;
    if (s.alpha < 0.2) s.alpha = 0.2;
  });
  ctx.shadowBlur = 0;
  requestAnimationFrame(animateStars);
}

// ==========================================
// 5. 3D CARD TILT
// ==========================================
function initCardTilt() {
  document.addEventListener('mousemove', (e) => {
    document.querySelectorAll('.tilt-card').forEach(card => {
      const rect = card.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const rY = ((e.clientX - rect.left - rect.width / 2) / (rect.width / 2)) * 7;
        const rX = -((e.clientY - rect.top - rect.height / 2) / (rect.height / 2)) * 7;
        card.style.transform = `perspective(1000px) rotateX(${rX}deg) rotateY(${rY}deg) translateZ(10px)`;
      } else {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
      }
    });
  });
}

// ==========================================
// 6. AUTH SYSTEM — USERNAME BASED
// ==========================================

// SHA-256 for local password hashing
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function switchAuthTab(mode) {
  state.authMode = mode;
  clearAuthFeedback();
  document.getElementById('reset-pw-panel').style.display = 'none';
  document.getElementById('main-auth-panel').style.display = 'block';

  const tLogin = document.getElementById('tab-login');
  const tReg = document.getElementById('tab-register');
  const title = document.getElementById('auth-card-title');
  const label = document.getElementById('auth-submit-label');
  const hintDesc = document.getElementById('auth-toggle-hint-desc');
  const hintBtn = document.getElementById('auth-toggle-hint-btn');
  const regFields = document.getElementById('register-extra-fields');
  const forgotLink = document.getElementById('forgot-pw-link');

  if (mode === 'login') {
    tLogin.classList.add('active-tab'); tReg.classList.remove('active-tab');
    title.innerText = 'Access Dashboard';
    label.innerText = 'Enter Orbit';
    hintDesc.innerText = "Don't have an account?"; hintBtn.innerText = 'Sign up';
    regFields.style.display = 'none';
    forgotLink.style.display = 'block';
  } else {
    tReg.classList.add('active-tab'); tLogin.classList.remove('active-tab');
    title.innerText = 'Register Flight Officer';
    label.innerText = 'Establish Comms';
    hintDesc.innerText = 'Already registered?'; hintBtn.innerText = 'Login';
    regFields.style.display = 'block';
    forgotLink.style.display = 'none';
  }
}

function toggleAuthModes() {
  switchAuthTab(state.authMode === 'login' ? 'register' : 'login');
}

function showAuthFeedback(msg, type = 'error') {
  const el = document.getElementById('auth-feedback-msg');
  el.textContent = msg;
  el.className = `auth-feedback ${type}`;
  el.style.display = 'block';
}

function clearAuthFeedback() {
  const el = document.getElementById('auth-feedback-msg');
  el.style.display = 'none'; el.textContent = '';
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  clearAuthFeedback();

  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;

  if (!username || !password) return;

  const submitBtn = document.getElementById('auth-submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Processing...';

  try {
    if (state.storageMode === 'cloud') {
      // Cloud mode: username maps to supabase email field (stored as username@spendorbit.local)
      const fakeEmail = username.toLowerCase().replace(/\s+/g, '_') + '@spendorbit.local';
      if (state.authMode === 'login') {
        const { data, error } = await state.supabaseClient.auth.signInWithPassword({ email: fakeEmail, password });
        if (error) throw new Error('Invalid username or password. Please check your credentials.');
        const meta = data.user.user_metadata || {};
        state.user = {
          id: data.user.id,
          email: meta.recovery_email || '',
          username: meta.display_username || username,
          supabaseEmail: fakeEmail
        };
      } else {
        const displayUsername = username;
        const recoveryEmail = document.getElementById('auth-recovery-email').value.trim();
        const { data, error } = await state.supabaseClient.auth.signUp({
          email: fakeEmail,
          password,
          options: { data: { display_username: displayUsername, recovery_email: recoveryEmail } }
        });
        if (error) throw error;
        if (data.user) {
          state.user = { id: data.user.id, email: recoveryEmail, username: displayUsername, supabaseEmail: fakeEmail };
          showToast('Account created! Welcome aboard.', 'success');
        }
      }
    } else {
      // Local storage auth
      const localUsers = JSON.parse(localStorage.getItem('spendorbit_local_users') || '{}');
      const usernameKey = username.toLowerCase();
      const passHash = await sha256(password);

      if (state.authMode === 'login') {
        if (!localUsers[usernameKey]) throw new Error('Username not found. Did you mean to register?');
        if (localUsers[usernameKey].hash !== passHash) throw new Error('Incorrect password. Please try again.');
        const u = localUsers[usernameKey];
        state.user = { id: usernameKey, email: u.recoveryEmail || '', username: u.displayUsername || username };
      } else {
        if (localUsers[usernameKey]) throw new Error('This username is already taken. Please choose another.');
        const displayUsername = username;
        const recoveryEmail = document.getElementById('auth-recovery-email').value.trim();
        localUsers[usernameKey] = { hash: passHash, displayUsername, recoveryEmail, createdAt: new Date().toISOString() };
        localStorage.setItem('spendorbit_local_users', JSON.stringify(localUsers));
        state.user = { id: usernameKey, email: recoveryEmail, username: displayUsername };
      }
    }

    sessionStorage.setItem('spendorbit_session', JSON.stringify(state.user));
    postAuthInit();

  } catch (err) {
    showAuthFeedback(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span id="auth-submit-label">${state.authMode === 'login' ? 'Enter Orbit' : 'Establish Comms'}</span>`;
  }
}

// Password Reset (local mode: simulate sending email by showing the stored recovery email)
function showForgotPassword() {
  document.getElementById('main-auth-panel').style.display = 'none';
  document.getElementById('reset-pw-panel').style.display = 'block';
  clearAuthFeedback();
}
function hideForgotPassword() {
  document.getElementById('reset-pw-panel').style.display = 'none';
  document.getElementById('main-auth-panel').style.display = 'block';
  clearAuthFeedback();
}

async function handlePasswordReset(event) {
  event.preventDefault();
  clearAuthFeedback();
  const username = document.getElementById('reset-username').value.trim();
  const newPassword = document.getElementById('reset-new-password').value;
  const confirmPassword = document.getElementById('reset-confirm-password').value;

  if (!username || !newPassword || !confirmPassword) return;
  if (newPassword !== confirmPassword) { showAuthFeedback('Passwords do not match.'); return; }
  if (newPassword.length < 6) { showAuthFeedback('Password must be at least 6 characters.'); return; }

  if (state.storageMode === 'cloud') {
    // In cloud mode, look up the fake email and send reset via supabase
    const fakeEmail = username.toLowerCase().replace(/\s+/g, '_') + '@spendorbit.local';
    try {
      const { error } = await state.supabaseClient.auth.resetPasswordForEmail(fakeEmail);
      if (error) throw error;
      showAuthFeedback('Password reset email sent! Check the recovery email you registered with.', 'success');
    } catch (err) {
      showAuthFeedback('Could not send reset email. Make sure your username is correct.');
    }
    return;
  }

  // Local mode: direct password reset
  const localUsers = JSON.parse(localStorage.getItem('spendorbit_local_users') || '{}');
  const usernameKey = username.toLowerCase();
  if (!localUsers[usernameKey]) { showAuthFeedback('Username not found.'); return; }

  const recoveryEmail = localUsers[usernameKey].recoveryEmail;
  if (!recoveryEmail) {
    showAuthFeedback('No recovery email on file for this account. Password reset unavailable.');
    return;
  }

  // Update the hash
  localUsers[usernameKey].hash = await sha256(newPassword);
  localStorage.setItem('spendorbit_local_users', JSON.stringify(localUsers));

  showAuthFeedback(`Password updated! Recovery email on file: ${recoveryEmail}`, 'success');
  setTimeout(() => { hideForgotPassword(); }, 2500);
}

function checkActiveSession() {
  const activeSession = sessionStorage.getItem('spendorbit_session');
  if (activeSession) {
    state.user = JSON.parse(activeSession);
    postAuthInit();
  } else {
    navigateTo('landing');
  }
}

async function postAuthInit() {

  // ✅ If cloud mode, refresh state.user.id with real Supabase UUID
  if (state.storageMode === 'cloud' && state.supabaseClient) {
    const { data: sessionData } = await state.supabaseClient.auth.getSession();
    if (sessionData?.session?.user?.id) {
      state.user.id = sessionData.session.user.id;
    }
  }

  const initials = (state.user.username || 'U').slice(0, 2).toUpperCase();
  document.getElementById('avatar-initials').innerText = initials;
  document.getElementById('header-greeting').innerText = `Welcome back, Pilot ${state.user.username}`;
  document.getElementById('dropdown-username').innerText = state.user.username;
  document.getElementById('dropdown-email').innerText = state.user.email || 'No recovery email set';
  document.getElementById('dropdown-storage-label').innerText = state.storageMode === 'cloud' ? 'Cloud Synced' : 'Local Offline';
  updateDbIndicatorUI();
  navigateTo('dashboard-shell');
}

function logoutUser() {
  if (state.storageMode === 'cloud' && state.supabaseClient) {
    state.supabaseClient.auth.signOut();
  }
  sessionStorage.removeItem('spendorbit_session');
  state.user = null; state.expenses = []; state.budgets = {}; state.monthlyIncome = 0;
  navigateTo('landing');
}

// ==========================================
// 7. STORAGE ENGINE
// ==========================================
function loadDbSettings() {
  const savedMode = localStorage.getItem('spendorbit_storage_mode');
  const savedUrl = localStorage.getItem('spendorbit_supabase_url');
  const savedKey = localStorage.getItem('spendorbit_supabase_key');

  if (savedMode === 'cloud' && savedUrl && savedKey) {
    state.supabaseUrl = savedUrl; state.supabaseAnonKey = savedKey;
    try {
      state.supabaseClient = supabase.createClient(savedUrl, savedKey);
      state.storageMode = 'cloud';
    } catch (e) { state.storageMode = 'local'; }
  } else {
    state.storageMode = 'local';
  }
}

function updateDbIndicatorUI() {
  const dbLabel = document.getElementById('db-indicator-label');
  const badge = document.getElementById('db-indicator-badge');
  if (!dbLabel || !badge) return;
  if (state.storageMode === 'cloud') {
    dbLabel.innerText = 'Cloud Synced';
    badge.style.color = 'var(--accent-emerald)';
    badge.style.borderColor = 'rgba(0, 255, 170, 0.4)';
    badge.style.background = 'rgba(0, 255, 170, 0.1)';
  } else {
    dbLabel.innerText = 'Local Offline';
    badge.style.color = 'var(--text-muted)';
    badge.style.borderColor = 'rgba(255,255,255,0.15)';
    badge.style.background = 'rgba(255,255,255,0.05)';
  }
  // Update dropdown badge too
  const storageLabel = document.getElementById('dropdown-storage-label');
  if (storageLabel) storageLabel.innerText = state.storageMode === 'cloud' ? 'Cloud Synced' : 'Local Offline';
}

async function loadDataAndSyncDash() {
  try {
    await Promise.all([syncExpenses(), syncBudgets(), syncMonthlyIncome()]);
    updateDashboardCounters();
    triggerChartRenders();
    renderRecentTransactions();
  } catch (err) { console.error('Dashboard data load error:', err); }
}

async function syncExpenses() {
  if (state.storageMode === 'cloud' && state.supabaseClient) {
    const { data, error } = await state.supabaseClient.from('expenses').select('*').order('date', { ascending: false });
    if (error) throw error;
    state.expenses = data || [];
  } else {
    const localData = localStorage.getItem(`spendorbit_expenses_${state.user.id}`);
    state.expenses = localData ? JSON.parse(localData) : [];
    // Sort descending by date
    state.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
  }
}

async function syncBudgets() {
  if (state.storageMode === 'cloud' && state.supabaseClient) {
    const { data, error } = await state.supabaseClient.from('budgets').select('category, amount');
    if (error) throw error;
    state.budgets = { ...DEFAULT_BUDGETS };
    if (data) data.forEach(b => { state.budgets[b.category] = Number(b.amount); });
  } else {
    const localData = localStorage.getItem(`spendorbit_budgets_${state.user.id}`);
    state.budgets = localData ? JSON.parse(localData) : { ...DEFAULT_BUDGETS };
  }
}

async function syncMonthlyIncome() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  const storageKey = `spendorbit_income_${state.user.id}_${monthKey}`;
  const saved = localStorage.getItem(storageKey);
  state.monthlyIncome = saved ? Number(saved) : 0;
}

function saveMonthlyIncome(amount) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  const storageKey = `spendorbit_income_${state.user.id}_${monthKey}`;
  localStorage.setItem(storageKey, String(amount));
  state.monthlyIncome = amount;
}

// ==========================================
// 8. DASHBOARD COUNTERS & CHARTS
// ==========================================
function updateDashboardCounters() {
  const now = new Date();
  const cm = now.getMonth(), cy = now.getFullYear();
  const spentThisMonth = state.expenses
    .filter(exp => { const d = new Date(exp.date); return d.getMonth() === cm && d.getFullYear() === cy; })
    .reduce((sum, exp) => sum + Number(exp.amount), 0);

  // Income-based remaining: if income set, use it; else use total budgets
  const baseBudget = state.monthlyIncome > 0 ? state.monthlyIncome : Object.values(state.budgets).reduce((s, a) => s + a, 0);
  const remaining = baseBudget - spentThisMonth;
  const percentUsed = baseBudget > 0 ? (spentThisMonth / baseBudget) * 100 : 0;

  animateNumberCounter('counter-total-spent', spentThisMonth);
  animateNumberCounter('counter-budget-remaining', remaining);
  animateNumberCounter('counter-income', state.monthlyIncome);

  const statusLabel = document.getElementById('dashboard-budget-status');
  if (percentUsed >= 100) {
    statusLabel.innerText = 'WARNING: Over budget this month!'; statusLabel.style.color = 'var(--accent-pink)';
  } else if (percentUsed >= 85) {
    statusLabel.innerText = 'CAUTION: Approaching budget limit (85%+)'; statusLabel.style.color = 'orange';
  } else {
    statusLabel.innerText = 'Green Zone: Safe Orbit Stabilized'; statusLabel.style.color = 'var(--accent-emerald)';
  }
}

function animateNumberCounter(elementId, targetVal) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const duration = 800, startTime = performance.now();
  function update(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = progress * (2 - progress);
    el.innerText = (targetVal * eased).toFixed(2);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function triggerChartRenders() {
  renderDonutChart();
  renderBarChart();
  renderRemainingBudgetRing();
}

// Pseudo-3D Extruded Donut Chart
function renderDonutChart() {
  const canvas = document.getElementById('canvas-donut');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const now = new Date();
  const monthlyExpenses = state.expenses.filter(exp => {
    const d = new Date(exp.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const catTotals = {};
  Object.keys(CATEGORIES).forEach(c => catTotals[c] = 0);
  monthlyExpenses.forEach(exp => {
    if (catTotals[exp.category] !== undefined) catTotals[exp.category] += Number(exp.amount);
    else catTotals['Other'] += Number(exp.amount);
  });

  const totalSpent = Object.values(catTotals).reduce((s, v) => s + v, 0);
  if (totalSpent === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '13px Exo 2'; ctx.textAlign = 'center';
    ctx.fillText('No expenses logged this month.', canvas.width / 2, canvas.height / 2); return;
  }

  let currentAngle = -Math.PI / 2;
  const angles = [];
  Object.keys(catTotals).forEach(cat => {
    const val = catTotals[cat];
    if (val > 0) {
      const sliceAngle = (val / totalSpent) * Math.PI * 2;
      angles.push({ category: cat, color: CATEGORIES[cat].color, start: currentAngle, end: currentAngle + sliceAngle, val });
      currentAngle += sliceAngle;
    }
  });

  const cx = canvas.width / 2, cy = canvas.height / 2 - 8;
  const rx = 82, ry = 52, thickness = 14;

  for (let t = thickness; t > 0; t--) {
    angles.forEach(a => {
      ctx.beginPath();
      ctx.ellipse(cx, cy + t, rx, ry, 0, a.start, a.end);
      ctx.lineTo(cx + Math.cos(a.end) * (rx - 22), cy + t + Math.sin(a.end) * (ry - 15));
      ctx.ellipse(cx, cy + t, rx - 22, ry - 15, 0, a.end, a.start, true);
      ctx.closePath();
      ctx.fillStyle = adjustColorBrightness(a.color, -45);
      ctx.fill();
    });
  }

  angles.forEach(a => {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, a.start, a.end);
    ctx.lineTo(cx + Math.cos(a.end) * (rx - 22), cy + Math.sin(a.end) * (ry - 15));
    ctx.ellipse(cx, cy, rx - 22, ry - 15, 0, a.end, a.start, true);
    ctx.closePath();
    ctx.fillStyle = a.color; ctx.strokeStyle = '#050512'; ctx.lineWidth = 1.5;
    ctx.fill(); ctx.stroke();
  });

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 22, ry - 15, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15,15,42,0.9)'; ctx.fill();

  const maxCat = angles.reduce((p, c) => p.val > c.val ? p : c, { category: 'None', val: 0 });
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '9px Orbitron';
  ctx.fillText('TOP SPEND', cx, cy - 5);
  ctx.fillStyle = maxCat.color || '#fff'; ctx.font = 'bold 11px Exo 2';
  ctx.fillText(maxCat.category.toUpperCase(), cx, cy + 9);
}

function adjustColorBrightness(hex, percent) {
  let R = parseInt(hex.substring(1, 3), 16);
  let G = parseInt(hex.substring(3, 5), 16);
  let B = parseInt(hex.substring(5, 7), 16);
  R = Math.min(255, Math.max(0, Math.floor(R * (100 + percent) / 100)));
  G = Math.min(255, Math.max(0, Math.floor(G * (100 + percent) / 100)));
  B = Math.min(255, Math.max(0, Math.floor(B * (100 + percent) / 100)));
  return `#${R.toString(16).padStart(2,'0')}${G.toString(16).padStart(2,'0')}${B.toString(16).padStart(2,'0')}`;
}

// Monthly Bar Chart
function renderBarChart() {
  const canvas = document.getElementById('canvas-bars');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const d = new Date();
  const monthsData = [];
  for (let i = 5; i >= 0; i--) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
    monthsData.push({ label: t.toLocaleString('default', { month: 'short' }), month: t.getMonth(), year: t.getFullYear(), spent: 0 });
  }
  state.expenses.forEach(exp => {
    const ed = new Date(exp.date);
    monthsData.forEach(m => { if (ed.getMonth() === m.month && ed.getFullYear() === m.year) m.spent += Number(exp.amount); });
  });

  const maxSpent = Math.max(...monthsData.map(m => m.spent), 100);
  const pL = 38, pR = 10, pT = 18, pB = 28;
  const gW = canvas.width - pL - pR, gH = canvas.height - pT - pB;

  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pT + (gH * i / 4);
    ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(canvas.width - pR, y); ctx.stroke();
    ctx.fillStyle = 'rgba(138,138,176,0.8)'; ctx.font = '8px Share Tech Mono'; ctx.textAlign = 'right';
    ctx.fillText(`$${Math.round(maxSpent - (maxSpent * i / 4))}`, pL - 4, y + 3);
  }

  const barWidth = 22;
  const gap = (gW - (barWidth * 6)) / 5;

  monthsData.forEach((m, idx) => {
    const x = pL + (idx * (barWidth + gap));
    const finalBarHeight = (m.spent / maxSpent) * gH;
    let currentHeight = 0;
    function drawFrame() {
      if (currentHeight < finalBarHeight) {
        currentHeight += (finalBarHeight - currentHeight) * 0.15 + 0.5;
        if (currentHeight > finalBarHeight) currentHeight = finalBarHeight;
      }
      const y = pT + gH - currentHeight;
      ctx.clearRect(x - 2, pT - 5, barWidth + 4, gH + 10);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const gy = pT + (gH * i / 4);
        ctx.beginPath(); ctx.moveTo(x - 2, gy); ctx.lineTo(x + barWidth + 2, gy); ctx.stroke();
      }
      const grad = ctx.createLinearGradient(x, y, x, pT + gH);
      grad.addColorStop(0, '#ff006e'); grad.addColorStop(1, '#7c3aed');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.roundRect(x, y, barWidth, Math.max(currentHeight, 0), [5, 5, 0, 0]); ctx.fill();
      ctx.fillStyle = 'rgba(138,138,176,0.8)'; ctx.font = '9px Exo 2'; ctx.textAlign = 'center';
      ctx.fillText(m.label, x + barWidth / 2, pT + gH + 16);
      if (m.spent > 0) { ctx.fillStyle = '#fff'; ctx.font = '7px Share Tech Mono'; ctx.fillText(`$${Math.round(m.spent)}`, x + barWidth / 2, y - 4); }
      if (currentHeight < finalBarHeight) requestAnimationFrame(drawFrame);
    }
    drawFrame();
  });
}

// Budget Ring
function renderRemainingBudgetRing() {
  const canvas = document.getElementById('canvas-remaining-ring');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const now = new Date();
  const spentThisMonth = state.expenses
    .filter(exp => { const d = new Date(exp.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
    .reduce((sum, exp) => sum + Number(exp.amount), 0);

  const base = state.monthlyIncome > 0 ? state.monthlyIncome : Object.values(state.budgets).reduce((s, a) => s + a, 0);
  const percentUsed = base > 0 ? (spentThisMonth / base) * 100 : 0;
  const rounded = Math.min(Math.round(percentUsed), 100);
  const el = document.getElementById('dashboard-budget-percent');
  if (el) el.innerText = rounded;

  const cx = canvas.width / 2, cy = canvas.height / 2, r = 60;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 10; ctx.stroke();

  const endAngle = (percentUsed / 100) * Math.PI * 2 - Math.PI / 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, Math.min(endAngle, Math.PI * 1.5));
  let strokeColor = 'var(--secondary-cyan)';
  if (percentUsed >= 100) strokeColor = 'var(--accent-pink)';
  else if (percentUsed >= 85) strokeColor = '#eab308';
  ctx.strokeStyle = strokeColor; ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.shadowBlur = 12; ctx.shadowColor = strokeColor; ctx.stroke(); ctx.shadowBlur = 0;
}

// ==========================================
// 9. RECENT TRANSACTIONS
// ==========================================
function renderRecentTransactions() {
  const feed = document.getElementById('dashboard-recent-transactions');
  if (!feed) return;
  feed.innerHTML = '';

  const items = state.expenses.slice(0, 5);
  if (items.length === 0) {
    feed.innerHTML = '<div class="no-data-msg">No entries logged yet. Add an expense to start tracking.</div>';
    return;
  }
  items.forEach(tx => {
    const cat = CATEGORIES[tx.category] || CATEGORIES['Other'];
    feed.insertAdjacentHTML('beforeend', `
      <div class="transaction-item" id="tx-recent-${tx.id}">
        <div class="tx-left">
          <div class="tx-icon-box" style="color:${cat.color};background:rgba(${hexToRgb(cat.color)},0.12);border-color:rgba(${hexToRgb(cat.color)},0.25);">${cat.emoji}</div>
          <div class="tx-details">
            <span class="tx-note">${escapeHtml(tx.note)}</span>
            <span class="tx-meta">${tx.category} | ${new Date(tx.date + 'T00:00:00').toLocaleDateString()}</span>
          </div>
        </div>
        <div class="tx-right">
          <span class="tx-amount negative mono">-$${Number(tx.amount).toFixed(2)}</span>
          <button class="delete-tx-mini-btn" onclick="animateDeleteExpense('${tx.id}')"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>`);
  });
}

function hexToRgb(hex) {
  const r = parseInt(hex.substring(1, 3), 16);
  const g = parseInt(hex.substring(3, 5), 16);
  const b = parseInt(hex.substring(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

// ==========================================
// 10. EXPENSE MODAL
// ==========================================
function openExpenseModal() {
  document.getElementById('expense-form').reset();
  document.getElementById('expense-id-edit').value = '';
  document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('expense-modal-overlay').classList.add('active-modal');
}
function closeExpenseModal() {
  document.getElementById('expense-modal-overlay').classList.remove('active-modal');
}
function closeExpenseModalOnOutsideClick(event) {
  if (event.target.id === 'expense-modal-overlay') closeExpenseModal();
}

async function handleExpenseSubmit(event) {
  event.preventDefault();
  const amount = Number(document.getElementById('expense-amount').value);
  const category = document.getElementById('expense-category').value;
  const date = document.getElementById('expense-date').value;
  const note = document.getElementById('expense-note').value.trim();
  if (!amount || amount <= 0 || !note) return;

  const submitBtn = event.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    if (state.storageMode === 'cloud' && state.supabaseClient) {

      // ✅ Get the real Supabase UUID from the active session
      const { data: sessionData } = await state.supabaseClient.auth.getSession();
      const realUserId = sessionData?.session?.user?.id;

      if (!realUserId) throw new Error('No active session. Please log out and log back in.');

      const { error } = await state.supabaseClient.from('expenses')
        .insert([{ amount, category, date, note, user_id: realUserId }]);

      if (error) throw error;

    } else {
      const localKey = `spendorbit_expenses_${state.user.id}`;
      const current = JSON.parse(localStorage.getItem(localKey) || '[]');
      current.unshift({ id: 'local_' + Math.random().toString(36).slice(2, 9) + Date.now(), amount, category, date, note });
      localStorage.setItem(localKey, JSON.stringify(current));
    }
    closeExpenseModal();
    showToast('Expense logged successfully!', 'success');
    loadDataAndSyncDash();
  } catch (err) {
    showToast('Failed to save expense: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

function animateDeleteExpense(id) {
  const row = document.getElementById(`tx-recent-${id}`) || document.getElementById(`tx-row-${id}`);
  if (row) {
    row.style.transition = 'all 0.4s ease';
    row.style.transform = 'perspective(1000px) translateZ(-300px) rotateX(45deg)';
    row.style.opacity = '0'; row.style.height = '0'; row.style.padding = '0'; row.style.overflow = 'hidden';
    setTimeout(() => deleteExpense(id), 400);
  } else {
    deleteExpense(id);
  }
}

async function deleteExpense(id) {
  try {
    if (state.storageMode === 'cloud' && state.supabaseClient) {
      const { error } = await state.supabaseClient.from('expenses').delete().eq('id', id);
      if (error) throw error;
    } else {
      const localKey = `spendorbit_expenses_${state.user.id}`;
      let current = JSON.parse(localStorage.getItem(localKey) || '[]');
      current = current.filter(item => item.id !== id);
      localStorage.setItem(localKey, JSON.stringify(current));
    }
    showToast('Expense deleted.', 'info');
    loadDataAndSyncDash();
    if (state.subview === 'history') renderHistoryTable();
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}

// ==========================================
// 11. INCOME MODAL
// ==========================================
function openIncomeModal() {
  document.getElementById('income-modal-amount').value = state.monthlyIncome > 0 ? state.monthlyIncome : '';
  document.getElementById('income-modal-overlay').classList.add('active-modal');
}
function closeIncomeModal() {
  document.getElementById('income-modal-overlay').classList.remove('active-modal');
}
function closeIncomeModalOnOutsideClick(event) {
  if (event.target.id === 'income-modal-overlay') closeIncomeModal();
}
function handleIncomeSubmit(event) {
  event.preventDefault();
  const amount = Number(document.getElementById('income-modal-amount').value);
  if (amount < 0) return;
  saveMonthlyIncome(amount);
  closeIncomeModal();
  showToast('Monthly income updated!', 'success');
  updateDashboardCounters();
  renderRemainingBudgetRing();
}

// ==========================================
// 12. TRANSACTION HISTORY
// ==========================================
function populateMonthFilter() {
  const monthSel = document.getElementById('filter-month');
  if (!monthSel) return;
  monthSel.innerHTML = '<option value="ALL">All Months</option>';
  const dates = [...new Set(state.expenses.map(e => {
    const d = new Date(e.date);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  }))].sort().reverse();
  dates.forEach(dStr => {
    const [yr, mo] = dStr.split('-');
    const label = new Date(yr, mo - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    monthSel.insertAdjacentHTML('beforeend', `<option value="${dStr}">${label}</option>`);
  });
}

function sortTableBy(key) {
  if (state.historySort.key === key) state.historySort.dir = state.historySort.dir === 'asc' ? 'desc' : 'asc';
  else { state.historySort.key = key; state.historySort.dir = 'desc'; }
  document.querySelectorAll('.history-table th').forEach(th => th.classList.remove('sort-asc', 'sort-desc'));
  ['date', 'note', 'category', 'amount'].forEach(k => {
    const icon = document.getElementById(`sort-icon-${k}`);
    if (icon) icon.className = 'fa-solid fa-sort';
  });
  const activeHeader = document.querySelector(`.history-table th[data-sort="${key}"]`);
  if (activeHeader) activeHeader.classList.add(state.historySort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
  const activeIcon = document.getElementById(`sort-icon-${key}`);
  if (activeIcon) activeIcon.className = state.historySort.dir === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
  renderHistoryTable();
}

function renderHistoryTable() {
  const tbody = document.getElementById('history-table-body');
  const emptyMsg = document.getElementById('history-empty-msg');
  if (!tbody) return;
  tbody.innerHTML = '';

  const query = (document.getElementById('search-tx')?.value || '').toLowerCase().trim();
  const filterCat = document.getElementById('filter-category')?.value || 'ALL';
  const filterMo = document.getElementById('filter-month')?.value || 'ALL';

  let filtered = state.expenses.filter(tx => {
    const d = new Date(tx.date);
    const yyyymm = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    return (tx.note.toLowerCase().includes(query) || tx.category.toLowerCase().includes(query)) &&
      (filterCat === 'ALL' || tx.category === filterCat) &&
      (filterMo === 'ALL' || yyyymm === filterMo);
  });

  const sk = state.historySort.key, sd = state.historySort.dir === 'asc' ? 1 : -1;
  filtered.sort((a, b) => {
    if (sk === 'amount') return (Number(a[sk]) - Number(b[sk])) * sd;
    if (sk === 'date') return (new Date(a[sk]) - new Date(b[sk])) * sd;
    return String(a[sk]).localeCompare(String(b[sk])) * sd;
  });

  if (filtered.length === 0) { if (emptyMsg) emptyMsg.style.display = 'block'; return; }
  if (emptyMsg) emptyMsg.style.display = 'none';

  filtered.forEach(tx => {
    const cat = CATEGORIES[tx.category] || CATEGORIES['Other'];
    tbody.insertAdjacentHTML('beforeend', `
      <tr id="tx-row-${tx.id}">
        <td class="mono">${new Date(tx.date + 'T00:00:00').toLocaleDateString()}</td>
        <td style="font-weight:600;">${escapeHtml(tx.note)}</td>
        <td><span class="table-category-badge" style="background:rgba(${hexToRgb(cat.color)},0.1);border:1px solid rgba(${hexToRgb(cat.color)},0.25);color:${cat.color};">${cat.emoji} ${tx.category}</span></td>
        <td style="text-align:right;font-weight:bold;" class="mono" style="color:var(--accent-pink);">-$${Number(tx.amount).toFixed(2)}</td>
        <td style="text-align:center;">
          <button class="table-action-btn delete" onclick="animateDeleteExpense('${tx.id}')" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
        </td>
      </tr>`);
  });
}

// ==========================================
// 13. BUDGET PLANNER
// ==========================================
function renderBudgetsPanel() {
  const grid = document.getElementById('budget-grid-list');
  if (!grid) return;
  grid.innerHTML = '';
  let totalLimit = 0;
  const now = new Date();

  Object.keys(CATEGORIES).forEach(catName => {
    const cat = CATEGORIES[catName];
    const limit = state.budgets[catName] || 0;
    totalLimit += limit;
    const spent = state.expenses
      .filter(e => e.category === catName)
      .filter(e => { const d = new Date(e.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const percent = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    let statusTag = '<span class="budget-status-tag ok">Stable</span>';
    if (spent > limit && limit > 0) statusTag = '<span class="budget-status-tag over">Breached</span>';
    else if (percent >= 85) statusTag = '<span class="budget-status-tag warning">Warning</span>';

    grid.insertAdjacentHTML('beforeend', `
      <div class="budget-category-card glass-panel tilt-card">
        <div>
          <div class="budget-cat-top">
            <div class="budget-cat-info">
              <div class="budget-cat-icon" style="background:rgba(${hexToRgb(cat.color)},0.15);border:1px solid rgba(${hexToRgb(cat.color)},0.25);color:${cat.color};">${cat.emoji}</div>
              <span class="budget-cat-name">${catName}</span>
            </div>
            <button class="budget-limit-edit-btn" onclick="openBudgetEditModal('${catName}', ${limit})"><i class="fa-solid fa-pen-to-square"></i></button>
          </div>
          <div class="budget-progress-container">
            <div class="budget-bar-track"><div class="budget-bar-fill" style="width:${Math.min(percent, 100)}%;background:${cat.color};box-shadow:0 0 8px ${cat.color};"></div></div>
            <div class="budget-bar-text"><span>Usage: <strong>${percent}%</strong></span><span class="mono">$${spent.toFixed(0)} / $${limit}</span></div>
          </div>
        </div>
        <div class="budget-summary-stats"><span style="color:var(--text-muted);">Status:</span>${statusTag}</div>
      </div>`);
  });
  const el = document.getElementById('budget-sum-allocated');
  if (el) el.innerText = `$${totalLimit.toFixed(2)}`;
}

function openBudgetEditModal(categoryName, currentLimit) {
  document.getElementById('budget-modal-category-name').value = categoryName;
  document.getElementById('budget-modal-category-title').innerText = `Adjust ${categoryName} Cap`;
  document.getElementById('budget-modal-amount').value = currentLimit;
  document.getElementById('budget-modal-overlay').classList.add('active-modal');
}
function closeBudgetModal() {
  document.getElementById('budget-modal-overlay').classList.remove('active-modal');
}
function closeBudgetModalOnOutsideClick(event) {
  if (event.target.id === 'budget-modal-overlay') closeBudgetModal();
}

async function handleBudgetSubmit(event) {
  event.preventDefault();
  const category = document.getElementById('budget-modal-category-name').value;
  const amount = Number(document.getElementById('budget-modal-amount').value);
  if (amount < 0) return;

  try {
    if (state.storageMode === 'cloud' && state.supabaseClient) {

      // ✅ Get real UUID from session
      const { data: sessionData } = await state.supabaseClient.auth.getSession();
      const realUserId = sessionData?.session?.user?.id;

      if (!realUserId) throw new Error('No active session. Please log out and log back in.');

      const { data, error: fetchErr } = await state.supabaseClient
        .from('budgets').select('id').eq('category', category).maybeSingle();
      if (fetchErr) throw fetchErr;

      if (data) {
        const { error } = await state.supabaseClient.from('budgets')
          .update({ amount }).eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await state.supabaseClient.from('budgets')
          .insert([{ category, amount, user_id: realUserId }]);
        if (error) throw error;
      }
    } else {
      const localKey = `spendorbit_budgets_${state.user.id}`;
      const current = JSON.parse(localStorage.getItem(localKey) || '{}');
      current[category] = amount;
      localStorage.setItem(localKey, JSON.stringify(current));
    }
    closeBudgetModal();
    showToast(`${category} budget updated!`, 'success');
    await syncBudgets();
    renderBudgetsPanel();
  } catch (err) {
    showToast('Failed to save budget: ' + err.message, 'error');
  }
}

// ==========================================
// 14. CLOUD SETTINGS
// ==========================================
function renderCloudSettings() {
  const urlEl = document.getElementById('settings-db-url');
  const keyEl = document.getElementById('settings-db-key');
  if (urlEl) urlEl.value = state.supabaseUrl || '';
  if (keyEl) keyEl.value = state.supabaseAnonKey || '';

  const statusBox = document.getElementById('settings-status-box');
  const statusTitle = document.getElementById('settings-status-title');
  const statusDesc = document.getElementById('settings-status-desc');
  const disconnectBtn = document.getElementById('settings-db-disconnect');
  const feedbackEl = document.getElementById('settings-feedback-msg');
  if (feedbackEl) feedbackEl.style.display = 'none';

  if (state.storageMode === 'cloud') {
    statusBox.className = 'sync-status-indicator connected';
    statusTitle.innerText = 'Status: Cloud Synced (Supabase Active)';
    statusDesc.innerText = 'Real-time query routing to your remote database instance.';
    disconnectBtn.style.display = 'inline-block';
  } else {
    statusBox.className = 'sync-status-indicator disconnected';
    statusTitle.innerText = 'Status: Local Offline';
    statusDesc.innerText = 'Data stored strictly in browser localStorage.';
    disconnectBtn.style.display = 'none';
  }
}

async function handleSaveDbSettings(event) {
  event.preventDefault();
  const url = document.getElementById('settings-db-url').value.trim();
  const key = document.getElementById('settings-db-key').value.trim();
  const feedback = document.getElementById('settings-feedback-msg');
  feedback.style.display = 'none';
  if (!url || !key) return;

  try {
    const client = supabase.createClient(url, key);
    const { error } = await client.from('expenses').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw new Error('Connection test failed: ' + error.message);
    localStorage.setItem('spendorbit_supabase_url', url);
    localStorage.setItem('spendorbit_supabase_key', key);
    localStorage.setItem('spendorbit_storage_mode', 'cloud');
    state.supabaseUrl = url; state.supabaseAnonKey = key;
    state.supabaseClient = client; state.storageMode = 'cloud';
    updateDbIndicatorUI(); renderCloudSettings();
    showToast('Supabase cloud database connected!', 'success');
  } catch (err) {
    feedback.innerText = 'Connection failed: ' + err.message;
    feedback.style.display = 'block';
  }
}

function disconnectCloudDb() {
  localStorage.removeItem('spendorbit_supabase_url');
  localStorage.removeItem('spendorbit_supabase_key');
  localStorage.setItem('spendorbit_storage_mode', 'local');
  state.supabaseUrl = ''; state.supabaseAnonKey = '';
  state.supabaseClient = null; state.storageMode = 'local';
  updateDbIndicatorUI(); renderCloudSettings();
  showToast('Switched to Local Offline storage.', 'info');
}

function copySqlSchema() {
  const code = document.getElementById('sql-schema-code')?.innerText;
  if (!code) return;
  navigator.clipboard.writeText(code)
    .then(() => showToast('SQL schema copied to clipboard!', 'success'))
    .catch(() => showToast('Copy failed. Please copy manually.', 'error'));
}

// ==========================================
// 15. PROFILE DROPDOWN
// ==========================================
function toggleProfileDropdown() {
  document.getElementById('profile-dropdown').classList.toggle('open');
}
function closeProfileDropdown() {
  document.getElementById('profile-dropdown')?.classList.remove('open');
}
document.addEventListener('click', function (e) {
  const wrapper = document.querySelector('.profile-dropdown-wrapper');
  if (wrapper && !wrapper.contains(e.target)) closeProfileDropdown();
});

// ==========================================
// 16. TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}
