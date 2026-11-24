const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

const db = new Database(path.join(__dirname, "data", "wedding.db"));
db.pragma("journal_mode = WAL");

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guest_events (
      guest_id INTEGER NOT NULL,
      event_id INTEGER NOT NULL,
      PRIMARY KEY (guest_id, event_id),
      FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );
  `);

  const seedEvents = [
    { slug: "mehndi", name: "Mehndi Ceremony", color: "#1a5c3a" },
    { slug: "barat", name: "Barat & Nikah", color: "#7b1f2c" },
    { slug: "walima", name: "Walima Reception", color: "#b45e58" }
  ];

  const insertEvent = db.prepare(
    "INSERT OR IGNORE INTO events (slug, name, color) VALUES (?, ?, ?)"
  );
  for (const ev of seedEvents) {
    insertEvent.run(ev.slug, ev.name, ev.color);
  }
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

module.exports = { db, init, generateToken };
