INSERT INTO users (name, email, password, role, verified, is_active, last_active)
VALUES ('Admin User', 'admin@moveout.com', '$2b$10$HcZfw4veqw0NUBmPDGQFzeEVPnOiCI5oJhARMbr.XHmMpFFIA1UoC', 'admin', TRUE, TRUE, NOW());


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
    IF p_public THEN
        -- Public label, use the existing memo column, no verification_url needed
        INSERT INTO labels (label_name, user_id, category_id, memo, public, pin) 
        VALUES (p_label_name, p_user_id, p_category_id, p_memo, p_public, p_pin);
    ELSE
        -- Private label, store the verification URL in the new column
        INSERT INTO labels (label_name, user_id, category_id, memo, public, pin, verification_url) 
        VALUES (p_label_name, p_user_id, p_category_id, p_memo, p_public, p_pin, p_memo);
    END IF;

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
    IN p_public BOOLEAN,  
    IN p_pin VARCHAR(6)  
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
    SELECT new_user_id, id FROM categories WHERE category_name IN ('Fragile', 'Hazard', 'General', 'Care');
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

-- Function to send notification to a user
DELIMITER $$ 
CREATE PROCEDURE send_notification_to_user(
    IN adminId INT, 
    IN userId INT, 
    IN message TEXT, 
    IN notif_type ENUM('marketing', 'system', 'reminder', 'label_share')
)
BEGIN
    DECLARE adminRole ENUM('user', 'admin');

    -- Check if the sender is an admin
    SELECT role INTO adminRole FROM users WHERE id = adminId;

    IF adminRole = 'admin' THEN
        -- Insert a new notification for the specified user
        INSERT INTO notifications (user_id, sender_id, message, type)
        VALUES (userId, adminId, message, notif_type);
    ELSE
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Permission denied: Only admin can send notifications.';
    END IF;
END$$
DELIMITER ;

-- Function send notification to all users
DELIMITER $$ 
CREATE PROCEDURE send_notification_to_all(
    IN adminId INT, 
    IN message TEXT, 
    IN notif_type ENUM('marketing', 'system', 'reminder')
)
BEGIN
    DECLARE adminRole ENUM('user', 'admin');

    -- Check if the current user is an admin
    SELECT role INTO adminRole FROM users WHERE id = adminId;

    IF adminRole = 'admin' THEN
        -- Insert a new global notification for all users except the admin
        INSERT INTO notifications (user_id, sender_id, message, type, is_global)
        SELECT id, adminId, message, notif_type, TRUE -- Mark the notification as global
        FROM users
        WHERE id != adminId;  -- Exclude the admin from receiving their own notification
    ELSE
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Permission denied: Only admin can send notifications.';
    END IF;
END$$
DELIMITER ;


-- Function: Get notifications for a user, including shared label details
DELIMITER $$ 
CREATE PROCEDURE get_notifications_for_user(
    IN userId INT
)
BEGIN
    -- Select notifications for the given user
    SELECT 
        n.id, 
        n.message, 
        n.type, 
        n.is_read, 
        n.created_at,
        CASE 
            WHEN n.type = 'label_share' THEN (
                SELECT CONCAT('Label: ', l.label_name, ' (Shared by ', u.name, ')')
                FROM shared_labels sl
                JOIN labels l ON sl.label_id = l.id
                JOIN users u ON sl.sender_id = u.id
                WHERE sl.recipient_id = n.user_id
                LIMIT 1
            )
            ELSE NULL
        END AS additional_info  -- Add shared label details for label_share notifications
    FROM notifications n
    WHERE n.user_id = userId
    ORDER BY n.created_at DESC;
END$$
DELIMITER ;

-- Add notification for shared label
DELIMITER $$ 
CREATE PROCEDURE notify_label_share(
    IN senderId INT, 
    IN recipientId INT, 
    IN labelId INT, 
    IN message TEXT
)
BEGIN
    -- Insert a new notification for shared label
    INSERT INTO notifications (user_id, sender_id, message, type)
    VALUES (recipientId, senderId, message, 'label_share');
END$$
DELIMITER ;

-- Function: Mark notification as read
DELIMITER $$
CREATE PROCEDURE mark_notification_as_read(
    IN notificationId INT
)
BEGIN
    -- Mark the specified notification as read
    UPDATE notifications
    SET is_read = TRUE
    WHERE id = notificationId;
END$$
DELIMITER ;

-- Function: Delete notification
DELIMITER $$
CREATE PROCEDURE delete_notification(
    IN notificationId INT
)
BEGIN
    -- Delete the specified notification
    DELETE FROM notifications
    WHERE id = notificationId;
END$$
DELIMITER ;

