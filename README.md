# CinemaBooking Full-Stack Movie Booking System

CinemaBooking is a movie booking and recommendation dashboard developed as a full-stack academic project. The existing HTML, CSS, and JavaScript interface is preserved, while a Python Flask API and MySQL database provide persistent users, movies, showtimes, bookings, ticket types, and seat reservations.

## Technology Stack

|Layer|Technology|
|-|-|
|Frontend|HTML5, CSS3, vanilla JavaScript|
|Backend|Python 3, Flask|
|Database|MySQL 8+|
|Database driver|`mysql-connector-python`|
|PDF receipt|jsPDF in the browser|
|Authentication|Flask session with password hashing|

## Project Structure

```text
Project 1/
├── frontend/                  # HTML, CSS, client-side JS & assets
│   ├── assets/                # Movie posters & vendor libraries
│   │   ├── posters/
│   │   └── vendor/
│   ├── app.js                 # Frontend application logic & API calls
│   ├── index.html             # Dashboard UI
│   ├── mock-movies.json       # Offline fallback movie catalog
│   └── styles.css             # Visual design & responsive layout
├── backend/                   # Python Flask API
│   ├── app.py                 # Flask server & API routes
│   ├── requirements.txt       # Python dependencies
│   └── .env.example           # Environment template
├── database/                  # Database scripts
│   └── database.sql           # MySQL schema & seed data
├── .env.example               # Root database configuration template
├── .gitignore                 # Git ignore rules
└── README.md                  # Project documentation
```

## Features

The frontend provides movie search, language and type filters, recommendations, popular movies, date and showtime selection, interactive seats, adult/child/senior ticket pricing, sign-in and profile forms, booking history, theme switching, and PDF receipt generation. When the Flask API is available, movie records, sign-in, bookings, and cancellations use MySQL. If the API is unavailable, the catalog and local booking behavior continue through the existing mock/local-storage fallback so the interface can still be demonstrated.

The backend adds persistent users, password hashing, a movie catalog, generated showtimes, user-specific booking history, ticket types, server-side duplicate-seat protection, cancellation status, and a health endpoint. The payment button remains a **simulation**: it records a booking but does not charge real money. A production deployment would require a payment provider and HTTPS.

## Prerequisites

Install Python 3.10+ and MySQL 8+. Create a MySQL user that can create or use the `cinema_booking` database. The project does not require MongoDB, Oracle, JDBC, or a separate Node.js server.

## Setup

Navigate into the project directory:

```bash
cd "Project 1"
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
```

Copy `.env.example` to `.env` and set the MySQL password. The Flask app reads environment variables; for a simple local demonstration, export them directly:

```bash
export DB_HOST=127.0.0.1
export DB_PORT=3306
export DB_USER=root
export DB_PASSWORD=your_mysql_password
export DB_NAME=cinema_booking
export SECRET_KEY=development-secret-change-me
```

Initialize the database:

```bash
mysql -u root -p < database/database.sql
```

Start the application from the `Project 1` folder:

```bash
python3 backend/app.py
```

Open **http://localhost:5000**. Do not open `index.html` with a double click: the Flask server supplies both the frontend and API routes.

## Demonstration Flow

1. Open the dashboard and show the English, Hindi, and Tamil catalog.
2. Use the language dropdown and search box.
3. Open a movie, select a date, showtime, seats, and ticket types.
4. Use **Sign in** with a name, email, and six-character password. A new email creates a user; an existing email checks the password.
5. Click **Confirm \& Pay**. This is a simulated payment and creates a MySQL booking.
6. Open **My Bookings** and demonstrate the booking history, **Receipt PDF**, Edit, and Cancel actions.
7. Refresh the browser and show that MySQL-backed bookings remain available for the signed-in session.
8. Check **http://localhost:5000/api/health** to demonstrate database connectivity.

## API Summary

|Method|Route|Purpose|
|-|-|-|
|GET|`/api/health`|Test Flask/MySQL connectivity|
|GET|`/api/movies`|Return the catalog|
|POST|`/api/auth/signin`|Create or authenticate a user session|
|POST|`/api/auth/signout`|Clear the session|
|GET|`/api/showtimes/<movie_id>`|Return seeded showtimes for a date|
|GET|`/api/showtimes/<movie_id>/<show_id>/occupied`|Return reserved seats|
|GET|`/api/bookings`|Return current user's bookings|
|POST|`/api/bookings`|Create a booking and reserve seats|
|DELETE|`/api/bookings/<booking_id>`|Mark a user's booking cancelled|

## Database Design

`users` stores accounts; `movies` stores the catalog; `showtimes` stores scheduled screenings; `bookings` stores booking headers and status; and `booking_seats` stores one row per selected seat and ticket type. Foreign keys and a transaction protect booking integrity. `active_bookings` is a convenience view for confirmed bookings.

## Future Work

Future production work would add real payment verification, email tickets, stronger authorization, migrations, automated tests, deployment, and real-time seat locking.

