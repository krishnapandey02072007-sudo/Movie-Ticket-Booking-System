-- ============================================================================
-- ADVANCED DATABASE ROUTINES: TRIGGERS, PROCEDURES, FUNCTIONS & VIEWS
-- Engine: Oracle 21c PL/SQL
-- Features: ACID Transactions, Pessimistic Locking, Concurrency Control,
--           Double-Booking Prevention, Automated Auditing, Compound Triggers, Views
-- ============================================================================

SET DEFINE OFF;

-- ----------------------------------------------------------------------------
-- TRIGGER 1: Double-Booking Prevention (Concurrency & Integrity Enforcement)
-- Raises ORA-20001 if a confirmed ticket already occupies the seat for the show
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_prevent_double_booking
BEFORE INSERT ON booking_seats
FOR EACH ROW
DECLARE
    v_count NUMBER;
BEGIN
    IF :NEW.status = 'CONFIRMED' THEN
        SELECT COUNT(*)
        INTO v_count
        FROM booking_seats
        WHERE show_id = :NEW.show_id
          AND seat_no = :NEW.seat_no
          AND status = 'CONFIRMED';

        IF v_count > 0 THEN
            RAISE_APPLICATION_ERROR(-20001, 'Seat ' || :NEW.seat_no || ' is already confirmed for show ' || :NEW.show_id);
        END IF;
    END IF;
END;
/

-- ----------------------------------------------------------------------------
-- TRIGGER 2: Compound Trigger for Automatic Movie Rating Recalculation
-- Avoids ORA-04091 mutating table error using Oracle 21c COMPOUND TRIGGER pattern
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_update_movie_rating
FOR INSERT OR UPDATE OR DELETE ON rates
COMPOUND TRIGGER
    TYPE t_movie_ids IS TABLE OF NUMBER INDEX BY PLS_INTEGER;
    g_movie_ids t_movie_ids;

    AFTER EACH ROW IS
    BEGIN
        IF DELETING THEN
            g_movie_ids(g_movie_ids.COUNT + 1) := :OLD.movie_id;
        ELSE
            g_movie_ids(g_movie_ids.COUNT + 1) := :NEW.movie_id;
        END IF;
    END AFTER EACH ROW;

    AFTER STATEMENT IS
        v_avg_rating NUMBER(3,1);
        v_votes NUMBER;
    BEGIN
        FOR i IN 1 .. g_movie_ids.COUNT LOOP
            SELECT NVL(AVG(rating), 0), COUNT(*)
            INTO v_avg_rating, v_votes
            FROM rates
            WHERE movie_id = g_movie_ids(i);

            UPDATE movies
            SET rating = TO_CHAR(v_avg_rating, 'FM990.0'),
                votes = TO_CHAR(v_votes) || ' reviews'
            WHERE movie_id = g_movie_ids(i);
        END LOOP;
    END AFTER STATEMENT;
END trg_update_movie_rating;
/

