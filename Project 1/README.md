# CinemaBooking — Full-Stack Movie Ticket Booking System (Project 1)

CinemaBooking is a full-stack movie booking and recommendation platform built with a Python Flask REST API, MySQL relational database, and responsive vanilla HTML5, CSS3, and JavaScript frontend.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| **Backend** | Python 3.10+, Flask |
| **Database** | MySQL 8.0+ |
| **Database Driver** | `mysql-connector-python` |
| **PDF Generation** | jsPDF (browser client) |
| **Authentication** | Flask session with Werkzeug password hashing |

---

## Project Structure

```text
Project 1/
├── frontend/                  # Client-side user interface
│   ├── assets/                # Movie posters & vendor libraries
│   │   ├── posters/           # Poster images (JPG)
│   │   └── vendor/            # Offline vendor scripts (jspdf.umd.min.js)
│   ├── app.js                 # UI controllers, seat picker & REST API integration
│   ├── index.html             # Main dashboard UI
│   ├── mock-movies.json       # Fallback catalog when offline
│   └── styles.css             # Glassmorphism styling and responsive layout
├── backend/                   # Server-side API application
│   ├── app.py                 # Flask server, route handlers & static file serving
│   ├── requirements.txt       # Python package dependencies
│   └── .env.example           # Backend environment configuration template
├── database/                  # Relational database scripts
│   └── database.sql           # MySQL database schema, constraints & seed data
├── .env.example               # Root database configuration template
├── .gitignore                 # Git ignore rules for virtualenvs and secrets
└── README.md                  # Project documentation
```

---

## Core Features

- **Movie Discovery:** Filter movies by language (English, Hindi, Tamil) and type, or search by title.
- **Showtime & Seat Selection:** Interactive seat grid (A1–E8) with real-time status and row pricing.
- **Multi-Tier Ticket Pricing:** Adult (full price), Child (20% discount), Senior (15% discount).
- **Authentication & Profiles:** User registration and sign-in with password hashing (`generate_password_hash` / `check_password_hash`).
- **Simulated Payment & Booking:** Confirms bookings, prevents duplicate seat reservations using database transactions, and generates client-side PDF booking receipts.
- **Booking History & Cancellations:** View active bookings, cancel reservations, and edit seats.
- **Graceful Offline Fallback:** If the backend database is unreachable, automatically falls back to local client state and `mock-movies.json` for live demo capability.

---

## Prerequisites

- **Python 3.10+**
- **MySQL Server 8.0+**
- A MySQL user account with permissions to create and manage the `cinema_booking` database.

---

## Setup & Installation

### 1. Database Initialization

From the `Project 1` folder, import the database schema and sample data:

```bash
mysql -u root -p < database/database.sql
```

*(Enter your MySQL root password when prompted. This creates the `cinema_booking` database with tables and seed data).*

### 2. Environment Configuration

Copy the template `.env.example` to `.env` in the `Project 1` directory (or inside `backend/`):

```bash
cp .env.example .env
```

Configure your MySQL connection details inside `.env`:

```env
SECRET_KEY=development-secret-change-me
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=cinema_booking
PORT=5000
```

### 3. Backend Setup

Create a virtual environment and install the required dependencies:

```bash
cd "Project 1"
python -m venv .venv
```

Activate the virtual environment:
- **Windows (Command Prompt / PowerShell):**
  ```cmd
  .venv\Scripts\activate
  ```
- **macOS / Linux:**
  ```bash
  source .venv/bin/activate
  ```

Install dependencies:

```bash
pip install -r backend/requirements.txt
```

---

## Running the Application

From the `Project 1` directory with the virtual environment activated:

```bash
python backend/app.py
```

The application will start on:
**http://localhost:5000**

> [!NOTE]
> Do not open `index.html` directly by double-clicking it. The Flask server serves both the frontend static assets and the `/api/*` endpoints.

---

## API Summary

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/health` | Test database connectivity status |
| `GET` | `/api/movies` | Fetch the full movie catalog |
| `POST` | `/api/auth/signin` | Sign in or register a user session |
| `POST` | `/api/auth/signout` | Destroy the current session |
| `GET` | `/api/showtimes/<movie_id>?date=YYYY-MM-DD` | Get available screenings for a movie |
| `GET` | `/api/showtimes/<movie_id>/<show_id>/occupied` | Get reserved seat list for a showtime |
| `GET` | `/api/bookings` | Retrieve bookings for the logged-in user |
| `POST` | `/api/bookings` | Create a confirmed booking with reserved seats |
| `DELETE` | `/api/bookings/<booking_id>` | Cancel a booking |

---

## Database Schema Overview

- **`users`**: Account records with `user_id`, `name`, `email` (unique), `password_hash`, and registration timestamp.
- **`movies`**: Movie catalog with duration, language, genre, poster path, rating, and vote counts.
- **`showtimes`**: Screen schedules (`show_id`, `movie_id`, `show_date`, `show_time`, `screen_name`, `price`).
- **`bookings`**: Booking records linked by `user_id` and `movie_id`, tracking confirmation status (`CONFIRMED` / `CANCELLED`).
- **`booking_seats`**: Individual seat reservations per booking (`seat_no`, `ticket_type`) with foreign key constraints.
