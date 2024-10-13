const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../db/dbConnection'); // Your existing DB connection
require('dotenv').config({ path: './config/Google.env' });

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_REDIRECT_URI
},
function(token, tokenSecret, profile, done) {
    const email = profile.emails[0].value;
    const name = profile.displayName;

    // Check if the user already exists in the database
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return done(err);

        if (results.length > 0) {
            // User exists, log them in
            return done(null, results[0]);
        } else {
            // User doesn't exist, create a new account with Google
            const googlePassword = ''; // No password required for Google users
            db.query('INSERT INTO users (name, email, password, verified) VALUES (?, ?, ?, ?)', 
                [name, email, googlePassword, 1], // Automatically set verified to 1
                (err, result) => {
                    if (err) return done(err);
                    
                    // Fetch the newly created user
                    db.query('SELECT * FROM users WHERE id = ?', [result.insertId], (err, newUser) => {
                        if (err) return done(err);
                        return done(null, newUser[0]);
                    });
                });
        }
    });
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    db.query('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
        if (err) return done(err);
        done(null, user[0]);
    });
});
