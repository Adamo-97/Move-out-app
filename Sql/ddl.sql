-- Drop the database if it exists and recreate it
DROP DATABASE IF EXISTS moveout_app;
CREATE DATABASE IF NOT EXISTS moveout_app;
USE moveout_app;

-- Drop tables if they exist for resetting the schema
DROP TABLE IF EXISTS qr_codes, labels, user_categories, shared_labels, categories, users, notifications;

-- Create the users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,  -- Store hashed passwords
    verified BOOLEAN DEFAULT 0,      -- Email verification flag
    verification_code VARCHAR(4),     -- Verification code for email
    role ENUM('user', 'admin') DEFAULT 'user',
    is_active BOOLEAN DEFAULT TRUE,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the categories table
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(50) NOT NULL
);
-- Insert initial categories (use INSERT IGNORE to avoid duplicates)
INSERT INTO categories (category_name) VALUES ('Fragile'), ('Hazard'), ('General'), ('Care');

-- Create the labels table with ON DELETE CASCADE for user_id and category_id
CREATE TABLE labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    label_name VARCHAR(255) NOT NULL,
    user_id INT,  
    category_id INT,
    memo TEXT,
    public BOOLEAN DEFAULT TRUE,
    pin VARCHAR(6),
    verification_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Create the QR codes table with ON DELETE CASCADE for label_id
CREATE TABLE qr_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    label_id INT,
    qr_code_data VARCHAR(255) NOT NULL,  -- Store QR code data
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
);

-- Create the user_categories table
CREATE TABLE user_categories (
    user_category_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    category_id INT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Create the shared_labels table
CREATE TABLE shared_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    recipient_id INT NOT NULL,
    label_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'declined') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
);

-- Create the notifications table
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,  -- The recipient of the notification
    sender_id INT,         -- Optional: The sender of the notification (can be NULL for system messages)
    message TEXT NOT NULL, -- The content of the notification
    type ENUM('marketing', 'system', 'reminder', 'label_share') NOT NULL, -- Type of notification
    status ENUM('unread', 'read') DEFAULT 'unread', -- Read/unread status
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of when the notification was created
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, -- Link to users table
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL -- Sender can be NULL
);
