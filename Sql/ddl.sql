-- Drop the database if it exists and recreate it
DROP DATABASE IF EXISTS moveout_app;
CREATE DATABASE IF NOT EXISTS moveout_app;
USE moveout_app;

-- Drop tables if they exist for resetting the schema
DROP TABLE IF EXISTS qr_codes;
DROP TABLE IF EXISTS labels;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;

-- Create the users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,  -- Store hashed passwords
    verified BOOLEAN DEFAULT 0,      -- Email verification flag
    verification_code VARCHAR(4)
);

-- Create the categories table
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(50) NOT NULL
);

-- Insert initial categories (use INSERT IGNORE to avoid duplicates)
INSERT IGNORE INTO categories (category_name) VALUES ('General'), ('Fragile'), ('Hazard');

-- Create the labels table with ON DELETE CASCADE for user_id and category_id
CREATE TABLE labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    label_name VARCHAR(255) NOT NULL,
    user_id INT,
    category_id INT,
    memo TEXT,
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

-- Function: Add a new user
DELIMITER $$

CREATE PROCEDURE add_new_user(
    IN p_name VARCHAR(255),
    IN p_email VARCHAR(255),
    IN p_password VARCHAR(255),
    IN p_verification_code VARCHAR(4),
    IN p_verified BOOLEAN
)
BEGIN
    INSERT INTO users (name, email, password, verification_code, verified)
    VALUES (p_name, p_email, p_password, p_verification_code, p_verified);
END $$

DELIMITER ;

-- Function: Remove a user
DELIMITER $$
CREATE PROCEDURE remove_user(IN p_user_id INT)
BEGIN
    DELETE FROM users WHERE id = p_user_id;
END $$
DELIMITER ;

-- Function: Add a label and memo or QR code
DELIMITER $$
CREATE PROCEDURE add_label(
    IN p_label_name VARCHAR(255),
    IN p_user_id INT,
    IN p_category_id INT,
    IN p_memo TEXT
)
BEGIN
    INSERT INTO labels (label_name, user_id, category_id, memo) 
    VALUES (p_label_name, p_user_id, p_category_id, p_memo);
END $$
DELIMITER ;

-- Function: Generate QR code and insert into qr_codes table
DELIMITER $$
CREATE PROCEDURE generate_qr_code(IN p_label_id INT, IN p_qr_data VARCHAR(255))
BEGIN
    INSERT INTO qr_codes (label_id, qr_code_data) 
    VALUES (p_label_id, p_qr_data);
END $$
DELIMITER ;

-- Function: Delete a label (permanently delete the label)
DELIMITER $$
CREATE PROCEDURE delete_label(IN p_label_id INT)
BEGIN
    DELETE FROM labels 
    WHERE id = p_label_id;
END $$
DELIMITER ;

-- Function: Edit a label
DELIMITER $$
CREATE PROCEDURE edit_label(
    IN p_label_id INT,
    IN p_label_name VARCHAR(255),
    IN p_category_id INT,
    IN p_memo TEXT
)
BEGIN
    UPDATE labels 
    SET label_name = p_label_name, category_id = p_category_id, memo = p_memo, updated_at = CURRENT_TIMESTAMP 
    WHERE id = p_label_id;
END $$
DELIMITER ;

-- Function: Verify email by checking code and updating user
DELIMITER $$

CREATE PROCEDURE verify_email(
    IN p_verification_code VARCHAR(4)
)
BEGIN
    UPDATE users
    SET verified = TRUE
    WHERE verification_code = p_verification_code;
END $$

DELIMITER ;

-- Show tables for verification
SHOW TABLES;
