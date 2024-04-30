// CHECKED
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// CHECKED
// Configure express to use body-parser and serve static files
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'YourSecretKey',
    resave: true,
    saveUninitialized: true
}));

// CHECKED
// Initialize SQLite database in memory
let db = new sqlite3.Database('./database.sqlite', (err) => {
    db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)');
    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        type TEXT,
        category TEXT,
        cost REAL,
        purchase_date DATE,
        reminder TEXT,
        reoccurrence TEXT,
        reminder_date DATE,  
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);
});

// CHECKED
// Handles the data inputted from the add subscription form
app.post('/submit_subscription', (req, res) => {
    const { subscription_type, cost, purchase_date, reminder, reoccurrence } = req.body;
    // Makes sure to use data for the logged in user
    const userId = req.session.userId;  

    // Map subscription types to categories
    const categoryMap = {
        Netflix: "Streaming",
        Hulu: "Streaming",
        Spotify: "Music",
        Amazon: "Delivery"
    };

    const category = categoryMap[subscription_type]

    // Calculate the reminder_date based on purchase_date, reminder, and reoccurrence
    let date = new Date(purchase_date);
    switch (reoccurrence) {
        case 'Weekly':
            date.setDate(date.getDate() + 7);
            break;
        case 'Monthly':
            date.setMonth(date.getMonth() + 1);
            break;
        case 'Annually':
            date.setFullYear(date.getFullYear() + 1);
            break;
    }

    // Adjusting for when the user wants to be reminded
    switch (reminder) {
        case '1 day':
            date.setDate(date.getDate() - 1);
            break;
        case '3 days':
            date.setDate(date.getDate() - 3);
            break;
        case '1 week':
            date.setDate(date.getDate() - 7);
            break;
    }

    const reminderDate = date.toISOString().split('T')[0];  

    db.run(`INSERT INTO subscriptions (user_id, type, category, cost, purchase_date, reminder, reoccurrence, reminder_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, subscription_type, category, parseFloat(cost), purchase_date, reminder, reoccurrence, reminderDate],
        function(err) {
            // Goes back to My Subscription page after adding new subscription with it being displayed
            res.redirect('/');  
            
        });
});

// CHECKED
// Route to delete a subscription
app.delete('/api/delete_subscription/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM subscriptions WHERE id = ?', id, (err) => {
        res.send('Subscription deleted successfully');
    });
});

// CHECKED
// Makes sure that even after logging in/out the subscriptions for a user presented in My Subscriptions
app.get('/api/subscriptions', (req, res) => {
    const userId = req.session.userId;
    db.all(`SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC`, [userId], (err, rows) => {
            res.json(rows);
    });
});

// CHECKED FIX THE MATH THOOOOOOOOOO **********!!!!!!!!!!!
// Fetch alerts for the logged-in user
app.get('/api/alerts', (req, res) => {
    const userId = req.session.userId;
    db.all(`SELECT type, cost, reminder_date FROM subscriptions WHERE user_id = ?`, [userId], (err, rows) => {
        res.json(rows.map(row => {
            const today = new Date();
            const reminderDate = new Date(row.reminder_date);
            const daysLeft = Math.ceil((reminderDate - today) / (1000 * 60 * 60 * 24));
            return {
                type: row.type,
                cost: row.cost,
                daysLeft
            };
        }));
    });
});


// API endpoint to fetch budget information for the logged-in user
app.get('/api/budget', (req, res) => {
    const userId = req.session.userId;

    // Reoccurence Query that totals the cost based off reoccurence period (ie: weekly, monthly)
    const reoccurrenceQuery = `SELECT reoccurrence, SUM(cost) AS totalCost FROM subscriptions WHERE user_id = ? GROUP BY reoccurrence`;

    // Query that groups cost by category and depending on the reoccurence period also annualizes 
    const categoryQuery = `SELECT category, reoccurrence, SUM(cost) AS totalCost FROM subscriptions WHERE user_id = ? GROUP BY category, reoccurrence`;

    // Reoccurence Query
    db.all(reoccurrenceQuery, [userId], (err, reoccurrenceRows) => {
        
        const budget = {
            weekly: 0,
            monthly: 0,
            annually: 0,
            categories: {}
        };

        // Process reoccurrence data
        reoccurrenceRows.forEach(row => {
            switch (row.reoccurrence) {
                case 'Weekly':
                    budget.weekly += row.totalCost; // Annualize weekly costs
                    break;
                case 'Monthly':
                    budget.monthly += row.totalCost; // Annualize monthly costs
                    break;
                case 'Annually':
                    budget.annually += row.totalCost;
                    break;
            }
        });

        // Execute the second query inside the first query's callback
        db.all(categoryQuery, [userId], (err, categoryRows) => {
            // Process category data
            categoryRows.forEach(row => {
                if (!budget.categories[row.category]) {
                    budget.categories[row.category] = 0;
                }
                // Annualize the sum based on reoccurrence
                if (row.reoccurrence === 'Weekly') {
                    budget.categories[row.category] += row.totalCost * 52;
                } else if (row.reoccurrence === 'Monthly') {
                    budget.categories[row.category] += row.totalCost * 12;
                } else { // 'Annually' or unspecified reoccurrence stays as is
                    budget.categories[row.category] += row.totalCost;
                }
            });
            // Send the combined and computed budget data
            res.json(budget);
            
        });
        
    });
});

// Page Movement Routes

// Home Page Route
app.get('/', (req, res) => {
    if (req.session.loggedin) {
        res.sendFile(__dirname + '/home.html');
    } else {
        res.redirect('/login'); 
    }
});

// CHECKED
// Registration Page Route
app.get('/register', (req, res) => {
    res.sendFile(__dirname + '/register.html');
});

// CHECKED
// Add Subscriptions Page Route
app.get('/add_subscriptions', (req, res) => {
    res.sendFile(__dirname + '/add_subscriptions.html');
});

// CHECKED
// Alerts Page Route
app.get('/alerts', (req, res) => {
    res.sendFile(__dirname + '/alerts.html');
});

// CHECKED
// Budget Page Route
app.get('/budget', (req, res) => {
    res.sendFile(__dirname + '/budget.html');
});



// Login Set Up Routes

// CHECKED
// Login Page Route
app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});

// CHECKED
// Login Authentication Route 
app.post('/auth', (req, res) => {
    const { username, password } = req.body;
    if (username && password) {
        db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
            if (row) {
                req.session.loggedin = true;
                 // Storing user id for their ession
                req.session.userId = row.id;  
                res.redirect('/');
            } else {
                res.redirect('/login?error=Incorrect+Username+and/or+Password');
            }
        });
    }
});

app.post('/register', (req, res) => {
    const { username, password, confirm_password } = req.body;

    // Check if passwords match first
    if (password !== confirm_password) {
        res.redirect("/register?error=Passwords+Don't+Match");
        return;
    }

    // Check if username already exists
    db.get('SELECT username FROM users WHERE username = ?', [username], (err, row) => {
        if (row) {
            res.redirect('/register?error=Username+Already+in+Use');
            return;
        }
        // If it doesn't make a new user and log in
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], function(err) {
            res.redirect('/login');
        });
    });
});


// CHECKED
// Logout Route
app.get('/logout', (req, res) => {
    res.redirect('/login');
});


// CHECKED
// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});



