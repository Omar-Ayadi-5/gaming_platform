-- FILE: schema.sql
-- Fixed to match api.php and script.js for GGNexus Esports Platform
-- Run in phpMyAdmin or MySQL CLI. This resets the esports_platform database tables.

CREATE DATABASE IF NOT EXISTS esports_platform
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE esports_platform;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS ratings;
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS team_offers;
DROP TABLE IF EXISTS player_performances;
DROP TABLE IF EXISTS game_accounts;
DROP TABLE IF EXISTS clips;
DROP TABLE IF EXISTS career_backgrounds;
DROP TABLE IF EXISTS media;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS feeds;
DROP TABLE IF EXISTS manager_profiles;
DROP TABLE IF EXISTS coach_profiles;
DROP TABLE IF EXISTS player_profiles;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    username   VARCHAR(50)  UNIQUE NOT NULL,
    email      VARCHAR(120) UNIQUE NOT NULL,
    password   VARCHAR(255) NOT NULL,
    role       ENUM('PLAYER','COACH','MANAGER') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE profiles (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNIQUE NOT NULL,
    nickname   VARCHAR(80),
    bio        TEXT,
    avatar_url VARCHAR(255) DEFAULT 'assets/uploads/avatars/default.png',
    banner_url VARCHAR(255) DEFAULT 'assets/uploads/banners/default.jpg',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE player_profiles (
    profile_id INT PRIMARY KEY,
    main_game  VARCHAR(80),
    main_role  VARCHAR(80),
    region     VARCHAR(30),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE coach_profiles (
    profile_id INT PRIMARY KEY,
    main_game  VARCHAR(80),
    positions  VARCHAR(255),
    region     VARCHAR(30),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manager_profiles (
    profile_id INT PRIMARY KEY,
    main_game  VARCHAR(80),
    team_name  VARCHAR(120),
    region     VARCHAR(30),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE feeds (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    profile_id INT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE posts (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    feed_id    INT NOT NULL,
    user_id    INT NOT NULL,
    content    TEXT,
    post_type  ENUM('TEXT','IMAGE','CLIP') DEFAULT 'TEXT',
    visibility ENUM('PUBLIC','FOLLOWERS','PRIVATE') DEFAULT 'PUBLIC',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE media (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    post_id     INT NOT NULL,
    media_url   VARCHAR(255) NOT NULL,
    media_type  ENUM('IMAGE','VIDEO') NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE career_backgrounds (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    profile_id   INT NOT NULL,
    category     ENUM('TEAM','ACHIEVEMENT','EDUCATION','OTHER','EXPERIENCE','CERTIFICATION') DEFAULT 'OTHER',
    title        VARCHAR(120) NOT NULL,
    organization VARCHAR(120),
    role_name    VARCHAR(80),
    start_date   DATE NULL,
    end_date     DATE NULL,
    description  TEXT,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE clips (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    profile_id  INT NOT NULL,
    title       VARCHAR(120) NOT NULL,
    description TEXT,
    clip_url    VARCHAR(255) NOT NULL,
    clip_type   ENUM('HIGHLIGHT','ANALYSIS','MONTAGE','OTHER') DEFAULT 'HIGHLIGHT',
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE game_accounts (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    player_id  INT NOT NULL,
    game_name  VARCHAR(80) NOT NULL,
    ign        VARCHAR(80) NOT NULL,
    tag_line   VARCHAR(30),
    platform   VARCHAR(40) DEFAULT 'PC',
    FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE player_performances (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    account_id      INT NOT NULL,
    account_rank    VARCHAR(80),
    win_rate        DECIMAL(5,2) DEFAULT 0,
    average_kda     DECIMAL(6,2) DEFAULT 0,
    average_damage  DECIMAL(10,2) DEFAULT 0,
    matches_played  INT DEFAULT 0,
    captured_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES game_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_offers (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    manager_id   INT NOT NULL,
    team_name    VARCHAR(120) NOT NULL,
    game         VARCHAR(80) NOT NULL,
    target_role  VARCHAR(80) NOT NULL,
    description  TEXT,
    status       ENUM('OPEN','CLOSED') DEFAULT 'OPEN',
    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE applications (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    offer_id          INT NOT NULL,
    applicant_id      INT NOT NULL,
    message           TEXT,
    status            ENUM('PENDING','ACCEPTED','REJECTED') DEFAULT 'PENDING',
    applied_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY no_duplicate_apply (offer_id, applicant_id),
    FOREIGN KEY (offer_id) REFERENCES team_offers(id) ON DELETE CASCADE,
    FOREIGN KEY (applicant_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ratings (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    giver_id   INT NOT NULL,
    profile_id INT NOT NULL,
    score      TINYINT NOT NULL,
    comment    TEXT,
    rated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY one_rating_per_user (giver_id, profile_id),
    FOREIGN KEY (giver_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE conversations (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_one   INT NOT NULL,
    user_two   INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_conversation (user_one, user_two),
    FOREIGN KEY (user_one) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user_two) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE messages (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    conv_id      INT NOT NULL,
    sender_id    INT NOT NULL,
    message_text TEXT NOT NULL,
    is_read      BOOLEAN DEFAULT FALSE,
    sent_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conv_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    content    TEXT NOT NULL,
    type       ENUM('MESSAGE','APPLICATION','RATING','OFFER','SYSTEM') NOT NULL DEFAULT 'SYSTEM',
    link_url   VARCHAR(255),
    is_read    BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_posts_feed     ON posts(feed_id);
CREATE INDEX idx_posts_user     ON posts(user_id);
CREATE INDEX idx_posts_created  ON posts(created_at);
CREATE INDEX idx_media_post     ON media(post_id);
CREATE INDEX idx_messages_conv  ON messages(conv_id);
CREATE INDEX idx_notif_user     ON notifications(user_id, is_read);
CREATE INDEX idx_offers_status  ON team_offers(status);
CREATE INDEX idx_offers_game    ON team_offers(game);
CREATE INDEX idx_apps_offer     ON applications(offer_id);
CREATE INDEX idx_ratings_profile ON ratings(profile_id);

-- Demo data. Password for all demo users is: password
INSERT INTO users (id, username, email, password, role) VALUES
(1, 'ProSniper', 'player@esports.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'PLAYER'),
(2, 'CoachMike', 'coach@esports.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'COACH'),
(3, 'ManagerPro', 'manager@esports.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'MANAGER');

INSERT INTO profiles (id, user_id, nickname, bio) VALUES
(1, 1, 'ProSniper', 'Valorant duelist looking for a serious roster.'),
(2, 2, 'CoachMike', 'Tactical coach focused on team development and VOD reviews.'),
(3, 3, 'ManagerPro', 'Recruiting motivated players for Team Nexus.');

INSERT INTO player_profiles (profile_id, main_game, main_role, region) VALUES
(1, 'Valorant', 'Duelist', 'EUW');

INSERT INTO coach_profiles (profile_id, main_game, positions, region) VALUES
(2, 'Valorant', 'Tactical Coach, Analyst', 'EUW');

INSERT INTO manager_profiles (profile_id, main_game, team_name, region) VALUES
(3, 'Valorant', 'Team Nexus', 'EUW');

INSERT INTO feeds (profile_id) VALUES (1), (2), (3);

INSERT INTO game_accounts (player_id, game_name, ign, tag_line, platform) VALUES
(1, 'Valorant', 'ProSniper', '#EUW', 'PC');

INSERT INTO player_performances (account_id, account_rank, win_rate, average_kda, average_damage, matches_played) VALUES
(1, 'Diamond 2', 58.50, 1.85, 164.20, 350);

INSERT INTO team_offers (manager_id, team_name, game, target_role, description) VALUES
(3, 'Team Nexus', 'Valorant', 'Entry Fragger', 'Looking for a committed Entry Fragger with strong comms and VOD review discipline.');

INSERT INTO posts (feed_id, user_id, content, post_type, visibility) VALUES
(1, 1, 'Ready for tryouts this week. Dropping new clips soon!', 'TEXT', 'PUBLIC'),
(2, 2, 'Coaches: consistency beats mechanics when pressure hits.', 'TEXT', 'PUBLIC'),
(3, 3, 'Team Nexus recruitment is open. Check the Recruitment Hub.', 'TEXT', 'PUBLIC');

INSERT INTO ratings (giver_id, profile_id, score, comment) VALUES
(2, 1, 5, 'Strong mechanics and great communication.');
