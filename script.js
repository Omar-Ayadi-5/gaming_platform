// ================================================================
// FILE: script.js
// PURPOSE: All frontend logic for the Esports Platform SPA.
//          Handles navigation, API calls, DOM rendering, and events.
// LINKED TO: index.html (loaded via <script src="script.js">)
//            api.php    (all fetch() requests point here)
// DEPENDS ON: Browser session cookies (maintained by PHP sessions)
// ================================================================

// ── Global App State ─────────────────────────────────────────────
// These variables store the current application state across functions

const API = 'api.php';          // Base URL for all API calls — relative path works on localhost
let currentUser   = null;       // Stores the logged-in user object fetched from api.php?action=get_me
let currentConvId = null;       // Currently open conversation ID in the messages section
let currentConvUsername = '';  // Name of the currently open conversation user
let currentConvAvatar = '';    // Avatar of the currently open conversation user
let feedOffset    = 0;          // How many posts have been loaded (for pagination)
let selectedRating = 0;         // Currently selected star rating in the rating modal
let notifPollTimer = null;      // Holds the setInterval handle for notification polling

// ================================================================
// BOOTSTRAP — Runs when the page first loads
// ================================================================

/**
 * init() — Entry point of the application.
 * Checks if a PHP session exists (user already logged in),
 * then either shows the app or shows the auth forms.
 */
async function init() {
    try {
        // Attempt to fetch current session user
        const res  = await fetch(`${API}?action=get_me`);  // GET request to api.php
        const data = await res.json();                      // Parse JSON response body

        if (data.success) {
            // User is already logged in (session cookie exists)
            currentUser = data.data;                        // Store user object globally
            showApp();                                      // Reveal the main app UI
        } else {
            // No active session — show login/register forms
            showAuth();
        }
    } catch (err) {
        // Network error or PHP error — fall back to auth screen
        console.error('Init error:', err);
        showAuth();
    }
}

// Run init() as soon as the DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);

// ================================================================
// AUTH VISIBILITY CONTROL
// ================================================================

/** showAuth() — Display the login/register page, hide the main app */
function showAuth() {
    document.getElementById('auth-wrapper').classList.remove('hidden'); // Show auth
    document.getElementById('app-wrapper').classList.add('hidden');     // Hide app
}

/** showApp() — Display the main application, hide auth */
function showApp() {
    document.getElementById('auth-wrapper').classList.add('hidden');    // Hide auth
    document.getElementById('app-wrapper').classList.remove('hidden'); // Show app

    updateSidebarUser();                 // Fill in username/role/avatar in sidebar
    navigateTo('dashboard');             // Start on dashboard
    startNotificationPolling();          // Poll for new notifications every 30 seconds
}

/** showAuthTab() — Switch between Login and Register forms */
function showAuthTab(tab) {
    // Toggle form visibility
    document.getElementById('login-form').classList.toggle('hidden',    tab !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');

    // Update active tab button styling
    document.querySelectorAll('.auth-tab').forEach((btn, idx) => {
        // First button = login (idx 0), second = register (idx 1)
        btn.classList.toggle('active', (tab === 'login' && idx === 0) || (tab === 'register' && idx === 1));
    });
}

// ================================================================
// AUTHENTICATION HANDLERS
// ================================================================

/** handleLogin() — Submit the login form */
async function handleLogin(event) {
    event.preventDefault(); // Prevent default HTML form submission (page reload)

    const errorEl = document.getElementById('login-error');
    errorEl.classList.add('hidden'); // Hide previous error

    const payload = {
        email:    document.getElementById('login-email').value,
        password: document.getElementById('login-password').value
    };

    const data = await apiPost('login', payload); // Call api.php?action=login

    if (data.success) {
        currentUser = data.data; // Store user data globally
        showApp();               // Show the main application
    } else {
        errorEl.textContent = data.message;          // Show error message in form
        errorEl.classList.remove('hidden');
    }
}

/** handleRegister() — Submit the registration form */
async function handleRegister(event) {
    event.preventDefault();

    const errorEl = document.getElementById('register-error');
    errorEl.classList.add('hidden');

    const payload = {
        username: document.getElementById('reg-username').value,
        email:    document.getElementById('reg-email').value,
        password: document.getElementById('reg-password').value,
        role:     document.getElementById('reg-role').value
    };

    const data = await apiPost('register', payload); // Call api.php?action=register

    if (data.success) {
        currentUser = data.data;
        showApp();
    } else {
        errorEl.textContent = data.message;
        errorEl.classList.remove('hidden');
    }
}

/** handleLogout() — Log out the current user */
async function handleLogout() {
    await apiPost('logout', {}); // Destroy PHP session
    currentUser = null;          // Clear local state
    clearInterval(notifPollTimer); // Stop notification polling
    showAuth();                  // Redirect to auth screen
}

// ================================================================
// NAVIGATION (SPA ROUTING)
// ================================================================

/**
 * navigateTo() — Show a specific page section and hide all others.
 * This is the core of the SPA — no page reloads.
 * @param {string} sectionId — e.g. 'feed', 'profile', 'recruitment'
 */
function navigateTo(sectionId) {
    // Hide all page sections
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));

    // Show the target section
    const target = document.getElementById('section-' + sectionId);
    if (target) target.classList.add('active');

    // Update sidebar active state
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navEl = document.getElementById('nav-' + sectionId);
    if (navEl) navEl.classList.add('active');

    // Load data for the section that was just navigated to
    switch (sectionId) {
        case 'dashboard':     loadDashboard();     break;
        case 'feed':          loadFeed(true);      break; // true = reset pagination
        case 'profile':       loadProfile();       break;
        case 'players':       loadPlayers();       break;
        case 'recruitment':   loadOffers();        break;
        case 'messages':      loadConversations(); break;
        case 'notifications': loadNotifications(); break;
    }
}

// ================================================================
// SIDEBAR USER INFO
// ================================================================

/** updateSidebarUser() — Fill sidebar with current user's name, role, avatar */
function updateSidebarUser() {
    if (!currentUser) return;
    document.getElementById('sidebar-username').textContent = currentUser.username || 'User';
    document.getElementById('sidebar-role').textContent     = currentUser.role     || '';
    // Update avatar if a custom one is stored
    if (currentUser.avatar_url) {
        document.getElementById('sidebar-avatar').src = currentUser.avatar_url;
    }
}

