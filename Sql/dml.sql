USE moveout_app;

-- 1. Insert test data for users
INSERT INTO users (name, email, password, verification_code, verified)
VALUES
('John Doe', 'john.doe@example.com', '$2a$10$abcdefghijklmnopqrstuv', '1234', 0),
('Jane Smith', 'jane.smith@example.com', '$2a$10$1234567890abcdefghijklmn', '5678', 1),
('Alice Johnson', 'alice.johnson@example.com', '$2a$10$zyxwvutsrqponmlkjihgfedc', '9101', 1);

-- Show users table after inserting users
SELECT * FROM users;

-- 2. Insert test data for categories (no duplicates allowed)
INSERT IGNORE INTO categories (category_name)
VALUES
('General'),
('Fragile'),
('Hazard');

-- Show categories table after inserting categories
SELECT * FROM categories;

-- 3. Insert test data for labels
CALL add_label('Books', 1, 1, 'These are general books');
-- Show labels table after adding first label
SELECT * FROM labels;

CALL add_label('Glassware', 2, 2, 'Fragile glassware items');
-- Show labels table after adding second label
SELECT * FROM labels;

CALL add_label('Chemicals', 3, 3, 'Hazardous chemicals stored in the lab');
-- Show labels table after adding third label
SELECT * FROM labels;

-- 4. Test generate QR code for labels
CALL generate_qr_code(1, 'QR_CODE_DATA_FOR_BOOKS');
-- Show qr_codes table after generating first QR code
SELECT * FROM qr_codes;

CALL generate_qr_code(2, 'QR_CODE_DATA_FOR_GLASSWARE');
-- Show qr_codes table after generating second QR code
SELECT * FROM qr_codes;

CALL generate_qr_code(3, 'QR_CODE_DATA_FOR_CHEMICALS');
-- Show qr_codes table after generating third QR code
SELECT * FROM qr_codes;

-- 5. Test delete a label
CALL delete_label(2); -- This should delete the label with id 2 (Glassware) and its QR code
-- Show labels and qr_codes tables after deleting the label with id 2
SELECT * FROM labels;
SELECT * FROM qr_codes;

-- 6. Test edit a label
CALL edit_label(1, 'Updated Books', 1, 'Updated memo for the books label');
-- Show labels table after editing the label with id 1
SELECT * FROM labels;

-- 7. Test email verification process
CALL verify_email('1234'); -- This should verify the user with verification code '1234'
-- Show users table after verifying email
SELECT * FROM users;

-- 8. Test remove a user (cascades to delete the labels)
CALL remove_user(3); -- This should remove the user with id 3 (Alice Johnson) and the associated label
-- Show users, labels, and qr_codes tables after removing the user with id 3
SELECT * FROM users;
SELECT * FROM labels;
SELECT * FROM qr_codes;