-- ----------------------------------------------------------------------------
-- TRIGGER 3: Booking Audit Trail Logging
-- Records state transitions (CONFIRMED -> CANCELLED / REFUNDED)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_audit_booking_status
AFTER UPDATE OF status ON bookings
FOR EACH ROW
BEGIN
    IF :OLD.status <> :NEW.status THEN
        INSERT INTO booking_audit_log (booking_id, old_status, new_status, action_type, changed_by, notes)
        VALUES (:NEW.booking_id, :OLD.status, :NEW.status, 'STATUS_CHANGE', 'USER_OR_ADMIN',
                'Status changed from ' || :OLD.status || ' to ' || :NEW.status || ' at ' || TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'));
    END IF;
END;
/

-- ----------------------------------------------------------------------------
-- FUNCTION: Calculate Membership Tier Discount
-- Returns percentage discount based on user's active membership
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_get_user_discount(p_user_id IN NUMBER)
RETURN NUMBER
IS
    v_discount NUMBER := 0;
BEGIN
    SELECT NVL(discount_percent, 0)
    INTO v_discount
    FROM memberships
    WHERE user_id = p_user_id
      AND status = 'ACTIVE'
      AND expires_on >= SYSDATE;
    RETURN v_discount;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN 0;
END;
/

-- ----------------------------------------------------------------------------
-- PROCEDURE 1: Buy Tickets (ACID Transaction with Pessimistic Locking)
-- Validates show, locks show, creates booking, issues seats, records payment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_book_tickets(
    p_user_id           IN NUMBER,
    p_movie_id          IN NUMBER,
    p_show_id           IN VARCHAR2,
    p_show_date         IN DATE,
    p_show_time         IN VARCHAR2,
    p_screen_name       IN VARCHAR2,
    p_seats_csv         IN VARCHAR2, -- Comma-separated: e.g. 'A1,A2'
    p_types_csv         IN VARCHAR2, -- Comma-separated: e.g. 'adult,child'
    p_payment_reference IN VARCHAR2,
    p_total             IN NUMBER,
    p_booking_id        OUT NUMBER,
    p_status            OUT VARCHAR2,
    p_message           OUT VARCHAR2
)
IS
    v_locked_price NUMBER(10,2);
    v_seat VARCHAR2(10);
    v_type VARCHAR2(20);
    v_pos_seat NUMBER := 1;
    v_next_seat NUMBER;
    v_pos_type NUMBER := 1;
    v_next_type NUMBER;
    v_seat_price NUMBER(10,2);
    v_membership_discount NUMBER;
    v_conflict_count NUMBER;
BEGIN
    -- 1. Pessimistic lock on show to serialize concurrent requests.
    -- Auto-provision show record if not present, preventing ORA-01403: no data found!
    BEGIN
        SELECT price INTO v_locked_price
        FROM shows
        WHERE show_id = p_show_id
        FOR UPDATE;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            IF INSTR(p_screen_name, 'IMAX') > 0 THEN
                v_locked_price := 280.00;
            ELSE
                v_locked_price := 180.00;
            END IF;

            INSERT INTO shows (show_id, movie_id, screen_id, screen_name, show_date, show_time, price)
            VALUES (p_show_id, p_movie_id, 1, p_screen_name, p_show_date, p_show_time, v_locked_price);

            SELECT price INTO v_locked_price
            FROM shows
            WHERE show_id = p_show_id
            FOR UPDATE;
    END;

    -- 2. Verify none of the requested seats are already confirmed
    SELECT COUNT(*) INTO v_conflict_count
    FROM booking_seats bs
    WHERE bs.show_id = p_show_id
      AND bs.status = 'CONFIRMED'
      AND INSTR(',' || p_seats_csv || ',', ',' || bs.seat_no || ',') > 0;

    IF v_conflict_count > 0 THEN
        p_status := 'CONFLICT';
        p_message := 'One or more of the selected seats are already booked for this show.';
        p_booking_id := NULL;
        RETURN;
    END IF;

    -- 3. Calculate user membership discount
    v_membership_discount := fn_get_user_discount(p_user_id);

    -- 4. Insert master booking
    INSERT INTO bookings (
        user_id, movie_id, show_id, show_date, show_time, screen_name,
        total, status, payment_status, payment_reference, created_at
    ) VALUES (
        p_user_id, p_movie_id, p_show_id, p_show_date, p_show_time, p_screen_name,
        p_total, 'CONFIRMED', 'USER_REPORTED', p_payment_reference, SYSTIMESTAMP
    ) RETURNING booking_id INTO p_booking_id;

    -- 5. Parse CSV seat and type lists and insert normalized booking_seats
    LOOP
        v_next_seat := INSTR(p_seats_csv, ',', v_pos_seat);
        v_next_type := INSTR(p_types_csv, ',', v_pos_type);

        IF v_next_seat > 0 THEN
            v_seat := SUBSTR(p_seats_csv, v_pos_seat, v_next_seat - v_pos_seat);
            v_pos_seat := v_next_seat + 1;
        ELSE
            v_seat := SUBSTR(p_seats_csv, v_pos_seat);
        END IF;

        IF v_next_type > 0 THEN
            v_type := SUBSTR(p_types_csv, v_pos_type, v_next_type - v_pos_type);
            v_pos_type := v_next_type + 1;
        ELSE
            v_type := SUBSTR(p_types_csv, v_pos_type);
        END IF;

        v_seat := TRIM(v_seat);
        v_type := LOWER(TRIM(NVL(v_type, 'adult')));

        -- Per-seat tier discount calculation
        IF v_type = 'child' THEN
            v_seat_price := v_locked_price * 0.80;
        ELSIF v_type = 'senior' THEN
            v_seat_price := v_locked_price * 0.85;
        ELSE
            v_seat_price := v_locked_price;
        END IF;

        IF v_membership_discount > 0 THEN
            v_seat_price := v_seat_price * (1 - (v_membership_discount / 100));
        END IF;

        INSERT INTO booking_seats (booking_id, show_id, seat_no, ticket_type, price, status)
        VALUES (p_booking_id, p_show_id, v_seat, v_type, v_seat_price, 'CONFIRMED');

        EXIT WHEN v_next_seat = 0;
    END LOOP;

    -- 6. Insert initial payment ledger record
    INSERT INTO payments (booking_id, amount, payment_method, payment_status, payment_reference, created_at)
    VALUES (p_booking_id, p_total, 'UPI', 'COMPLETED', p_payment_reference, SYSTIMESTAMP);

    -- 7. Audit log
    INSERT INTO booking_audit_log (booking_id, old_status, new_status, action_type, changed_by, notes)
    VALUES (p_booking_id, NULL, 'CONFIRMED', 'CREATE_BOOKING', 'USER', 'Booking confirmed for seats: ' || p_seats_csv);

    COMMIT;
    p_status := 'SUCCESS';
    p_message := 'Booking created successfully.';

EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        p_status := 'ERROR';
        p_message := SQLERRM;
        p_booking_id := NULL;
END;
/

-- ----------------------------------------------------------------------------
-- PROCEDURE 2: Cancel / Refund Ticket
-- Releases seats, computes refund percentage, updates audit log
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_cancel_booking(
    p_booking_id    IN NUMBER,
    p_user_id       IN NUMBER,
    p_refund_amount OUT NUMBER,
    p_status        OUT VARCHAR2,
    p_message       OUT VARCHAR2
)
IS
    v_total NUMBER(10,2);
    v_cur_status VARCHAR2(20);
BEGIN
    SELECT total, status
    INTO v_total, v_cur_status
    FROM bookings
    WHERE booking_id = p_booking_id AND user_id = p_user_id
    FOR UPDATE;

    IF v_cur_status <> 'CONFIRMED' THEN
        p_status := 'INVALID_STATE';
        p_message := 'Booking is already ' || v_cur_status;
        p_refund_amount := 0;
        RETURN;
    END IF;

    -- 100% full refund before show cancellation
    p_refund_amount := v_total;

    UPDATE bookings
    SET status = 'CANCELLED',
        refund_requested_at = SYSTIMESTAMP,
        refund_request_amount = p_refund_amount
    WHERE booking_id = p_booking_id;

    UPDATE booking_seats
    SET status = 'CANCELLED'
    WHERE booking_id = p_booking_id;

    COMMIT;
    p_status := 'SUCCESS';
    p_message := 'Booking cancelled and seats successfully released.';

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        p_status := 'NOT_FOUND';
        p_message := 'Booking not found or not owned by user.';
        p_refund_amount := 0;
    WHEN OTHERS THEN
        ROLLBACK;
        p_status := 'ERROR';
        p_message := SQLERRM;
        p_refund_amount := 0;
END;
/

-- ----------------------------------------------------------------------------
-- PROCEDURE 3: Edit Ticket Seat (Seat Modification for Existing Booking)
-- Allows modifying one seat to another available seat in the same show
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_edit_ticket_seat(
    p_booking_id   IN NUMBER,
    p_user_id      IN NUMBER,
    p_old_seat     IN VARCHAR2,
    p_new_seat     IN VARCHAR2,
    p_status       OUT VARCHAR2,
    p_message      OUT VARCHAR2
)
IS
    v_show_id VARCHAR2(50);
    v_seat_exists NUMBER;
    v_taken NUMBER;
    v_fee CONSTANT NUMBER := 40.00;
BEGIN
    -- Verify booking ownership and get show_id
    SELECT show_id INTO v_show_id
    FROM bookings
    WHERE booking_id = p_booking_id AND user_id = p_user_id AND status = 'CONFIRMED'
    FOR UPDATE;

    -- Verify user currently holds old_seat
    SELECT COUNT(*) INTO v_seat_exists
    FROM booking_seats
    WHERE booking_id = p_booking_id AND seat_no = p_old_seat AND status = 'CONFIRMED';

    IF v_seat_exists = 0 THEN
        p_status := 'SEAT_NOT_OWNED';
        p_message := 'Seat ' || p_old_seat || ' does not belong to this active booking.';
        RETURN;
    END IF;

    -- Check if target seat is already taken
    SELECT COUNT(*) INTO v_taken
    FROM booking_seats
    WHERE show_id = v_show_id AND seat_no = p_new_seat AND status = 'CONFIRMED';

    IF v_taken > 0 THEN
        p_status := 'SEAT_TAKEN';
        p_message := 'Seat ' || p_new_seat || ' is already taken by another guest.';
        RETURN;
    END IF;

    -- Update seat atomically
    UPDATE booking_seats
    SET seat_no = p_new_seat
    WHERE booking_id = p_booking_id AND seat_no = p_old_seat;

    -- Enforce ?40 modification fee per modified seat on the booking total
    UPDATE bookings
    SET total = total + v_fee
    WHERE booking_id = p_booking_id;

    -- Record modification fee payment
    INSERT INTO payments (booking_id, amount, payment_method, payment_status, payment_reference)
    VALUES (p_booking_id, v_fee, 'UPI', 'COMPLETED', 'MOD-FEE-' || p_old_seat || '-TO-' || p_new_seat);

    -- Record enterprise audit trail
    INSERT INTO booking_audit_log (booking_id, old_status, new_status, action_type, changed_by, notes)
    VALUES (p_booking_id, 'CONFIRMED', 'CONFIRMED', 'SEAT_EDIT', 'USER', 
            'Seat changed from ' || p_old_seat || ' to ' || p_new_seat || ' (Modification fee paid: ?' || v_fee || ')');

    COMMIT;
    p_status := 'SUCCESS';
    p_message := 'Seat changed successfully to ' || p_new_seat || ' (?40.00 seat change fee applied)';

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        p_status := 'NOT_FOUND';
        p_message := 'Active booking not found.';
    WHEN OTHERS THEN
        ROLLBACK;
        p_status := 'ERROR';
        p_message := SQLERRM;
END;
/

-- ----------------------------------------------------------------------------
-- PROCEDURE 4: Late-Arrival 50% Refund Request
-- ----------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_late_refund(
    p_booking_id    IN NUMBER,
    p_user_id       IN NUMBER,
    p_refund_amount OUT NUMBER,
    p_status        OUT VARCHAR2,
    p_message       OUT VARCHAR2
)
IS
    v_total NUMBER(10,2);
    v_cur_status VARCHAR2(20);
    v_already_requested TIMESTAMP;
BEGIN
    SELECT total, status, refund_requested_at
    INTO v_total, v_cur_status, v_already_requested
    FROM bookings
    WHERE booking_id = p_booking_id AND user_id = p_user_id
    FOR UPDATE;

    IF v_cur_status <> 'CONFIRMED' THEN
        p_status := 'INVALID_STATE';
        p_message := 'Booking is already cancelled or refunded.';
        p_refund_amount := 0;
        RETURN;
    END IF;

    IF v_already_requested IS NOT NULL THEN
        p_status := 'ALREADY_REQUESTED';
        p_message := 'A refund request has already been recorded for this booking.';
        p_refund_amount := 0;
        RETURN;
    END IF;

    -- 50% partial refund for late arrival policy
    p_refund_amount := ROUND(v_total * 0.50, 2);

    UPDATE bookings
    SET refund_requested_at = SYSTIMESTAMP,
        refund_request_amount = p_refund_amount
    WHERE booking_id = p_booking_id;

    INSERT INTO booking_audit_log (booking_id, old_status, new_status, action_type, changed_by, notes)
    VALUES (p_booking_id, 'CONFIRMED', 'REFUND_REQUESTED', 'LATE_REFUND', 'USER', 'Late arrival refund requested: Rs. ' || p_refund_amount);

    COMMIT;
    p_status := 'SUCCESS';
    p_message := '50% late-arrival refund request recorded.';

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        p_status := 'NOT_FOUND';
        p_message := 'Booking not found.';
        p_refund_amount := 0;
    WHEN OTHERS THEN
        ROLLBACK;
        p_status := 'ERROR';
        p_message := SQLERRM;
        p_refund_amount := 0;
END;
/

-- ----------------------------------------------------------------------------
-- ADVANCED VIEW 1: Active Shows with Real-Time Seat Occupancy
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_active_shows AS
SELECT
    s.show_id,
    s.movie_id,
    m.title AS movie_title,
    m.language,
    m.poster,
    s.screen_id,
    s.screen_name,
    s.show_date,
    s.show_time,
    s.price,
    sc.capacity,
    NVL(occ.booked_seats, 0) AS booked_seats,
    (sc.capacity - NVL(occ.booked_seats, 0)) AS available_seats
FROM shows s
JOIN movies m ON s.movie_id = m.movie_id
JOIN screens sc ON s.screen_id = sc.screen_id
LEFT JOIN (
    SELECT show_id, COUNT(*) AS booked_seats
    FROM booking_seats
    WHERE status = 'CONFIRMED'
    GROUP BY show_id
) occ ON s.show_id = occ.show_id;

-- ----------------------------------------------------------------------------
-- ADVANCED VIEW 2: User Booking Summary with Seats & Payment Details
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_bookings AS
SELECT
    b.booking_id,
    b.user_id,
    u.name AS user_name,
    u.email AS user_email,
    b.movie_id,
    m.title AS movie_title,
    m.language,
    m.poster,
    b.show_id,
    b.show_date,
    b.show_time,
    b.screen_name,
    b.total,
    b.status,
    b.payment_status,
    b.payment_reference,
    b.refund_requested_at,
    b.refund_request_amount,
    b.created_at,
    (
        SELECT LISTAGG(bs.seat_no, ', ') WITHIN GROUP (ORDER BY bs.seat_no)
        FROM booking_seats bs
        WHERE bs.booking_id = b.booking_id
    ) AS seats_list
FROM bookings b
JOIN users u ON b.user_id = u.user_id
JOIN movies m ON b.movie_id = m.movie_id;

-- ----------------------------------------------------------------------------
-- ADVANCED VIEW 3: Movie Performance & Financial Analytics View
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_movie_performance AS
SELECT
    m.movie_id,
    m.title,
    m.language,
    m.movie_type,
    m.rating,
    m.votes,
    COUNT(DISTINCT b.booking_id) AS total_bookings,
    NVL(SUM(CASE WHEN b.status = 'CONFIRMED' THEN b.total ELSE 0 END), 0) AS gross_revenue,
    NVL(COUNT(CASE WHEN bs.status = 'CONFIRMED' THEN 1 END), 0) AS total_tickets_sold
FROM movies m
LEFT JOIN bookings b ON m.movie_id = b.movie_id
LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
GROUP BY m.movie_id, m.title, m.language, m.movie_type, m.rating, m.votes;