-- share label with another user
DELIMITER $$
CREATE PROCEDURE share_label_with_user(
    IN senderId INT,
    IN recipientId INT,
    IN labelId INT
)
BEGIN
    -- Insert a new shared label entry
    INSERT INTO shared_labels (sender_id, recipient_id, label_id, status)
    VALUES (senderId, recipientId, labelId, 'pending');

    -- Send a notification to the recipient
    INSERT INTO notifications (user_id, message, type)
    VALUES (recipientId, CONCAT('A label has been shared with you by user ', senderId), 'system');
END$$
DELIMITER ;

-- accept shared label
DELIMITER $$
CREATE PROCEDURE accept_shared_label(
    IN recipientId INT,
    IN sharedLabelId INT
)
BEGIN
    -- Update the status of the shared label to 'accepted'
    UPDATE shared_labels
    SET status = 'accepted'
    WHERE id = sharedLabelId;

    -- Send a notification to the sender
    INSERT INTO notifications (user_id, message, type)
    VALUES ((SELECT sender_id FROM shared_labels WHERE id = sharedLabelId), CONCAT('User ', recipientId, ' has accepted your shared label'), 'system');
END$$
DELIMITER ;

-- decline shared label
DELIMITER $$
CREATE PROCEDURE decline_shared_label(
    IN recipientId INT,
    IN sharedLabelId INT
)
BEGIN
    -- Update the status of the shared label to 'declined'
    UPDATE shared_labels
    SET status = 'declined'
    WHERE id = sharedLabelId;

    -- Send a notification to the sender
    INSERT INTO notifications (user_id, message, type)
    VALUES ((SELECT sender_id FROM shared_labels WHERE id = sharedLabelId), CONCAT('User ', recipientId, ' has declined your shared label'), 'system');
END$$
DELIMITER ;

-- Function: Get shared labels for a user
DELIMITER $$
CREATE PROCEDURE get_shared_labels_for_user(
    IN userId INT
)
BEGIN
    -- Select all shared labels for the given user
    SELECT 
        shared_labels.id, 
        shared_labels.sender_id, 
        shared_labels.recipient_id, 
        shared_labels.label_id, 
        shared_labels.status, 
        shared_labels.created_at,
        labels.label_name
    FROM 
        shared_labels
    JOIN 
        labels ON shared_labels.label_id = labels.id
    WHERE 
        shared_labels.recipient_id = userId;
END$$
DELIMITER ;

-- Function: deactivate user
DELIMITER $$
CREATE PROCEDURE deactivate_user_account(
    IN userId INT
)
BEGIN
    -- Check if the user is an admin
    DECLARE userRole ENUM('user', 'admin');
    SELECT role INTO userRole FROM users WHERE id = userId;

    IF userRole = 'admin' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Admin accounts cannot be deactivated.';
    ELSE
        -- Deactivate the user account
        UPDATE users
        SET last_active = NOW(), is_active = 0
        WHERE id = userId;
    END IF;
END$$
DELIMITER ;

-- Function: reactivate user
DELIMITER $$
CREATE PROCEDURE reactivate_user_account(
    IN userId INT
)
BEGIN
    -- Mark the user as active and update the last active time
    UPDATE users
    SET last_active = NOW(), is_active = 1
    WHERE id = userId;
END$$
DELIMITER ;

-- Function: get all users
DELIMITER $$
CREATE PROCEDURE get_all_users()
BEGIN
    -- Select all users excluding admins and format the last_active field
    SELECT 
        id, 
        name, 
        email, 
        verified, 
        role, 
        is_active, 
        DATE_FORMAT(last_active, '%Y-%m-%d %H:%i:%s') AS last_active
    FROM users
    WHERE role = 'user'; -- Exclude admins
END$$
DELIMITER ;

-- Function:; automatically update last active time
DELIMITER $$
CREATE PROCEDURE update_last_active_time(
    IN userId INT
)
BEGIN
    -- Update the last active time for the user
    UPDATE users
    SET last_active = NOW()
    WHERE id = userId;
END$$
DELIMITER ;

-- Function auto deactivate user
DELIMITER $$
CREATE PROCEDURE auto_deactivate_user()
BEGIN

    DELETE FROM users
    WHERE last_active < DATE_SUB(NOW(), INTERVAL 60 DAY)  -- 30 days inactivity + 30 days deactivated
    AND is_active = 0;

END$$
DELIMITER ;

-- Function auto delete inactive users
DELIMITER $$
CREATE PROCEDURE auto_delete_inactive_users()
BEGIN
    -- Delete users who have been inactive for more than 1 year
    DELETE FROM users
    WHERE last_active < DATE_SUB(NOW(), INTERVAL 1 YEAR);
END$$
DELIMITER ;

