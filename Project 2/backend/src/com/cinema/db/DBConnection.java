package com.cinema.db;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

/**
 * Advanced Database Management Systems (ADBMS) - DA3
 * Front-end to Back-end Connectivity using Java Database Connectivity (JDBC)
 * Database Engine: Oracle 21c XE (XEPDB1)
 */
public class DBConnection {

    private static final String DEFAULT_URL = "jdbc:oracle:thin:@//localhost:1521/XEPDB1";
    private static final String DEFAULT_USER = "cinema_admin";
    private static final String DEFAULT_PASSWORD = "cinema123";

    private static String url = System.getenv("DB_URL") != null ? System.getenv("DB_URL") : DEFAULT_URL;
    private static String user = System.getenv("DB_USER") != null ? System.getenv("DB_USER") : DEFAULT_USER;
    private static String password = System.getenv("DB_PASSWORD") != null ? System.getenv("DB_PASSWORD") : DEFAULT_PASSWORD;

    static {
        try {
            Class.forName("oracle.jdbc.OracleDriver");
            System.out.println("[JDBC] Oracle JDBC Driver successfully registered.");
        } catch (ClassNotFoundException e) {
            System.err.println("[JDBC WARNING] Oracle JDBC driver not found in classpath: " + e.getMessage());
        }
    }

    /**
     * Establishes a new JDBC Connection to Oracle Database.
     */
    public static Connection getConnection() throws SQLException {
        return DriverManager.getConnection(url, user, password);
    }

    /**
     * Verifies that the Oracle database is reachable via JDBC.
     */
    public static boolean testConnection() {
        try (Connection conn = getConnection()) {
            return conn != null && !conn.isClosed();
        } catch (SQLException e) {
            System.err.println("[JDBC ERROR] Failed to connect to Oracle: " + e.getMessage());
            return false;
        }
    }

    public static String getUrl() {
        return url;
    }

    public static String getUser() {
        return user;
    }
}
