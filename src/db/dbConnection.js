require('dotenv').config({ path: '../../config/config.env' }); // Load environment variables from .env
const mysql = require('mysql2');

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
});

db.connect((err) => {
    console.log('Connecting to database with the following details:');
    console.log('Host:', process.env.DB_HOST);
    console.log('User:', process.env.DB_USER);
    console.log('Database:', process.env.DB_NAME);

    if (err) {
        console.error('Error connecting to the database:', err);
    } else {
        console.log('Connected to the MariaDB database.');
    }
});

module.exports = db;
