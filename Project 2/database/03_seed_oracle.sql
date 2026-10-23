-- ============================================================================
-- SEED DATA: MOVIE TICKET BOOKING SYSTEM (ORACLE 21c)
-- Aligned with mock-movies.json & real assets in web/assets/posters/
-- ============================================================================
SET DEFINE OFF;

-- ----------------------------------------------------------------------------
-- 1. USERS
-- ----------------------------------------------------------------------------
INSERT INTO users (user_id, name, email, password_hash, role) VALUES
(1, 'Admin User', 'admin@bookit.test', 'pbkdf2_sha256$default', 'ADMIN');
INSERT INTO users (user_id, name, email, password_hash, role) VALUES
(2, 'Staff Incharge', 'staff@bookit.test', 'pbkdf2_sha256$default', 'STAFF');
INSERT INTO users (user_id, name, email, password_hash, role) VALUES
(3, 'Rohith Raj', 'rohith@vit.ac.in', 'pbkdf2_sha256$default', 'CUSTOMER');
INSERT INTO users (user_id, name, email, password_hash, role) VALUES
(4, 'Diya Sharma', 'diya@bookit.test', 'pbkdf2_sha256$default', 'CUSTOMER');
INSERT INTO users (user_id, name, email, password_hash, role) VALUES
(5, 'Aarav Patel', 'aarav@bookit.test', 'pbkdf2_sha256$default', 'CUSTOMER');

-- ----------------------------------------------------------------------------
-- 2. USER PROFILES
-- ----------------------------------------------------------------------------
INSERT INTO user_profiles (user_id, phone, date_of_birth, address, bio) VALUES
(3, '+91 9876543210', TO_DATE('2003-05-15', 'YYYY-MM-DD'), 'VIT University, Vellore, Tamil Nadu', 'Film enthusiast & Computer Science engineering student');
INSERT INTO user_profiles (user_id, phone, date_of_birth, address, bio) VALUES
(4, '+91 9811223344', TO_DATE('2002-11-20', 'YYYY-MM-DD'), 'Indira Nagar, Bangalore', 'Loves IMAX action and sci-fi movies');
INSERT INTO user_profiles (user_id, phone, date_of_birth, address, bio) VALUES
(5, '+91 9822334455', TO_DATE('2001-08-10', 'YYYY-MM-DD'), 'Anna Nagar, Chennai', 'Weekend cinema buff');

-- ----------------------------------------------------------------------------
-- 3. MEMBERSHIPS
-- ----------------------------------------------------------------------------
INSERT INTO memberships (user_id, membership_type, discount_percent, started_on, expires_on, status) VALUES
(3, 'PLATINUM', 15.00, SYSDATE - 30, ADD_MONTHS(SYSDATE, 11), 'ACTIVE');
INSERT INTO memberships (user_id, membership_type, discount_percent, started_on, expires_on, status) VALUES
(4, 'GOLD', 10.00, SYSDATE - 60, ADD_MONTHS(SYSDATE, 10), 'ACTIVE');

-- ----------------------------------------------------------------------------
-- 4. SCREENS
-- ----------------------------------------------------------------------------
INSERT INTO screens (screen_id, screen_name, screen_type, capacity) VALUES
(1, 'Screen 1 - IMAX', 'IMAX Laser 4K', 40);
INSERT INTO screens (screen_id, screen_name, screen_type, capacity) VALUES
(2, 'Screen 2 - Standard', 'Dolby Atmos 7.1', 40);
INSERT INTO screens (screen_id, screen_name, screen_type, capacity) VALUES
(3, 'Screen 3 - Standard', 'Standard Digital 4K', 40);

