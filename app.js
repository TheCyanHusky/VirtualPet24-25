const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
const db = new sqlite3.Database(path.join(__dirname, 'database.db'));

db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password TEXT)");
  db.run(`CREATE TABLE IF NOT EXISTS pets (
    username TEXT PRIMARY KEY,
    pet_name TEXT,
    pet_type TEXT,
    hunger INTEGER,
    happiness INTEGER,
    personality TEXT,
    coins INTEGER DEFAULT 0,
    current_outfit TEXT DEFAULT 'none',
    owned_outfits TEXT DEFAULT 'default'
  )`);
});

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.get('/signup', (req, res) => {
  res.render('signup');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
    if (err) {
      res.send('Error occurred. <a href="/login">Try again</a>' + "  " + err);
    } else if (row) {
      req.session.user = username;
      db.get("SELECT * FROM pets WHERE username = ?", [username], (err, pet) => {
        if (err) {
          res.send('Error occurred. <a href="/login">Try again</a>' + "  " + err);
        } else if (pet) {
          res.redirect('/home');
        } else {
          res.redirect('/select-pet');
        }
      });
    } else {
      res.send('Invalid username or password. <a href="/login">Try again</a>');
    }
  });
});

app.post('/signup', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
    if (err) {
      res.send('Error occurred. <a href="/signup">Try again</a>');
    } else if (row) {
      res.send('Username already taken. <a href="/signup">Try again</a>');
    } else {
      db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, password], (err) => {
        if (err) {
          res.send('Error occurred. <a href="/signup">Try again</a>');
        } else {
          req.session.user = username;
          res.redirect('/select-pet');
        }
      });
    }
  });
});

app.get('/select-pet', (req, res) => {
  if (req.session.user) {
    res.render('select-pet');
  } else {
    res.redirect('/');
  }
});

app.post('/select-pet', (req, res) => {
  const { pet_name, pet_type } = req.body;
  const personalityTraits = ['Friendly', 'Playful', 'Lazy', 'Curious'];
  const personality = personalityTraits[Math.floor(Math.random() * personalityTraits.length)];
  if (req.session.user) {
    db.run("INSERT INTO pets (username, pet_name, pet_type, hunger, happiness, personality, coins) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [req.session.user, pet_name, pet_type, 50, 50, personality, 0], (err) => {
        if (err) {
          res.send('Error occurred. <a href="/select-pet">Try again</a>');
        } else {
          res.redirect('/home');
        }
      });
  } else {
    res.redirect('/');
  }
});

app.get('/home', (req, res) => {
  if (req.session.user) {
    db.get("SELECT * FROM pets WHERE username = ?", [req.session.user], (err, pet) => {
      if (err) {
        res.send('Error occurred. <a href="/login">Try again</a>' + "  " + err);
      } else if (pet) {
        const ownedOutfits = pet.owned_outfits ? pet.owned_outfits.split(',') : ['default'];
        res.render('home', { user: req.session.user, pet, ownedOutfits });
      } else {
        res.redirect('/select-pet');
      }
    });
  } else {
    res.redirect('/');
  }
});

app.get('/play', (req, res) => {
  if (req.session.user) {
    res.render('play');
  } else {
    res.redirect('/');
  }
});

app.post('/play', (req, res) => {
  if (req.session.user) {
    db.run("UPDATE pets SET happiness = happiness + 10, coins = coins + 5 WHERE username = ?", [req.session.user], (err) => {
      if (err) {
        res.send('Error occurred. <a href="/home">Try again</a>' + "  " + err);
      } else {
        res.redirect('/play');
      }
    });
  } else {
    res.redirect('/');
  }
});

app.get('/shop', (req, res) => {
  if (req.session.user) {
    db.get("SELECT owned_outfits FROM pets WHERE username = ?", [req.session.user], (err, row) => {
      if (err) {
        res.send('Error occurred. <a href="/home">Try again</a>' + "  " + err);
      } else if (row) {
        const ownedOutfits = row.owned_outfits ? row.owned_outfits.split(',') : ['default'];
        res.render('shop', { ownedOutfits });
      }
    });
  } else {
    res.redirect('/');
  }
});

app.post('/shop', (req, res) => {
  const { outfit } = req.body;
  if (req.session.user) {
    db.get("SELECT coins, owned_outfits FROM pets WHERE username = ?", [req.session.user], (err, row) => {
      if (err) {
        res.send('Error occurred. <a href="/shop">Try again</a>');
      } else if (row) {
        if (row.coins >= 10) { // Assuming each outfit costs 10 coins
          const ownedOutfits = row.owned_outfits ? row.owned_outfits.split(',') : ['default'];
          if (!ownedOutfits.includes(outfit)) {
            ownedOutfits.push(outfit);
            const updatedOutfits = ownedOutfits.join(',');
            db.run("UPDATE pets SET coins = coins - 10, owned_outfits = ? WHERE username = ?", [updatedOutfits, req.session.user], (err) => {
              if (err) {
                res.send('Error occurred. <a href="/shop">Try again</a>');
              } else {
                res.redirect('/home');
              }
            });
          } else {
            res.send('You already own this outfit. <a href="/shop">Try again</a>');
          }
        } else {
          res.send('Not enough coins. <a href="/shop">Try again</a>');
        }
      } else {
        res.send('User not found. <a href="/shop">Try again</a>');
      }
    });
  } else {
    res.redirect('/');
  }
});

app.post('/feed', (req, res) => {
  if (req.session.user) {
    db.run("UPDATE pets SET hunger = hunger + 10 WHERE username = ?", [req.session.user], (err) => {
      if (err) {
        res.send('Error occurred. <a href="/home">Try again</a>' + "  " + err);
      } else {
        res.redirect('/home');
      }
    });
  } else {
    res.redirect('/');
  }
});

app.post('/pet', (req, res) => {
  if (req.session.user) {
    db.run("UPDATE pets SET happiness = happiness + 10 WHERE username = ?", [req.session.user], (err) => {
      if (err) {
        res.send('Error occurred. <a href="/home">Try again</a>' + "  " + err);
      } else {
        res.redirect('/home');
      }
    });
  } else {
    res.redirect('/');
  }
});

app.post('/change-outfit', (req, res) => {
  const { outfit } = req.body;
  if (req.session.user) {
    db.run("UPDATE pets SET current_outfit = ? WHERE username = ?", [outfit, req.session.user], (err) => {
      if (err) {
        res.send('Error occurred. <a href="/home">Try again</a>' + "  " + err);
      } else {
        res.redirect('/home');
      }
    });
  } else {
    res.redirect('/');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.listen(port, () => {
  console.log(`App running at http://localhost:${port}`);
});