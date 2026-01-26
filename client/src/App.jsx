import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // We keep the backend field names (tasks/title/priority/status/dueDate/completed)
  // but the UI treats them as session tracker fields.
  const [tasks, setTasks] = useState([]);

  // Form fields
  const [title, setTitle] = useState(""); // client name
  const [priority, setPriority] = useState("pt"); // session type: pt | strength | cardio | group
  const [status, setStatus] = useState("scheduled"); // scheduled | completed | canceled | no_show
  const [dueDate, setDueDate] = useState(""); // session date yyyy-mm-dd

  // List controls
  const [filterStatus, setFilterStatus] = useState("all"); // all | scheduled | completed | canceled | no_show
  const [sortBy, setSortBy] = useState("newest"); // newest | due_date | type

  // Editing
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");

  const [error, setError] = useState("");
  const isAuthed = !!token;

  function authHeaders() {
    return { Authorization: `Bearer ${token}` };
  }

  function typeLabel(v) {
    const map = {
      pt: "Personal Training",
      strength: "Strength Training",
      cardio: "Cardio",
      group: "Group Class",
    };
    return map[v] || v || "—";
  }

  function statusLabel(v) {
    const map = {
      scheduled: "Scheduled",
      completed: "Completed",
      canceled: "Canceled",
      no_show: "No-show",
    };
    return map[v] || v || "—";
  }

  async function loadTasks() {
    if (!token) return;
    setError("");

    const res = await fetch(`${API}/api/tasks`, {
      headers: authHeaders(),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load sessions");
      return;
    }
    setTasks(data);
  }

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function submitAuth(e) {
    e.preventDefault();
    setError("");

    const endpoint = mode === "register" ? "register" : "login";

    const res = await fetch(`${API}/api/auth/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Auth failed");
      return;
    }

    const t = data.token;
    localStorage.setItem("token", t);
    setToken(t);

    setEmail("");
    setPassword("");
  }

  function logout() {
    localStorage.removeItem("token");
    setToken("");
    setTasks([]);
    setEditingId(null);
    setEditingTitle("");
    setError("");
  }

  async function addTask(e) {
    e.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length < 2) return;

    setError("");

    // If you mark it completed from the dropdown, keep completed boolean consistent
    const completedBool = status === "completed";

    const res = await fetch(`${API}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        title: trimmed, // client name
        priority, // session type
        status, // session status
        dueDate: dueDate || null, // session date
        completed: completedBool,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to add session");
      return;
    }

    setTasks((prev) => [data, ...prev]);
    setTitle("");
    setPriority("pt");
    setStatus("scheduled");
    setDueDate("");
  }

  async function deleteTask(id) {
    setError("");

    const res = await fetch(`${API}/api/tasks/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to delete session");
      return;
    }

    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  // Checkbox = completed yes/no
  // Also keeps status in sync: checked => completed, unchecked => scheduled
  async function toggleCompleted(task) {
    setError("");

    const nextCompleted = !task.completed;
    const nextStatus = nextCompleted ? "completed" : "scheduled";

    const res = await fetch(`${API}/api/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        completed: nextCompleted,
        status: nextStatus,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to update session");
      return;
    }

    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, completed: nextCompleted, status: nextStatus } : t
      )
    );
  }

  function startEdit(task) {
    setEditingId(task.id);
    setEditingTitle(task.title);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingTitle("");
  }

  async function saveEdit(taskId) {
    const trimmed = editingTitle.trim();
    if (trimmed.length < 2) {
      setError("Client name must be at least 2 characters.");
      return;
    }

    setError("");

    const res = await fetch(`${API}/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ title: trimmed }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to update client name");
      return;
    }

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, title: trimmed } : t)));
    cancelEdit();
  }

  const visibleTasks = useMemo(() => {
    return (tasks ?? [])
      .filter((t) => {
        const s = t.status ?? "scheduled";
        return filterStatus === "all" ? true : s === filterStatus;
      })
      .sort((a, b) => {
        if (sortBy === "type") {
          const order = { pt: 1, strength: 2, cardio: 3, group: 4 };
          const av = order[a.priority ?? "pt"] ?? 99;
          const bv = order[b.priority ?? "pt"] ?? 99;
          return av - bv;
        }

        if (sortBy === "due_date") {
          const ad = a.dueDate ?? a.due_date ?? "";
          const bd = b.dueDate ?? b.due_date ?? "";
          if (!ad && !bd) return 0;
          if (!ad) return 1;
          if (!bd) return -1;
          return ad.localeCompare(bd);
        }

        // newest default (by id desc)
        return (b.id ?? 0) - (a.id ?? 0);
      });
  }, [tasks, filterStatus, sortBy]);

  return (
    <div className="wrap">
      <div className="topbar">
        <h1>CLIENT SESSION TRACKER</h1>
        {isAuthed ? <button onClick={logout}>Logout</button> : null}
      </div>

      {error && <p className="error">{error}</p>}

      {!isAuthed ? (
        <div className="card">
          <div className="tabs">
            <button
              className={mode === "login" ? "tab active" : "tab"}
              onClick={() => setMode("login")}
              type="button"
            >
              Login
            </button>
            <button
              className={mode === "register" ? "tab active" : "tab"}
              onClick={() => setMode("register")}
              type="button"
            >
              Register
            </button>
          </div>

          <form onSubmit={submitAuth} className="col">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              type="password"
            />
            <button type="submit">{mode === "register" ? "Create account" : "Login"}</button>
          </form>

          <p className="hint">Tip: Register first, then login. Sessions are private per user.</p>
        </div>
      ) : (
        <>
          <form onSubmit={addTask} className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Client name..."
            />

            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="pt">Personal Training</option>
              <option value="strength">Strength Training</option>
              <option value="cardio">Cardio</option>
              <option value="group">Group Class</option>
            </select>

            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="canceled">Canceled</option>
              <option value="no_show">No-show</option>
            </select>

            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

            <button type="submit">Add Session</button>
          </form>

          <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
            <label>
              Filter:
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ marginLeft: 8 }}
              >
                <option value="all">All</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="canceled">Canceled</option>
                <option value="no_show">No-show</option>
              </select>
            </label>

            <label>
              Sort:
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ marginLeft: 8 }}>
                <option value="newest">Newest</option>
                <option value="due_date">Session date</option>
                <option value="type">Session type</option>
              </select>
            </label>
          </div>

          <ul className="list">
            {visibleTasks.map((t) => (
              <li key={t.id} className="item">
                <label className="left">
                  <input type="checkbox" checked={!!t.completed} onChange={() => toggleCompleted(t)} />

                  {editingId === t.id ? (
                    <input
                      className="editInput"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                    />
                  ) : (
                    <div>
                      <span className={t.completed ? "done" : ""}>{t.title}</span>
                      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                        <span>Type: {typeLabel(t.priority ?? "pt")}</span>
                        <span style={{ marginLeft: 10 }}>Status: {statusLabel(t.status ?? "scheduled")}</span>
                        <span style={{ marginLeft: 10 }}>
                          Date: {t.dueDate ?? t.due_date ?? "—"}
                        </span>
                      </div>
                    </div>
                  )}
                </label>

                <div className="actions">
                  {editingId === t.id ? (
                    <>
                      <button type="button" onClick={() => saveEdit(t.id)}>
                        Save
                      </button>
                      <button type="button" className="ghost" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" className="ghost" onClick={() => startEdit(t)}>
                      Edit
                    </button>
                  )}

                  <button type="button" className="danger" onClick={() => deleteTask(t.id)}>
                    ❌
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
