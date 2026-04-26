<?php
// =============================================================================
// FILE: api.php
// PURPOSE: Single-file PHP REST API backend for the Esports Platform
// HOW IT WORKS: The frontend sends fetch() requests to api.php?action=ACTION_NAME
//               This file reads the action, runs the correct function, and
//               returns a JSON response. No HTML is generated here.
// DEPENDS ON: schema.sql (database must exist), assets/uploads/ directories
// LINKED TO: script.js (all fetch() calls point to this file)
// =============================================================================

// ── Session & Headers ─────────────────────────────────────────────────────────

session_start(); // Start PHP session so we can track logged-in user across requests

header('Content-Type: application/json');             // All responses are JSON
if (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] !== '') {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS'); // Permitted HTTP methods
header('Access-Control-Allow-Headers: Content-Type'); // Allow JSON content-type header in requests

// Handle browser pre-flight OPTIONS request (CORS check)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200); // Tell browser the CORS check passed
    exit();                   // Stop processing — nothing more to do for OPTIONS
}

// ── Database Connection ───────────────────────────────────────────────────────
// Inline connection (no separate db.php) so this file is self-contained
$db_host = getenv('DB_HOST') ?: '127.0.0.1';
$db_name = getenv('DB_NAME') ?: '';
$db_user = getenv('DB_USER') ?: '';
$db_pass = getenv('DB_PASS') ?: '';
$db_port = getenv('DB_PORT') ?: '3306';
            

try {
    // Create PDO connection with UTF-8 charset so emojis/unicode work correctly
    $pdo = new PDO(
        "mysql:host=$db_host;port=$db_port;dbname=$db_name;charset=utf8mb4",
        $db_user,
        $db_pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]
    );

    // Throw exceptions on any SQL error instead of silent failures
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Return all query results as associative arrays (e.g., $row['username'])
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

} catch (PDOException $e) {
    // If connection fails, send error JSON and stop execution
    respond(false, 'Database connection failed: ' . $e->getMessage());
}

// ── Router ────────────────────────────────────────────────────────────────────
// Read the 'action' value from either GET or POST parameters

$action = $_GET['action'] ?? $_POST['action'] ?? ''; // Use null-coalescing to avoid undefined errors

