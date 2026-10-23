from datetime import date, timedelta
from decimal import Decimal
import hashlib
import os
from pathlib import Path

from flask import Flask, jsonify, request, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

try:
    import mysql.connector
    from mysql.connector import Error
except ImportError:  # Helpful message when dependencies are not installed yet.
    mysql = None
    Error = Exception

BACKEND_DIR = Path(__file__).resolve().parent
ROOT = BACKEND_DIR.parent
FRONTEND_DIR = ROOT / "frontend"

if (BACKEND_DIR / ".env").exists():
    load_dotenv(BACKEND_DIR / ".env")
elif (ROOT / ".env").exists():
    load_dotenv(ROOT / ".env")
else:
    load_dotenv()

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "change-this-development-secret")


def db_config():
    return {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("DB_PORT", "3306")),
        "user": os.getenv("DB_USER", "root"),
        "password": os.getenv("DB_PASSWORD", ""),
        "database": os.getenv("DB_NAME", "cinema_booking"),
    }


def connection():
    if mysql is None:
        raise RuntimeError("Install dependencies with: pip install -r requirements.txt")
    return mysql.connector.connect(**db_config())


def query(sql, params=(), many=False, commit=False):
    conn = connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if many:
            cursor.executemany(sql, params)
        else:
            cursor.execute(sql, params)
        rows = cursor.fetchall() if cursor.with_rows else []
        if commit:
            conn.commit()
        return rows
    finally:
        cursor.close()
        conn.close()


def serialize_movie(row):
    return {
        "movieID": row["movie_id"], "title": row["title"], "language": row["language"],
        "duration": row["duration"], "releaseYear": row["release_year"],
        "movieType": row["movie_type"], "poster": row["poster"],
        "rating": row["rating"], "votes": row["votes"]
    }


def current_user_id():
    return session.get("user_id")


@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/api/health")
def health():
    try:
        query("SELECT 1 AS ok")
        return jsonify({"status": "ok", "database": "mysql"})
    except Exception as exc:
        return jsonify({"status": "degraded", "database": "unavailable", "message": str(exc)}), 503


@app.get("/api/movies")
def movies():
    rows = query("SELECT * FROM movies ORDER BY movie_id")
    return jsonify([serialize_movie(row) for row in rows])


@app.post("/api/auth/signin")
def signin():
    body = request.get_json(silent=True) or {}
    name, email, password = body.get("name", "").strip(), body.get("email", "").strip().lower(), body.get("password", "")
    if len(name) < 2 or "@" not in email or len(password) < 6:
        return jsonify({"error": "Valid name, email, and password are required."}), 400
    rows = query("SELECT * FROM users WHERE email = %s", (email,))
    if rows:
        user = rows[0]
        if not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Invalid email or password."}), 401
    else:
        query("INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s)",
              (name, email, generate_password_hash(password)), commit=True)
        user = query("SELECT * FROM users WHERE email = %s", (email,))[0]
    session["user_id"] = user["user_id"]
    return jsonify({"userID": user["user_id"], "username": user["email"].split("@")[0], "name": user["name"], "email": user["email"]})


@app.post("/api/auth/signout")
def signout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/showtimes/<int:movie_id>")
def showtimes(movie_id):
    requested = request.args.get("date", date.today().isoformat())
    rows = query("SELECT * FROM showtimes WHERE movie_id = %s AND show_date = %s ORDER BY show_time", (movie_id, requested))
    return jsonify([{"showID": r["show_id"], "screenName": r["screen_name"], "showTime": r["show_time"].strftime("%I:%M %p"), "price": float(r["price"]), "date": requested} for r in rows])


@app.get("/api/bookings")
def get_bookings():
    uid = current_user_id()
    if not uid:
        return jsonify([])
    rows = query("""SELECT b.*, m.title AS movie_title, m.language FROM bookings b
                    JOIN movies m ON m.movie_id = b.movie_id
                    WHERE b.user_id = %s ORDER BY b.created_at DESC""", (uid,))
    result = []
    for row in rows:
        seats = query("SELECT seat_no, ticket_type FROM booking_seats WHERE booking_id = %s ORDER BY seat_no", (row["booking_id"],))
        result.append({"id": row["booking_id"], "movieID": row["movie_id"], "movieTitle": row["movie_title"], "language": row["language"], "date": str(row["show_date"]), "showID": row["show_id"], "showTime": row["show_time"], "screenName": row["screen_name"], "seats": [s["seat_no"] for s in seats], "ticketTypes": {s["seat_no"]: s["ticket_type"] for s in seats}, "total": float(row["total"])})
    return jsonify(result)


@app.get("/api/showtimes/<int:movie_id>/<show_id>/occupied")
def occupied(movie_id, show_id):
    rows = query("SELECT bs.seat_no FROM booking_seats bs JOIN bookings b ON b.booking_id = bs.booking_id WHERE b.movie_id = %s AND b.show_id = %s AND b.status = 'CONFIRMED'", (movie_id, show_id))
    return jsonify([row["seat_no"] for row in rows])


@app.post("/api/bookings")
def create_booking():
    uid = current_user_id()
    if not uid:
        return jsonify({"error": "Please sign in before booking."}), 401
    body = request.get_json(silent=True) or {}
    required = ["movieID", "date", "showID", "showTime", "screenName", "seats", "ticketTypes", "total"]
    if any(field not in body for field in required) or not body["seats"]:
        return jsonify({"error": "Incomplete booking details."}), 400
    conn = connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) FROM bookings b JOIN booking_seats bs ON b.booking_id = bs.booking_id WHERE b.movie_id=%s AND b.show_id=%s AND b.status='CONFIRMED' AND bs.seat_no IN (" + ",".join(["%s"] * len(body["seats"])) + ")", [body["movieID"], body["showID"], *body["seats"]])
        if cursor.fetchone()[0]:
            return jsonify({"error": "One or more selected seats are already booked."}), 409
        cursor.execute("INSERT INTO bookings (user_id, movie_id, show_date, show_id, show_time, screen_name, total) VALUES (%s,%s,%s,%s,%s,%s,%s)", (uid, body["movieID"], body["date"], body["showID"], body["showTime"], body["screenName"], body["total"]))
        booking_id = cursor.lastrowid
        cursor.executemany("INSERT INTO booking_seats (booking_id, seat_no, ticket_type) VALUES (%s,%s,%s)", [(booking_id, seat, body["ticketTypes"].get(seat, "adult")) for seat in body["seats"]])
        conn.commit()
        return jsonify({"id": booking_id, **body}), 201
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close(); conn.close()


@app.delete("/api/bookings/<int:booking_id>")
def delete_booking(booking_id):
    if not current_user_id():
        return jsonify({"error": "Please sign in."}), 401
    query("UPDATE bookings SET status = 'CANCELLED' WHERE booking_id = %s AND user_id = %s", (booking_id, current_user_id()), commit=True)
    return jsonify({"ok": True})


@app.errorhandler(Exception)
def handle_error(error):
    app.logger.exception(error)
    return jsonify({"error": "Server error", "details": str(error)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)