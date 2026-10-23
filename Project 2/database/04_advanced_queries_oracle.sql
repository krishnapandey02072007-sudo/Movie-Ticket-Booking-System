-- ============================================================================
-- ADVANCED SQL QUERIES & ANALYTICS (ORACLE 21c PL/SQL)
-- DA3: Advanced Database Evaluation & Demonstration
-- Topics: Window Functions, CTEs, ROLLUP/CUBE, Correlated Subqueries, Partitions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- QUERY 1: Window Function - DENSE_RANK() & ROW_NUMBER() per Genre/Language
-- Ranks movies within each language based on average customer rating
-- ----------------------------------------------------------------------------
SELECT
    m.language,
    m.title,
    m.release_year,
    m.rating,
    DENSE_RANK() OVER (PARTITION BY m.language ORDER BY TO_NUMBER(m.rating) DESC) AS rank_in_language,
    ROW_NUMBER() OVER (ORDER BY TO_NUMBER(m.rating) DESC) AS overall_rank
FROM movies m
ORDER BY m.language, rank_in_language;

-- ----------------------------------------------------------------------------
-- QUERY 2: CTE & Window Function - Running Total Revenue per Movie
-- Computes progressive daily revenue and cumulative tickets
-- ----------------------------------------------------------------------------
WITH DailyMovieSales AS (
    SELECT
        b.movie_id,
        m.title,
        b.show_date,
        COUNT(b.booking_id) AS bookings_count,
        SUM(b.total) AS daily_revenue
    FROM bookings b
    JOIN movies m ON b.movie_id = m.movie_id
    WHERE b.status = 'CONFIRMED'
    GROUP BY b.movie_id, m.title, b.show_date
)
SELECT
    movie_id,
    title,
    show_date,
    daily_revenue,
    SUM(daily_revenue) OVER (
        PARTITION BY movie_id
        ORDER BY show_date
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_movie_revenue
FROM DailyMovieSales
ORDER BY movie_id, show_date;

-- ----------------------------------------------------------------------------
-- QUERY 3: LAG() Window Function - Booking Value Progression per Customer
-- Compares current booking amount with previous booking by the same user
-- ----------------------------------------------------------------------------
SELECT
    b.user_id,
    u.name AS customer_name,
    b.booking_id,
    b.created_at,
    b.total AS current_booking_amount,
    LAG(b.total, 1, 0) OVER (PARTITION BY b.user_id ORDER BY b.created_at) AS previous_booking_amount,
    (b.total - LAG(b.total, 1, b.total) OVER (PARTITION BY b.user_id ORDER BY b.created_at)) AS spending_delta
FROM bookings b
JOIN users u ON b.user_id = u.user_id
WHERE b.status = 'CONFIRMED'
ORDER BY b.user_id, b.created_at;

-- ----------------------------------------------------------------------------
-- QUERY 4: Multidimensional Aggregation - GROUP BY ROLLUP
-- Generates sub-totals and grand totals for revenue by Screen and Show Date
-- ----------------------------------------------------------------------------
SELECT
    NVL(s.screen_name, '=== ALL SCREENS ===') AS screen_name,
    NVL(TO_CHAR(b.show_date, 'YYYY-MM-DD'), '=== ALL DATES ===') AS show_date,
    COUNT(b.booking_id) AS total_bookings,
    SUM(b.total) AS total_revenue
FROM bookings b
JOIN shows s ON b.show_id = s.show_id
WHERE b.status = 'CONFIRMED'
GROUP BY ROLLUP(s.screen_name, b.show_date)
ORDER BY s.screen_name, b.show_date;

-- ----------------------------------------------------------------------------
-- QUERY 5: Correlated Subquery with NOT EXISTS
-- Finds all users who have never cancelled a booking
-- ----------------------------------------------------------------------------
SELECT
    u.user_id,
    u.name,
    u.email,
    COUNT(b.booking_id) AS successful_bookings
FROM users u
JOIN bookings b ON u.user_id = b.user_id
WHERE b.status = 'CONFIRMED'
  AND NOT EXISTS (
      SELECT 1
      FROM bookings b2
      WHERE b2.user_id = u.user_id
        AND b2.status = 'CANCELLED'
  )
GROUP BY u.user_id, u.name, u.email;

-- ----------------------------------------------------------------------------
-- QUERY 6: Complex Multi-Join with EER Subtypes
-- Gathers full polymorphic details across Movie Superclass and Subtypes
-- ----------------------------------------------------------------------------
SELECT
    m.movie_id,
    m.title,
    m.movie_type,
    COALESCE(act.lead_actor, anim.studio, doc.subject, 'N/A') AS specialized_attribute,
    CASE
        WHEN act.movie_id IS NOT NULL THEN 'Actor-Based'
        WHEN anim.movie_id IS NOT NULL THEN 'Animated Feature (' || anim.animation_style || ')'
        WHEN doc.movie_id IS NOT NULL THEN 'Documentary (Narrated by ' || doc.narrator || ')'
        ELSE 'General Feature'
    END AS eer_classification
FROM movies m
LEFT JOIN movie_actor_based act ON m.movie_id = act.movie_id
LEFT JOIN animated_movie anim ON m.movie_id = anim.movie_id
LEFT JOIN documentary doc ON m.movie_id = doc.movie_id;
