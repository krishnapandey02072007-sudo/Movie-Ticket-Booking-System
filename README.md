# Movie Ticket Booking System

A comprehensive multi-architecture repository featuring two complete implementations of a full-stack Movie Ticket Booking System, built for academic coursework and database systems architecture demonstrations.

---

## Projects Overview

| Attribute | Project 1 | Project 2 |
|---|---|---|
| **Edition** | Full-Stack Web App (Python + MySQL) | Enterprise Polyglot Persistence (Java + Oracle + Neo4j) |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript | Modern Glassmorphism HTML5, CSS3, Vanilla JavaScript |
| **Backend** | Python 3.10+, Flask REST API | Pure Java 21+ Multi-Threaded HTTP Server |
| **Relational Database** | MySQL 8.0+ (`cinema_booking`) | Oracle 21c Express Edition (`XEPDB1`, `cinema_admin`) |
| **Database Driver** | `mysql-connector-python` | `ojdbc11.jar` (`java.sql.*`) |
| **Graph Database** | N/A | Neo4j 5.x / In-Memory Graph Engine |
| **Concurrency & Integrity** | SQL transactions & duplicate seat check | Row-level locks (`FOR UPDATE`), PL/SQL Procedures & Triggers |
| **Default Port** | `http://localhost:5000` | `http://localhost:8080` |
| **Documentation** | [Project 1 README](Project%201/README.md) | [Project 2 README](Project%202/README.md) |

---

## Repository Structure

```text
Movie-Ticket-Booking-System/
│
├── Project 1/                 # Python Flask + MySQL Implementation
│   ├── frontend/              # HTML, CSS, client-side JS & assets
│   │   ├── assets/            # Movie posters & vendor libraries
│   │   ├── app.js             # UI controller & API integration
│   │   ├── index.html         # Dashboard interface
│   │   ├── mock-movies.json   # Offline fallback movie catalog
│   │   └── styles.css         # Responsive styling
│   ├── backend/               # Flask server & REST API
│   │   ├── app.py             # Server routes & static file handler
│   │   ├── requirements.txt   # Python dependencies
│   │   └── .env.example       # Backend environment template
│   ├── database/              # Relational database scripts
│   │   └── database.sql       # MySQL schema, constraints & seed data
│   ├── .env.example           # Root database configuration template
│   ├── .gitignore             # Project-specific gitignore
│   └── README.md              # Detailed Project 1 documentation
│
├── Project 2/                 # Java JDBC + Oracle 21c + Neo4j Implementation
│   ├── frontend/              # Glassmorphism Web UI
│   │   ├── assets/            # All 14 posters, payment QR, vendor JS
│   │   ├── app.js             # Client controller & graph synchronization
│   │   ├── index.html         # Booking interface & Admin Analytics dashboard
│   │   ├── mock-movies.json   # Fallback catalog
│   │   └── styles.css         # Modern dark glassmorphism styling
│   ├── backend/               # Java HTTP Server & JDBC DAO Layer
│   │   ├── bin/               # Compiled class files
│   │   ├── lib/               # Oracle JDBC driver (ojdbc11.jar)
│   │   ├── src/com/cinema/    # Java source code (DAO, server, DB connection)
│   │   ├── run.bat            # Compile and start web server (port 8080)
│   │   └── test_jdbc_console.bat # 10-step interactive terminal demo
│   ├── database/              # Oracle SQL & Neo4j Cypher scripts
│   │   ├── 01_schema_oracle.sql # 12 normalized Oracle tables & indexes
│   │   ├── 02_procedures_triggers_oracle.sql # PL/SQL procedures, triggers, views
│   │   ├── 03_seed_oracle.sql # Demo seed data
│   │   ├── 04_advanced_queries_oracle.sql # Analytical window functions & CTEs
│   │   ├── 05_neo4j_setup.cypher # Graph database constraints & graph seed
│   │   ├── setup_oracle.sql   # Master SQL*Plus setup script
│   │   └── setup_database.bat # Automated Oracle database initializer
│   └── README.md              # Detailed Project 2 documentation
│
├── .gitignore                 # Repository-wide gitignore
└── README.md                  # Common project repository overview
```

---

## Quick Start Guide

### Running Project 1 (Python Flask + MySQL)

1. **Import Database:**
   ```bash
   cd "Project 1"
   mysql -u root -p < database/database.sql
   ```
2. **Configure Environment:**
   Copy `.env.example` to `.env` and set your MySQL credentials.
3. **Install Dependencies & Run:**
   ```bash
   python -m venv .venv
   .venv\Scripts\activate       # Windows (.venv/bin/activate on macOS/Linux)
   pip install -r backend/requirements.txt
   python backend/app.py
   ```
4. **Access UI:** Open **http://localhost:5000** in your browser.

---

### Running Project 2 (Java JDBC + Oracle 21c + Neo4j)

1. **Initialize Database:**
   ```cmd
   cd "Project 2\database"
   setup_database.bat
   ```
   *(Or via SQL\*Plus: `sqlplus cinema_admin/cinema123@//localhost:1521/XEPDB1 @setup_oracle.sql`)*

2. **Launch Application:**
   ```cmd
   cd "Project 2\backend"
   run.bat
   ```
   *(Compiles Java sources with `javac` and launches server on port 8080)*

3. **Access UI:** Open **http://localhost:8080** in your browser.

4. **Terminal Viva Demo:**
   ```cmd
   cd "Project 2\backend"
   test_jdbc_console.bat
   ```

---

## License & Academic Usage

This repository was developed for academic coursework in Database Management Systems and Systems Architecture at VIT.
