# CinemaBooking — Enterprise Movie Ticket Booking System (Project 2)

CinemaBooking is an enterprise full-stack movie booking platform implementing a **Polyglot Persistence** architecture. The application combines **Oracle 21c Express Edition** for ACID relational transactions and concurrency control with **Neo4j 5.x** for graph-based collaborative filtering, bridged by a high-performance **pure Java JDBC** HTTP server.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3 Glassmorphism, Vanilla ES6 JavaScript |
| **Backend** | Java 21+ / 25, Multi-threaded HTTP Server (`com.sun.net.httpserver`) |
| **Relational Database** | Oracle 21c Express Edition (`XEPDB1`) |
| **Database Connectivity** | Pure Java JDBC (`ojdbc11.jar`, `java.sql.*`) |
| **Graph Database** | Neo4j 5.x (Cypher Query Language) & Built-in In-Memory Graph Engine |
| **Concurrency Control** | Oracle Row-Level Locks (`SELECT ... FOR UPDATE`), ACID Transactions |

---

## Project Structure

```text
Project 2/
├── frontend/                     # Web UI, styling, and client scripts
│   ├── assets/                   # Posters, payment QR code, vendor libraries
│   │   ├── posters/              # Movie poster images (all 14 titles)
│   │   ├── vendor/               # jspdf.umd.min.js
│   │   └── payment-qr.png        # UPI payment QR image asset
│   ├── app.js                    # UI controller, seat matrix, real-time graph recommendations
│   ├── index.html                # Booking interface & Admin Analytics dashboard
│   ├── mock-movies.json          # Offline fallback movie catalog
│   └── styles.css                # Dark modern glassmorphism styling
├── backend/                      # Java JDBC Application Server
│   ├── bin/                      # Compiled class files (.class)
│   ├── lib/
│   │   └── ojdbc11.jar           # Oracle 21c JDBC Driver
│   ├── src/com/cinema/           # Java source code
│   │   ├── db/DBConnection.java  # JDBC connection pool manager
│   │   ├── db/Neo4jService.java  # Graph database traversal & dual-write sync
│   │   ├── dao/CinemaDAO.java    # JDBC PreparedStatements, transactions, procedures
│   │   ├── server/CinemaServer.java # Multi-threaded HTTP server & REST API
│   │   ├── Main.java             # Web application entrypoint
│   │   └── JdbcCliDemo.java      # Terminal viva demonstration runner
│   ├── run.bat                   # Compile & start web server
│   └── test_jdbc_console.bat     # Run terminal JDBC & graph demo
├── database/                     # Relational & Graph Database scripts
│   ├── 01_schema_oracle.sql      # 12 normalized Oracle tables & constraints
│   ├── 02_procedures_triggers_oracle.sql # PL/SQL procedures, triggers, views
│   ├── 03_seed_oracle.sql        # Demo movies, users, showtimes seed
│   ├── 04_advanced_queries_oracle.sql # Analytical window functions & CTEs
│   ├── 05_neo4j_setup.cypher     # Neo4j Graph database constraints & graph seed
│   ├── setup_oracle.sql          # Master SQL*Plus setup script
│   └── setup_database.bat        # Automated Oracle database initialization script
└── README.md                     # Project documentation
```

---

## Quick Start

### 1. Database Initialization (Oracle 21c XE)

Ensure Oracle Service (`OracleServiceXE`) is running on port 1521. Initialize the database using the batch script or SQL*Plus:

**Option A — Automated Batch Script:**
```cmd
cd database
setup_database.bat
```

**Option B — SQL*Plus Command Line:**
```cmd
sqlplus cinema_admin/cinema123@//localhost:1521/XEPDB1 @database/setup_oracle.sql
```

*(This creates the required users, tables, foreign keys, triggers, stored procedures, and initial catalog data).*

### 2. Start Web Application

Navigate to the `backend` folder and execute `run.bat`:

```cmd
cd backend
run.bat
```

- Compiles Java source files with `javac` into `backend/bin/`.
- Starts the multi-threaded HTTP server on **http://localhost:8080/**.
- Opens your browser to the booking dashboard.

### 3. Interactive JDBC Console Demo (Viva Demonstration)

To run a 10-step automated demonstration of Oracle JDBC queries, stored procedures, triggers, and graph queries directly in the terminal:

```cmd
cd backend
test_jdbc_console.bat
```

Steps executed:
1. Oracle JDBC Connection verification
2. PreparedStatement movie catalog query
3. Showtime lookup
4. Occupied seats calculation
5. Ticket booking via Stored Procedure `SP_BOOK_TICKETS`
6. Race-condition prevention via Trigger `TRG_PREVENT_DOUBLE_BOOKING`
7. Seat change via Stored Procedure `SP_EDIT_TICKET_SEAT`
8. Cancellation & refund via Stored Procedure `SP_CANCEL_BOOKING`
9. Analytical query execution on View `V_MOVIE_PERFORMANCE`
10. Neo4j collaborative filtering Cypher traversal

