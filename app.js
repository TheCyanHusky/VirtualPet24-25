const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

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
    owned_outfits TEXT DEFAULT 'default',
    inventory TEXT DEFAULT '[]'
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

// Function to decrease hunger and happiness based on personality
function decreaseHungerAndHappiness() {
  db.all("SELECT username, personality, hunger, happiness FROM pets WHERE username IN (SELECT username FROM users WHERE online = 'true')", (err, rows) => {
    if (err) {
      console.error("Database error:", err);
      return;
    }

    rows.forEach(row => {
      let hungerDecrease = 2;
      let happinessDecrease = 2;

      switch (row.personality) {
        case 'Playful':
          happinessDecrease = 1;
          break;
        case 'Lazy':
          hungerDecrease = 3;
          happinessDecrease = 1;
          break;
        case 'Curious':
          hungerDecrease = 1;
          happinessDecrease = 3;
          break;
        case 'Energetic':
          hungerDecrease = 4;
          happinessDecrease = 1;
          break;
        case 'Calm':
          hungerDecrease = 1;
          happinessDecrease = 1;
          break;
        case 'Greedy':
          hungerDecrease = 5;
          happinessDecrease = 2;
          break;
        case 'Cheerful':
          hungerDecrease = 2;
          happinessDecrease = 1;
          break;
        case 'Depressed':
          hungerDecrease = 5;
          happinessDecrease = 10;
          break;
        default:
          break;
      }

      const newHunger = Math.max(row.hunger - hungerDecrease, 0);
      const newHappiness = Math.max(row.happiness - happinessDecrease, 0);

      db.run("UPDATE pets SET hunger = ?, happiness = ? WHERE username = ?", [newHunger, newHappiness, row.username], (err) => {
        if (err) {
          console.error("Database error:", err);
        } else {
          console.log(`Updated ${row.username}: Hunger=${newHunger}, Happiness=${newHappiness}`);
        }
      });
    });
  });
}

app.get('/pet-status', (req, res) => {
  if (req.session.user) {
    db.get("SELECT hunger, happiness FROM pets WHERE username = ?", [req.session.user], (err, row) => {
      if (err) {
        console.error("Database error:", err);
        res.status(500).send('Error occurred');
      } else {
        res.json({ hunger: row.hunger, happiness: row.happiness });
      }
    });
  } else {
    res.status(401).send('Unauthorized');
  }
});

// Run the decreaseHungerAndHappiness function every 20 seconds
setInterval(decreaseHungerAndHappiness, 20000);

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username && password) {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) {
        console.error(err);
        res.send("There was an error:\n" + err);
      } else if (!row) {
        res.send('Invalid username or password. <a href="/login">Try again</a>');
      } else {
        // Compare stored password with provided password
        crypto.pbkdf2(password, row.salt, 1000, 64, 'sha512', (err, derivedKey) => {
          if (err) {
            res.send('Error hashing password: \n' + err);
          } else {
            const hashPassword = derivedKey.toString('hex');
            if (row.password === hashPassword) {
              req.session.user = username;
              db.run("UPDATE users SET online = 'true' WHERE username = ?", [username], (err) => {
                if (err) {
                  res.send('Error occurred. <a href="/login">Try again</a>' + "  " + err);
                } else {
                  db.get("SELECT * FROM pets WHERE username = ?", [username], (err, pet) => {
                    if (err) {
                      res.send('Error occurred. <a href="/login">Try again</a>' + "  " + err);
                    } else if (pet) {
                      res.redirect('/home');
                    } else {
                      res.redirect('/select-pet');
                    }
                  });
                }
              });
            } else {
              res.send('Invalid username or password. <a href="/login">Try again</a>');
            }
          }
        });
      }
    });
  } else {
    res.send("You need a username and password. <a href='/login'>Try again</a>");
  }
});

