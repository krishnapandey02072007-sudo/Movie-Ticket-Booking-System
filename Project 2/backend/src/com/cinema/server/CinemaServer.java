package com.cinema.server;

import com.cinema.dao.CinemaDAO;
import com.cinema.db.DBConnection;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

/**
 * Built-in High-Performance HTTP Server running on standard JDK.
 * Provides frontend static file serving and REST JSON API endpoints connected
 * to Oracle Database via JDBC.
 */
public class CinemaServer {

    private final int port;
    private final Path webRoot;
    private final CinemaDAO dao;
    private HttpServer server;

    // Session cache (cookie/token -> userId)
    private static final Map<String, Integer> SESSIONS = new HashMap<>();
    private static int activeDefaultUserId = 3; // Default to demo user 'Rohith Raj'

    public CinemaServer(int port, Path webRoot) {
        this.port = port;
        this.webRoot = webRoot;
        this.dao = new CinemaDAO();
    }

    public void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/", new UnifiedHandler());
        server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
        server.start();
        System.out.println("============================================================================");
        System.out.println(" 🎬 MOVIE TICKET BOOKING SYSTEM - DA3 ADVANCED DATABASE");
        System.out.println(" Architecture: POLYGLOT PERSISTENCE (Oracle 21c XE Relational + Neo4j Graph)");
        System.out.println(" Relational Database: " + DBConnection.getUrl() + " (User: " + DBConnection.getUser() + ")");
        System.out.println(" Graph Database: Neo4j 5.x (Cypher Collaborative Filtering Engine)");
        System.out.println(" Frontend & Backend Connectivity: PURE JAVA JDBC (java.sql.*)");
        System.out.println(" Server URL: http://localhost:" + port);
        System.out.println(" Web Root: " + webRoot.toAbsolutePath());
        System.out.println("============================================================================");
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
        }
    }

    private class UnifiedHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String method = exchange.getRequestMethod().toUpperCase();
            String path = exchange.getRequestURI().getPath();
            String query = exchange.getRequestURI().getQuery();

            // Set CORS headers
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization");

            if ("OPTIONS".equals(method)) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }

            try {
                if (path.startsWith("/api/")) {
                    handleApi(exchange, method, path, query);
                } else {
                    handleStaticFile(exchange, path);
                }
            } catch (Exception e) {
                e.printStackTrace();
                sendJson(exchange, 500,
                        "{\"error\":\"Internal Server Error\", \"details\":\"" + escapeJson(e.getMessage()) + "\"}");
            }
        }
    }

    private void handleApi(HttpExchange exchange, String method, String path, String query) throws Exception {
        Map<String, String> queryParams = parseQueryParams(query);

        // 1. Health check
        if (path.equals("/api/health")) {
            boolean ok = DBConnection.testConnection();
            boolean neoOk = com.cinema.db.Neo4jService.isNeo4jReachable();
            String json = String.format(
                    "{\"status\":\"%s\", \"database\":\"Oracle 21c XE\", \"graphDatabase\":\"Neo4j 5.x\", \"graphStatus\":\"%s\", \"architecture\":\"Polyglot Persistence\", \"connectivity\":\"Java JDBC (ojdbc11)\"}",
                    ok ? "ok" : "degraded", neoOk ? "Online (Daemon Connected)" : "Active (In-Memory Graph Engine)");
            sendJson(exchange, ok ? 200 : 503, json);
            return;
        }

        // 2. Movie Catalog
        if (path.equals("/api/movies")) {
            List<Map<String, Object>> movies = dao.getMovies();
            sendJson(exchange, 200, toJsonList(movies));
            return;
        }

        // 3. Showtimes for a Movie
        if (path.startsWith("/api/showtimes/")) {
            String sub = path.substring("/api/showtimes/".length());
            String[] parts = sub.split("/");
            int movieId = Integer.parseInt(parts[0]);

            if (parts.length == 1) {
                // GET /api/showtimes/{movieId}?date=YYYY-MM-DD
                String date = queryParams.getOrDefault("date", java.time.LocalDate.now().toString());
                List<Map<String, Object>> showtimes = dao.getShowtimes(movieId, date);
                sendJson(exchange, 200, toJsonList(showtimes));
                return;
            } else if (parts.length >= 3 && "occupied".equalsIgnoreCase(parts[2])) {
                // GET /api/showtimes/{movieId}/{showId}/occupied
                String showId = URLDecoder.decode(parts[1], StandardCharsets.UTF_8.name());
                List<String> occupied = dao.getOccupiedSeats(movieId, showId);
                StringBuilder sb = new StringBuilder("[");
                for (int i = 0; i < occupied.size(); i++) {
                    if (i > 0)
                        sb.append(",");
                    sb.append("\"").append(occupied.get(i)).append("\"");
                }
                sb.append("]");
                sendJson(exchange, 200, sb.toString());
                return;
            }
        }

        // 4. Payment Details & QR
        if (path.equals("/api/payment-details")) {
            double amount = Double.parseDouble(queryParams.getOrDefault("amount", "0"));
            String upiId = "rrr97971@upi";
            String payee = "CinemaBooking";
            String upiLink = String.format("upi://pay?pa=%s&pn=%s&am=%.2f&cu=INR&tn=Movie%%20ticket%%20booking", upiId,
                    payee, amount);
            String json = String.format(
                    "{\"upiId\":\"%s\", \"payeeName\":\"%s\", \"amount\":%.2f, \"upiLink\":\"%s\", \"qrUrl\":\"assets/payment-qr.png\"}",
                    upiId, payee, amount, upiLink);
            sendJson(exchange, 200, json);
            return;
        }

        if (path.equals("/api/payment-qr")) {
            Path qrPath = webRoot.resolve("assets").resolve("payment-qr.png");
            if (Files.exists(qrPath)) {
                byte[] bytes = Files.readAllBytes(qrPath);
                exchange.getResponseHeaders().set("Content-Type", "image/png");
                exchange.sendResponseHeaders(200, bytes.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(bytes);
                }
            } else {
                exchange.sendResponseHeaders(404, -1);
            }
            return;
        }

        // 5. Late Policy
        if (path.equals("/api/late-policy")) {
            sendJson(exchange, 200, "{\"windowMinutes\": 30, \"refundPercent\": 50}");
            return;
        }

        // 6. Auth
        if (path.equals("/api/auth/signin") && "POST".equals(method)) {
            String body = readBody(exchange);
            Map<String, String> jsonMap = parseSimpleJson(body);
            String name = jsonMap.getOrDefault("name", "Guest User");
            String email = jsonMap.getOrDefault("email", "guest@example.com");
            Map<String, Object> user = dao.authenticateUser(name, email);
            int uid = ((Number) user.get("userID")).intValue();
            activeDefaultUserId = uid;
            sendJson(exchange, 200, toJsonObject(user));
            return;
        }

        if (path.equals("/api/auth/signout") && "POST".equals(method)) {
            sendJson(exchange, 200, "{\"ok\": true}");
            return;
        }

        if (path.equals("/api/auth/me")) {
            sendJson(exchange, 200,
                    String.format("{\"userID\": %d, \"name\": \"Rohith Raj\", \"email\": \"rohith@vit.ac.in\"}",
                            activeDefaultUserId));
            return;
        }

        // 7. Bookings
        if (path.equals("/api/bookings")) {
            if ("GET".equals(method)) {
                List<Map<String, Object>> bookings = dao.getUserBookings(activeDefaultUserId);
                sendJson(exchange, 200, toJsonList(bookings));
                return;
            } else if ("POST".equals(method)) {
                // Buy Tickets via Stored Procedure SP_BOOK_TICKETS
                String body = readBody(exchange);
                Map<String, String> jsonMap = parseSimpleJson(body);

                int movieId = Integer.parseInt(jsonMap.get("movieID"));
                String showId = jsonMap.get("showID");
                String showDate = jsonMap.get("date");
                String showTime = jsonMap.get("showTime");
                String screenName = jsonMap.get("screenName");
                double total = Double.parseDouble(jsonMap.get("total"));
                String paymentRef = jsonMap.getOrDefault("paymentReference", "UPI-" + System.currentTimeMillis());

                List<String> seats = parseJsonArray(jsonMap.get("seats"));
                Map<String, String> types = parseJsonMap(jsonMap.get("ticketTypes"));

                // If editingBookingId is set, it's an edit!
                if (jsonMap.containsKey("editingBookingId") && !jsonMap.get("editingBookingId").isEmpty()) {
                    long editId = Long.parseLong(jsonMap.get("editingBookingId"));
                    List<String> currentSeats = dao.getBookingSeats(editId);
                    Map<String, Object> editRes = dao.editBookingSeats(editId, activeDefaultUserId, currentSeats, seats);
                    if ((Boolean) editRes.get("success")) {
                        double feeCharged = (Double) editRes.getOrDefault("feeCharged", 0.0);
                        int seatsChanged = (Integer) editRes.getOrDefault("seatsChanged", 0);
                        sendJson(exchange, 200, "{\"id\":" + editId + ", \"total\":" + total
                                + ", \"seatsChanged\":" + seatsChanged + ", \"feeCharged\":" + feeCharged
                                + ", \"message\":\"" + escapeJson((String) editRes.get("message")) + "\"}");
                    } else {
                        sendJson(exchange, 409,
                                "{\"error\":\"" + escapeJson((String) editRes.get("message")) + "\"}");
                    }
                    return;
                }

                Map<String, Object> bookRes = dao.bookTickets(activeDefaultUserId, movieId, showId, showDate, showTime,
                        screenName, seats, types, total, paymentRef);
                if ((Boolean) bookRes.get("success")) {
                    long bookingId = ((Number) bookRes.get("bookingId")).longValue();
                    String resp = String.format(
                            "{\"id\":%d, \"total\":%.2f, \"paymentStatus\":\"USER_REPORTED\", \"message\":\"%s\"}",
                            bookingId, total, escapeJson((String) bookRes.get("message")));
                    sendJson(exchange, 201, resp);
                } else if ("CONFLICT".equals(bookRes.get("status"))) {
                    sendJson(exchange, 409, "{\"error\":\"" + escapeJson((String) bookRes.get("message")) + "\"}");
                } else {
                    sendJson(exchange, 400, "{\"error\":\"" + escapeJson((String) bookRes.get("message")) + "\"}");
                }
                return;
            }
        }

        // Individual Booking Actions: Cancel, Edit Seat, Late Refund, Late Switch
        if (path.startsWith("/api/bookings/")) {
            String remainder = path.substring("/api/bookings/".length());
            String[] parts = remainder.split("/");
            long bookingId = Long.parseLong(parts[0]);

            // Cancellation / Refund: DELETE /api/bookings/{id} or POST
            // /api/bookings/{id}/cancel
            if ("DELETE".equals(method) || (parts.length >= 2 && "cancel".equalsIgnoreCase(parts[1]))) {
                Map<String, Object> cancelRes = dao.cancelBooking(bookingId, activeDefaultUserId);
                if ((Boolean) cancelRes.get("success")) {
                    sendJson(exchange, 200, String.format("{\"ok\":true, \"refundAmount\":%.2f, \"message\":\"%s\"}",
                            (Double) cancelRes.get("refundAmount"), escapeJson((String) cancelRes.get("message"))));
                } else {
                    sendJson(exchange, 400, "{\"error\":\"" + escapeJson((String) cancelRes.get("message")) + "\"}");
                }
                return;
            }

            // Edit Seat: POST /api/bookings/{id}/edit-seat or POST /api/bookings/{id}/edit-seats
            if (parts.length >= 2 && ("edit-seat".equalsIgnoreCase(parts[1]) || "edit-seats".equalsIgnoreCase(parts[1])) && "POST".equals(method)) {
                String body = readBody(exchange);
                Map<String, String> jsonMap = parseSimpleJson(body);

                // Multi-seat support (JSON array)
                if (jsonMap.containsKey("newSeats") || jsonMap.containsKey("seats")) {
                    String raw = jsonMap.containsKey("newSeats") ? jsonMap.get("newSeats") : jsonMap.get("seats");
                    List<String> newSeats = parseJsonArray(raw);
                    List<String> oldSeats = jsonMap.containsKey("oldSeats") ? parseJsonArray(jsonMap.get("oldSeats")) : dao.getBookingSeats(bookingId);

                    Map<String, Object> editRes = dao.editBookingSeats(bookingId, activeDefaultUserId, oldSeats, newSeats);
                    if ((Boolean) editRes.get("success")) {
                        double fee = (Double) editRes.getOrDefault("feeCharged", 0.0);
                        int count = (Integer) editRes.getOrDefault("seatsChanged", 0);
                        sendJson(exchange, 200, String.format(
                                "{\"ok\":true, \"bookingId\":%d, \"seatsChanged\":%d, \"feeCharged\":%.2f, \"message\":\"%s\"}",
                                bookingId, count, fee, escapeJson((String) editRes.get("message"))));
                    } else {
                        sendJson(exchange, 409, "{\"error\":\"" + escapeJson((String) editRes.get("message")) + "\"}");
                    }
                    return;
                }

                // Single seat modification
                String oldSeat = jsonMap.get("oldSeat");
                String newSeat = jsonMap.get("newSeat");
                Map<String, Object> editRes = dao.editTicketSeat(bookingId, activeDefaultUserId, oldSeat, newSeat);
                if ((Boolean) editRes.get("success")) {
                    sendJson(exchange, 200,
                            "{\"ok\":true, \"bookingId\":" + bookingId + ", \"seatsChanged\":1, \"feeCharged\":40.00, \"message\":\"" + escapeJson((String) editRes.get("message")) + "\"}");
                } else {
                    sendJson(exchange, 409, "{\"error\":\"" + escapeJson((String) editRes.get("message")) + "\"}");
                }
                return;
            }

            // Late-Arrival Refund: POST /api/bookings/{id}/late-refund
            if (parts.length >= 2 && "late-refund".equalsIgnoreCase(parts[1]) && "POST".equals(method)) {
                Map<String, Object> refundRes = dao.lateRefund(bookingId, activeDefaultUserId);
                if ((Boolean) refundRes.get("success")) {
                    sendJson(exchange, 200, String.format(
                            "{\"ok\":true, \"bookingID\":%d, \"refundAmount\":%.2f, \"refundPercent\":50, \"requestStatus\":\"REQUESTED\"}",
                            bookingId, (Double) refundRes.get("refundAmount")));
                } else {
                    sendJson(exchange, 409, "{\"error\":\"" + escapeJson((String) refundRes.get("message")) + "\"}");
                }
                return;
            }

            // Late-Arrival Switch Showtime: POST /api/bookings/{id}/late-switch
            if (parts.length >= 2 && "late-switch".equalsIgnoreCase(parts[1]) && "POST".equals(method)) {
                String body = readBody(exchange);
                Map<String, String> jsonMap = parseSimpleJson(body);
                String showId = jsonMap.get("showID");
                String showDate = jsonMap.get("date");
                String showTime = jsonMap.get("showTime");
                String screenName = jsonMap.get("screenName");
                double newTotal = Double.parseDouble(jsonMap.get("total"));
                List<String> seats = parseJsonArray(jsonMap.get("seats"));
                Map<String, String> types = parseJsonMap(jsonMap.get("ticketTypes"));

                Map<String, Object> switchRes = dao.switchShow(bookingId, activeDefaultUserId, showId, showDate,
                        showTime, screenName, seats, types, newTotal);
                if ((Boolean) switchRes.get("success")) {
                    sendJson(exchange, 200,
                            String.format("{\"ok\":true, \"id\":%d, \"difference\":%.2f, \"message\":\"%s\"}",
                                    bookingId, (Double) switchRes.get("difference"),
                                    escapeJson((String) switchRes.get("message"))));
                } else {
                    sendJson(exchange, 409, "{\"error\":\"" + escapeJson((String) switchRes.get("message")) + "\"}");
                }
                return;
            }
        }

        // 8. Recommendations via Neo4j Graph Engine (popular / collaborative filtering)
        if (path.startsWith("/api/recommendations/")) {
            if (path.contains("/popular")) {
                List<Map<String, Object>> popular = com.cinema.db.Neo4jService.getPopularMovies(dao);
                sendJson(exchange, 200, toJsonList(popular));
                return;
            } else {
                List<Map<String, Object>> recs = com.cinema.db.Neo4jService.getCollaborativeRecommendations(activeDefaultUserId, dao);
                sendJson(exchange, 200, toJsonList(recs));
                return;
            }
        }

        // 8b. Neo4j Graph Status
        if (path.equals("/api/neo4j/status")) {
            Map<String, Object> stats = com.cinema.db.Neo4jService.getGraphStats();
            sendJson(exchange, 200, toJsonObject(stats));
            return;
        }

        // 8c. Neo4j Full Sync from Oracle (POST)
        if (path.equals("/api/admin/neo4j-sync") && "POST".equals(method)) {
            Map<String, Object> syncRes = com.cinema.db.Neo4jService.syncFromOracle(dao);
            sendJson(exchange, 200, toJsonObject(syncRes));
            return;
        }

        // 9. Ratings
        if (path.equals("/api/ratings") && "POST".equals(method)) {
            String body = readBody(exchange);
            Map<String, String> jsonMap = parseSimpleJson(body);
            int movieId = Integer.parseInt(jsonMap.get("movieID"));
            double rating = Double.parseDouble(jsonMap.get("rating"));
            String review = jsonMap.getOrDefault("review", "Great movie!");
            dao.addRating(activeDefaultUserId, movieId, rating, review);
            sendJson(exchange, 200, "{\"ok\":true, \"message\":\"Review recorded in Oracle and synced to Neo4j graph!\"}");
            return;
        }

        // 10. Admin Analytics & Views
        if (path.equals("/api/admin/stats")) {
            Map<String, Object> stats = dao.getAdminStats();
            stats.put("neo4j", com.cinema.db.Neo4jService.getGraphStats());
            sendJson(exchange, 200, toJsonObject(stats));
            return;
        }

        sendJson(exchange, 404, "{\"error\":\"Endpoint not found\"}");
    }

    private void handleStaticFile(HttpExchange exchange, String path) throws IOException {
        if ("/".equals(path) || path.isEmpty()) {
            path = "/index.html";
        }
        Path filePath = webRoot.resolve(path.substring(1)).normalize();
        if (!filePath.startsWith(webRoot) || !Files.exists(filePath) || Files.isDirectory(filePath)) {
            filePath = webRoot.resolve("index.html");
        }

        String mime = getMimeType(filePath.getFileName().toString());
        byte[] bytes = Files.readAllBytes(filePath);

        exchange.getResponseHeaders().set("Content-Type", mime);
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private void sendJson(HttpExchange exchange, int statusCode, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private String readBody(HttpExchange exchange) throws IOException {
        try (InputStream is = exchange.getRequestBody();
                ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) != -1) {
                bos.write(buf, 0, n);
            }
            return bos.toString(StandardCharsets.UTF_8);
        }
    }

    private Map<String, String> parseQueryParams(String query) {
        Map<String, String> map = new HashMap<>();
        if (query == null || query.isEmpty())
            return map;
        for (String pair : query.split("&")) {
            int idx = pair.indexOf('=');
            if (idx > 0) {
                try {
                    String k = URLDecoder.decode(pair.substring(0, idx), StandardCharsets.UTF_8.name());
                    String v = URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8.name());
                    map.put(k, v);
                } catch (Exception ignored) {
                }
            }
        }
        return map;
    }

    private String getMimeType(String filename) {
        String lower = filename.toLowerCase();
        if (lower.endsWith(".html"))
            return "text/html; charset=UTF-8";
        if (lower.endsWith(".css"))
            return "text/css; charset=UTF-8";
        if (lower.endsWith(".js"))
            return "application/javascript; charset=UTF-8";
        if (lower.endsWith(".json"))
            return "application/json; charset=UTF-8";
        if (lower.endsWith(".png"))
            return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
            return "image/jpeg";
        if (lower.endsWith(".svg"))
            return "image/svg+xml";
        if (lower.endsWith(".ico"))
            return "image/x-icon";
        return "application/octet-stream";
    }

    // Lightweight JSON serialization helpers without external third-party
    // dependencies
    public static String escapeJson(String s) {
        if (s == null)
            return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t",
                "\\t");
    }

    public static String toJsonObject(Map<String, Object> map) {
        StringBuilder sb = new StringBuilder("{");
        int count = 0;
        for (Map.Entry<String, Object> e : map.entrySet()) {
            if (count++ > 0)
                sb.append(",");
            sb.append("\"").append(escapeJson(e.getKey())).append("\":");
            sb.append(valueToJson(e.getValue()));
        }
        sb.append("}");
        return sb.toString();
    }

    public static String toJsonList(List<Map<String, Object>> list) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < list.size(); i++) {
            if (i > 0)
                sb.append(",");
            sb.append(toJsonObject(list.get(i)));
        }
        sb.append("]");
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static String valueToJson(Object val) {
        if (val == null)
            return "null";
        if (val instanceof Number || val instanceof Boolean)
            return val.toString();
        if (val instanceof List) {
            List<?> l = (List<?>) val;
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < l.size(); i++) {
                if (i > 0)
                    sb.append(",");
                sb.append(valueToJson(l.get(i)));
            }
            sb.append("]");
            return sb.toString();
        }
        if (val instanceof Map) {
            return toJsonObject((Map<String, Object>) val);
        }
        return "\"" + escapeJson(val.toString()) + "\"";
    }

    public static Map<String, String> parseSimpleJson(String json) {
        Map<String, String> map = new HashMap<>();
        if (json == null)
            return map;
        json = json.trim();
        if (json.startsWith("{"))
            json = json.substring(1);
        if (json.endsWith("}"))
            json = json.substring(0, json.length() - 1);

        int len = json.length();
        int i = 0;
        while (i < len) {
            // Find key
            while (i < len && (json.charAt(i) == ' ' || json.charAt(i) == ',' || json.charAt(i) == '\n'
                    || json.charAt(i) == '\r'))
                i++;
            if (i >= len)
                break;
            if (json.charAt(i) != '"') {
                i++;
                continue;
            }
            int keyStart = ++i;
            while (i < len && json.charAt(i) != '"')
                i++;
            String key = json.substring(keyStart, i++);

            // Find colon
            while (i < len && json.charAt(i) != ':')
                i++;
            i++; // skip :
            while (i < len && (json.charAt(i) == ' ' || json.charAt(i) == '\t'))
                i++;

            // Find value
            if (i >= len)
                break;
            char c = json.charAt(i);
            String val = "";
            if (c == '"') {
                int valStart = ++i;
                while (i < len && json.charAt(i) != '"') {
                    if (json.charAt(i) == '\\')
                        i++;
                    i++;
                }
                val = json.substring(valStart, Math.min(i, len));
                i++;
            } else if (c == '[' || c == '{') {
                char close = c == '[' ? ']' : '}';
                int depth = 1;
                int valStart = i++;
                while (i < len && depth > 0) {
                    if (json.charAt(i) == c)
                        depth++;
                    else if (json.charAt(i) == close)
                        depth--;
                    i++;
                }
                val = json.substring(valStart, i);
            } else {
                int valStart = i;
                while (i < len && json.charAt(i) != ',' && json.charAt(i) != '}')
                    i++;
                val = json.substring(valStart, i).trim();
            }
            map.put(key, val);
        }
        return map;
    }

    public static List<String> parseJsonArray(String json) {
        List<String> list = new ArrayList<>();
        if (json == null)
            return list;
        json = json.trim();
        if (json.startsWith("["))
            json = json.substring(1);
        if (json.endsWith("]"))
            json = json.substring(0, json.length() - 1);
        for (String s : json.split(",")) {
            String clean = s.trim().replace("\"", "");
            if (!clean.isEmpty())
                list.add(clean);
        }
        return list;
    }

    public static Map<String, String> parseJsonMap(String json) {
        Map<String, String> map = new HashMap<>();
        if (json == null)
            return map;
        Map<String, String> raw = parseSimpleJson(json);
        for (Map.Entry<String, String> e : raw.entrySet()) {
            map.put(e.getKey(), e.getValue().replace("\"", "").trim());
        }
        return map;
    }
}