### 4. Setup Neo4j Graph Database (Optional)

If running Neo4j Desktop or Docker (`neo4j:5` on port 7474 / 7687):

```cmd
cypher-shell -u neo4j -p neo4jpassword -f database/05_neo4j_setup.cypher
```

*(Note: If Neo4j daemon is not installed, CinemaBooking automatically activates its built-in In-Memory Graph Engine so graph recommendations and metrics operate without external dependencies).*

---

## Advanced Database Architecture: Polyglot Persistence

### 1. Relational Tier (Oracle 21c Express Edition)

- **Enhanced Entity-Relationship (EER) Specialization:** Superclass `MOVIES` with subtypes `MOVIE_ACTOR_BASED`, `ANIMATED_MOVIE`, and `DOCUMENTARY`.
- **Concurrency Control & Integrity Triggers:**
  - `TRG_PREVENT_DOUBLE_BOOKING`: Enforces atomic uniqueness before seat insertion to prevent race conditions.
  - `TRG_UPDATE_MOVIE_RATING`: Compound Trigger updating running aggregates without mutating-table (`ORA-04091`) errors.
  - `TRG_AUDIT_BOOKING_STATUS`: Automated audit trail logging for all booking status changes.
- **PL/SQL Stored Procedures:**
  - `SP_BOOK_TICKETS`: Pessimistic locking (`FOR UPDATE`), multi-seat allocation, tier discounts, and commit.
  - `SP_EDIT_TICKET_SEAT`: Atomically reassigns seats with fee adjustment.
  - `SP_CANCEL_BOOKING`: Cancels tickets, releases seats, and records refund transactions.
  - `SP_LATE_REFUND`: Computes 50% late-arrival refunds.
- **Analytical Views:** `V_ACTIVE_SHOWS`, `V_USER_BOOKINGS`, `V_MOVIE_PERFORMANCE`.

### 2. Graph Database Tier (Neo4j 5.x)

- **Property Graph Schema:**
  - **Nodes:** `:User`, `:Movie`, `:Genre`
  - **Edges:** `(User)-[:RATED {rating}]->(Movie)`, `(User)-[:BOOKED]->(Movie)`, `(Movie)-[:IN_GENRE]->(Genre)`
- **Collaborative Filtering Cypher Query:**
  ```cypher
  MATCH (me:User {id: $u})
  MATCH (similar:User)-[simEdge]->(m:Movie)<-[myEdge]-(me)
  WHERE (type(simEdge) IN ['RATED', 'BOOKED']) AND (type(myEdge) IN ['RATED', 'BOOKED'])
  MATCH (similar)-[recEdge:RATED]->(rec:Movie)
  WHERE recEdge.rating >= 4.0 AND NOT (me)-[:RATED]->(rec) AND NOT (me)-[:BOOKED]->(rec)
  RETURN rec.title, count(DISTINCT similar) AS graphMatchScore
  ORDER BY graphMatchScore DESC LIMIT 5;
  ```
- **Dual-Write Synchronization:** Real-time graph edge updates on booking/rating plus full database reconciliation via `POST /api/admin/neo4j-sync`.

---

## API Summary

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/health` | System health, Oracle JDBC status & Neo4j graph engine state |
| `GET` | `/api/movies` | Movie catalog with duration, rating, and genre specialization |
| `POST` | `/api/auth/signin` | Authenticate or register a user session |
| `POST` | `/api/auth/signout` | Invalidate current session |
| `GET` | `/api/showtimes/<movie_id>` | Showtimes and screen information for a movie |
| `GET` | `/api/showtimes/<movie_id>/<show_id>/occupied` | Current reserved seats for a show |
| `GET` | `/api/bookings` | Booking history for the active user session |
| `POST` | `/api/bookings` | Book tickets via `SP_BOOK_TICKETS` transaction |
| `PUT` | `/api/bookings/<id>/seat` | Edit booking seat via `SP_EDIT_TICKET_SEAT` |
| `DELETE` | `/api/bookings/<id>` | Cancel booking and calculate refund via `SP_CANCEL_BOOKING` |
| `GET` | `/api/recommendations` | Neo4j collaborative filtering recommendations |
| `GET` | `/api/admin/metrics` | Live database performance, trigger logs, and occupancy stats |
| `POST` | `/api/admin/neo4j-sync` | Synchronize relational Oracle records into the Neo4j graph |