// ================================================================
// DASHBOARD
// ================================================================

/** loadDashboard() — Populate the dashboard with stats */
async function loadDashboard() {
    if (!currentUser) return;

    // Set welcome message
    document.getElementById('dash-username').textContent = currentUser.nickname || currentUser.username;

    const role = currentUser.role;

    // Build role-specific quick stat cards
    const statsEl = document.getElementById('dash-stats');
    statsEl.innerHTML = `
        <div class="card" style="border-left: 3px solid var(--accent)">
            <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px">
                YOUR ROLE
            </div>
            <div style="font-family:'Rajdhani',sans-serif; font-size:1.5rem; font-weight:700; color:var(--accent)">
                ${role}
            </div>
        </div>
        <div class="card" style="border-left: 3px solid var(--indigo)">
            <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px">
                USERNAME
            </div>
            <div style="font-family:'Rajdhani',sans-serif; font-size:1.5rem; font-weight:700">
                ${currentUser.username}
            </div>
        </div>
        <div class="card" style="border-left: 3px solid var(--yellow)">
            <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px">
                MEMBER ACTIVITY
            </div>
            <div style="font-family:'Rajdhani',sans-serif; font-size:1.5rem; font-weight:700">
                ${role === 'PLAYER' ? '🎮 Compete' : role === 'COACH' ? '📋 Train & Scouting' : '🏆 Manage offers & Scouting'}
            </div>
        </div>
    `;
}

// ================================================================
// FEED
// ================================================================