-- ----------------------------------------------------------------------------
-- 5. MOVIES (All 14 movies with exact valid posters in assets/posters/)
-- ----------------------------------------------------------------------------
INSERT INTO movies (movie_id, title, language, duration, release_year, movie_type, poster, rating, votes) VALUES
(1, 'Inception', 'English', 148, 2010, 'ACTOR_BASED', 'assets/posters/poster-inception.jpg', '8.8', '2.3M+');
INSERT INTO movies (movie_id, title, language, duration, release_year, movie_type, poster, rating, votes) VALUES
(2, 'Spider-Man: Across the Spider-Verse', 'English', 140, 2023, 'ANIMATED', 'assets/posters/poster-spiderman.jpg', '8.9', '412K+');
INSERT INTO movies (movie_id, title, language, duration, release_year, movie_type, poster, rating, votes) VALUES
(3, 'Our Planet', 'English', 50, 2019, 'DOCUMENTARY', 'assets/posters/poster-ourplanet.jpg', '9.3', '68K+');
INSERT INTO movies (movie_id, title, language, duration, release_year, movie_type, poster, rating, votes) VALUES
(4, 'Interstellar', 'English', 169, 2014, 'ACTOR_BASED', 'assets/posters/poster-interstellar.jpg', '8.7', '1.9M+');
INSERT INTO movies (movie_id, title, language, duration, release_year, movie_type, poster, rating, votes) VALUES
(5, 'The Dark Knight', 'English', 152, 2008, 'ACTOR_BASED', 'assets/posters/poster-darkknight.jpg', '9.0', '2.7M+');
INSERT INTO movies (movie_id, title, language, duration, release_year, movie_type, poster, rating, votes) VALUES
(6, 'The Lion King', 'English', 118, 1994, 'ANIMATED', 'assets/posters/poster-lionking.jpg', '8.5', '980K+');
INSERT INTO movies (movie_id, title, language, duration, release_year, movie_type, poster, rating, votes) VALUES
(7, 'Free Solo', 'English', 100, 2018, 'DOCUMENTARY', 'assets/posters/poster-freesolo.jpg', '8.2', '45K+');
INSERT INTO movies (movie_id, title, language, duration, release_year, movie_type, poster, rating, votes) VALUES
(8, 'Oppenheimer', 'English', 180, 2023, 'ACTOR_BASED', 'assets/posters/poster-oppenheimer.jpg', '8.6', '890K+');
INSERT INTO movies (movie_id, title, language, duration, release_year, movie_type, poster, rating, votes) VALUES
(9, '3 Idiots', 'Hindi', 170, 2009, 'DRAMA', 'assets/posters/poster-3-idiots.jpg', '8.4', '450K+');
INSERT INTO movies (movie_id, title, language, duration, release_year, movie_type, poster, rating, votes) VALUES
(10, 'Dangal', 'Hindi', 161, 2016, 'SPORTS_DRAMA', 'assets/posters/poster-dangal.jpg', '8.3', '300K+');
INSERT INTO movies (movie_id, title, language, duration, release_year, movie_type, poster, rating, votes) VALUES
(11, 'Zindagi Na Milegi Dobara', 'Hindi', 155, 2011, 'ADVENTURE_DRAMA', 'assets/posters/poster-znmd.jpg', '8.2', '210K+');
INSERT INTO movies (movie_id, title, language, duration, release_year, movie_type, poster, rating, votes) VALUES
(12, 'Vikram', 'Tamil', 174, 2022, 'ACTION_THRILLER', 'assets/posters/poster-vikram.jpg', '8.3', '180K+');
INSERT INTO movies (movie_id, title, language, duration, release_year, movie_type, poster, rating, votes) VALUES
(13, 'Jai Bhim', 'Tamil', 164, 2021, 'LEGAL_DRAMA', 'assets/posters/poster-jai-bhim.jpg', '9.0', '145K+');
INSERT INTO movies (movie_id, title, language, duration, release_year, movie_type, poster, rating, votes) VALUES
(14, 'Kaithi', 'Tamil', 145, 2019, 'ACTION_THRILLER', 'assets/posters/poster-kaithi.jpg', '8.4', '125K+');

-- ----------------------------------------------------------------------------
-- 6. EER SUBTYPES (Advanced Object-Relational Specialization)
-- ----------------------------------------------------------------------------
INSERT INTO movie_actor_based (movie_id, lead_actor) VALUES (1, 'Leonardo DiCaprio');
INSERT INTO movie_actor_based (movie_id, lead_actor) VALUES (4, 'Matthew McConaughey');
INSERT INTO movie_actor_based (movie_id, lead_actor) VALUES (5, 'Christian Bale');
INSERT INTO movie_actor_based (movie_id, lead_actor) VALUES (8, 'Cillian Murphy');
INSERT INTO movie_actor_based (movie_id, lead_actor) VALUES (9, 'Aamir Khan');
INSERT INTO movie_actor_based (movie_id, lead_actor) VALUES (10, 'Aamir Khan');
INSERT INTO movie_actor_based (movie_id, lead_actor) VALUES (11, 'Hrithik Roshan');
INSERT INTO movie_actor_based (movie_id, lead_actor) VALUES (12, 'Kamal Haasan');
INSERT INTO movie_actor_based (movie_id, lead_actor) VALUES (13, 'Suriya');
INSERT INTO movie_actor_based (movie_id, lead_actor) VALUES (14, 'Karthi');

INSERT INTO animated_movie (movie_id, animation_style, studio) VALUES (2, 'Stylized 2D/3D Hybrid', 'Sony Pictures Animation');
INSERT INTO animated_movie (movie_id, animation_style, studio) VALUES (6, 'Photorealistic Computer Animation', 'Walt Disney Pictures');

INSERT INTO documentary (movie_id, subject, narrator) VALUES (3, 'Global Ecology & Wildlife Preservation', 'Sir David Attenborough');
INSERT INTO documentary (movie_id, subject, narrator) VALUES (7, 'El Capitan Free Solo Ascent', 'Alex Honnold');

