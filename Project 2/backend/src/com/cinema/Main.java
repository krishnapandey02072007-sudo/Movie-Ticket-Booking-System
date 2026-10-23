package com.cinema;

import com.cinema.db.DBConnection;
import com.cinema.server.CinemaServer;

import java.awt.Desktop;
import java.net.URI;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Main application entrypoint.
 * Boots the unified Movie Ticket Booking System backed by Oracle 21c Database via pure Java JDBC.
 */
public class Main {

    public static void main(String[] args) {
        int port = 8080;
        if (System.getenv("PORT") != null) {
            try {
                port = Integer.parseInt(System.getenv("PORT"));
            } catch (NumberFormatException ignored) {}
        }

        Path webRoot = Paths.get("frontend");
        if (!java.nio.file.Files.isDirectory(webRoot)) {
            webRoot = Paths.get("..", "frontend");
        }
        if (!java.nio.file.Files.isDirectory(webRoot)) {
            webRoot = Paths.get("Project 2", "frontend");
        }
        if (!java.nio.file.Files.isDirectory(webRoot)) {
            webRoot = Paths.get("web");
        }
        if (!java.nio.file.Files.isDirectory(webRoot)) {
            webRoot = Paths.get("..", "web");
        }
        if (!java.nio.file.Files.isDirectory(webRoot)) {
            webRoot = Paths.get(".").toAbsolutePath();
        }

        System.out.println("Initializing Movie Ticket Booking System (DA3)...");
        boolean dbOk = DBConnection.testConnection();
        if (dbOk) {
            System.out.println(">>> [SUCCESS] Connected to Oracle 21c Database via JDBC!");
        } else {
            System.err.println(">>> [WARNING] Could not connect to Oracle 21c at " + DBConnection.getUrl());
            System.err.println("    Please ensure Oracle Service (OracleServiceXE) is running on port 1521.");
        }

        try {
            CinemaServer server = new CinemaServer(port, webRoot);
            server.start();

            String appUrl = "http://localhost:" + port;
            System.out.println("\nApplication is ready at: " + appUrl);
            System.out.println("Press Ctrl+C in terminal to stop the server.\n");

            // Automatically open browser on desktop
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                try {
                    Desktop.getDesktop().browse(new URI(appUrl));
                } catch (Exception e) {
                    System.out.println("Open " + appUrl + " in your web browser.");
                }
            }
        } catch (Exception e) {
            System.err.println("Failed to start server: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