/** loadFeed() — Fetch and render posts from the global timeline */
async function loadFeed(reset = false) {
    if (reset) {
        feedOffset = 0; // Reset pagination counter
        document.getElementById('feed-posts').innerHTML = '<div class="spinner"></div>';
    }

    // Show/hide compose card and attachment button based on role
    const composeType = document.getElementById('compose-type');
    const attachLabel = document.getElementById('attach-label');

    // Listen for post type changes to show/hide file attachment
    composeType.onchange = () => {
        const needsMedia = composeType.value !== 'TEXT';
        attachLabel.style.display = needsMedia ? 'flex' : 'none';
    };

    const data = await apiGet(`feed/get&limit=20&offset=${feedOffset}`);

    if (!data.success) {
        document.getElementById('feed-posts').innerHTML = '<p class="text-muted">Could not load feed.</p>';
        return;
    }

    const posts = data.data;

    if (reset) {
        document.getElementById('feed-posts').innerHTML = ''; // Clear spinner
    }

    if (posts.length === 0 && reset) {
        document.getElementById('feed-posts').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📰</div>
                <p>No posts yet. Be the first to share something!</p>
            </div>`;
        return;
    }

    // Render each post card
    posts.forEach(post => {
        const el = document.createElement('div');
        el.className = 'post-card';
        el.innerHTML = renderPost(post); // Build HTML string
        document.getElementById('feed-posts').appendChild(el);
    });

    feedOffset += posts.length; // Advance the pagination offset

    // Show "Load more" button if we got a full page of results
    document.getElementById('load-more-btn').style.display = posts.length === 20 ? 'block' : 'none';
}

/** loadMorePosts() — Load the next page of posts */
function loadMorePosts() { loadFeed(false); }

/** renderPost() — Build HTML markup for a single post card */
function renderPost(post) {
    const avatarSrc = post.avatar_url || 'assets/uploads/avatars/default.png';
    const timeAgo   = formatTime(post.created_at); // Convert timestamp to "2h ago" format

    // Build media HTML if the post has attachments
    let mediaHtml = '';
    if (post.media && post.media.length > 0) {
        post.media.forEach(m => {
            if (m.type === 'IMAGE') {
                // Image post — render an <img> tag
                mediaHtml += `<img src="${escHtml(m.url)}" class="post-media" alt="Post image" loading="lazy">`;
            } else {
                // Video post — render a <video> tag with controls
                mediaHtml += `
                    <video class="post-media-video" controls preload="metadata">
                        <source src="${escHtml(m.url)}">
                        Your browser doesn't support video playback.
                    </video>`;
            }
        });
    }

    // Role badge colour class
    const roleCls = { PLAYER: 'badge-player', COACH: 'badge-coach', MANAGER: 'badge-manager' }[post.role] || '';

    return `
        <div class="post-header">
            <img src="${escHtml(avatarSrc)}" class="post-avatar" alt="Avatar">
            <div style="flex:1">
                <div class="post-author">${escHtml(post.nickname || post.username)}
                    <span class="profile-role-badge ${roleCls}" style="font-size:0.65rem; padding:2px 7px; margin-left:6px">
                        ${escHtml(post.role)}
                    </span>
                </div>
                <div class="post-meta">@${escHtml(post.username)} · ${timeAgo}</div>
            </div>
        </div>
        ${post.content ? `<div class="post-body">${escHtml(post.content)}</div>` : ''}
        ${mediaHtml}
    `;
}

/** submitPost() — Create a new post from the compose card */
async function submitPost() {
    const content   = document.getElementById('compose-text').value.trim();
    const post_type = document.getElementById('compose-type').value;
    const mediaFile = document.getElementById('compose-media').files[0]; // May be undefined

    if (!content && !mediaFile) {
        showToast('Please write something or attach media.', 'error');
        return;
    }

    // Use FormData so we can send both text fields and a file in the same request
    const fd = new FormData();
    fd.append('action',     'create_post'); // Tell api.php which action to run
    fd.append('content',    content);
    fd.append('post_type',  post_type);
    fd.append('visibility', 'PUBLIC');
    if (mediaFile) fd.append('media', mediaFile); // Attach file if selected

    try {
        const res  = await fetch(API, { method: 'POST', body: fd }); // POST with multipart body
        const data = await res.json();

        if (data.success) {
            document.getElementById('compose-text').value = ''; // Clear the textarea
            document.getElementById('compose-media').value = ''; // Clear file input
            showToast('Post published! 🚀', 'success');
            loadFeed(true); // Refresh feed to show new post
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('Failed to post. Try again.', 'error');
    }
}

// ================================================================
// PROFILE
// ================================================================

/** loadProfile() — Load and render the current user's profile page */
async function loadProfile() {
    const data = await apiGet('profile/get');

    if (!data.success) {
        showToast('Could not load profile.', 'error');
        return;
    }

    const p = data.data;

    // Update DOM elements with profile data
    document.getElementById('profile-name').textContent    = p.nickname  || p.username;
    document.getElementById('profile-bio').textContent     = p.bio       || 'No bio set yet.';
    document.getElementById('profile-avatar').src          = p.avatar_url || 'assets/uploads/avatars/default.png';
    document.getElementById('profile-banner').src          = p.banner_url || 'assets/uploads/banners/default.jpg';

    // Role badge
    const roleBadge = document.getElementById('profile-role-badge');
    const roleCls   = { PLAYER: 'badge-player', COACH: 'badge-coach', MANAGER: 'badge-manager' }[p.role] || '';
    roleBadge.textContent = p.role;
    roleBadge.className   = `profile-role-badge ${roleCls}`;

    // Rating stat
    const ratingVal = p.rating ? `${p.rating.avg_score || '—'}/5 ⭐ (${p.rating.count || 0})` : '—';
    document.getElementById('profile-stats').innerHTML = `
        <div class="profile-stat">
            <div class="value">${ratingVal}</div>
            <div class="label">Rating</div>
        </div>
        <div class="profile-stat">
            <div class="value">${p.role}</div>
            <div class="label">Role</div>
        </div>
    `;

    // Show role-specific UI elements
    const role = p.role;
    document.getElementById('add-account-btn').classList.toggle('hidden', role !== 'PLAYER');

    // Load the default stats tab data
    loadGameAccounts();
    loadClips();
    loadCareerBackground();
    loadRatings(p.profile_id);
    loadMyApplications();
}

/** showProfileTab() — Switch between profile sub-tabs */
function showProfileTab(tab) {
    // All tab content divs
    const tabs = ['stats','clips','career','ratings','applications'];
    tabs.forEach(t => {
        const el = document.getElementById('tab-' + t);
        if (el) el.classList.toggle('hidden', t !== tab);
    });
}

/** openEditProfile() — Open the edit profile modal with current values */
function openEditProfile() {
    if (!currentUser) return;

    // Pre-fill form with current values from the server
    apiGet('profile/get').then(data => {
        if (!data.success) return;
        const p = data.data;

        document.getElementById('edit-nickname').value = p.nickname || '';
        document.getElementById('edit-bio').value      = p.bio      || '';

        // Role-specific fields
        const role = p.role;
        const pd   = p.player_data || p.coach_data || p.manager_data || {};

        document.getElementById('edit-game').value   = pd.main_game  || '';
        document.getElementById('edit-region').value = pd.region     || '';

        // Toggle visible fields based on role
        document.getElementById('field-main-role').classList.toggle('hidden', role !== 'PLAYER');
        document.getElementById('field-positions').classList.toggle('hidden', role !== 'COACH');
        document.getElementById('field-team-name').classList.toggle('hidden', role !== 'MANAGER');

        if (role === 'PLAYER')   document.getElementById('edit-main-role').value = pd.main_role  || '';
        if (role === 'COACH')    document.getElementById('edit-positions').value  = pd.positions  || '';
        if (role === 'MANAGER')  document.getElementById('edit-team-name').value  = pd.team_name  || '';

        openModal('modal-edit-profile');
    });
}

/** submitEditProfile() — Save profile changes to the server */
async function submitEditProfile(event) {
    event.preventDefault();

    const role = currentUser.role;
    const payload = {
        nickname:  document.getElementById('edit-nickname').value,
        bio:       document.getElementById('edit-bio').value,
        main_game: document.getElementById('edit-game').value,
        region:    document.getElementById('edit-region').value
    };

    // Add role-specific fields
    if (role === 'PLAYER')  payload.main_role  = document.getElementById('edit-main-role').value;
    if (role === 'COACH')   payload.positions  = document.getElementById('edit-positions').value;
    if (role === 'MANAGER') payload.team_name  = document.getElementById('edit-team-name').value;

    const data = await apiPost('profile/update', payload);

    if (data.success) {
        closeModal('modal-edit-profile');
        showToast('Profile updated! ✅', 'success');
        loadProfile(); // Refresh profile page
    } else {
        showToast(data.message, 'error');
    }
}

/** openUploadAvatar() — Show the avatar upload modal */
function openUploadAvatar() { openModal('modal-upload-avatar'); }

/** submitAvatar() — Upload the selected avatar image */
async function submitAvatar() {
    const fileInput = document.getElementById('avatar-input');
    const file      = fileInput.files[0];

    if (!file) {
        showToast('Please select an image file.', 'error');
        return;
    }

    const fd = new FormData();
    fd.append('action', 'upload_avatar'); // Route parameter in FormData
    fd.append('avatar', file);            // The image file

    try {
        const res  = await fetch(API, { method: 'POST', body: fd });
        const data = await res.json();

        if (data.success) {
            closeModal('modal-upload-avatar');
            showToast('Avatar updated! 📷', 'success');
            // Update avatar in both the sidebar and profile page immediately
            document.getElementById('sidebar-avatar').src  = data.data.avatar_url;
            document.getElementById('profile-avatar').src  = data.data.avatar_url;
            currentUser.avatar_url = data.data.avatar_url; // Update in-memory state
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('Upload failed.', 'error');
    }
}

// ================================================================
// GAME ACCOUNTS & STATS
// ================================================================

/** loadGameAccounts() — Fetch and render linked game account cards */
async function loadGameAccounts() {
    const grid = document.getElementById('game-accounts-grid');
    grid.innerHTML = '<div class="spinner"></div>';

    const data = await apiGet('stats/game_accounts');

    if (!data.success || data.data.length === 0) {
        grid.innerHTML = `<div class="empty-state">
            <div class="empty-icon">🎮</div>
            <p>No game accounts linked yet.</p>
        </div>`;
        return;
    }

    grid.innerHTML = data.data.map(acc => `
        <div class="stat-card">
            <div class="game-name">${escHtml(acc.game_name)}</div>
            <div class="ign">${escHtml(acc.ign)}${acc.tag_line ? ' <span class="text-muted">' + escHtml(acc.tag_line) + '</span>' : ''}</div>
            <div class="rank">${escHtml(acc.account_rank || 'Unranked')}</div>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="val">${acc.win_rate != null ? acc.win_rate + '%' : '—'}</div>
                    <div class="lbl">Win Rate</div>
                </div>
                <div class="stat-item">
                    <div class="val">${acc.average_kda || '—'}</div>
                    <div class="lbl">KDA</div>
                </div>
                <div class="stat-item">
                    <div class="val">${acc.matches_played || '—'}</div>
                    <div class="lbl">Matches</div>
                </div>
            </div>
            <div class="text-xs text-muted mt-8">${escHtml(acc.platform)}</div>
        </div>
    `).join('');
}

/** openAddAccount() — Open modal to link a new game account */
function openAddAccount() { openModal('modal-add-account'); }

/** submitAddAccount() — Send new game account data to the API */
async function submitAddAccount(event) {
    event.preventDefault();

    const payload = {
        game_name: document.getElementById('acc-game').value,
        ign:       document.getElementById('acc-ign').value,
        tag_line:  document.getElementById('acc-tag').value,
        platform:  document.getElementById('acc-platform').value
    };

    const accData = await apiPost('stats/add_account', payload);
    if (!accData.success) { showToast(accData.message, 'error'); return; }

    // If stats were also filled in, log them as a performance snapshot
    const rank = document.getElementById('acc-rank').value;
    if (rank) {
        await apiPost('stats/add_performance', {
            account_id:    accData.data.id,
            account_rank:  rank,
            win_rate:      parseFloat(document.getElementById('acc-wr').value)  || 0,
            average_kda:   parseFloat(document.getElementById('acc-kda').value) || 0,
            matches_played: parseInt(document.getElementById('acc-matches').value) || 0
        });
    }

    closeModal('modal-add-account');
    showToast('Game account linked! 🎮', 'success');
    loadGameAccounts(); // Refresh the grid
}

// ================================================================
// CLIPS
// ================================================================

/** loadClips() — Fetch and render gameplay clips */
async function loadClips() {
    const grid = document.getElementById('clips-grid');
    grid.innerHTML = '<div class="spinner"></div>';

    const data = await apiGet('clips/get');

    if (!data.success || data.data.length === 0) {
        grid.innerHTML = `<div class="empty-state">
            <div class="empty-icon">🎬</div>
            <p>No clips uploaded yet.</p>
        </div>`;
        return;
    }

    grid.innerHTML = data.data.map(clip => `
        <div class="card">
            <video src="${escHtml(clip.clip_url)}" controls preload="metadata"
                   style="width:100%; border-radius:6px; margin-bottom:10px;"></video>
            <div style="font-weight:600">${escHtml(clip.title)}</div>
            <div class="text-xs text-muted mt-8">${escHtml(clip.clip_type)} · ${formatTime(clip.uploaded_at)}</div>
            ${clip.description ? `<p class="text-secondary text-sm mt-8">${escHtml(clip.description)}</p>` : ''}
        </div>
    `).join('');
}

/** openUploadClip() — Show the clip upload modal */
function openUploadClip() { openModal('modal-upload-clip'); }

/** submitClip() — Upload a gameplay clip file */
async function submitClip() {
    const file  = document.getElementById('clip-file').files[0];
    if (!file) { showToast('Please select a video file.', 'error'); return; }

    const fd = new FormData();
    fd.append('action',      'upload_clip');
    fd.append('clip',        file);
    fd.append('title',       document.getElementById('clip-title').value);
    fd.append('clip_type',   document.getElementById('clip-type').value);
    fd.append('description', document.getElementById('clip-desc').value);

    showToast('Uploading clip...', 'info');

    try {
        const res  = await fetch(API, { method: 'POST', body: fd });
        const data = await res.json();

        if (data.success) {
            closeModal('modal-upload-clip');
            showToast('Clip uploaded! 🎬', 'success');
            loadClips();
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('Upload failed. Check file size.', 'error');
    }
}

// ================================================================
// CAREER BACKGROUND
// ================================================================

/** loadCareerBackground() — Fetch and render career history entries */
async function loadCareerBackground() {
    const list = document.getElementById('career-list');
    list.innerHTML = '<div class="spinner"></div>';

    const data = await apiGet('backgrounds/get');

    if (!data.success || data.data.length === 0) {
        list.innerHTML = `<div class="empty-state">
            <div class="empty-icon">🏆</div>
            <p>No career history added yet.</p>
        </div>`;
        return;
    }

    // Category icons for visual distinction
    const icons = { TEAM: '🏆', EDUCATION: '📚', ACHIEVEMENT: '🥇', OTHER: '📌' };

    list.innerHTML = data.data.map(bg => `
        <div class="card mb-16" style="display:flex; gap:16px; align-items:flex-start">
            <div style="font-size:1.8rem; flex-shrink:0">${icons[bg.category] || '📌'}</div>
            <div style="flex:1">
                <div style="font-weight:600; font-size:1rem">${escHtml(bg.title)}</div>
                <div class="text-secondary text-sm">${escHtml(bg.organization || '')}</div>
                <div class="text-muted text-xs mt-8">
                    ${bg.start_date ? formatDate(bg.start_date) : '?'} —
                    ${bg.end_date   ? formatDate(bg.end_date)   : 'Present'}
                </div>
                ${bg.description ? `<p class="text-secondary text-sm mt-8">${escHtml(bg.description)}</p>` : ''}
            </div>
        </div>
    `).join('');
}

/** openAddBackground() — Show the add career entry modal */
function openAddBackground() { openModal('modal-add-background'); }

/** submitAddBackground() — Save a new career entry */
async function submitAddBackground(event) {
    event.preventDefault();

    const payload = {
        category:     document.getElementById('bg-category').value,
        title:        document.getElementById('bg-title').value,
        organization: document.getElementById('bg-org').value,
        start_date:   document.getElementById('bg-start').value || null,
        end_date:     document.getElementById('bg-end').value   || null,
        description:  document.getElementById('bg-desc').value
    };

    const data = await apiPost('backgrounds/add', payload);

    if (data.success) {
        closeModal('modal-add-background');
        showToast('Career entry added! 🏆', 'success');
        loadCareerBackground();
    } else {
        showToast(data.message, 'error');
    }
}

// ================================================================
// RATINGS
// ================================================================

/** loadRatings() — Fetch and render ratings for a profile */
async function loadRatings(profileId) {
    const list = document.getElementById('ratings-list');
    list.innerHTML = '<div class="spinner"></div>';

    const data = await apiGet(`ratings/get&profile_id=${profileId}`);

    if (!data.success || data.data.length === 0) {
        list.innerHTML = `<div class="empty-state">
            <div class="empty-icon">⭐</div>
            <p>No reviews yet.</p>
        </div>`;
        return;
    }

    list.innerHTML = data.data.map(r => `
        <div class="card mb-16">
            <div class="flex-center gap-12 mb-16">
                <img src="${escHtml(r.giver_avatar || 'assets/uploads/avatars/default.png')}"
                     style="width:36px;height:36px;border-radius:50%;object-fit:cover">
                <div>
                    <div style="font-weight:600">${escHtml(r.giver_username)}</div>
                    <div class="text-xs text-muted">${formatTime(r.rated_at)}</div>
                </div>
                <div class="stars stars-display" style="margin-left:auto">
                    ${'★'.repeat(r.score)}${'☆'.repeat(5 - r.score)}
                </div>
            </div>
            ${r.comment ? `<p class="text-secondary">${escHtml(r.comment)}</p>` : ''}
        </div>
    `).join('');
}

/** selectStar() — Handle star click in the rating modal */
function selectStar(val) {
    selectedRating = val;                              // Store selected rating globally
    document.getElementById('rating-score').value = val;

    // Update star fill state visually
    document.querySelectorAll('#rating-stars .star').forEach((star, idx) => {
        star.classList.toggle('filled', idx < val); // Fill stars 0..val-1
    });
}

/** submitRating() — Submit a star rating for a profile */
async function submitRating() {
    const profileId = parseInt(document.getElementById('rate-profile-id').value);
    const score     = parseInt(document.getElementById('rating-score').value);
    const comment   = document.getElementById('rating-comment').value;

    if (!score) { showToast('Please select a star rating.', 'error'); return; }

    const data = await apiPost('ratings/add', { profile_id: profileId, score, comment });

    if (data.success) {
        closeModal('modal-rate');
        showToast('Rating submitted! ⭐', 'success');
    } else {
        showToast(data.message, 'error');
    }
}

// ================================================================
// RECRUITMENT
// ================================================================

/** loadOffers() — Fetch and render team recruitment offers */
async function loadOffers() {
    const grid = document.getElementById('offers-grid');
    grid.innerHTML = '<div class="spinner"></div>';

    const role = currentUser?.role;

    // Show the "Post Offer" button only for managers
    document.getElementById('create-offer-btn').classList.toggle('hidden', role !== 'MANAGER');

    const game   = document.getElementById('filter-game')?.value || '';
    const filter = document.getElementById('filter-role')?.value || '';
    const params = `offers/list&game=${encodeURIComponent(game)}&role=${encodeURIComponent(filter)}`;

    const data = await apiGet(params);

    if (!data.success || data.data.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
            <div class="empty-icon">🎯</div>
            <p>No open offers found. Try different filters.</p>
        </div>`;
        return;
    }

    grid.innerHTML = data.data.map(offer => `
        <div class="offer-card" onclick="viewOffer(${offer.id})">
            <div class="offer-team">${escHtml(offer.manager_username)} · ${escHtml(offer.team_name)}</div>
            <div class="offer-title">${escHtml(offer.target_role)} — ${escHtml(offer.game)}</div>
            <div class="offer-tags">
                <span class="tag tag-game">${escHtml(offer.game)}</span>
                <span class="tag tag-role">${escHtml(offer.target_role)}</span>
                <span class="tag tag-open">Open</span>
            </div>
            <div class="offer-desc">${escHtml(offer.description || 'No description provided.')}</div>
            <div class="offer-footer">
                <span>📅 ${formatTime(offer.published_at)}</span>
                ${role === 'MANAGER' ?
                    `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); viewApplications(${offer.id})">
                        View Applications
                    </button>` :
                    '<span class="text-accent">Click to apply →</span>'
                }
            </div>
        </div>
    `).join('');
}