-- ----------------------------------------------------------------------------
-- 7. SHOWS (Dynamic Generation for 7 days across all 14 movies)
-- Matches frontend getShowtimesForMovie deterministic schedule
-- ----------------------------------------------------------------------------
DECLARE
    TYPE t_times IS VARRAY(4) OF VARCHAR2(20);
    v_base_times t_times := t_times('10:00 AM', '1:30 PM', '5:00 PM', '8:30 PM');
    v_time_str VARCHAR2(20);
    v_screen_id NUMBER;
    v_screen_name VARCHAR2(100);
    v_price NUMBER(10,2);
    v_show_id VARCHAR2(50);
    v_cur_date DATE;
    v_stagger NUMBER;
    v_h NUMBER;
    v_m NUMBER;
    v_total_min NUMBER;
    v_period VARCHAR2(2);
    v_disp_h NUMBER;
BEGIN
    FOR d IN 0 .. 6 LOOP
        v_cur_date := TRUNC(SYSDATE + d);
        FOR m IN 1 .. 14 LOOP
            -- Screen assignment: Screen 1 (IMAX), Screen 2 (Standard), Screen 3 (Standard)
            v_screen_id := MOD(m - 1, 3) + 1;
            IF v_screen_id = 1 THEN
                v_screen_name := 'Screen 1 - IMAX';
                v_price := 280.00;
            ELSIF v_screen_id = 2 THEN
                v_screen_name := 'Screen 2 - Standard';
            ELSE
                v_screen_name := 'Screen 3 - Standard';
            END IF;

            v_stagger := MOD(m - 1, 3) * 20;

            FOR slot IN 0 .. 3 LOOP
                v_show_id := m || '-' || TO_CHAR(v_cur_date, 'YYYY-MM-DD') || '-' || slot;

                -- Pricing: IMAX 280, Standard alternating 180 / 220
                IF v_screen_id <> 1 THEN
                    IF MOD(slot, 2) = 0 THEN
                        v_price := 180.00;
                    ELSE
                        v_price := 220.00;
                    END IF;
                END IF;

                -- Calculate staggered show time string
                IF slot = 0 THEN v_h := 10; v_m := 0;
                ELSIF slot = 1 THEN v_h := 13; v_m := 30;
                ELSIF slot = 2 THEN v_h := 17; v_m := 0;
                ELSE v_h := 20; v_m := 30;
                END IF;

                v_total_min := MOD(v_h * 60 + v_m + v_stagger, 1440);
                v_h := TRUNC(v_total_min / 60);
                v_m := MOD(v_total_min, 60);
                IF v_h >= 12 THEN v_period := 'PM'; ELSE v_period := 'AM'; END IF;
                v_disp_h := MOD(v_h, 12);
                IF v_disp_h = 0 THEN v_disp_h := 12; END IF;
                v_time_str := TO_CHAR(v_disp_h) || ':' || LPAD(TO_CHAR(v_m), 2, '0') || ' ' || v_period;

                INSERT INTO shows (show_id, movie_id, screen_id, screen_name, show_date, show_time, price)
                VALUES (v_show_id, m, v_screen_id, v_screen_name, v_cur_date, v_time_str, v_price);
            END LOOP;
        END LOOP;
    END LOOP;
END;
/

-- ----------------------------------------------------------------------------
-- 8. INITIAL SAMPLE BOOKINGS & SEATS
-- ----------------------------------------------------------------------------
INSERT INTO bookings (booking_id, user_id, movie_id, show_id, show_date, show_time, screen_name, total, status, payment_status, payment_reference, created_at) VALUES
(1, 4, 1, '1-' || TO_CHAR(TRUNC(SYSDATE), 'YYYY-MM-DD') || '-2', TRUNC(SYSDATE), '5:00 PM', 'Screen 1 - IMAX', 504.00, 'CONFIRMED', 'COMPLETED', 'UPI-REF-992101', SYSTIMESTAMP - INTERVAL '2' HOUR);

INSERT INTO booking_seats (ticket_no, booking_id, show_id, seat_no, ticket_type, price, status) VALUES
(1, 1, '1-' || TO_CHAR(TRUNC(SYSDATE), 'YYYY-MM-DD') || '-2', 'C4', 'adult', 252.00, 'CONFIRMED');
INSERT INTO booking_seats (ticket_no, booking_id, show_id, seat_no, ticket_type, price, status) VALUES
(2, 1, '1-' || TO_CHAR(TRUNC(SYSDATE), 'YYYY-MM-DD') || '-2', 'C5', 'adult', 252.00, 'CONFIRMED');

INSERT INTO payments (payment_id, booking_id, amount, payment_method, payment_status, payment_reference, created_at) VALUES
(1, 1, 504.00, 'UPI', 'COMPLETED', 'UPI-REF-992101', SYSTIMESTAMP - INTERVAL '2' HOUR);

-- ----------------------------------------------------------------------------
-- 9. RATINGS
-- ----------------------------------------------------------------------------
INSERT INTO rates (rate_id, user_id, movie_id, rating, review_text) VALUES
(1, 4, 1, 9.5, 'Phenomenal mind-bending direction and Zimmer score!');
INSERT INTO rates (rate_id, user_id, movie_id, rating, review_text) VALUES
(2, 5, 8, 9.2, 'Masterpiece of cinema. Sound design in IMAX was mindblowing.');

COMMIT;
