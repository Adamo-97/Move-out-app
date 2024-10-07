-- Drop the database if it exists and recreate it
DROP DATABASE IF EXISTS moveout_app;
CREATE DATABASE IF NOT EXISTS moveout_app;
USE moveout_app;

-- Drop tables if they exist for resetting the schema
DROP TABLE IF EXISTS qr_codes;
DROP TABLE IF EXISTS labels;
DROP TABLE IF EXISTS user_categories;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;

-- Create the users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,  -- Store hashed passwords
    verified BOOLEAN DEFAULT 0,      -- Email verification flag
    verification_code VARCHAR(4)     -- Verification code for email
);

-- Create the categories table
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(50) NOT NULL
);

-- Insert initial categories (use INSERT IGNORE to avoid duplicates)
INSERT INTO categories (category_name) VALUES ('Fragile'), ('Hazard'), ('General');

-- Create the labels table with ON DELETE CASCADE for user_id and category_id
CREATE TABLE labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    label_name VARCHAR(255) NOT NULL,
    user_id INT,  -- This matches the data type of `id` in the `users` table
    category_id INT,  -- This matches the data type of `id` in the `categories` table
    memo TEXT,
    public BOOLEAN DEFAULT TRUE,  -- New public column with default value as TRUE
    pin VARCHAR(6),  -- New column to store the 6-digit pin for private labels
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Create the QR codes table with ON DELETE CASCADE for label_id
CREATE TABLE qr_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    label_id INT,  -- This matches the data type of `id` in the `labels` table
    qr_code_data VARCHAR(255) NOT NULL,  -- Store QR code data
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
);

-- Create the user_categories table
CREATE TABLE user_categories (
    user_category_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,  -- Matches the `id` column in the `users` table
    category_id INT,  -- Matches the `id` column in the `categories` table
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);
