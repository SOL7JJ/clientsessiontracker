import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const featureCards = [
  {
    title: "Smart Session Scheduling",
    text: "Map each client session by type, status, and date so your calendar reflects real delivery.",
  },
  {
    title: "Attendance Visibility",
    text: "Spot no-shows and cancellations quickly, then adjust your day before revenue slips.",
  },
  {
    title: "Client-Level Tracking",
    text: "Every coach sees only their own data for secure and focused day-to-day operations.",
  },
  {
    title: "Fast Daily Updates",
    text: "Update session outcomes in seconds with simple controls designed for busy coaching floors.",
  },
  {
    title: "Zero-Noise Workflow",
    text: "A clean interface keeps your team on execution, not admin overhead.",
  },
  {
    title: "Ready for Scale",
    text: "Start solo and grow into a multi-coach operation with the same process foundation.",
  },
];

const workSteps = [
  "Create your secure coach account and private workspace.",
  "Add client sessions with type, date, and planned status.",
  "Track completion in real time as sessions happen.",
  "Review the week with clear filters and operational insights.",
];

const testimonials = [
  {
    quote:
      "FitFlow gave me a professional operating system for my coaching business. I run the week with confidence now.",
    name: "Ari M.",
    role: "Independent Personal Trainer",
  },
  {
    quote:
      "We reduced admin chaos in the first week. Coaches know exactly what is scheduled and what changed.",
    name: "Nadia K.",
    role: "Studio Operations Lead",
  },
  {
    quote:
      "The team adopted it quickly because the flow is simple. It feels built for real coaching environments.",
    name: "Ben T.",
    role: "Strength Coach",
  },
];

const faqs = [
  {
    q: "Is this built only for personal trainers?",
    a: "It works for personal training, strength coaching, cardio programs, and group classes.",
  },
  {
    q: "Can each coach keep their sessions private?",
    a: "Yes. Authentication and user-level data isolation are built in by default.",
  },
  {
    q: "How quickly can I start?",
    a: "You can register and begin adding sessions immediately with no setup friction.",
  },
];

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
    <div className={isAuthed ? "wrap" : "wrap authWrap"}>
      {isAuthed ? (
        <div className="topbar">
          <h1>CLIENT SESSION TRACKER</h1>
          <button onClick={logout}>Logout</button>
        </div>
      ) : null}

      {error && <p className="error">{error}</p>}

      {!isAuthed ? (
        <section className="marketing">
          <header className="marketingBar">
            <div className="brand">
              <span className="brandDot" />
              <div>
                <p className="brandTitle">FitFlow</p>
                <p className="brandSub">Client Session OS</p>
              </div>
            </div>
            <p className="barMeta">Built for independent coaches and performance studios</p>
          </header>

          <div className="authShell">
            <div className="authHero">
              <p className="eyebrow">Modern coaching operations</p>
              <h2>Run your coaching business with enterprise-level clarity.</h2>
              <p className="authSub">
                From first booking to final session completion, keep every touchpoint organized in one premium
                workflow your team actually wants to use.
              </p>

              <div className="metrics">
                <div>
                  <p>30%</p>
                  <span>less scheduling overhead</span>
                </div>
                <div>
                  <p>2.1x</p>
                  <span>faster daily planning</span>
                </div>
                <div>
                  <p>100%</p>
                  <span>client-level visibility</span>
                </div>
              </div>

              <div className="heroChips">
                <span>Session Lifecycle Tracking</span>
                <span>Private by Design</span>
                <span>Fast Daily Workflow</span>
              </div>
            </div>

            <div className="card authCard">
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

              <form onSubmit={submitAuth} className="col authForm">
                <label className="field">
                  <span>Email</span>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </label>

                <label className="field">
                  <span>Password</span>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    type="password"
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                  />
                </label>
                <button type="submit" className="primary">
                  {mode === "register" ? "Create account" : "Login"}
                </button>
              </form>

              <p className="hint">Tip: Register first, then login. Sessions are private per user.</p>
            </div>
          </div>

          <section className="socialProof">
            <p>Trusted by performance-focused coaches and studios</p>
            <div className="logoRow">
              <span>IRONHOUSE</span>
              <span>ELITE CORE</span>
              <span>MOTION LAB</span>
              <span>PEAKSHIFT</span>
              <span>NOVA PT</span>
            </div>
          </section>

          <section className="sectionBlock">
            <div className="sectionHead">
              <p className="eyebrow dark">Core Capabilities</p>
              <h3>Everything your team needs to run sessions professionally</h3>
            </div>
            <div className="featureGrid">
              {featureCards.map((item) => (
                <article key={item.title} className="featureCard">
                  <h4>{item.title}</h4>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="sectionBlock alt">
            <div className="sectionHead">
              <p className="eyebrow dark">How It Works</p>
              <h3>Get operational in minutes, not weeks</h3>
            </div>
            <div className="stepList">
              {workSteps.map((step, idx) => (
                <div key={step} className="stepItem">
                  <span>{idx + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="sectionBlock">
            <div className="sectionHead">
              <p className="eyebrow dark">Customer Stories</p>
              <h3>Built for real coaching environments</h3>
            </div>
            <div className="testimonialGrid">
              {testimonials.map((item) => (
                <article key={item.name} className="testimonialCard">
                  <p className="quote">"{item.quote}"</p>
                  <p className="author">{item.name}</p>
                  <p className="role">{item.role}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="sectionBlock alt">
            <div className="sectionHead">
              <p className="eyebrow dark">FAQ</p>
              <h3>Answers before you start</h3>
            </div>
            <div className="faqList">
              {faqs.map((item) => (
                <article key={item.q} className="faqItem">
                  <h4>{item.q}</h4>
                  <p>{item.a}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="finalCta">
            <div>
              <p className="eyebrow">Ready to upgrade your workflow?</p>
              <h3>Start with FitFlow and run sessions like a modern performance business.</h3>
            </div>
            <button type="button" className="primary" onClick={() => setMode("register")}>
              Create your account
            </button>
          </section>
        </section>
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