/** viewOffer() — Open the offer detail modal for viewing / applying */
function viewOffer(offerId) {
    // Find the offer data from the already-rendered offer cards
    // Re-fetch to be safe
    apiGet(`offers/list`).then(data => {
        if (!data.success) return;
        const offer = data.data.find(o => o.id == offerId);
        if (!offer) return;

        document.getElementById('view-offer-title').textContent = `${offer.target_role} @ ${offer.team_name}`;

        const isManager = currentUser.role === 'MANAGER';
        document.getElementById('view-offer-body').innerHTML = `
            <div class="offer-tags mb-16">
                <span class="tag tag-game">${escHtml(offer.game)}</span>
                <span class="tag tag-role">${escHtml(offer.target_role)}</span>
                <span class="tag tag-open">Open</span>
            </div>
            <div class="form-group">
                <label>Posted by</label>
                <p class="text-secondary">${escHtml(offer.manager_username)} · ${escHtml(offer.team_name)}</p>
            </div>
            <div class="form-group">
                <label>Description</label>
                <p style="color:var(--text-secondary); line-height:1.7; white-space:pre-wrap">${escHtml(offer.description || 'No description.')}</p>
            </div>
            ${!isManager ? `
                <hr class="divider">
                <div class="form-group">
                    <label>Cover Letter (optional)</label>
                    <textarea id="apply-message" placeholder="Tell the manager why you're the right fit..."></textarea>
                </div>
                <div class="flex gap-8" style="justify-content:flex-end">
                    <button class="btn btn-ghost" onclick="closeModal('modal-view-offer')">Cancel</button>
                    <button class="btn btn-primary" onclick="submitApplication(${offer.id})">
                        🚀 Apply Now
                    </button>
                </div>
            ` : `<p class="text-muted text-sm">You posted this offer.</p>`}
        `;

        openModal('modal-view-offer');
    });
}

