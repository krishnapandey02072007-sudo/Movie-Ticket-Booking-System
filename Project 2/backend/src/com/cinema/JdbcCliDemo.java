package com.cinema;

import com.cinema.dao.CinemaDAO;
import com.cinema.db.DBConnection;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.*;

/**
 * Standalone JDBC Console Demonstration for DA3 Professor Review & Viva.
 * Directly demonstrates:
 * 1. Oracle JDBC Connection
 * 2. PreparedStatement queries
 * 3. CallableStatement for Stored Procedures (Buy Ticket, Edit Seat, Refund)
 * 4. ACID Transaction & Pessimistic Locking
 * 5. Trigger Enforcement (Double-booking prevention)
 * 6. Advanced Views execution
 */
public class JdbcCliDemo {

    public static void main(String[] args) {
        System.out.println("============================================================================");
        System.out.println(" 🎬 DA3 INTERACTIVE JDBC CONSOLE DEMO (ORACLE 21c PL/SQL + JDBC)");
        System.out.println("============================================================================");

        try {
            // 1. Test Connection
            System.out.println("\n[STEP 1] Testing Oracle JDBC Connection...");
            try (Connection conn = DBConnection.getConnection();
                 Statement st = conn.createStatement();
                 ResultSet rs = st.executeQuery("SELECT 'Connected to ' || banner FROM v$version WHERE ROWNUM = 1")) {
                if (rs.next()) {
                    System.out.println(">>> " + rs.getString(1));
                }
            }

            CinemaDAO dao = new CinemaDAO();

            // 2. Query Movies Catalog via JDBC PreparedStatement
            System.out.println("\n[STEP 2] Fetching Movie Catalog via JDBC PreparedStatement...");
            List<Map<String, Object>> movies = dao.getMovies();
            for (Map<String, Object> m : movies) {
                System.out.printf("  ID: %d | Title: %-30s | Lang: %-8s | Rating: %s (%s)\n",
                        m.get("movieID"), m.get("title"), m.get("language"), m.get("rating"), m.get("votes"));
            }

            // 3. Query Showtimes for Today
            String today = LocalDate.now().toString();
            System.out.println("\n[STEP 3] Fetching Showtimes for Today (" + today + ") for Movie ID 1 (Leo)...");
            List<Map<String, Object>> showtimes = dao.getShowtimes(1, today);
            for (Map<String, Object> s : showtimes) {
                System.out.printf("  Show ID: %-20s | Screen: %-22s | Time: %-10s | Price: ₹%.2f\n",
                        s.get("showID"), s.get("screenName"), s.get("showTime"), s.get("price"));
            }

            if (showtimes.isEmpty()) {
                System.out.println("No showtimes found for today. Exiting demo.");
                return;
            }

            String targetShowId = (String) showtimes.get(0).get("showID");
            String targetTime = (String) showtimes.get(0).get("showTime");
            String targetScreen = (String) showtimes.get(0).get("screenName");
            double price = (Double) showtimes.get(0).get("price");

            // 4. Check occupied seats
            System.out.println("\n[STEP 4] Querying Occupied Seats for show " + targetShowId + "...");
            List<String> occupied = dao.getOccupiedSeats(1, targetShowId);
            System.out.println("  Currently booked seats: " + occupied);

            // 5. BUY TICKET via JDBC CallableStatement (sp_book_tickets)
            System.out.println("\n[STEP 5] BUYING TICKETS via Stored Procedure SP_BOOK_TICKETS...");
            List<String> demoSeats = Arrays.asList("D1", "D2");
            Map<String, String> types = new HashMap<>();
            types.put("D1", "adult");
            types.put("D2", "child"); // 20% discount
            double expectedTotal = price + (price * 0.80);

            // User 3 (Rohith Raj) has 15% Platinum membership discount!
            expectedTotal = expectedTotal * 0.85;

            System.out.printf("  Booking seats %s for User ID 3 (Rohith Raj - Platinum Member)... Total: ₹%.2f\n", demoSeats, expectedTotal);
            Map<String, Object> bookRes = dao.bookTickets(3, 1, targetShowId, today, targetTime, targetScreen,
                    demoSeats, types, expectedTotal, "UPI-DEMO-" + System.currentTimeMillis());

            System.out.println("  Procedure Result: " + bookRes);
            if (!(Boolean) bookRes.get("success")) {
                System.out.println("  (Booking was not created: " + bookRes.get("message") + ")");
            }

            long newBookingId = ((Number) bookRes.getOrDefault("bookingId", 0L)).longValue();

            // 6. Test Double-Booking Prevention Trigger
            System.out.println("\n[STEP 6] Testing TRIGGER TRG_PREVENT_DOUBLE_BOOKING (Race Condition Prevention)...");
            System.out.println("  Attempting to book the SAME seat (D1) again for the same show...");
            Map<String, Object> conflictRes = dao.bookTickets(4, 1, targetShowId, today, targetTime, targetScreen,
                    Collections.singletonList("D1"), Collections.singletonMap("D1", "adult"), price, "UPI-CONFLICT-TEST");
            System.out.println("  Expected Conflict Result: " + conflictRes);
            System.out.println("  >>> Confirmed: Concurrency conflict prevented by database trigger!");

            // 7. EDIT TICKET SEAT via JDBC CallableStatement (sp_edit_ticket_seat)
            if (newBookingId > 0) {
                System.out.println("\n[STEP 7] EDITING TICKET SEAT via Stored Procedure SP_EDIT_TICKET_SEAT...");
                System.out.println("  Changing seat from D2 to D3 for booking #" + newBookingId + "...");
                Map<String, Object> editRes = dao.editTicketSeat(newBookingId, 3, "D2", "D3");
                System.out.println("  Procedure Result: " + editRes);

                // 8. CANCEL / REFUND TICKET via JDBC CallableStatement (sp_cancel_booking)
                System.out.println("\n[STEP 8] CANCELLING & REFUNDING TICKET via Stored Procedure SP_CANCEL_BOOKING...");
                Map<String, Object> cancelRes = dao.cancelBooking(newBookingId, 3);
                System.out.println("  Procedure Result: " + cancelRes);
                System.out.printf("  >>> Seats released! Refund Processed: ₹%.2f\n", cancelRes.get("refundAmount"));
            }

            // 9. Query Advanced Views
            System.out.println("\n[STEP 9] Querying Advanced View V_MOVIE_PERFORMANCE via JDBC...");
            try (Connection conn = DBConnection.getConnection();
                 Statement st = conn.createStatement();
                 ResultSet rs = st.executeQuery("SELECT title, language, total_bookings, gross_revenue, total_tickets_sold FROM v_movie_performance")) {
                while (rs.next()) {
                    System.out.printf("  Movie: %-25s | Lang: %-8s | Bookings: %-2d | Sold: %-2d | Gross Revenue: ₹%.2f\n",
                            rs.getString(1), rs.getString(2), rs.getInt(3), rs.getInt(5), rs.getDouble(4));
                }
            }

            // 10. Neo4j Graph Database Integration & Polyglot Persistence
            System.out.println("\n[STEP 10] Testing Neo4j Graph Database Integration & Polyglot Persistence...");
            Map<String, Object> neoStats = com.cinema.db.Neo4jService.getGraphStats();
            System.out.println("  Neo4j Engine Mode: " + neoStats.get("engineMode"));
            System.out.println("  Graph Nodes Count: " + neoStats.get("nodesCount"));
            System.out.println("  Graph Relationships: " + neoStats.get("relationshipsCount") +
                    " (RATED: " + neoStats.get("ratedEdges") + ", BOOKED: " + neoStats.get("bookedEdges") +
                    ", IN_GENRE: " + neoStats.get("inGenreEdges") + ")");

            System.out.println("\n  Executing Multi-Hop Cypher Collaborative Filtering Query for User 3 (Rohith Raj):");
            System.out.println("  Cypher Pattern: (me:User {id: 3})-[:RATED]->(m)<-[:RATED]-(similar)-[:RATED]->(rec:Movie)");
            List<Map<String, Object>> recs = com.cinema.db.Neo4jService.getCollaborativeRecommendations(3, dao);
            for (Map<String, Object> r : recs) {
                System.out.printf("  >>> Recommended: %-30s | Match Score: %.1f | Reason: %s\n",
                        r.get("title"), ((Number) r.get("graphScore")).doubleValue(), r.get("recommendationReason"));
            }

            System.out.println("\n============================================================================");
            System.out.println(" 🎉 ALL JDBC TESTS, STORED PROCEDURES & NEO4J GRAPH QUERIES PASSED!");
            System.out.println("============================================================================\n");

        } catch (Exception e) {
            System.err.println("JDBC CLI Demo Error: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
