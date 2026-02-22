# Full-Stack Client session tracker Application

A production-style full-stack web application featuring user authentication and task management. Built with a React frontend and a Node.js/Express backend, using SQLite for data persistence and JWT for secure authentication.

**Live Demo**  
Frontend:
Backend API:

---

## Features

- User registration and login with secure password hashing
- JWT-based authentication and protected routes
- Create, read, update, and delete tasks (CRUD)
- User-level data isolation (users can only access their own tasks)
- Responsive frontend built with React
- RESTful API built with Express
- Environment-based configuration for local and production use

---

## Tech Stack

### Frontend
- React (Vite)
- HTML, CSS, JavaScript
- Fetch API

### Backend
- Node.js
- Express.js
- JWT Authentication
- bcrypt (password hashing)

### Database
- SQLite (used for development and demo deployment)

### Deployment
- Render (Backend Web Service & Frontend Static Site)
- GitHub (CI/CD via auto-deploy)

---

## API Endpoints

### Authentication
- `POST /api/auth/register` – Register a new user
- `POST /api/auth/login` – Login and receive JWT

### Tasks (Protected)
- `GET /api/tasks` – Get all tasks for the logged-in user
- `POST /api/tasks` – Create a new task
- `PUT /api/tasks/:id` – Update a task
- `DELETE /api/tasks/:id` – Delete a task

---

## Getting Started (Local Development)

### Prerequisites
- Node.js (v18+ recommended)
- npm

### Clone the repository
```bash
git clone https://github.com/SOL7JJ/react-express-sqlite-auth.git
cd react-express-sqlite-auth
Backend setup
cd server
npm install
npm start
Create a .env file in server/ (not committed to Git):
JWT_SECRET=your_secret_key
Frontend setup
cd client
npm install
npm run dev
Create a .env file in client/ (not committed to Git):
VITE_API_URL=http://localhost:3001
Architecture Overview
The frontend communicates with the backend via RESTful APIs.
JWT tokens are issued on login and included in the Authorization header.
Protected routes are enforced using Express middleware.
SQLite stores users and tasks with relational integrity.
Future Improvements
Migrate from SQLite to PostgreSQL for production scalability
Add refresh tokens and session expiry handling
Implement role-based access control
Add automated tests
Add CI pipeline with GitHub Actions
Author
James Jonathan Elie Tossou-Ayayi
Junior Full-Stack Software Engineer
GitHub: https://github.com/SOL7JJ
LinkedIn: (add link)