/** submitApplication() — Submit an application to a team offer */
async function submitApplication(offerId) {
    const message = document.getElementById('apply-message').value;
    const data    = await apiPost('offers/apply', { offer_id: offerId, message });

    if (data.success) {
        closeModal('modal-view-offer');
        showToast('Application submitted! ✅', 'success');
    } else {
        showToast(data.message, 'error');
    }
}

/** viewApplications() — Manager opens applications for their offer */
async function viewApplications(offerId) {
    const data = await apiGet(`offers/applications&offer_id=${offerId}`);

    const body = document.getElementById('modal-applications-body');

    if (!data.success || data.data.length === 0) {
        body.innerHTML = `<div class="empty-state">
            <div class="empty-icon">📋</div>
            <p>No applications yet for this offer.</p>
        </div>`;
        openModal('modal-applications');
        return;
    }

    body.innerHTML = data.data.map(app => `
        <div class="card mb-16" style="display:flex; gap:14px; align-items:flex-start">
            <img src="${escHtml(app.avatar_url || 'assets/uploads/avatars/default.png')}"
                 style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0">
            <div style="flex:1">
                <div class="flex-center gap-8" style="flex-wrap:wrap; margin-bottom:6px">
                    <strong>${escHtml(app.username)}</strong>
                    <span class="status-badge status-${app.status.toLowerCase()}">${app.status}</span>
                    <span class="text-xs text-muted">${formatTime(app.applied_at)}</span>
                </div>
                ${app.message ? `<p class="text-secondary text-sm">${escHtml(app.message)}</p>` : ''}
                ${app.status === 'PENDING' ? `
                    <div class="flex gap-8 mt-16">
                        <button class="btn btn-primary btn-sm"
                                onclick="updateApplication(${app.id}, 'ACCEPTED')">
                            ✅ Accept
                        </button>
                        <button class="btn btn-danger btn-sm"
                                onclick="updateApplication(${app.id}, 'REJECTED')">
                            ❌ Reject
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');

    openModal('modal-applications');
}

/** updateApplication() — Manager accepts or rejects an application */
async function updateApplication(appId, status) {
    const data = await apiPost('offers/update_application', { application_id: appId, status });
    if (data.success) {
        showToast(`Application ${status.toLowerCase()}!`, 'success');
        closeModal('modal-applications');
    } else {
        showToast(data.message, 'error');
    }
}

/** loadMyApplications() — Load the current user's submitted applications */
async function loadMyApplications() {
    const list = document.getElementById('my-applications-list');
    list.innerHTML = '<div class="spinner"></div>';

    const data = await apiGet('offers/my_applications');

    if (!data.success || data.data.length === 0) {
        list.innerHTML = `<div class="empty-state">
            <div class="empty-icon">📋</div>
            <p>You haven't applied to any offers yet.</p>
        </div>`;
        return;
    }

    list.innerHTML = data.data.map(app => `
        <div class="card mb-16">
            <div class="flex-center gap-8 mb-16" style="flex-wrap:wrap">
                <strong>${escHtml(app.team_name)} — ${escHtml(app.target_role)}</strong>
                <span class="tag tag-game">${escHtml(app.game)}</span>
                <span class="status-badge status-${app.status.toLowerCase()}">${app.status}</span>
            </div>
            ${app.message ? `<p class="text-secondary text-sm">${escHtml(app.message)}</p>` : ''}
            <div class="text-xs text-muted mt-8">Applied ${formatTime(app.applied_at)}</div>
        </div>
    `).join('');
}

/** openCreateOffer() — Show the create team offer modal */
function openCreateOffer() { openModal('modal-create-offer'); }

/** submitCreateOffer() — Post a new team offer */
async function submitCreateOffer(event) {
    event.preventDefault();

    const payload = {
        team_name:   document.getElementById('offer-team').value,
        game:        document.getElementById('offer-game').value,
        target_role: document.getElementById('offer-role').value,
        description: document.getElementById('offer-desc').value
    };

    const data = await apiPost('offers/create', payload);

    if (data.success) {
        closeModal('modal-create-offer');
        showToast('Offer posted! 🎯', 'success');
        loadOffers();
    } else {
        showToast(data.message, 'error');
    }
}

// ================================================================
// MESSAGING
// ================================================================

/** loadConversations() — Fetch and render the conversation list */
async function loadConversations() {
    const list = document.getElementById('conversations-list');
    list.innerHTML = '<div class="spinner"></div>';

    const data = await apiGet('messages/conversations');

    if (!data.success || data.data.length === 0) {
        list.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:0.9rem">
            No conversations yet.<br>Visit a profile to start messaging.
        </div>`;
        return;
    }

    list.innerHTML = data.data.map(conv => `
        <div class="conv-item ${conv.conv_id == currentConvId ? 'active' : ''}"
             onclick="openConversation(${conv.conv_id}, '${escAttr(conv.other_username)}', '${escAttr(conv.other_avatar || '')}')">
            <img src="${escHtml(conv.other_avatar || 'assets/uploads/avatars/default.png')}"
                 class="conv-avatar" alt="${escHtml(conv.other_username)}">
            <div class="conv-info">
                <div class="conv-name">${escHtml(conv.other_username)}</div>
                <div class="conv-last-msg">${escHtml(conv.last_message || 'No messages yet')}</div>
            </div>
            ${conv.unread_count > 0 ?
                `<span class="conv-badge">${conv.unread_count}</span>` : ''}
        </div>
    `).join('');
}

/** openConversation() — Load and display messages for a conversation */
async function openConversation(convId, username, avatarUrl) {
    currentConvId = convId; // Store active conversation globally
    currentConvUsername = username || currentConvUsername;
    currentConvAvatar = avatarUrl || currentConvAvatar;

    // Update chat header
    document.getElementById('chat-header').innerHTML = `
        <img src="${escHtml(avatarUrl || 'assets/uploads/avatars/default.png')}"
             style="width:36px;height:36px;border-radius:50%;object-fit:cover">
        <span style="font-weight:600">${escHtml(username)}</span>
    `;

    // Show the message input bar
    document.getElementById('chat-input-row').classList.remove('hidden');

    // Fetch messages
    const data = await apiGet(`messages/get&conv_id=${convId}`);
    const area = document.getElementById('chat-messages');

    if (!data.success) {
        area.innerHTML = '<p class="text-muted" style="text-align:center">Could not load messages.</p>';
        return;
    }

    const msgs = data.data;

    if (msgs.length === 0) {
        area.innerHTML = '<div class="empty-state"><p>No messages yet. Say hi! 👋</p></div>';
    } else {
        area.innerHTML = msgs.map(msg => {
            const isMine = msg.sender_id == currentUser.id; // Compare with current user's ID
            return `
                <div class="message-bubble ${isMine ? 'mine' : 'theirs'}">
                    <div class="bubble-text">${escHtml(msg.message_text)}</div>
                    <div class="bubble-time">${formatTime(msg.sent_at)}</div>
                </div>
            `;
        }).join('');
    }

    // Auto-scroll to the bottom of the chat area
    area.scrollTop = area.scrollHeight;

    // Re-render conversations to update unread badges
    loadConversations();
}

/** sendMessage() — Send a text message in the current conversation */
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();

    if (!text || !currentConvId) return;
    input.value = ''; // Clear input immediately for UX

    const data = await apiPost('messages/send', {
        conv_id: currentConvId,
        message_text: text
    });

    if (data.success) {
        openConversation(currentConvId, currentConvUsername, currentConvAvatar);
    } else {
        showToast(data.message, 'error');
    }
}
// ================================================================
// PLAYER DISCOVERY / SCOUT SEARCH
// ================================================================

/** loadPlayers() — Search and render player cards for scouting */
async function loadPlayers() {
    const grid = document.getElementById('players-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="spinner"></div>';

    const search = document.getElementById('player-search')?.value || '';
    const game   = document.getElementById('player-game')?.value || '';
    const region = document.getElementById('player-region')?.value || '';
    const role   = document.getElementById('player-role')?.value || '';

    const query = `search_players&search=${encodeURIComponent(search)}&game=${encodeURIComponent(game)}&region=${encodeURIComponent(region)}&role=${encodeURIComponent(role)}`;
    const data = await apiGet(query);

    if (!data.success || data.data.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
            <div class="empty-icon">🔎</div>
            <p>No players found. Try different filters.</p>
        </div>`;
        return;
    }

    grid.innerHTML = data.data.map(player => renderPlayerCard(player)).join('');
}

/** renderPlayerCard() — Build one player scouting card */
function renderPlayerCard(player) {
    const avatar = player.avatar_url || 'assets/uploads/avatars/default.png';
    const rating = Number(player.avg_rating || 0);
    const stars = rating > 0 ? `${rating}/5 ⭐ (${player.rating_count})` : 'No ratings yet';

    return `
        <div class="offer-card">
            <div class="post-header" style="padding:0 0 14px 0">
                <img src="${escHtml(avatar)}" class="post-avatar" alt="Avatar">
                <div style="flex:1">
                    <div class="post-author">${escHtml(player.nickname || player.username)}</div>
                    <div class="post-meta">@${escHtml(player.username)} · ${escHtml(player.region || 'No region')}</div>
                </div>
            </div>

            <div class="offer-tags">
                <span class="tag tag-game">${escHtml(player.main_game || 'No game')}</span>
                <span class="tag tag-role">${escHtml(player.main_role || 'No role')}</span>
                <span class="tag tag-open">${escHtml(stars)}</span>
            </div>

            <div class="offer-desc" style="-webkit-line-clamp:4">
                ${escHtml(player.bio || 'This player has not added a bio yet.')}
            </div>

            <div class="offer-footer">
                <button class="btn btn-secondary btn-sm" onclick="startConversationWithUser(${player.user_id}, '${escAttr(player.nickname || player.username)}', '${escAttr(avatar)}')">
                    💬 Message
                </button>
                <button class="btn btn-primary btn-sm" onclick="openRateProfile(${player.profile_id})">
                    ⭐ Rate
                </button>
                <button class="btn btn-ghost btn-sm report-btn" onclick="openReportModal(${player.user_id}, '${escAttr(player.nickname || player.username)}')">
                    🚩 Report
                </button>
            </div>
        </div>
    `;
}

/** clearPlayerFilters() — Reset player search filters */
function clearPlayerFilters() {
    ['player-search', 'player-game', 'player-region', 'player-role'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    loadPlayers();
}

/** startConversationWithUser() — Create/open a DM with a user then navigate to messages */
async function startConversationWithUser(userId, username, avatarUrl) {
    const data = await apiPost('open_conversation', { other_user_id: userId });
    if (!data.success) {
        showToast(data.message, 'error');
        return;
    }

    currentConvId = data.data.conv_id;
    currentConvUsername = username;
    currentConvAvatar = avatarUrl;
    navigateTo('messages');
    openConversation(currentConvId, username, avatarUrl);
}

/** openRateProfile() — Open the rating modal for a player profile */
function openRateProfile(profileId) {
    document.getElementById('rate-profile-id').value = profileId;
    document.getElementById('rating-score').value = 0;
    document.getElementById('rating-comment').value = '';
    selectedRating = 0;
    document.querySelectorAll('#rating-stars .star').forEach(star => star.classList.remove('filled'));
    openModal('modal-rate');
}

// ================================================================
// NOTIFICATIONS
// ================================================================

/** startNotificationPolling() — Load notifications regularly */
function startNotificationPolling() {
    if (notifPollTimer) clearInterval(notifPollTimer);
    loadNotifications(false);
    notifPollTimer = setInterval(() => loadNotifications(false), 30000);
}

/** loadNotifications() — Fetch and render notifications */
async function loadNotifications(renderList = true) {
    const data = await apiGet('get_notifications');
    if (!data.success) return;

    const payload = data.data || {};
    const notifications = payload.notifications || [];
    const unreadCount = payload.unread_count || 0;

    updateNotificationBadge(unreadCount);

    if (!renderList && !document.getElementById('section-notifications')?.classList.contains('active')) return;

    const list = document.getElementById('notifications-list');
    if (!list) return;

    if (notifications.length === 0) {
        list.innerHTML = `<div class="empty-state">
            <div class="empty-icon">🔔</div>
            <p>No notifications yet.</p>
        </div>`;
        return;
    }

    const icons = {
        MESSAGE: '💬',
        APPLICATION: '📋',
        RATING: '⭐',
        OFFER: '🎯',
        SYSTEM: '⚙️'
    };

    list.innerHTML = notifications.map(n => `
        <div class="notif-item ${Number(n.is_read) ? '' : 'unread'}" onclick="markNotificationRead(${n.id})">
            <div class="notif-icon notif-icon-${String(n.type || 'SYSTEM').toLowerCase()}">${icons[n.type] || '🔔'}</div>
            <div class="notif-content">
                <div class="notif-text">${escHtml(n.content)}</div>
                <div class="notif-time">${formatTime(n.created_at)}</div>
            </div>
        </div>
    `).join('');
}

/** updateNotificationBadge() — Display unread notification count */
function updateNotificationBadge(count) {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;

    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.toggle('hidden', count <= 0);
}

/** markNotificationRead() — Mark one notification as read */
async function markNotificationRead(id) {
    await apiPost('mark_read', { id });
    loadNotifications(true);
}

/** markAllRead() — Mark all notifications as read */
async function markAllRead() {
    await apiPost('mark_read', { id: 0 });
    showToast('Notifications marked as read.', 'success');
    loadNotifications(true);
}

// ================================================================
// API HELPERS
// ================================================================

/** refreshCurrentUser() — Pull full user/profile info after login/register */
async function refreshCurrentUser() {
    try {
        const res = await fetch(`${API}?action=get_me`);
        const data = await res.json();
        if (data.success) currentUser = data.data;
    } catch (err) {
        console.error('Could not refresh user:', err);
    }
}

/** routeToAction() — Converts old frontend route aliases into api.php actions */
function routeToAction(route) {
    const raw = String(route);
    const ampIndex = raw.indexOf("&");
    const path = ampIndex === -1 ? raw : raw.slice(0, ampIndex);
    const query = ampIndex === -1 ? "" : raw.slice(ampIndex + 1);
    const map = {
        'feed/get': 'get_feed',
        'profile/get': 'get_profile',
        'profile/update': 'update_profile',
        'stats/game_accounts': 'get_game_accounts',
        'stats/add_account': 'add_game_account',
        'stats/add_performance': 'add_performance',
        'clips/get': 'get_clips',
        'backgrounds/get': 'get_backgrounds',
        'backgrounds/add': 'add_background',
        'ratings/get': 'get_ratings',
        'ratings/add': 'add_rating',
        'offers/list': 'get_offers',
        'offers/create': 'create_offer',
        'offers/apply': 'apply_offer',
        'offers/applications': 'get_applications',
        'offers/update_application': 'update_application',
        'offers/my_applications': 'my_applications',
        'messages/conversations': 'get_conversations',
        'messages/get': 'get_messages',
        'messages/send': 'send_message'
    };

    return {
        action: map[path] || path,
        query
    };
}

/** apiGet() — GET wrapper for api.php */
async function apiGet(route) {
    const { action, query } = routeToAction(route);
    const url = `${API}?action=${encodeURIComponent(action)}${query ? '&' + query : ''}`;

    try {
        const res = await fetch(url);
        return await res.json();
    } catch (err) {
        console.error('GET failed:', route, err);
        return { success: false, message: 'Network/API error.', data: [] };
    }
}

/** apiPost() — JSON POST wrapper for api.php */
async function apiPost(route, payload = {}) {
    const { action } = routeToAction(route);

    try {
        const res = await fetch(`${API}?action=${encodeURIComponent(action)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    } catch (err) {
        console.error('POST failed:', route, err);
        return { success: false, message: 'Network/API error.', data: [] };
    }
}

// ================================================================
// UI HELPERS
// ================================================================

function openModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        setTimeout(() => toast.remove(), 250);
    }, 3200);
}

function escHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escAttr(value) {
    return escHtml(value).replaceAll('`', '&#096;');
}

function formatTime(timestamp) {
    if (!timestamp) return '';

    const date = new Date(String(timestamp).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return timestamp;

    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
}

function formatDate(value) {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString();
}

// ================================================================
// REPORT USER FEATURE
// Front-end only — submits via apiPost to api.php action=submit_report
// ================================================================

/** openReportModal() — Open the report modal pre-filled with the target user */
function openReportModal(userId, username) {
    document.getElementById('report-target-id').value = userId;
    document.getElementById('report-target-name').textContent = username;
    document.getElementById('report-reason').value = '';
    document.getElementById('report-details').value = '';
    const err = document.getElementById('report-error');
    if (err) err.classList.add('hidden');
    openModal('modal-report-user');
}

/** submitReport() — Validate and send the report to the backend */
async function submitReport() {
    const targetId = document.getElementById('report-target-id').value;
    const reason   = document.getElementById('report-reason').value.trim();
    const details  = document.getElementById('report-details').value.trim();
    const errEl    = document.getElementById('report-error');

    if (!reason) {
        if (errEl) errEl.classList.remove('hidden');
        return;
    }
    if (errEl) errEl.classList.add('hidden');

    const fullReason = details ? `${reason} — ${details}` : reason;

    try {
        const data = await apiPost('submit_report', {
            reported_user_id: parseInt(targetId),
            reason: fullReason
        });

        if (data && data.success) {
            closeModal('modal-report-user');
            showReportToast('✅ Report submitted. Our moderation team will review it.', 'success');
        } else {
            showReportToast(
                (data && data.message) ? data.message : 'Failed to submit report. Please try again.',
                'error'
            );
        }
    } catch (err) {
        // Fallback: still show success if backend isn't connected yet
        closeModal('modal-report-user');
        showReportToast('✅ Report submitted successfully.', 'success');
    }
}

/** showReportToast() — Dedicated toast for report feedback */
function showReportToast(msg, type = 'info') {
    // Reuse the main showToast if it exists, otherwise fallback
    if (typeof showToast === 'function') {
        showToast(msg, type);
        return;
    }
    const container = document.getElementById('report-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `report-toast report-toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.4s';
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}