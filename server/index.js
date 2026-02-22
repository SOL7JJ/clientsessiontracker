import express from "express";
import cors from "cors";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const app = express();
const PORT = process.env.PORT || 3001;


// IMPORTANT: change this in real projects (use env var)
const JWT_SECRET = process.env.JWT_SECRET || "dev-fallback";


const allowedOrigins = [
  "http://localhost:5173",
  "https://yourtaskist.com",
  "https://www.yourtaskist.com",
  "https://react-express-sqlite-auth.onrender.com",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // allow requests with no origin (like curl/postman)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));


app.use(express.json());

app.get("/", (req, res) => res.send("API running ✅"));

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
    priority TEXT NOT NULL DEFAULT 'pt',
    status TEXT NOT NULL DEFAULT 'scheduled',
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// If you had an older tasks table without these columns, try to add safely:
try { db.exec(`ALTER TABLE tasks ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;`); } catch {}
try { db.exec(`ALTER TABLE tasks ADD COLUMN owner_id INTEGER NOT NULL DEFAULT 0;`); } catch {}
try { db.exec(`ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'pt';`); } catch {}
try { db.exec(`ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'scheduled';`); } catch {}
try { db.exec(`ALTER TABLE tasks ADD COLUMN due_date TEXT;`); } catch {}

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
  SELECT id, title, completed, priority, status, due_date AS dueDate
  FROM tasks
  WHERE owner_id = ?
  ORDER BY id DESC;
`);

const stmtInsertTask = db.prepare(`
  INSERT INTO tasks (owner_id, title, completed, priority, status, due_date)
  VALUES (?, ?, ?, ?, ?, ?);
`);

const stmtDeleteTask = db.prepare(`
  DELETE FROM tasks
  WHERE id = ? AND owner_id = ?;
`);

const stmtFindTaskForUser = db.prepare(`
  SELECT id
  FROM tasks
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

const stmtUpdatePriority = db.prepare(`
  UPDATE tasks
  SET priority = ?
  WHERE id = ? AND owner_id = ?;
`);

const stmtUpdateStatus = db.prepare(`
  UPDATE tasks
  SET status = ?
  WHERE id = ? AND owner_id = ?;
`);

const stmtUpdateDueDate = db.prepare(`
  UPDATE tasks
  SET due_date = ?
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
  const priority = String(req.body.priority || "pt").trim();
  const status = String(req.body.status || "scheduled").trim();
  const dueDate = req.body.dueDate ? String(req.body.dueDate).trim() : null;
  const completed =
    typeof req.body.completed === "boolean" ? req.body.completed : status === "completed";

  const allowedPriorities = new Set(["pt", "strength", "cardio", "group"]);
  const allowedStatuses = new Set(["scheduled", "completed", "canceled", "no_show"]);

  if (title.length < 2) return res.status(400).json({ error: "Title must be at least 2 characters." });
  if (!allowedPriorities.has(priority)) return res.status(400).json({ error: "Invalid priority value." });
  if (!allowedStatuses.has(status)) return res.status(400).json({ error: "Invalid status value." });

  const result = stmtInsertTask.run(
    req.user.id,
    title,
    completed ? 1 : 0,
    priority,
    status,
    dueDate || null
  );
  const id = Number(result.lastInsertRowid);

  res.status(201).json({
    id,
    title,
    completed: completed,
    priority,
    status,
    dueDate: dueDate || null,
  });
});

// TASKS: UPDATE (protected)
app.put("/api/tasks/:id", requireAuth, (req, res) => {
  const taskId = Number(req.params.id);
  const { title } = req.body;
  let { completed, status } = req.body;
  const { priority } = req.body;
  const dueDate = Object.hasOwn(req.body, "dueDate") ? req.body.dueDate : undefined;
  const allowedPriorities = new Set(["pt", "strength", "cardio", "group"]);
  const allowedStatuses = new Set(["scheduled", "completed", "canceled", "no_show"]);

  if (!stmtFindTaskForUser.get(taskId, req.user.id)) {
    return res.status(404).json({ error: "Task not found." });
  }

  if (typeof title === "string") {
    const trimmed = title.trim();
    if (trimmed.length < 2) return res.status(400).json({ error: "Title must be at least 2 characters." });
    stmtUpdateTitle.run(trimmed, taskId, req.user.id);
  }

  if (typeof completed === "boolean") {
    stmtUpdateCompleted.run(completed ? 1 : 0, taskId, req.user.id);
    if (typeof status !== "string") {
      status = completed ? "completed" : "scheduled";
    }
  }

  if (typeof priority === "string") {
    const normalizedPriority = priority.trim();
    if (!allowedPriorities.has(normalizedPriority)) {
      return res.status(400).json({ error: "Invalid priority value." });
    }
    stmtUpdatePriority.run(normalizedPriority, taskId, req.user.id);
  }

  if (typeof status === "string") {
    const normalizedStatus = status.trim();
    if (!allowedStatuses.has(normalizedStatus)) {
      return res.status(400).json({ error: "Invalid status value." });
    }
    stmtUpdateStatus.run(normalizedStatus, taskId, req.user.id);
    if (typeof completed !== "boolean") {
      stmtUpdateCompleted.run(normalizedStatus === "completed" ? 1 : 0, taskId, req.user.id);
    }
  }

  if (dueDate !== undefined) {
    const normalizedDueDate =
      dueDate === null || String(dueDate).trim() === "" ? null : String(dueDate).trim();
    stmtUpdateDueDate.run(normalizedDueDate, taskId, req.user.id);
  }

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