app.post('/signup', (req, res) => {
  const { username, password } = req.body;
  if (username && password) {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
      if (err) {
        console.error(err);
        res.send("There was an error:\n" + err);
      } else if (row) {
        res.send('Username already taken. <a href="/signup">Try again</a>');
      } else {
        // Create a new salt
        const salt = crypto.randomBytes(16).toString('hex');
        // Use the salt to hash the password
        crypto.pbkdf2(password, salt, 1000, 64, 'sha512', (err, derivedKey) => {
          if (err) {
            res.send('Error hashing password: \n' + err);
          } else {
            const hashPassword = derivedKey.toString('hex');
            db.run('INSERT INTO users (username, password, salt, online) VALUES (?, ?, ?, ?)', [username, hashPassword, salt, 'true'], (err) => {
              if (err) {
                res.send('Database error:\n' + err);
              } else {
                req.session.user = username;
                res.redirect('/select-pet');
              }
            });
          }
        });
      }
    });
  } else {
    res.send("You need a username and password. <a href='/signup'>Try again</a>");
  }
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
  const personalityTraits = ['Friendly', 'Playful', 'Lazy', 'Curious', 'Energetic', 'Calm', 'Greedy', 'Cheerful', 'Depressed'];
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
    db.get("SELECT * FROM pets WHERE username = ?", [req.session.user], (err, pet) => {
      if (err) {
        res.send('Error occurred. <a href="/home">Try again</a>' + "  " + err);
      } else if (pet) {
        res.render('play', { userName: req.session.user, petName: pet.pet_name });
      } else {
        res.redirect('/select-pet');
      }
    });
  } else {
    res.redirect('/');
  }
});

app.get('/tag', (req, res) => {
  if (req.session.user) {
    db.get("SELECT * FROM pets WHERE username = ?", [req.session.user], (err, pet) => {
      if (err) {
        res.send('Error occurred. <a href="/home">Try again</a>' + "  " + err);
      } else if (pet) {
        res.render('tag', { pet });
      } else {
        res.redirect('/select-pet');
      }
    });
  } else {
    res.redirect('/');
  }
});

