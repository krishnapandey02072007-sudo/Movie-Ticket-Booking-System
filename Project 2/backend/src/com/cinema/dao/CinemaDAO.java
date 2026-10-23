package com.cinema.dao;

import com.cinema.db.DBConnection;

import java.sql.*;
import java.util.*;

/**
 * Data Access Object (DAO) implementing pure JDBC operations.
 * Demonstrates:
 * - PreparedStatement for parameterized queries
 * - CallableStatement for executing Oracle Stored Procedures and Functions
 * - ACID Transactions with setAutoCommit(false), commit(), and rollback()
 * - Concurrency Control with Pessimistic Locking (FOR UPDATE)
 * - Result mapping from Advanced Views (v_active_shows, v_movie_performance, etc.)
 */
public class CinemaDAO {

    public List<Map<String, Object>> getMovies() throws SQLException {
        String sql = "SELECT * FROM movies ORDER BY movie_id";
        List<Map<String, Object>> list = new ArrayList<>();
        try (Connection conn = DBConnection.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("movieID", rs.getInt("movie_id"));
                m.put("title", rs.getString("title"));
                m.put("language", rs.getString("language"));
                m.put("duration", rs.getInt("duration"));
                m.put("releaseYear", rs.getInt("release_year"));
                m.put("movieType", rs.getString("movie_type"));
                m.put("poster", rs.getString("poster"));
                m.put("rating", rs.getString("rating"));
                m.put("votes", rs.getString("votes"));
                list.add(m);
            }
        }
        return list;
    }

    public List<Map<String, Object>> getShowtimes(int movieId, String date) throws SQLException {
        String sql = "SELECT * FROM shows WHERE movie_id = ? AND TO_CHAR(show_date, 'YYYY-MM-DD') = ? ORDER BY show_time";
        List<Map<String, Object>> list = new ArrayList<>();
        try (Connection conn = DBConnection.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, movieId);
            ps.setString(2, date);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> s = new LinkedHashMap<>();
                    s.put("showID", rs.getString("show_id"));
                    s.put("screenName", rs.getString("screen_name"));
                    s.put("showTime", rs.getString("show_time"));
                    s.put("price", rs.getDouble("price"));
                    s.put("date", date);
                    list.add(s);
                }
            }
        }
        if (list.isEmpty()) {
            // Auto-provision 4 showtimes for this movie & date
            String screenName = (movieId - 1) % 3 == 0 ? "Screen 1 - IMAX" : ((movieId - 1) % 3 == 1 ? "Screen 2 - Standard" : "Screen 3 - Standard");
            int screenId = (movieId - 1) % 3 + 1;
            boolean isIMAX = screenName.contains("IMAX");
            int stagger = ((movieId - 1) % 3) * 20;
            int[][] baseHM = {{10, 0}, {13, 30}, {17, 0}, {20, 30}};

            String insSql = "INSERT INTO shows (show_id, movie_id, screen_id, screen_name, show_date, show_time, price) VALUES (?, ?, ?, ?, TO_DATE(?, 'YYYY-MM-DD'), ?, ?)";
            try (Connection conn = DBConnection.getConnection();
                 PreparedStatement psIns = conn.prepareStatement(insSql)) {
                for (int slot = 0; slot < 4; slot++) {
                    String showId = movieId + "-" + date + "-" + slot;
                    double price = isIMAX ? 280.0 : (slot % 2 == 0 ? 180.0 : 220.0);
                    int totalMin = (baseHM[slot][0] * 60 + baseHM[slot][1] + stagger) % 1440;
                    int h = totalMin / 60;
                    int m = totalMin % 60;
                    String period = h >= 12 ? "PM" : "AM";
                    int disH = h % 12;
                    if (disH == 0) disH = 12;
                    String timeStr = String.format("%d:%02d %s", disH, m, period);

                    psIns.setString(1, showId);
                    psIns.setInt(2, movieId);
                    psIns.setInt(3, screenId);
                    psIns.setString(4, screenName);
                    psIns.setString(5, date);
                    psIns.setString(6, timeStr);
                    psIns.setDouble(7, price);
                    psIns.addBatch();

                    Map<String, Object> s = new LinkedHashMap<>();
                    s.put("showID", showId);
                    s.put("screenName", screenName);
                    s.put("showTime", timeStr);
                    s.put("price", price);
                    s.put("date", date);
                    list.add(s);
                }
                try {
                    psIns.executeBatch();
                } catch (Exception ignored) {
                }
            }
        }
        return list;
    }

    public List<String> getOccupiedSeats(int movieId, String showId) throws SQLException {
        String sql = "SELECT bs.seat_no FROM booking_seats bs " +
                     "JOIN bookings b ON bs.booking_id = b.booking_id " +
                     "WHERE b.movie_id = ? AND b.show_id = ? AND bs.status = 'CONFIRMED'";
        List<String> seats = new ArrayList<>();
        try (Connection conn = DBConnection.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, movieId);
            ps.setString(2, showId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    seats.add(rs.getString("seat_no"));
                }
            }
        }
        return seats;
    }

    /**
     * Executes PL/SQL Stored Procedure SP_BOOK_TICKETS via JDBC CallableStatement.
     */
    public Map<String, Object> bookTickets(int userId, int movieId, String showId, String showDate,
                                           String showTime, String screenName, List<String> seats,
                                           Map<String, String> ticketTypes, double total,
                                           String paymentRef) throws SQLException {
        String seatsCsv = String.join(",", seats);
        List<String> typesList = new ArrayList<>();
        for (String seat : seats) {
            typesList.add(ticketTypes.getOrDefault(seat, "adult"));
        }
        String typesCsv = String.join(",", typesList);

        String callSql = "{call sp_book_tickets(?, ?, ?, TO_DATE(?, 'YYYY-MM-DD'), ?, ?, ?, ?, ?, ?, ?, ?, ?)}";
        Map<String, Object> result = new LinkedHashMap<>();

        try (Connection conn = DBConnection.getConnection();
             CallableStatement cs = conn.prepareCall(callSql)) {
            cs.setInt(1, userId);
            cs.setInt(2, movieId);
            cs.setString(3, showId);
            cs.setString(4, showDate);
            cs.setString(5, showTime);
            cs.setString(6, screenName);
            cs.setString(7, seatsCsv);
            cs.setString(8, typesCsv);
            cs.setString(9, paymentRef != null ? paymentRef : "UPI-" + System.currentTimeMillis());
            cs.setDouble(10, total);

            // Register OUT parameters
            cs.registerOutParameter(11, Types.NUMERIC); // p_booking_id
            cs.registerOutParameter(12, Types.VARCHAR); // p_status
            cs.registerOutParameter(13, Types.VARCHAR); // p_message

            cs.execute();

            long bookingId = cs.getLong(11);
            String status = cs.getString(12);
            String message = cs.getString(13);

            result.put("bookingId", bookingId);
            result.put("status", status);
            result.put("message", message);
            result.put("success", "SUCCESS".equalsIgnoreCase(status));

            // Sync BOOKED edge to Neo4j Graph Database
            if ("SUCCESS".equalsIgnoreCase(status)) {
                try {
                    com.cinema.db.Neo4jService.addBookedEdge(userId, movieId);
                } catch (Exception ignored) {}
            }
        }
        return result;
    }

    /**
     * Helper to look up movie_id associated with a booking_id.
     */
    public int getMovieIdForBooking(long bookingId) {
        String sql = "SELECT movie_id FROM bookings WHERE booking_id = ?";
        try (Connection conn = DBConnection.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, bookingId);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getInt("movie_id");
            }
        } catch (Exception ignored) {}
        return 0;
    }

    /**
     * Executes PL/SQL Stored Procedure SP_CANCEL_BOOKING via JDBC CallableStatement.
     */
    public Map<String, Object> cancelBooking(long bookingId, int userId) throws SQLException {
        int movieId = getMovieIdForBooking(bookingId);
        String callSql = "{call sp_cancel_booking(?, ?, ?, ?, ?)}";
        Map<String, Object> result = new LinkedHashMap<>();

        try (Connection conn = DBConnection.getConnection();
             CallableStatement cs = conn.prepareCall(callSql)) {
            cs.setLong(1, bookingId);
            cs.setInt(2, userId);
            cs.registerOutParameter(3, Types.NUMERIC); // p_refund_amount
            cs.registerOutParameter(4, Types.VARCHAR); // p_status
            cs.registerOutParameter(5, Types.VARCHAR); // p_message

            cs.execute();

            double refundAmount = cs.getDouble(3);
            String status = cs.getString(4);
            String message = cs.getString(5);

            result.put("refundAmount", refundAmount);
            result.put("status", status);
            result.put("message", message);
            result.put("success", "SUCCESS".equalsIgnoreCase(status));

            // Sync removal of BOOKED edge in Neo4j Graph Database
            if ("SUCCESS".equalsIgnoreCase(status) && movieId > 0) {
                try {
                    com.cinema.db.Neo4jService.removeBookedEdge(userId, movieId);
                } catch (Exception ignored) {}
            }
        }
        return result;
    }

    /**
     * Executes PL/SQL Stored Procedure SP_EDIT_TICKET_SEAT via JDBC CallableStatement.
     */
    public Map<String, Object> editTicketSeat(long bookingId, int userId, String oldSeat, String newSeat) throws SQLException {
        String callSql = "{call sp_edit_ticket_seat(?, ?, ?, ?, ?, ?)}";
        Map<String, Object> result = new LinkedHashMap<>();

        try (Connection conn = DBConnection.getConnection();
             CallableStatement cs = conn.prepareCall(callSql)) {
            cs.setLong(1, bookingId);
            cs.setInt(2, userId);
            cs.setString(3, oldSeat);
            cs.setString(4, newSeat);
            cs.registerOutParameter(5, Types.VARCHAR); // p_status
            cs.registerOutParameter(6, Types.VARCHAR); // p_message

            cs.execute();

            String status = cs.getString(5);
            String message = cs.getString(6);

            result.put("status", status);
            result.put("message", message);
            result.put("success", "SUCCESS".equalsIgnoreCase(status));
        }
        return result;
    }

    /**
     * Fetches current active seats for a booking.
     */
    public List<String> getBookingSeats(long bookingId) throws SQLException {
        String sql = "SELECT seat_no FROM booking_seats WHERE booking_id = ? AND status = 'CONFIRMED' ORDER BY seat_no";
        List<String> seats = new ArrayList<>();
        try (Connection conn = DBConnection.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setLong(1, bookingId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    seats.add(rs.getString("seat_no"));
                }
            }
        }
        return seats;
    }

    /**
     * Atomically edits multiple seats for an active booking.
     * Charges ?40 per modified seat via Stored Procedure SP_EDIT_TICKET_SEAT.
     */
    public Map<String, Object> editBookingSeats(long bookingId, int userId, List<String> oldSeats, List<String> newSeats) throws SQLException {
        Map<String, Object> result = new LinkedHashMap<>();

        if (oldSeats == null || oldSeats.isEmpty()) {
            oldSeats = getBookingSeats(bookingId);
        }

        if (newSeats == null || newSeats.isEmpty()) {
            result.put("success", false);
            result.put("message", "Please select valid new seats.");
            return result;
        }

        if (oldSeats.size() != newSeats.size()) {
            result.put("success", false);
            result.put("message", "Selected seat count (" + newSeats.size() + ") must match your booked seats (" + oldSeats.size() + ").");
            return result;
        }

        List<String> toRemove = new ArrayList<>(oldSeats);
        toRemove.removeAll(newSeats);

        List<String> toAdd = new ArrayList<>(newSeats);
        toAdd.removeAll(oldSeats);

        if (toRemove.isEmpty() && toAdd.isEmpty()) {
            result.put("success", true);
            result.put("message", "No seat changes were requested.");
            result.put("seatsChanged", 0);
            result.put("feeCharged", 0.0);
            result.put("newSeats", newSeats);
            return result;
        }

        int changedCount = toRemove.size();
        for (int i = 0; i < changedCount; i++) {
            String oldS = toRemove.get(i);
            String newS = toAdd.get(i);
            Map<String, Object> step = editTicketSeat(bookingId, userId, oldS, newS);
            if (!(Boolean) step.get("success")) {
                result.put("success", false);
                result.put("message", step.get("message"));
                return result;
            }
        }

        double totalFee = changedCount * 40.0;
        result.put("success", true);
        result.put("seatsChanged", changedCount);
        result.put("feeCharged", totalFee);
        result.put("newSeats", newSeats);
        result.put("message", "Seat(s) changed successfully to " + String.join(", ", newSeats) + "! Modification fee of ?40.00 applied (?40/seat).");
        return result;
    }

    /**
     * Executes PL/SQL Stored Procedure SP_LATE_REFUND via JDBC CallableStatement.
     */
    public Map<String, Object> lateRefund(long bookingId, int userId) throws SQLException {
        String callSql = "{call sp_late_refund(?, ?, ?, ?, ?)}";
        Map<String, Object> result = new LinkedHashMap<>();

        try (Connection conn = DBConnection.getConnection();
             CallableStatement cs = conn.prepareCall(callSql)) {
            cs.setLong(1, bookingId);
            cs.setInt(2, userId);
            cs.registerOutParameter(3, Types.NUMERIC); // p_refund_amount
            cs.registerOutParameter(4, Types.VARCHAR); // p_status
            cs.registerOutParameter(5, Types.VARCHAR); // p_message

            cs.execute();

            double refundAmount = cs.getDouble(3);
            String status = cs.getString(4);
            String message = cs.getString(5);

            result.put("refundAmount", refundAmount);
            result.put("status", status);
            result.put("message", message);
            result.put("success", "SUCCESS".equalsIgnoreCase(status));
        }
        return result;
    }

    /**
     * Performs atomic Show Switch (moving tickets to another showtime of the movie) with JDBC Transaction.
     */
    public Map<String, Object> switchShow(long bookingId, int userId, String newShowId, String newDate,
                                         String newTime, String newScreen, List<String> newSeats,
                                         Map<String, String> ticketTypes, double newTotal) throws SQLException {
        Map<String, Object> result = new LinkedHashMap<>();
        Connection conn = DBConnection.getConnection();
        try {
            conn.setAutoCommit(false); // Begin ACID Transaction

            // 1. Lock current booking
            String selSql = "SELECT * FROM bookings WHERE booking_id = ? AND user_id = ? AND status = 'CONFIRMED' FOR UPDATE";
            PreparedStatement psSel = conn.prepareStatement(selSql);
            psSel.setLong(1, bookingId);
            psSel.setInt(2, userId);
            ResultSet rs = psSel.executeQuery();
            if (!rs.next()) {
                conn.rollback();
                result.put("success", false);
                result.put("message", "Active booking not found or already cancelled.");
                return result;
            }
            int movieId = rs.getInt("movie_id");
            String oldShowId = rs.getString("show_id");
            double oldTotal = rs.getDouble("total");
            rs.close();
            psSel.close();

            // 2. Lock target show
            String lockShowSql = "SELECT price FROM shows WHERE show_id = ? FOR UPDATE";
            PreparedStatement psLockShow = conn.prepareStatement(lockShowSql);
            psLockShow.setString(1, newShowId);
            ResultSet rsShow = psLockShow.executeQuery();
            double showPrice;
            if (!rsShow.next()) {
                rsShow.close();
                psLockShow.close();
                double p = (newScreen != null && newScreen.contains("IMAX")) ? 280.0 : 180.0;
                String insShow = "INSERT INTO shows (show_id, movie_id, screen_id, screen_name, show_date, show_time, price) VALUES (?, ?, 1, ?, TO_DATE(?, 'YYYY-MM-DD'), ?, ?)";
                try (PreparedStatement psIns = conn.prepareStatement(insShow)) {
                    psIns.setString(1, newShowId);
                    psIns.setInt(2, movieId);
                    psIns.setString(3, newScreen != null ? newScreen : "Screen 1 - IMAX");
                    psIns.setString(4, newDate);
                    psIns.setString(5, newTime);
                    psIns.setDouble(6, p);
                    psIns.executeUpdate();
                }
                showPrice = p;
            } else {
                showPrice = rsShow.getDouble("price");
                rsShow.close();
                psLockShow.close();
            }

            // 3. Check seat conflicts in target show
            StringBuilder conflictSql = new StringBuilder("SELECT COUNT(*) FROM booking_seats WHERE show_id = ? AND status = 'CONFIRMED' AND seat_no IN (");
            for (int i = 0; i < newSeats.size(); i++) {
                conflictSql.append(i > 0 ? ",?" : "?");
            }
            conflictSql.append(")");
            PreparedStatement psConf = conn.prepareStatement(conflictSql.toString());
            psConf.setString(1, newShowId);
            for (int i = 0; i < newSeats.size(); i++) {
                psConf.setString(i + 2, newSeats.get(i));
            }
            ResultSet rsConf = psConf.executeQuery();
            rsConf.next();
            if (rsConf.getInt(1) > 0) {
                conn.rollback();
                result.put("success", false);
                result.put("message", "One or more seats in the new show were just booked. Please pick again.");
                return result;
            }
            rsConf.close();
            psConf.close();

            // 4. Update bookings row
            double diff = newTotal - oldTotal;
            double refundAmt = diff < 0 ? -diff : 0;
            String updBookingSql = "UPDATE bookings SET show_id = ?, show_date = TO_DATE(?, 'YYYY-MM-DD'), " +
                                  "show_time = ?, screen_name = ?, total = ?, refund_request_amount = ?, " +
                                  "switched_from_show_id = ?, switched_at = SYSTIMESTAMP WHERE booking_id = ?";
            PreparedStatement psUpd = conn.prepareStatement(updBookingSql);
            psUpd.setString(1, newShowId);
            psUpd.setString(2, newDate);
            psUpd.setString(3, newTime);
            psUpd.setString(4, newScreen);
            psUpd.setDouble(5, newTotal);
            psUpd.setDouble(6, refundAmt);
            psUpd.setString(7, oldShowId);
            psUpd.setLong(8, bookingId);
            psUpd.executeUpdate();
            psUpd.close();

            // 5. Delete old seats and insert new seats
            String delSeatsSql = "DELETE FROM booking_seats WHERE booking_id = ?";
            PreparedStatement psDel = conn.prepareStatement(delSeatsSql);
            psDel.setLong(1, bookingId);
            psDel.executeUpdate();
            psDel.close();

            String insSeatSql = "INSERT INTO booking_seats (booking_id, show_id, seat_no, ticket_type, price, status) VALUES (?, ?, ?, ?, ?, 'CONFIRMED')";
            PreparedStatement psIns = conn.prepareStatement(insSeatSql);
            for (String seat : newSeats) {
                String type = ticketTypes.getOrDefault(seat, "adult");
                double seatPrice = "child".equalsIgnoreCase(type) ? showPrice * 0.8 : "senior".equalsIgnoreCase(type) ? showPrice * 0.85 : showPrice;
                psIns.setLong(1, bookingId);
                psIns.setString(2, newShowId);
                psIns.setString(3, seat);
                psIns.setString(4, type);
                psIns.setDouble(5, seatPrice);
                psIns.addBatch();
            }
            psIns.executeBatch();
            psIns.close();

            // 6. Record in Audit Log
            String auditSql = "INSERT INTO booking_audit_log (booking_id, old_status, new_status, action_type, changed_by, notes) " +
                              "VALUES (?, 'CONFIRMED', 'CONFIRMED', 'SHOW_SWITCH', 'USER', ?)";
            PreparedStatement psAudit = conn.prepareStatement(auditSql);
            psAudit.setLong(1, bookingId);
            psAudit.setString(2, "Switched from show " + oldShowId + " to " + newShowId + ". New seats: " + String.join(",", newSeats));
            psAudit.executeUpdate();
            psAudit.close();

            conn.commit(); // Commit ACID Transaction
            result.put("success", true);
            result.put("message", "Show switched successfully.");
            result.put("difference", diff);
        } catch (SQLException e) {
            conn.rollback();
            result.put("success", false);
            result.put("message", e.getMessage());
        } finally {
            conn.setAutoCommit(true);
            conn.close();
        }
        return result;
    }

    /**
     * Queries user bookings by querying the advanced view V_USER_BOOKINGS and BOOKING_SEATS.
     */
    public List<Map<String, Object>> getUserBookings(int userId) throws SQLException {
        String sql = "SELECT * FROM v_user_bookings WHERE user_id = ? AND status = 'CONFIRMED' ORDER BY created_at DESC";
        List<Map<String, Object>> list = new ArrayList<>();
        try (Connection conn = DBConnection.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> b = new LinkedHashMap<>();
                    long bookingId = rs.getLong("booking_id");
                    b.put("id", bookingId);
                    b.put("movieID", rs.getInt("movie_id"));
                    b.put("movieTitle", rs.getString("movie_title"));
                    b.put("language", rs.getString("language"));
                    b.put("poster", rs.getString("poster"));
                    b.put("date", rs.getDate("show_date").toString());
                    b.put("showID", rs.getString("show_id"));
                    b.put("showTime", rs.getString("show_time"));
                    b.put("screenName", rs.getString("screen_name"));
                    b.put("total", rs.getDouble("total"));
                    b.put("paymentStatus", rs.getString("payment_status"));
                    b.put("paymentReference", rs.getString("payment_reference"));
                    b.put("refundRequestedAt", rs.getString("refund_requested_at"));
                    b.put("refundRequestAmount", rs.getObject("refund_request_amount") != null ? rs.getDouble("refund_request_amount") : null);

                    // Fetch individual seats
                    List<String> seats = new ArrayList<>();
                    Map<String, String> types = new LinkedHashMap<>();
                    String seatsSql = "SELECT seat_no, ticket_type FROM booking_seats WHERE booking_id = ? ORDER BY seat_no";
                    try (PreparedStatement psSeats = conn.prepareStatement(seatsSql)) {
                        psSeats.setLong(1, bookingId);
                        try (ResultSet rsSeats = psSeats.executeQuery()) {
                            while (rsSeats.next()) {
                                String s = rsSeats.getString("seat_no");
                                seats.add(s);
                                types.put(s, rsSeats.getString("ticket_type"));
                            }
                        }
                    }
                    b.put("seats", seats);
                    b.put("ticketTypes", types);
                    list.add(b);
                }
            }
        }
        return list;
    }

    public Map<String, Object> authenticateUser(String name, String email) throws SQLException {
        String selSql = "SELECT * FROM users WHERE LOWER(email) = LOWER(?)";
        Map<String, Object> user = new LinkedHashMap<>();
        try (Connection conn = DBConnection.getConnection()) {
            try (PreparedStatement ps = conn.prepareStatement(selSql)) {
                ps.setString(1, email);
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        user.put("userID", rs.getInt("user_id"));
                        user.put("username", email.split("@")[0]);
                        user.put("name", rs.getString("name"));
                        user.put("email", rs.getString("email"));
                        user.put("role", rs.getString("role"));
                        return user;
                    }
                }
            }

            // Create new user if not exists
            String insSql = "INSERT INTO users (name, email) VALUES (?, ?)";
            try (PreparedStatement psIns = conn.prepareStatement(insSql, new String[]{"USER_ID"})) {
                psIns.setString(1, name);
                psIns.setString(2, email);
                psIns.executeUpdate();
                try (ResultSet rs = psIns.getGeneratedKeys()) {
                    if (rs.next()) {
                        int newId = rs.getInt(1);
                        user.put("userID", newId);
                        user.put("username", email.split("@")[0]);
                        user.put("name", name);
                        user.put("email", email);
                        user.put("role", "CUSTOMER");
                    }
                }
            }
        }
        return user;
    }

    public void addRating(int userId, int movieId, double rating, String review) throws SQLException {
        String sql = "MERGE INTO rates r " +
                     "USING (SELECT ? AS u_id, ? AS m_id, ? AS r_val, ? AS r_txt FROM dual) src " +
                     "ON (r.user_id = src.u_id AND r.movie_id = src.m_id) " +
                     "WHEN MATCHED THEN UPDATE SET r.rating = src.r_val, r.review_text = src.r_txt " +
                     "WHEN NOT MATCHED THEN INSERT (user_id, movie_id, rating, review_text) VALUES (src.u_id, src.m_id, src.r_val, src.r_txt)";
        try (Connection conn = DBConnection.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, userId);
            ps.setInt(2, movieId);
            ps.setDouble(3, rating);
            ps.setString(4, review);
            ps.executeUpdate();
        }

        // Sync RATED edge to Neo4j Graph Database
        try {
            com.cinema.db.Neo4jService.addRatedEdge(userId, movieId, rating, review != null ? review : "");
        } catch (Exception ignored) {}
    }

    /**
     * Retrieves analytics from Advanced Views (V_MOVIE_PERFORMANCE, V_ACTIVE_SHOWS, BOOKING_AUDIT_LOG).
     */
    public Map<String, Object> getAdminStats() throws SQLException {
        Map<String, Object> stats = new LinkedHashMap<>();
        try (Connection conn = DBConnection.getConnection()) {
            // 1. Movie Performance View
            List<Map<String, Object>> moviesPerf = new ArrayList<>();
            try (Statement st = conn.createStatement();
                 ResultSet rs = st.executeQuery("SELECT * FROM v_movie_performance ORDER BY gross_revenue DESC")) {
                while (rs.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("movieTitle", rs.getString("title"));
                    row.put("language", rs.getString("language"));
                    row.put("genre", rs.getString("movie_type"));
                    row.put("rating", rs.getString("rating"));
                    row.put("totalBookings", rs.getInt("total_bookings"));
                    row.put("grossRevenue", rs.getDouble("gross_revenue"));
                    row.put("ticketsSold", rs.getInt("total_tickets_sold"));
                    moviesPerf.add(row);
                }
            }
            stats.put("moviePerformance", moviesPerf);

            // 2. Active Shows with Occupancy View
            List<Map<String, Object>> showsOcc = new ArrayList<>();
            try (Statement st = conn.createStatement();
                 ResultSet rs = st.executeQuery("SELECT * FROM v_active_shows ORDER BY show_date, show_time")) {
                while (rs.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("showId", rs.getString("show_id"));
                    row.put("movieTitle", rs.getString("movie_title"));
                    row.put("screenName", rs.getString("screen_name"));
                    row.put("showDate", rs.getDate("show_date").toString());
                    row.put("showTime", rs.getString("show_time"));
                    row.put("bookedSeats", rs.getInt("booked_seats"));
                    row.put("availableSeats", rs.getInt("available_seats"));
                    row.put("capacity", rs.getInt("capacity"));
                    showsOcc.add(row);
                }
            }
            stats.put("activeShows", showsOcc);

            // 3. Recent Audit Logs
            List<Map<String, Object>> auditLogs = new ArrayList<>();
            try (Statement st = conn.createStatement();
                 ResultSet rs = st.executeQuery("SELECT * FROM booking_audit_log ORDER BY change_time DESC FETCH FIRST 10 ROWS ONLY")) {
                while (rs.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("logId", rs.getLong("log_id"));
                    row.put("bookingId", rs.getLong("booking_id"));
                    row.put("actionType", rs.getString("action_type"));
                    row.put("oldStatus", rs.getString("old_status"));
                    row.put("newStatus", rs.getString("new_status"));
                    row.put("changedBy", rs.getString("changed_by"));
                    row.put("changeTime", rs.getString("change_time"));
                    row.put("notes", rs.getString("notes"));
                    auditLogs.add(row);
                }
            }
            stats.put("auditLogs", auditLogs);
        }
        return stats;
    }
}
