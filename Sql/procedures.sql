-- Function: Add a new user
DELIMITER $$
CREATE PROCEDURE add_new_user(
    IN name VARCHAR(255),
    IN email VARCHAR(255),
    IN password VARCHAR(255),
    IN verification_code VARCHAR(4),
    IN verified BOOLEAN
)
BEGIN
    -- Insert new user into the `users` table
    INSERT INTO users (name, email, password, verification_code, verified)
    VALUES (name, email, password, verification_code, verified);
    
    -- Get the last inserted user ID
    SET @new_user_id = LAST_INSERT_ID();
    
    -- Assign default categories to the new user
    CALL assign_default_categories(@new_user_id);
END$$
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
    IN p_memo TEXT,
    IN p_public BOOLEAN, 
    IN p_pin VARCHAR(6)   
)
BEGIN
    INSERT INTO labels (label_name, user_id, category_id, memo, public, pin) 
    VALUES (p_label_name, p_user_id, p_category_id, p_memo, p_public, p_pin);

    -- Return the newly inserted label ID
    SELECT LAST_INSERT_ID() AS label_id;
END $$
DELIMITER ;

-- Function: Generate QR code and insert into qr_codes table
DELIMITER $$
CREATE PROCEDURE generate_qr_code(IN p_label_id INT, IN p_qr_data TEXT)
BEGIN
    INSERT INTO qr_codes (label_id, qr_code_data) 
    VALUES (p_label_id, p_qr_data);
END $$
DELIMITER ;

-- Function: Delete a label (permanently delete the label)
DELIMITER $$
CREATE PROCEDURE delete_label(IN p_label_id INT)
BEGIN
    -- Delete from the child table (qr_codes) first if it exists
    DELETE FROM qr_codes 
    WHERE label_id = p_label_id;

    -- Delete from the parent table (labels)
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
    IN p_memo TEXT,
    IN p_public BOOLEAN,  -- New parameter for public status
    IN p_pin VARCHAR(6)   -- New parameter for the pin
)
BEGIN
    UPDATE labels 
    SET 
        label_name = p_label_name, 
        category_id = p_category_id, 
        memo = p_memo, 
        public = p_public,  -- Update the public status
        pin = p_pin,        -- Update the pin
        updated_at = CURRENT_TIMESTAMP 
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

-- Function: Assign default categories to new users
DELIMITER $$
CREATE PROCEDURE assign_default_categories(IN new_user_id INT)
BEGIN
    INSERT INTO user_categories (user_id, category_id)
    SELECT new_user_id, id FROM categories WHERE category_name IN ('Fragile', 'Hazard', 'General');
END$$
DELIMITER ;

-- Function: Add a custom category for a user
DELIMITER $$
CREATE PROCEDURE add_custom_category(
    IN user_id INT,
    IN category_name VARCHAR(255)
)
BEGIN
    DECLARE category_id INT;

    -- Check if the category already exists
    SELECT id INTO category_id FROM categories WHERE category_name = category_name;

    -- If category doesn't exist, insert it into `categories`
    IF category_id IS NULL THEN
        INSERT INTO categories (category_name) VALUES (category_name);
        SET category_id = LAST_INSERT_ID();
    END IF;

    -- Link the new or existing category to the user in `user_categories`
    INSERT INTO user_categories (user_id, category_id)
    VALUES (user_id, category_id);
END$$
DELIMITER ;

-- Function: Get labels for each user
DELIMITER $$
CREATE PROCEDURE get_user_labels(
    IN p_user_id INT
)
BEGIN
    SELECT 
        labels.id AS label_id,
        labels.label_name,
        labels.category_id,
        labels.memo,
        labels.public,
        labels.created_at,
        labels.updated_at,
        qr_codes.qr_code_data  -- Include QR code data
    FROM 
        labels
    LEFT JOIN 
        qr_codes ON labels.id = qr_codes.label_id  -- Join with qr_codes table
    WHERE 
        labels.user_id = p_user_id;
END $$
DELIMITER ;

-- Function to share lables between users 
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

--filtering and sorting of labels based on the various criteria
DELIMITER $$
CREATE PROCEDURE filter_user_labels(
    IN p_user_id INT,
    IN p_search_keyword VARCHAR(255),
    IN p_order_by_date ENUM('asc', 'desc'),
    IN p_category_id INT,
    IN p_public_only BOOLEAN
)
BEGIN
    SELECT 
        labels.id AS label_id,
        labels.label_name,
        labels.category_id,
        labels.memo,
        labels.public,
        labels.created_at,
        labels.updated_at,
        qr_codes.qr_code_data
    FROM 
        labels
    LEFT JOIN 
        qr_codes ON labels.id = qr_codes.label_id
    WHERE 
        labels.user_id = p_user_id
        AND (p_search_keyword IS NULL OR labels.label_name LIKE CONCAT('%', p_search_keyword, '%'))
        AND (p_category_id IS NULL OR labels.category_id = p_category_id)
        AND (p_public_only IS NULL OR labels.public = p_public_only)
    ORDER BY 
        CASE 
            WHEN p_order_by_date = 'asc' THEN labels.created_at
            ELSE NULL
        END ASC,
        CASE 
            WHEN p_order_by_date = 'desc' THEN labels.created_at
            ELSE NULL
        END DESC;
END $$
DELIMITER ;