app.post('/play', (req, res) => {
  if (req.session.user) {
    db.get("SELECT happiness, coins FROM pets WHERE username = ?", [req.session.user], (err, row) => {
      if (err) {
        res.send('Error occurred. <a href="/home">Try again</a>' + "  " + err);
      } else {
        const newHappiness = Math.min(row.happiness + 10, 100);
        const newCoins = row.coins + 5;
        db.run("UPDATE pets SET happiness = ?, coins = ? WHERE username = ?", [newHappiness, newCoins, req.session.user], (err) => {
          if (err) {
            res.send('Error occurred. <a href="/home">Try again</a>' + "  " + err);
          } else {
            res.redirect('/play');
          }
        });
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

app.get('/food-shop', (req, res) => {
  if (req.session.user) {
    res.render('food-shop');
  } else {
    res.redirect('/');
  }
});

app.post('/food-shop', (req, res) => {
  const { food } = req.body;
  if (req.session.user) {
    db.get("SELECT coins, inventory FROM pets WHERE username = ?", [req.session.user], (err, row) => {
      if (err) {
        console.error("Database error:", err);
        res.send('Error occurred. <a href="/food-shop">Try again</a>');
      } else if (row) {
        let cost;
        switch (food) {
          case 'Apple':
            cost = 6;
            break;
          case 'Cookie':
            cost = 12;
            break;
          case 'Pizza':
            cost = 20;
            break;
          default:
            res.send('Invalid food item. <a href="/food-shop">Try again</a>');
            return;
        }

        if (row.coins >= cost) {
          const inventory = row.inventory ? JSON.parse(row.inventory) : [];
          inventory.push(food);
          console.log('Updated Inventory:', inventory); // Debugging
          db.run("UPDATE pets SET coins = coins - ?, inventory = ? WHERE username = ?", [cost, JSON.stringify(inventory), req.session.user], (err) => {
            if (err) {
              console.error("Database error:", err);
              res.send('Error occurred. <a href="/food-shop">Try again</a>');
            } else {
              res.redirect('/home');
            }
          });
        } else {
          res.send('Not enough coins. <a href="/food-shop">Try again</a>');
        }
      } else {
        res.send('User not found. <a href="/food-shop">Try again</a>');
      }
    });
  } else {
    res.redirect('/');
  }
});

app.post('/feed', (req, res) => {
  const { food } = req.body;
  if (req.session.user) {
    db.get("SELECT coins, hunger, happiness FROM pets WHERE username = ?", [req.session.user], (err, row) => {
      if (err) {
        console.error("Database error:", err);
        res.send('Error occurred. <a href="/home">Try again</a>');
      } else if (row) {
        let cost, hungerIncrease, happinessIncrease = 0;
        switch (food) {
          case 'Apple':
            cost = 6;
            hungerIncrease = 10;
            break;
          case 'Cookie':
            cost = 12;
            hungerIncrease = 10;
            happinessIncrease = 10;
            break;
          case 'Pizza':
            cost = 20;
            hungerIncrease = 30;
            break;
          default:
            res.send('Invalid food item. <a href="/home">Try again</a>');
            return;
        }

        if (row.coins >= cost) {
          // Cap hunger and happiness at 100
          const newHunger = Math.min(row.hunger + hungerIncrease, 100);
          const newHappiness = Math.min(row.happiness + happinessIncrease, 100);

          db.run("UPDATE pets SET coins = coins - ?, hunger = ?, happiness = ? WHERE username = ?", [cost, newHunger, newHappiness, req.session.user], (err) => {
            if (err) {
              console.error("Database error:", err);
              res.send('Error occurred. <a href="/home">Try again</a>');
            } else {
              res.redirect('/home');
            }
          });
        } else {
          res.send('Not enough coins. <a href="/home">Try again</a>');
        }
      } else {
        res.send('User not found. <a href="/home">Try again</a>');
      }
    });
  } else {
    res.redirect('/');
  }
});

app.post('/play', (req, res) => {
  if (req.session.user) {
    db.get("SELECT happiness, coins FROM pets WHERE username = ?", [req.session.user], (err, row) => {
      if (err) {
        res.send('Error occurred. <a href="/home">Try again</a>' + "  " + err);
      } else {
        const newHappiness = Math.min(row.happiness + 10, 100);
        const newCoins = row.coins + 5;
        db.run("UPDATE pets SET happiness = ?, coins = ? WHERE username = ?", [newHappiness, newCoins, req.session.user], (err) => {
          if (err) {
            res.send('Error occurred. <a href="/home">Try again</a>' + "  " + err);
          } else {
            res.redirect('/play');
          }
        });
      }
    });
  } else {
    res.redirect('/');
  }
});

app.post('/pet', (req, res) => {
  if (req.session.user) {
    db.get("SELECT happiness FROM pets WHERE username = ?", [req.session.user], (err, row) => {
      if (err) {
        res.send('Error occurred. <a href="/home">Try again</a>' + "  " + err);
      } else {
        const newHappiness = Math.min(row.happiness + 10, 100);
        db.run("UPDATE pets SET happiness = ? WHERE username = ?", [newHappiness, req.session.user], (err) => {
          if (err) {
            res.send('Error occurred. <a href="/home">Try again</a>' + "  " + err);
          } else {
            res.redirect('/home');
          }
        });
      }
    });
  } else {
    res.redirect('/');
  }
});


app.get('/cloths-shop', (req, res) => {
  if (req.session.user) {
    res.render('cloths-shop');
  } else {
    res.redirect('/');
  }
});

app.post('/cloths-shop', (req, res) => {
  const { outfit } = req.body;
  if (req.session.user) {
    db.get("SELECT coins, owned_outfits FROM pets WHERE username = ?", [req.session.user], (err, row) => {
      if (err) {
        res.send('Error occurred. <a href="/cloths-shop">Try again</a>');
      } else if (row) {
        if (row.coins >= 10) { // Assuming each outfit costs 10 coins
          const ownedOutfits = row.owned_outfits ? row.owned_outfits.split(',') : ['default'];
          if (!ownedOutfits.includes(outfit)) {
            ownedOutfits.push(outfit);
            const updatedOutfits = ownedOutfits.join(',');
            db.run("UPDATE pets SET coins = coins - 10, owned_outfits = ? WHERE username = ?", [updatedOutfits, req.session.user], (err) => {
              if (err) {
                res.send('Error occurred. <a href="/cloths-shop">Try again</a>');
              } else {
                res.redirect('/home');
              }
            });
          } else {
            res.send('You already own this outfit. <a href="/cloths-shop">Try again</a>');
          }
        } else {
          res.send('Not enough coins. <a href="/cloths-shop">Try again</a>');
        }
      } else {
        res.send('User not found. <a href="/cloths-shop">Try again</a>');
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
  if (req.session.user) {
    db.run("UPDATE users SET online = 'false' WHERE username = ?", [req.session.user], (err) => {
      if (err) {
        res.send('Error occurred. <a href="/home">Try again</a>' + "  " + err);
      } else {
        req.session.destroy();
        res.redirect('/');
      }
    });
  } else {
    res.redirect('/');
  }
});

app.listen(port, () => {
  console.log(`App running at http://localhost:${port}`);
});