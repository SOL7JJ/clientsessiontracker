import express from "express";
import cors from "cors";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const app = express();
const PORT = 3001;

// IMPORTANT: change this in real projects (use env var)
const JWT_SECRET = process.env.JWT_SECRET || "dev-fallback";


app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// ---- SQLite setup ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.SQLITE_PATH || path.join(dataDir, "tasks.db");
const db = new DatabaseSync(dbPath);

// ---- Tables ----
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// If you had an older tasks table without these columns, try to add safely:
try { db.exec(`ALTER TABLE tasks ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;`); } catch {}
try { db.exec(`ALTER TABLE tasks ADD COLUMN owner_id INTEGER NOT NULL DEFAULT 0;`); } catch {}

// ---- Auth helpers ----
function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "2h" });
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization; // "Bearer <token>"
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });

  const token = auth.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, iat, exp }
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ---- Prepared statements ----
// Users
const stmtFindUserByEmail = db.prepare(`SELECT id, email, password_hash FROM users WHERE email = ?;`);
const stmtCreateUser = db.prepare(`INSERT INTO users (email, password_hash) VALUES (?, ?);`);

// Tasks (scoped to owner)
const stmtGetAllTasksForUser = db.prepare(`
  SELECT id, title, completed
  FROM tasks
  WHERE owner_id = ?
  ORDER BY id DESC;
`);

const stmtInsertTask = db.prepare(`
  INSERT INTO tasks (owner_id, title, completed)
  VALUES (?, ?, 0);
`);

const stmtDeleteTask = db.prepare(`
  DELETE FROM tasks
  WHERE id = ? AND owner_id = ?;
`);

const stmtUpdateTitle = db.prepare(`
  UPDATE tasks
  SET title = ?
  WHERE id = ? AND owner_id = ?;
`);

const stmtUpdateCompleted = db.prepare(`
  UPDATE tasks
  SET completed = ?
  WHERE id = ? AND owner_id = ?;
`);

// ---- Routes ----
app.get("/api/health", (req, res) => res.json({ ok: true }));

// AUTH: Register
app.post("/api/auth/register", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!email.includes("@")) return res.status(400).json({ error: "Enter a valid email." });
  if (password.length < 4) return res.status(400).json({ error: "Password must be at least 4 characters." });

  const existing = stmtFindUserByEmail.get(email);
  if (existing) return res.status(409).json({ error: "Email already registered." });

  const password_hash = bcrypt.hashSync(password, 10);
  const result = stmtCreateUser.run(email, password_hash);
  const id = Number(result.lastInsertRowid);

  const token = createToken({ id, email });
  res.status(201).json({ token });
});

// AUTH: Login
app.post("/api/auth/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const user = stmtFindUserByEmail.get(email);
  if (!user) return res.status(401).json({ error: "Invalid credentials." });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials." });

  const token = createToken({ id: user.id, email: user.email });
  res.json({ token });
});

// TASKS: READ (protected)
app.get("/api/tasks", requireAuth, (req, res) => {
  const rows = stmtGetAllTasksForUser.all(req.user.id);
  const tasks = rows.map((t) => ({ ...t, completed: !!t.completed }));
  res.json(tasks);
});

// TASKS: CREATE (protected)
app.post("/api/tasks", requireAuth, (req, res) => {
  const title = String(req.body.title || "").trim();
  if (title.length < 2) return res.status(400).json({ error: "Title must be at least 2 characters." });

  const result = stmtInsertTask.run(req.user.id, title);
  const id = Number(result.lastInsertRowid);

  res.status(201).json({ id, title, completed: false });
});

// TASKS: UPDATE (protected)
app.put("/api/tasks/:id", requireAuth, (req, res) => {
  const taskId = Number(req.params.id);
  const { title, completed } = req.body;

  let changed = 0;

  if (typeof title === "string") {
    const trimmed = title.trim();
    if (trimmed.length < 2) return res.status(400).json({ error: "Title must be at least 2 characters." });
    const r = stmtUpdateTitle.run(trimmed, taskId, req.user.id);
    changed += Number(r.changes);
  }

  if (typeof completed === "boolean") {
    const r = stmtUpdateCompleted.run(completed ? 1 : 0, taskId, req.user.id);
    changed += Number(r.changes);
  }

  if (changed === 0) return res.status(404).json({ error: "Task not found." });
  res.json({ success: true });
});

// TASKS: DELETE (protected)
app.delete("/api/tasks/:id", requireAuth, (req, res) => {
  const taskId = Number(req.params.id);
  const r = stmtDeleteTask.run(taskId, req.user.id);

  if (Number(r.changes) === 0) return res.status(404).json({ error: "Task not found." });
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`SQLite DB file: ${dbPath}`);
});