// Route to the correct function based on the action value
switch ($action) {

    // ── Authentication ──────────────────────────────────────────────
    case 'register':          handle_register();          break; // Create new user account
    case 'login':             handle_login();             break; // Start user session
    case 'logout':            handle_logout();            break; // Destroy session
    case 'get_me':            handle_get_me();            break; // Return current logged-in user info

    // ── Feed ────────────────────────────────────────────────────────
    case 'get_feed':          handle_get_feed();          break; // Fetch global post feed
    case 'create_post':       handle_create_post();       break; // Publish a new post

    // ── Profile ─────────────────────────────────────────────────────
    case 'get_profile':       handle_get_profile();       break; // View any user's profile
    case 'search_players':    handle_search_players();    break; // Scout/search player profiles
    case 'update_profile':    handle_update_profile();    break; // Edit own profile
    case 'upload_avatar':     handle_upload_avatar();     break; // Upload profile picture

    // ── Career Background ───────────────────────────────────────────
    case 'add_background':    handle_add_background();    break; // Add career entry
    case 'get_backgrounds':   handle_get_backgrounds();   break; // List career entries

    // ── Game Accounts & Stats ────────────────────────────────────────
    case 'add_game_account':  handle_add_game_account();  break; // Link a game account (IGN)
    case 'get_game_accounts': handle_get_game_accounts(); break; // Fetch linked accounts
    case 'add_performance':   handle_add_performance();   break; // Log stats snapshot
    case 'get_performances':  handle_get_performances();  break; // Fetch stats history

    // ── Clips ────────────────────────────────────────────────────────
    case 'upload_clip':       handle_upload_clip();       break; // Upload gameplay clip
    case 'get_clips':         handle_get_clips();         break; // List clips for a profile

    // ── Recruitment ──────────────────────────────────────────────────
    case 'create_offer':         handle_create_offer();        break; // Manager posts a team offer
    case 'get_offers':           handle_get_offers();          break; // List all open offers
    case 'apply_offer':          handle_apply_offer();         break; // Player/coach applies
    case 'get_applications':     handle_get_applications();    break; // Manager sees applications
    case 'update_application':   handle_update_application();  break; // Manager accepts/rejects
    case 'my_applications':      handle_my_applications();     break; // Applicant sees their apps

    // ── Ratings ──────────────────────────────────────────────────────
    case 'add_rating':        handle_add_rating();        break; // Submit a rating on a profile
    case 'get_ratings':       handle_get_ratings();       break; // Fetch ratings for a profile

    // ── Messaging ────────────────────────────────────────────────────
    case 'get_conversations': handle_get_conversations(); break; // List all conversations
    case 'open_conversation': handle_open_conversation(); break; // Start or open a convo with user
    case 'get_messages':      handle_get_messages();      break; // Fetch messages in a convo
    case 'send_message':      handle_send_message();      break; // Send a message

    // ── Notifications ────────────────────────────────────────────────
    case 'get_notifications': handle_get_notifications(); break; // List unread notifications
    case 'mark_read':         handle_mark_notification_read(); break; // Mark notification as read

    // ── Default — unknown action ─────────────────────────────────────
    default:
        respond(false, 'Unknown action: ' . htmlspecialchars($action)); // Sanitize output to prevent XSS
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * respond() — Send a JSON response and stop execution.
 * @param bool   $success  Was the operation successful?
 * @param string $message  Human-readable result message
 * @param array  $data     Optional payload returned to JavaScript
 */
function respond(bool $success, string $message = '', array $data = []): void {
    echo json_encode([          // Encode as JSON string
        'success' => $success,  // true / false
        'message' => $message,  // Status message for UI display
        'data'    => $data       // Any query results or objects
    ]);
    exit(); // Stop script execution — only one response per request
}

/**
 * require_auth() — Stop execution if user is not logged in.
 * Called at the top of any function that needs authentication.
 */
function require_auth(): void {
    if (empty($_SESSION['user_id'])) {             // Check if session has a user_id
        respond(false, 'Not authenticated. Please log in.'); // Send error if not
    }
}

/**
 * get_json_body() — Parse the raw JSON request body.
 * Used when the frontend sends fetch() with Content-Type: application/json.
 * @return array Decoded JSON as associative array
 */
function get_json_body(): array {
    $raw  = file_get_contents('php://input'); // Read raw HTTP request body
    $data = json_decode($raw, true);          // Decode JSON string to PHP array
    return $data ?? [];                       // Return empty array if body was empty or invalid
}

/**
 * create_notification() — Insert a notification row for a user.
 * Called internally whenever something notable happens (message, offer, etc.).
 */
function create_notification(PDO $pdo, int $user_id, string $content, string $type = 'SYSTEM'): void {
    $stmt = $pdo->prepare(
        "INSERT INTO notifications (user_id, content, type) VALUES (?, ?, ?)"
    );
    $stmt->execute([$user_id, $content, $type]);
}

function ensure_upload_dir(string $dir): void {
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
}

// =============================================================================
// AUTH HANDLERS
// =============================================================================

/** handle_register() — Create a new user, profile, and role sub-profile */
function handle_register(): void {
    global $pdo; // Access the database connection from global scope

    $body     = get_json_body();                             // Parse request JSON
    $username = trim($body['username'] ?? '');               // Remove whitespace from username
    $email    = trim(strtolower($body['email'] ?? ''));       // Normalise email to lowercase
    $password = $body['password'] ?? '';                     // Raw password (will be hashed)
    $role     = strtoupper($body['role'] ?? '');             // Normalise role to uppercase

    // ── Validation ──────────────────────────────────────────────────────
    if (!$username || !$email || !$password || !$role) {
        respond(false, 'All fields (username, email, password, role) are required.'); // Stop if any missing
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {        // Check email format
        respond(false, 'Invalid email address format.');
    }
    if (strlen($password) < 6) {                             // Minimum password length
        respond(false, 'Password must be at least 6 characters.');
    }
    if (!in_array($role, ['PLAYER', 'COACH', 'MANAGER'])) { // Whitelist allowed roles
        respond(false, 'Role must be PLAYER, COACH, or MANAGER.');
    }

    // ── Hash password ────────────────────────────────────────────────────
    $hashed = password_hash($password, PASSWORD_BCRYPT); // BCrypt — slow and secure

    try {
        $pdo->beginTransaction(); // Start transaction so partial data is never saved on error

        // ── Insert user row ──────────────────────────────────────────────
        $stmt = $pdo->prepare(
            "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)"
        );
        $stmt->execute([$username, $email, $hashed, $role]);
        $user_id = (int)$pdo->lastInsertId(); // Get the auto-generated user ID

        // ── Insert base profile row ──────────────────────────────────────
        $stmt = $pdo->prepare(
            "INSERT INTO profiles (user_id, nickname) VALUES (?, ?)"
        );
        $stmt->execute([$user_id, $username]); // Default nickname = username
        $profile_id = (int)$pdo->lastInsertId(); // Get the auto-generated profile ID

        // ── Insert role-specific sub-profile row ─────────────────────────
        if ($role === 'PLAYER') {
            $pdo->prepare("INSERT INTO player_profiles (profile_id) VALUES (?)")->execute([$profile_id]);
        } elseif ($role === 'COACH') {
            $pdo->prepare("INSERT INTO coach_profiles (profile_id) VALUES (?)")->execute([$profile_id]);
        } elseif ($role === 'MANAGER') {
            $pdo->prepare("INSERT INTO manager_profiles (profile_id) VALUES (?)")->execute([$profile_id]);
        }

        // ── Create the user's personal feed ─────────────────────────────
        $pdo->prepare("INSERT INTO feeds (profile_id) VALUES (?)")->execute([$profile_id]);

        $pdo->commit(); // All inserts succeeded — commit the transaction

        // ── Start session immediately so user is logged in after register ─
        $_SESSION['user_id']  = $user_id;
        $_SESSION['username'] = $username;
        $_SESSION['role']     = $role;

        respond(true, 'Registration successful!', [
            'user_id'  => $user_id,
            'username' => $username,
            'role'     => $role
        ]);

    } catch (PDOException $e) {
        $pdo->rollBack(); // Undo all inserts if anything failed
        if (strpos($e->getMessage(), 'Duplicate entry') !== false) {
            respond(false, 'Username or email already taken.'); // Friendly duplicate error
        }
        respond(false, 'Registration failed: ' . $e->getMessage());
    }
}

/** handle_login() — Authenticate user and start session */
function handle_login(): void {
    global $pdo;

    $body     = get_json_body();
    $email    = trim(strtolower($body['email'] ?? ''));
    $password = $body['password'] ?? '';

    if (!$email || !$password) {
        respond(false, 'Email and password are required.');
    }

    // Fetch the user row by email
    $stmt = $pdo->prepare("SELECT id, username, password, role FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch(); // Returns associative array or false if not found

    // Verify password against the stored BCrypt hash
    if (!$user || !password_verify($password, $user['password'])) {
        respond(false, 'Invalid email or password.'); // Same message for both cases (security)
    }

    // Store key user data in session
    $_SESSION['user_id']  = (int)$user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['role']     = $user['role'];

    respond(true, 'Login successful.', [
        'user_id'  => (int)$user['id'],
        'username' => $user['username'],
        'role'     => $user['role']
    ]);
}

/** handle_logout() — Destroy session and clear cookie */
function handle_logout(): void {
    session_unset();   // Remove all session variables
    session_destroy(); // Destroy the session on the server
    respond(true, 'Logged out successfully.');
}

/** handle_get_me() — Return current session user data */
function handle_get_me(): void {
    require_auth(); // Must be logged in

    global $pdo;
    // Fetch user + profile data in one JOIN query
    $stmt = $pdo->prepare("
        SELECT u.id, u.username, u.email, u.role,
               p.id AS profile_id, p.nickname, p.bio, p.avatar_url, p.banner_url
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.id = ?
    ");
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();

    if (!$user) respond(false, 'User not found.');
    respond(true, 'OK', $user);
}

// =============================================================================
// FEED HANDLERS
// =============================================================================

/** handle_get_feed() — Fetch global public posts, newest first */
function handle_get_feed(): void {
    require_auth();
    global $pdo;

    $limit  = (int)($_GET['limit']  ?? 20); // Number of posts to fetch (default 20)
    $offset = (int)($_GET['offset'] ??  0); // For pagination (skip N posts)

    // Join posts → users → profiles to get author info alongside each post
    $stmt = $pdo->prepare("
        SELECT
            p.id, p.content, p.post_type, p.created_at,
            u.username, u.role,
            pr.nickname, pr.avatar_url,
            GROUP_CONCAT(m.media_url ORDER BY m.id SEPARATOR '||') AS media_urls,
            GROUP_CONCAT(m.media_type ORDER BY m.id SEPARATOR '||') AS media_types
        FROM posts p
        JOIN users    u  ON u.id  = p.user_id
        JOIN profiles pr ON pr.user_id = u.id
        LEFT JOIN media m ON m.post_id = p.id     -- LEFT JOIN so posts without media still appear
        WHERE p.visibility = 'PUBLIC'
        GROUP BY p.id                              -- GROUP BY because of GROUP_CONCAT
        ORDER BY p.created_at DESC                 -- Newest posts first
        LIMIT ? OFFSET ?
    ");
    $stmt->execute([$limit, $offset]);
    $posts = $stmt->fetchAll();

    // Convert pipe-delimited media strings back to arrays for JavaScript
    foreach ($posts as &$post) {
        $post['media'] = [];
        if ($post['media_urls']) {                                      // Only process if media exists
            $urls  = explode('||', $post['media_urls']);                // Split on our separator
            $types = explode('||', $post['media_types']);
            foreach ($urls as $i => $url) {
                $post['media'][] = ['url' => $url, 'type' => $types[$i] ?? 'IMAGE'];
            }
        }
        unset($post['media_urls'], $post['media_types']); // Remove raw concatenated strings
    }

    respond(true, 'Feed loaded.', $posts);
}

/** handle_create_post() — Publish a new post with optional file upload */
function handle_create_post(): void {
    require_auth();
    global $pdo;

    // Support both JSON body and multipart form data (file uploads)
    $content   = $_POST['content']   ?? '';
    $post_type = strtoupper($_POST['post_type'] ?? 'TEXT');
    $visibility = strtoupper($_POST['visibility'] ?? 'PUBLIC');

    if (!in_array($post_type, ['TEXT','IMAGE','CLIP'])) {
        respond(false, 'Invalid post type.');
    }

    // Get the user's feed ID
    $stmt = $pdo->prepare("
        SELECT f.id AS feed_id
        FROM feeds f
        JOIN profiles p ON p.id = f.profile_id
        WHERE p.user_id = ?
    ");
    $stmt->execute([$_SESSION['user_id']]);
    $feed = $stmt->fetch();

    if (!$feed) respond(false, 'Feed not found for your account.');

    try {
        $pdo->beginTransaction();

        // Insert the post row
        $stmt = $pdo->prepare("
            INSERT INTO posts (feed_id, user_id, content, post_type, visibility)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->execute([$feed['feed_id'], $_SESSION['user_id'], $content, $post_type, $visibility]);
        $post_id = (int)$pdo->lastInsertId();

        // ── Handle file upload if present ──────────────────────────────
        if (isset($_FILES['media']) && $_FILES['media']['error'] === UPLOAD_ERR_OK) {
            $file      = $_FILES['media'];
            $ext       = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)); // Get file extension
            $allowed   = ['jpg','jpeg','png','gif','webp','mp4','mov','webm'];    // Whitelist of safe extensions
            if (!in_array($ext, $allowed)) {
                $pdo->rollBack();
                respond(false, 'File type not allowed. Allowed: jpg, png, gif, webp, mp4, mov, webm');
            }
            ensure_upload_dir('assets/uploads/posts');
            $filename  = 'post_' . $post_id . '_' . time() . '.' . $ext;        // Unique filename
            $dest      = 'assets/uploads/posts/' . $filename;                    // Destination path
            if (!move_uploaded_file($file['tmp_name'], $dest)) {                  // Move from temp to dest
                $pdo->rollBack();
                respond(false, 'File upload failed. Check folder permissions.');
            }
            $media_type = in_array($ext, ['mp4','mov','webm']) ? 'VIDEO' : 'IMAGE'; // Determine media type

            $pdo->prepare("INSERT INTO media (post_id, media_url, media_type) VALUES (?,?,?)")
                ->execute([$post_id, $dest, $media_type]);
        }

        $pdo->commit();
        respond(true, 'Post published successfully!', ['post_id' => $post_id]);

    } catch (PDOException $e) {
        $pdo->rollBack();
        respond(false, 'Failed to create post: ' . $e->getMessage());
    }
}

// =============================================================================
// PROFILE HANDLERS
// =============================================================================

/** handle_get_profile() — Return full profile data for a given user */
function handle_get_profile(): void {
    require_auth();
    global $pdo;

    $user_id = (int)($_GET['user_id'] ?? $_SESSION['user_id']); // Default to own profile

    // Base profile + user info
    $stmt = $pdo->prepare("
        SELECT u.id AS user_id, u.username, u.role, u.created_at AS joined_at,
               p.id AS profile_id, p.nickname, p.bio, p.avatar_url, p.banner_url
        FROM users u
        JOIN profiles p ON p.user_id = u.id
        WHERE u.id = ?
    ");
    $stmt->execute([$user_id]);
    $profile = $stmt->fetch();
    if (!$profile) respond(false, 'Profile not found.');

    $pid = (int)$profile['profile_id'];

    // Fetch role-specific sub-profile data
    if ($profile['role'] === 'PLAYER') {
        $sub = $pdo->prepare("SELECT * FROM player_profiles WHERE profile_id = ?");
        $sub->execute([$pid]);
        $profile['player_data'] = $sub->fetch() ?: [];

    } elseif ($profile['role'] === 'COACH') {
        $sub = $pdo->prepare("SELECT * FROM coach_profiles WHERE profile_id = ?");
        $sub->execute([$pid]);
        $profile['coach_data'] = $sub->fetch() ?: [];

    } elseif ($profile['role'] === 'MANAGER') {
        $sub = $pdo->prepare("SELECT * FROM manager_profiles WHERE profile_id = ?");
        $sub->execute([$pid]);
        $profile['manager_data'] = $sub->fetch() ?: [];
    }

    // Average rating score for this profile
    $rating_stmt = $pdo->prepare("
        SELECT COUNT(*) AS count, ROUND(AVG(score), 1) AS avg_score
        FROM ratings WHERE profile_id = ?
    ");
    $rating_stmt->execute([$pid]);
    $profile['rating'] = $rating_stmt->fetch();

    respond(true, 'Profile loaded.', $profile);
}

/** handle_search_players() — Search/scout player profiles by username, game, region, role, and rating */
function handle_search_players(): void {
    require_auth();
    global $pdo;

    $search = trim($_GET['search'] ?? '');
    $game   = trim($_GET['game'] ?? '');
    $region = trim($_GET['region'] ?? '');
    $role   = trim($_GET['role'] ?? '');

    $where = ["u.role = 'PLAYER'"];
    $params = [];

    if ($search !== '') {
        $where[] = "(u.username LIKE ? OR p.nickname LIKE ?)";
        $params[] = "%$search%";
        $params[] = "%$search%";
    }
    if ($game !== '') {
        $where[] = "pp.main_game LIKE ?";
        $params[] = "%$game%";
    }
    if ($region !== '') {
        $where[] = "pp.region LIKE ?";
        $params[] = "%$region%";
    }
    if ($role !== '') {
        $where[] = "pp.main_role LIKE ?";
        $params[] = "%$role%";
    }

    $sql = "
        SELECT
            u.id AS user_id,
            u.username,
            u.created_at AS joined_at,
            p.id AS profile_id,
            p.nickname,
            p.bio,
            p.avatar_url,
            pp.main_game,
            pp.main_role,
            pp.region,
            COALESCE(ROUND(AVG(r.score), 1), 0) AS avg_rating,
            COUNT(r.id) AS rating_count
        FROM users u
        JOIN profiles p ON p.user_id = u.id
        LEFT JOIN player_profiles pp ON pp.profile_id = p.id
        LEFT JOIN ratings r ON r.profile_id = p.id
        WHERE " . implode(' AND ', $where) . "
        GROUP BY u.id, p.id, pp.profile_id
        ORDER BY avg_rating DESC, rating_count DESC, u.created_at DESC
        LIMIT 50
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    respond(true, 'Players loaded.', $stmt->fetchAll());
}

/** handle_update_profile() — Update bio, nickname, and role-specific fields */
function handle_update_profile(): void {
    require_auth();
    global $pdo;

    $body     = get_json_body();
    $nickname = trim($body['nickname'] ?? '');
    $bio      = trim($body['bio']      ?? '');

    // Update the base profiles table
    $stmt = $pdo->prepare("
        UPDATE profiles SET nickname = ?, bio = ? WHERE user_id = ?
    ");
    $stmt->execute([$nickname, $bio, $_SESSION['user_id']]);

    // Fetch the profile_id for this user (needed to update sub-profile)
    $pid_stmt = $pdo->prepare("SELECT id FROM profiles WHERE user_id = ?");
    $pid_stmt->execute([$_SESSION['user_id']]);
    $pid = (int)$pid_stmt->fetchColumn(); // fetchColumn returns just the first column value

    $role = $_SESSION['role'];

    // Update the role-specific sub-profile table
    if ($role === 'PLAYER') {
        $pdo->prepare("
            UPDATE player_profiles SET main_game = ?, main_role = ?, region = ?
            WHERE profile_id = ?
        ")->execute([
            $body['main_game'] ?? null,
            $body['main_role'] ?? null,
            $body['region']    ?? null,
            $pid
        ]);
    } elseif ($role === 'COACH') {
        $pdo->prepare("
            UPDATE coach_profiles SET main_game = ?, positions = ?, region = ?
            WHERE profile_id = ?
        ")->execute([
            $body['main_game']  ?? null,
            $body['positions']  ?? null,
            $body['region']     ?? null,
            $pid
        ]);
    } elseif ($role === 'MANAGER') {
        $pdo->prepare("
            UPDATE manager_profiles SET main_game = ?, team_name = ?, region = ?
            WHERE profile_id = ?
        ")->execute([
            $body['main_game']  ?? null,
            $body['team_name']  ?? null,
            $body['region']     ?? null,
            $pid
        ]);
    }

    respond(true, 'Profile updated successfully.');
}

/** handle_upload_avatar() — Handle avatar image upload via multipart form */
function handle_upload_avatar(): void {
    require_auth();
    global $pdo;

    if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
        respond(false, 'No file uploaded or upload error occurred.');
    }

    $file    = $_FILES['avatar'];
    $ext     = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)); // Get file extension
    $allowed = ['jpg','jpeg','png','gif','webp'];                       // Images only for avatars

    if (!in_array($ext, $allowed)) {
        respond(false, 'Avatar must be an image (jpg, png, gif, webp).');
    }
    if ($file['size'] > 5 * 1024 * 1024) { // 5MB maximum size
        respond(false, 'Avatar file size must be under 5MB.');
    }

    ensure_upload_dir('assets/uploads/avatars');
    $filename = 'avatar_' . $_SESSION['user_id'] . '_' . time() . '.' . $ext; // Unique filename per user
    $dest     = 'assets/uploads/avatars/' . $filename;

    if (!move_uploaded_file($file['tmp_name'], $dest)) {
        respond(false, 'Failed to save avatar. Check that assets/uploads/avatars/ is writable.');
    }

    // Update the avatar_url in the profiles table
    $pdo->prepare("UPDATE profiles SET avatar_url = ? WHERE user_id = ?")
        ->execute([$dest, $_SESSION['user_id']]);

    respond(true, 'Avatar uploaded.', ['avatar_url' => $dest]);
}

// =============================================================================
// CAREER BACKGROUND HANDLERS
// =============================================================================

/** handle_add_background() — Add a career entry to the current user's profile */
function handle_add_background(): void {
    require_auth();
    global $pdo;

    $body = get_json_body();

    // Fetch the current user's profile_id
    $pid_stmt = $pdo->prepare("SELECT id FROM profiles WHERE user_id = ?");
    $pid_stmt->execute([$_SESSION['user_id']]);
    $profile_id = (int)$pid_stmt->fetchColumn();

    $stmt = $pdo->prepare("
        INSERT INTO career_backgrounds
            (profile_id, category, title, organization, role_name, start_date, end_date, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $profile_id,
        $body['category']     ?? 'OTHER',
        $body['title']        ?? '',
        $body['organization'] ?? '',
        $body['role_name']    ?? '',
        $body['start_date']   ?? null, // NULL allowed for missing dates
        $body['end_date']     ?? null,
        $body['description']  ?? ''
    ]);

    respond(true, 'Career entry added.', ['id' => (int)$pdo->lastInsertId()]);
}

/** handle_get_backgrounds() — List career entries for a profile */
function handle_get_backgrounds(): void {
    require_auth();
    global $pdo;

    $user_id = (int)($_GET['user_id'] ?? $_SESSION['user_id']);

    $stmt = $pdo->prepare("
        SELECT cb.*
        FROM career_backgrounds cb
        JOIN profiles p ON p.id = cb.profile_id
        WHERE p.user_id = ?
        ORDER BY cb.start_date DESC
    ");
    $stmt->execute([$user_id]);
    respond(true, 'OK', $stmt->fetchAll());
}

// =============================================================================
// GAME ACCOUNTS & PERFORMANCES HANDLERS
// =============================================================================

/** handle_add_game_account() — Link a game IGN to the player's profile */
function handle_add_game_account(): void {
    require_auth();
    global $pdo;

    if ($_SESSION['role'] !== 'PLAYER') {
        respond(false, 'Only PLAYER accounts can add game accounts.'); // Role check
    }

    $body = get_json_body();

    $stmt = $pdo->prepare("
        INSERT INTO game_accounts (player_id, game_name, ign, tag_line, platform)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $_SESSION['user_id'],
        $body['game_name'] ?? '',
        $body['ign']       ?? '',
        $body['tag_line']  ?? '',
        $body['platform']  ?? 'PC'
    ]);

    respond(true, 'Game account linked.', ['id' => (int)$pdo->lastInsertId()]);
}

/** handle_get_game_accounts() — Fetch all linked game accounts for a player */
function handle_get_game_accounts(): void {
    require_auth();
    global $pdo;

    $user_id = (int)($_GET['user_id'] ?? $_SESSION['user_id']);

    // Also fetch the latest performance snapshot per account using a subquery
    $stmt = $pdo->prepare("
        SELECT ga.*,
               pp.account_rank, pp.win_rate, pp.average_kda, pp.average_damage,
               pp.matches_played, pp.captured_at
        FROM game_accounts ga
        LEFT JOIN player_performances pp ON pp.id = (
            SELECT id FROM player_performances           -- Subquery to get only latest snapshot
            WHERE account_id = ga.id
            ORDER BY captured_at DESC LIMIT 1            -- Order by newest, take the first
        )
        WHERE ga.player_id = ?
        ORDER BY ga.id DESC
    ");
    $stmt->execute([$user_id]);
    respond(true, 'OK', $stmt->fetchAll());
}

/** handle_add_performance() — Log a stats snapshot for a game account */
function handle_add_performance(): void {
    require_auth();
    global $pdo;

    $body       = get_json_body();
    $account_id = (int)($body['account_id'] ?? 0);

    // Verify the account belongs to the session user (ownership check)
    $check = $pdo->prepare("SELECT id FROM game_accounts WHERE id = ? AND player_id = ?");
    $check->execute([$account_id, $_SESSION['user_id']]);
    if (!$check->fetch()) respond(false, 'Game account not found or not yours.');

    $stmt = $pdo->prepare("
        INSERT INTO player_performances
            (account_id, account_rank, win_rate, average_kda, average_damage, matches_played)
        VALUES (?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $account_id,
        $body['account_rank']   ?? '',
        $body['win_rate']       ?? 0,
        $body['average_kda']    ?? 0,
        $body['average_damage'] ?? 0,
        $body['matches_played'] ?? 0
    ]);

    respond(true, 'Performance snapshot saved.');
}

/** handle_get_performances() — Get stats history for a game account */
function handle_get_performances(): void {
    require_auth();
    global $pdo;

    $account_id = (int)($_GET['account_id'] ?? 0);
    $stmt = $pdo->prepare("
        SELECT * FROM player_performances
        WHERE account_id = ?
        ORDER BY captured_at DESC
    ");
    $stmt->execute([$account_id]);
    respond(true, 'OK', $stmt->fetchAll());
}

// =============================================================================
// CLIPS HANDLERS
// =============================================================================

/** handle_upload_clip() — Upload a gameplay clip video */
function handle_upload_clip(): void {
    require_auth();
    global $pdo;

    if (!in_array($_SESSION['role'], ['PLAYER','COACH'])) {
        respond(false, 'Only PLAYER and COACH accounts can upload clips.');
    }
    if (!isset($_FILES['clip']) || $_FILES['clip']['error'] !== UPLOAD_ERR_OK) {
        respond(false, 'No clip file uploaded.');
    }

    $file    = $_FILES['clip'];
    $ext     = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $allowed = ['mp4','mov','webm','avi']; // Video formats only

    if (!in_array($ext, $allowed)) {
        respond(false, 'Clip must be a video file (mp4, mov, webm, avi).');
    }
    if ($file['size'] > 100 * 1024 * 1024) { // 100MB max for video clips
        respond(false, 'Clip must be under 100MB.');
    }

    // Get profile_id for the uploader
    $pid_stmt = $pdo->prepare("SELECT id FROM profiles WHERE user_id = ?");
    $pid_stmt->execute([$_SESSION['user_id']]);
    $profile_id = (int)$pid_stmt->fetchColumn();

    ensure_upload_dir('assets/uploads/clips');
    $filename = 'clip_' . $profile_id . '_' . time() . '.' . $ext;
    $dest     = 'assets/uploads/clips/' . $filename;

    if (!move_uploaded_file($file['tmp_name'], $dest)) {
        respond(false, 'Failed to save clip. Check folder permissions.');
    }

    $stmt = $pdo->prepare("
        INSERT INTO clips (profile_id, title, description, clip_url, clip_type)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $profile_id,
        $_POST['title']       ?? 'Untitled Clip',
        $_POST['description'] ?? '',
        $dest,
        strtoupper($_POST['clip_type'] ?? 'HIGHLIGHT')
    ]);

    respond(true, 'Clip uploaded successfully.', ['clip_id' => (int)$pdo->lastInsertId()]);
}

/** handle_get_clips() — Return all clips for a profile */
function handle_get_clips(): void {
    require_auth();
    global $pdo;

    $user_id = (int)($_GET['user_id'] ?? $_SESSION['user_id']);
    $stmt = $pdo->prepare("
        SELECT c.*
        FROM clips c
        JOIN profiles p ON p.id = c.profile_id
        WHERE p.user_id = ?
        ORDER BY c.uploaded_at DESC
    ");
    $stmt->execute([$user_id]);
    respond(true, 'OK', $stmt->fetchAll());
}

// =============================================================================
// RECRUITMENT HANDLERS
// =============================================================================

/** handle_create_offer() — Manager posts a new team recruitment offer */
function handle_create_offer(): void {
    require_auth();
    global $pdo;

    if ($_SESSION['role'] !== 'MANAGER') {
        respond(false, 'Only MANAGER accounts can create team offers.');
    }

    $body = get_json_body();

    $stmt = $pdo->prepare("
        INSERT INTO team_offers (manager_id, team_name, game, target_role, description)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $_SESSION['user_id'],
        $body['team_name']   ?? '',
        $body['game']        ?? '',
        $body['target_role'] ?? '',
        $body['description'] ?? ''
    ]);

    respond(true, 'Offer posted successfully!', ['offer_id' => (int)$pdo->lastInsertId()]);
}

/** handle_get_offers() — List all OPEN team offers (with manager info) */
function handle_get_offers(): void {
    require_auth();
    global $pdo;

    $game   = $_GET['game']   ?? '';   // Optional filter by game
    $role   = $_GET['role']   ?? '';   // Optional filter by role
    $limit  = (int)($_GET['limit']  ?? 20);
    $offset = (int)($_GET['offset'] ?? 0);

    // Build dynamic WHERE clause based on optional filters
    $where  = ["t.status = 'OPEN'"]; // Always filter for open offers
    $params = [];

    if ($game) {
        $where[]  = "t.game LIKE ?";
        $params[] = "%$game%"; // Wildcard search
    }
    if ($role) {
        $where[]  = "t.target_role LIKE ?";
        $params[] = "%$role%";
    }

    $params[] = $limit;
    $params[] = $offset;

    $sql = "
        SELECT t.*, u.username AS manager_username
        FROM team_offers t
        JOIN users u ON u.id = t.manager_id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY t.published_at DESC
        LIMIT ? OFFSET ?
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    respond(true, 'OK', $stmt->fetchAll());
}

/** handle_apply_offer() — Player/coach submits an application */
function handle_apply_offer(): void {
    require_auth();
    global $pdo;

    if ($_SESSION['role'] === 'MANAGER') {
        respond(false, 'Managers cannot apply to offers. Create one instead!');
    }

    $body     = get_json_body();
    $offer_id = (int)($body['offer_id'] ?? 0);
    $message  = trim($body['message'] ?? '');

    if (!$offer_id) respond(false, 'Offer ID is required.');

    // Verify offer exists and is still open
    $check = $pdo->prepare("SELECT id FROM team_offers WHERE id = ? AND status = 'OPEN'");
    $check->execute([$offer_id]);
    if (!$check->fetch()) respond(false, 'Offer not found or no longer open.');

    try {
        $stmt = $pdo->prepare("
            INSERT INTO applications (offer_id, applicant_id, message) VALUES (?, ?, ?)
        ");
        $stmt->execute([$offer_id, $_SESSION['user_id'], $message]);

        // Notify the manager about the new application
        $offer_info = $pdo->prepare("SELECT manager_id, team_name FROM team_offers WHERE id = ?");
        $offer_info->execute([$offer_id]);
        $offer = $offer_info->fetch();

        create_notification(
            $pdo,
            $offer['manager_id'],
            $_SESSION['username'] . ' applied to your offer for ' . $offer['team_name'],
            'APPLICATION'
        );

        respond(true, 'Application submitted successfully!');
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'Duplicate entry') !== false) {
            respond(false, 'You have already applied to this offer.');
        }
        respond(false, 'Application failed: ' . $e->getMessage());
    }
}

/** handle_get_applications() — Manager fetches all applications for their offer */
function handle_get_applications(): void {
    require_auth();
    global $pdo;

    if ($_SESSION['role'] !== 'MANAGER') {
        respond(false, 'Only managers can view applications.');
    }

    $offer_id = (int)($_GET['offer_id'] ?? 0);
    if (!$offer_id) respond(false, 'offer_id required.');

    // Verify the offer belongs to this manager
    $check = $pdo->prepare("SELECT id FROM team_offers WHERE id = ? AND manager_id = ?");
    $check->execute([$offer_id, $_SESSION['user_id']]);
    if (!$check->fetch()) respond(false, 'Offer not found or access denied.');

    $stmt = $pdo->prepare("
        SELECT a.*, u.username, u.role AS applicant_role,
               p.avatar_url, p.nickname
        FROM applications a
        JOIN users    u ON u.id = a.applicant_id
        JOIN profiles p ON p.user_id = u.id
        WHERE a.offer_id = ?
        ORDER BY a.applied_at DESC
    ");
    $stmt->execute([$offer_id]);
    respond(true, 'OK', $stmt->fetchAll());
}

/** handle_update_application() — Manager accepts or rejects an application */
function handle_update_application(): void {
    require_auth();
    global $pdo;

    if ($_SESSION['role'] !== 'MANAGER') respond(false, 'Access denied.');

    $body           = get_json_body();
    $application_id = (int)($body['application_id'] ?? 0);
    $status         = strtoupper($body['status'] ?? '');

    if (!in_array($status, ['ACCEPTED','REJECTED'])) {
        respond(false, 'Status must be ACCEPTED or REJECTED.');
    }

    // Only allow updating applications for this manager's offers
    $stmt = $pdo->prepare("
        UPDATE applications a
        JOIN team_offers t ON t.id = a.offer_id
        SET a.status = ?, a.status_updated_at = NOW()
        WHERE a.id = ? AND t.manager_id = ?
    ");
    $stmt->execute([$status, $application_id, $_SESSION['user_id']]);

    if ($stmt->rowCount() === 0) respond(false, 'Application not found or access denied.');

    // Notify the applicant of the decision
    $info = $pdo->prepare("SELECT applicant_id, t.team_name FROM applications a JOIN team_offers t ON t.id = a.offer_id WHERE a.id = ?");
    $info->execute([$application_id]);
    $app = $info->fetch();

    create_notification(
        $pdo,
        $app['applicant_id'],
        'Your application for ' . $app['team_name'] . ' was ' . strtolower($status) . '.',
        'APPLICATION'
    );

    respond(true, 'Application status updated to ' . $status);
}

/** handle_my_applications() — Applicant checks the status of their own applications */
function handle_my_applications(): void {
    require_auth();
    global $pdo;

    $stmt = $pdo->prepare("
        SELECT a.*, t.team_name, t.game, t.target_role, t.status AS offer_status
        FROM applications a
        JOIN team_offers t ON t.id = a.offer_id
        WHERE a.applicant_id = ?
        ORDER BY a.applied_at DESC
    ");
    $stmt->execute([$_SESSION['user_id']]);
    respond(true, 'OK', $stmt->fetchAll());
}

// =============================================================================
// RATINGS HANDLERS
// =============================================================================

/** handle_add_rating() — Submit a 1–5 star rating on another user's profile */
function handle_add_rating(): void {
    require_auth();
    global $pdo;

    $body       = get_json_body();
    $profile_id = (int)($body['profile_id'] ?? 0);
    $score      = (int)($body['score']      ?? 0);
    $comment    = trim($body['comment']     ?? '');

    if ($score < 1 || $score > 5) respond(false, 'Score must be between 1 and 5.');
    if (!$profile_id)              respond(false, 'profile_id is required.');

    // Prevent rating own profile
    $self = $pdo->prepare("SELECT id FROM profiles WHERE id = ? AND user_id = ?");
    $self->execute([$profile_id, $_SESSION['user_id']]);
    if ($self->fetch()) respond(false, 'You cannot rate your own profile.');

    try {
        // INSERT ... ON DUPLICATE KEY UPDATE — inserts if new, updates if already rated
        $stmt = $pdo->prepare("
            INSERT INTO ratings (giver_id, profile_id, score, comment)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE score = VALUES(score), comment = VALUES(comment), rated_at = NOW()
        ");
        $stmt->execute([$_SESSION['user_id'], $profile_id, $score, $comment]);

        // Notify the profile owner
        $owner = $pdo->prepare("SELECT user_id FROM profiles WHERE id = ?");
        $owner->execute([$profile_id]);
        $owner_row = $owner->fetch();

        create_notification(
            $pdo,
            $owner_row['user_id'],
            $_SESSION['username'] . ' rated your profile ' . $score . '/5 ⭐',
            'RATING'
        );

        respond(true, 'Rating submitted successfully!');
    } catch (PDOException $e) {
        respond(false, 'Rating failed: ' . $e->getMessage());
    }
}

/** handle_get_ratings() — Fetch all ratings for a profile */
function handle_get_ratings(): void {
    require_auth();
    global $pdo;

    $profile_id = (int)($_GET['profile_id'] ?? 0);
    if (!$profile_id) respond(false, 'profile_id required.');

    $stmt = $pdo->prepare("
        SELECT r.score, r.comment, r.rated_at,
               u.username AS giver_username, p.avatar_url AS giver_avatar
        FROM ratings r
        JOIN users    u ON u.id = r.giver_id
        JOIN profiles p ON p.user_id = u.id
        WHERE r.profile_id = ?
        ORDER BY r.rated_at DESC
    ");
    $stmt->execute([$profile_id]);
    respond(true, 'OK', $stmt->fetchAll());
}

// =============================================================================
// MESSAGING HANDLERS
// =============================================================================

/** handle_open_conversation() — Get or create a conversation with another user */
function handle_open_conversation(): void {
    require_auth();
    global $pdo;

    $body         = get_json_body();
    $other_user   = (int)($body['other_user_id'] ?? 0);
    $current_user = (int)$_SESSION['user_id'];

    if (!$other_user || $other_user === $current_user) {
        respond(false, 'Invalid target user.');
    }

    // Normalise so user_one < user_two (prevents duplicate (A,B) and (B,A) rows)
    $u1 = min($current_user, $other_user);
    $u2 = max($current_user, $other_user);

    // Check if conversation already exists
    $check = $pdo->prepare("SELECT id FROM conversations WHERE user_one = ? AND user_two = ?");
    $check->execute([$u1, $u2]);
    $existing = $check->fetch();

    if ($existing) {
        respond(true, 'Conversation opened.', ['conv_id' => (int)$existing['id']]);
    }

    // Create new conversation
    $pdo->prepare("INSERT INTO conversations (user_one, user_two) VALUES (?, ?)")->execute([$u1, $u2]);
    respond(true, 'Conversation started.', ['conv_id' => (int)$pdo->lastInsertId()]);
}

/** handle_get_conversations() — List all conversations for the current user */
function handle_get_conversations(): void {
    require_auth();
    global $pdo;

    $uid = (int)$_SESSION['user_id'];

    $stmt = $pdo->prepare("
        SELECT
            c.id AS conv_id,
            -- Determine the 'other' user in the conversation
            IF(c.user_one = ?, c.user_two, c.user_one) AS other_user_id,
            u.username AS other_username,
            p.avatar_url AS other_avatar,
            -- Get the last message in the conversation using a correlated subquery
            (SELECT message_text FROM messages WHERE conv_id = c.id ORDER BY sent_at DESC LIMIT 1) AS last_message,
            (SELECT sent_at      FROM messages WHERE conv_id = c.id ORDER BY sent_at DESC LIMIT 1) AS last_message_at,
            -- Count unread messages sent by the other person
            (SELECT COUNT(*) FROM messages WHERE conv_id = c.id AND sender_id != ? AND is_read = 0) AS unread_count
        FROM conversations c
        JOIN users    u ON u.id = IF(c.user_one = ?, c.user_two, c.user_one)
        JOIN profiles p ON p.user_id = u.id
        WHERE c.user_one = ? OR c.user_two = ?
        ORDER BY last_message_at DESC
    ");
    $stmt->execute([$uid, $uid, $uid, $uid, $uid]); // Five ? placeholders for the same $uid

    respond(true, 'OK', $stmt->fetchAll());
}

/** handle_get_messages() — Fetch messages in a conversation and mark them as read */
function handle_get_messages(): void {
    require_auth();
    global $pdo;

    $conv_id = (int)($_GET['conv_id'] ?? 0);
    $uid     = (int)$_SESSION['user_id'];

    if (!$conv_id) respond(false, 'conv_id required.');

    // Ensure the user is a participant in this conversation (security check)
    $check = $pdo->prepare("SELECT id FROM conversations WHERE id = ? AND (user_one = ? OR user_two = ?)");
    $check->execute([$conv_id, $uid, $uid]);
    if (!$check->fetch()) respond(false, 'Conversation not found or access denied.');

    // Fetch messages with sender info
    $stmt = $pdo->prepare("
        SELECT m.id, m.sender_id, m.message_text, m.is_read, m.sent_at,
               u.username AS sender_username,
               p.avatar_url AS sender_avatar
        FROM messages m
        JOIN users    u ON u.id = m.sender_id
        JOIN profiles p ON p.user_id = u.id
        WHERE m.conv_id = ?
        ORDER BY m.sent_at ASC
    ");
    $stmt->execute([$conv_id]);
    $messages = $stmt->fetchAll();

    // Mark all unread messages FROM the other user as read
    $pdo->prepare("
        UPDATE messages SET is_read = 1
        WHERE conv_id = ? AND sender_id != ? AND is_read = 0
    ")->execute([$conv_id, $uid]);

    respond(true, 'OK', $messages);
}

/** handle_send_message() — Send a new message in a conversation */
function handle_send_message(): void {
    require_auth();
    global $pdo;

    $body    = get_json_body();
    $conv_id = (int)($body['conv_id']      ?? 0);
    $text    = trim($body['message_text'] ?? ($body['message'] ?? ''));
    $uid     = (int)$_SESSION['user_id'];

    if (!$conv_id || !$text) respond(false, 'conv_id and message_text are required.');

    // Verify membership in conversation
    $check = $pdo->prepare("SELECT user_one, user_two FROM conversations WHERE id = ? AND (user_one = ? OR user_two = ?)");
    $check->execute([$conv_id, $uid, $uid]);
    $convo = $check->fetch();
    if (!$convo) respond(false, 'Conversation not found or access denied.');

    // Insert the message
    $pdo->prepare("INSERT INTO messages (conv_id, sender_id, message_text) VALUES (?, ?, ?)")
        ->execute([$conv_id, $uid, $text]);

    // Determine recipient and send notification
    $recipient_id = ((int)$convo['user_one'] === $uid) ? $convo['user_two'] : $convo['user_one'];
    create_notification(
        $pdo,
        (int)$recipient_id,
        $_SESSION['username'] . ' sent you a message.',
        'MESSAGE'
    );

    respond(true, 'Message sent.', ['message_id' => (int)$pdo->lastInsertId()]);
}

// =============================================================================
// NOTIFICATIONS HANDLERS
// =============================================================================

/** handle_get_notifications() — Return the user's unread notifications */
function handle_get_notifications(): void {
    require_auth();
    global $pdo;

    $stmt = $pdo->prepare("
        SELECT * FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
    ");
    $stmt->execute([$_SESSION['user_id']]);
    $all = $stmt->fetchAll();

    // Count unread separately for the badge display
    $unread = array_filter($all, fn($n) => !$n['is_read']); // Filter to unread only

    respond(true, 'OK', [
        'notifications' => $all,
        'unread_count'  => count($unread)
    ]);
}

/** handle_mark_notification_read() — Mark one or all notifications as read */
function handle_mark_notification_read(): void {
    require_auth();
    global $pdo;

    $body = get_json_body();
    $id   = (int)($body['id'] ?? 0); // 0 means mark ALL as read

    if ($id) {
        // Mark a specific notification as read
        $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?")
            ->execute([$id, $_SESSION['user_id']]);
    } else {
        // Mark ALL of this user's notifications as read
        $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?")
            ->execute([$_SESSION['user_id']]);
    }

    respond(true, 'Notifications marked as read.');
}
