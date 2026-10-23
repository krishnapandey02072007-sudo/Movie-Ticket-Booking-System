// ============================================================================
// NEO4J 5.x GRAPH DATABASE SETUP SCRIPT (CYPHER)
// Course: VIT Advanced Database Management Systems (ADBMS) — DA3
// Project: BookIt — Movie Ticket Booking System (Polyglot Persistence)
// Primary DBMS: Oracle 21c Database Express Edition (ACID Transactions)
// Graph DBMS: Neo4j 5.x (Multi-Hop Graph Traversals & Collaborative Filtering)
// ============================================================================
// How to run:
//   1. Via Cypher Shell:
//      cypher-shell -u neo4j -p neo4jpassword -f db/05_neo4j_setup.cypher
//   2. Or copy-paste into Neo4j Browser running at http://localhost:7474
// ============================================================================

// ----------------------------------------------------------------------------
// 1. UNIQUENESS CONSTRAINTS & SCHEMA INDEXES
// ----------------------------------------------------------------------------
CREATE CONSTRAINT user_id_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.id IS UNIQUE;

CREATE CONSTRAINT movie_id_unique IF NOT EXISTS
FOR (m:Movie) REQUIRE m.id IS UNIQUE;

CREATE CONSTRAINT genre_name_unique IF NOT EXISTS
FOR (g:Genre) REQUIRE g.name IS UNIQUE;

CREATE INDEX movie_title_idx IF NOT EXISTS
FOR (m:Movie) ON (m.title);

// ----------------------------------------------------------------------------
// 2. CLEAR EXISTING GRAPH DATA (FOR CLEAN SEEDING)
// ----------------------------------------------------------------------------
MATCH (n) DETACH DELETE n;

// ----------------------------------------------------------------------------
// 3. USERS (Synchronized with Oracle USERS table)
// ----------------------------------------------------------------------------
MERGE (:User {id: 1, name: 'Admin User', role: 'ADMIN', email: 'admin@bookit.test'});
MERGE (:User {id: 2, name: 'Staff Incharge', role: 'STAFF', email: 'staff@bookit.test'});
MERGE (:User {id: 3, name: 'Rohith Raj', role: 'CUSTOMER', email: 'rohith@vit.ac.in', membership: 'PLATINUM'});
MERGE (:User {id: 4, name: 'Diya Sharma', role: 'CUSTOMER', email: 'diya@bookit.test', membership: 'GOLD'});
MERGE (:User {id: 5, name: 'Aarav Patel', role: 'CUSTOMER', email: 'aarav@bookit.test', membership: 'SILVER'});
MERGE (:User {id: 6, name: 'Meera Nair', role: 'CUSTOMER', email: 'meera@bookit.test', membership: 'SILVER'});
MERGE (:User {id: 7, name: 'Kabir Das', role: 'CUSTOMER', email: 'kabir@bookit.test', membership: 'SILVER'});

// ----------------------------------------------------------------------------
// 4. GENRES
// ----------------------------------------------------------------------------
MERGE (:Genre {id: 101, name: 'Action'});
MERGE (:Genre {id: 102, name: 'Sci-Fi'});
MERGE (:Genre {id: 103, name: 'Drama'});
MERGE (:Genre {id: 104, name: 'Animation'});
MERGE (:Genre {id: 105, name: 'Comedy'});
MERGE (:Genre {id: 106, name: 'Documentary'});
MERGE (:Genre {id: 107, name: 'Thriller'});

// ----------------------------------------------------------------------------
// 5. ALL 14 MOVIES (Matching Oracle 21c MOVIES table & poster assets)
// ----------------------------------------------------------------------------
MERGE (:Movie {id: 1,  title: 'Inception', language: 'English', duration: 148, year: 2010, type: 'ACTOR_BASED', poster: 'assets/posters/poster-inception.jpg', rating: 8.8});
MERGE (:Movie {id: 2,  title: 'Spider-Man: Across the Spider-Verse', language: 'English', duration: 140, year: 2023, type: 'ANIMATED', poster: 'assets/posters/poster-spiderman.jpg', rating: 8.9});
MERGE (:Movie {id: 3,  title: 'Our Planet', language: 'English', duration: 50, year: 2019, type: 'DOCUMENTARY', poster: 'assets/posters/poster-ourplanet.jpg', rating: 9.3});
MERGE (:Movie {id: 4,  title: 'Interstellar', language: 'English', duration: 169, year: 2014, type: 'ACTOR_BASED', poster: 'assets/posters/poster-interstellar.jpg', rating: 8.7});
MERGE (:Movie {id: 5,  title: 'The Dark Knight', language: 'English', duration: 152, year: 2008, type: 'ACTOR_BASED', poster: 'assets/posters/poster-darkknight.jpg', rating: 9.0});
MERGE (:Movie {id: 6,  title: 'The Lion King', language: 'English', duration: 118, year: 1994, type: 'ANIMATED', poster: 'assets/posters/poster-lionking.jpg', rating: 8.5});
MERGE (:Movie {id: 7,  title: 'Free Solo', language: 'English', duration: 100, year: 2018, type: 'DOCUMENTARY', poster: 'assets/posters/poster-freesolo.jpg', rating: 8.2});
MERGE (:Movie {id: 8,  title: 'Oppenheimer', language: 'English', duration: 180, year: 2023, type: 'ACTOR_BASED', poster: 'assets/posters/poster-oppenheimer.jpg', rating: 8.6});
MERGE (:Movie {id: 9,  title: '3 Idiots', language: 'Hindi', duration: 170, year: 2009, type: 'DRAMA', poster: 'assets/posters/poster-3-idiots.jpg', rating: 8.4});
MERGE (:Movie {id: 10, title: 'Dangal', language: 'Hindi', duration: 161, year: 2016, type: 'SPORTS_DRAMA', poster: 'assets/posters/poster-dangal.jpg', rating: 8.3});
MERGE (:Movie {id: 11, title: 'Zindagi Na Milegi Dobara', language: 'Hindi', duration: 155, year: 2011, type: 'ADVENTURE_DRAMA', poster: 'assets/posters/poster-znmd.jpg', rating: 8.2});
MERGE (:Movie {id: 12, title: 'Vikram', language: 'Tamil', duration: 174, year: 2022, type: 'ACTION_THRILLER', poster: 'assets/posters/poster-vikram.jpg', rating: 8.3});
MERGE (:Movie {id: 13, title: 'Jai Bhim', language: 'Tamil', duration: 164, year: 2021, type: 'LEGAL_DRAMA', poster: 'assets/posters/poster-jai-bhim.jpg', rating: 9.0});
MERGE (:Movie {id: 14, title: 'Kaithi', language: 'Tamil', duration: 145, year: 2019, type: 'ACTION_THRILLER', poster: 'assets/posters/poster-kaithi.jpg', rating: 8.4});

// ----------------------------------------------------------------------------
// 6. MOVIE TO GENRE RELATIONSHIPS (:IN_GENRE)
// ----------------------------------------------------------------------------
MATCH (m:Movie {id: 1}),  (g:Genre {name: 'Action'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 1}),  (g:Genre {name: 'Sci-Fi'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 2}),  (g:Genre {name: 'Animation'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 2}),  (g:Genre {name: 'Action'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 3}),  (g:Genre {name: 'Documentary'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 4}),  (g:Genre {name: 'Sci-Fi'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 4}),  (g:Genre {name: 'Drama'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 5}),  (g:Genre {name: 'Action'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 5}),  (g:Genre {name: 'Thriller'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 6}),  (g:Genre {name: 'Animation'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 6}),  (g:Genre {name: 'Drama'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 7}),  (g:Genre {name: 'Documentary'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 8}),  (g:Genre {name: 'Drama'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 9}),  (g:Genre {name: 'Comedy'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 9}),  (g:Genre {name: 'Drama'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 10}), (g:Genre {name: 'Drama'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 11}), (g:Genre {name: 'Comedy'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 12}), (g:Genre {name: 'Action'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 12}), (g:Genre {name: 'Thriller'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 13}), (g:Genre {name: 'Drama'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 14}), (g:Genre {name: 'Action'}) MERGE (m)-[:IN_GENRE]->(g);
MATCH (m:Movie {id: 14}), (g:Genre {name: 'Thriller'}) MERGE (m)-[:IN_GENRE]->(g);

// ----------------------------------------------------------------------------
// 7. USER RATINGS (:RATED) — SEED FOR COLLABORATIVE FILTERING
// ----------------------------------------------------------------------------
// User 3 (Rohith Raj - sci-fi & action lover)
MATCH (u:User {id: 3}), (m:Movie {id: 1}) MERGE (u)-[:RATED {rating: 5.0, review: 'Mind-bending cinematic masterpiece'}]->(m);
MATCH (u:User {id: 3}), (m:Movie {id: 4}) MERGE (u)-[:RATED {rating: 5.0, review: 'Hans Zimmer score and emotional depth'}]->(m);
MATCH (u:User {id: 3}), (m:Movie {id: 5}) MERGE (u)-[:RATED {rating: 4.5, review: 'The greatest comic book adaptation ever'}]->(m);

// User 4 (Diya Sharma - shares sci-fi taste with User 3, also loves Oppenheimer and Spider-Man)
MATCH (u:User {id: 4}), (m:Movie {id: 1}) MERGE (u)-[:RATED {rating: 5.0, review: 'Incredible Nolan direction'}]->(m);
MATCH (u:User {id: 4}), (m:Movie {id: 4}) MERGE (u)-[:RATED {rating: 5.0, review: 'Visual perfection'}]->(m);
MATCH (u:User {id: 4}), (m:Movie {id: 8}) MERGE (u)-[:RATED {rating: 5.0, review: 'Astonishing historical biography'}]->(m);
MATCH (u:User {id: 4}), (m:Movie {id: 2}) MERGE (u)-[:RATED {rating: 4.5, review: 'Groundbreaking visual animation'}]->(m);

// User 5 (Aarav Patel - thriller & action lover)
MATCH (u:User {id: 5}), (m:Movie {id: 5})  MERGE (u)-[:RATED {rating: 5.0, review: 'Heath Ledger Joker is legendary'}]->(m);
MATCH (u:User {id: 5}), (m:Movie {id: 12}) MERGE (u)-[:RATED {rating: 5.0, review: 'Kamal Haasan + Anirudh BGM power'}]->(m);
MATCH (u:User {id: 5}), (m:Movie {id: 14}) MERGE (u)-[:RATED {rating: 4.5, review: 'Gripping single-night action'}]->(m);

// User 6 (Meera Nair - animation and nature documentaries)
MATCH (u:User {id: 6}), (m:Movie {id: 2}) MERGE (u)-[:RATED {rating: 5.0, review: 'Masterpiece of animation art'}]->(m);
MATCH (u:User {id: 6}), (m:Movie {id: 6}) MERGE (u)-[:RATED {rating: 5.0, review: 'Nostalgic Disney classic'}]->(m);
MATCH (u:User {id: 6}), (m:Movie {id: 3}) MERGE (u)-[:RATED {rating: 4.5, review: 'Breathtaking wildlife cinematography'}]->(m);

// User 7 (Kabir Das - drama and comedy)
MATCH (u:User {id: 7}), (m:Movie {id: 9})  MERGE (u)-[:RATED {rating: 5.0, review: 'Timeless message about education'}]->(m);
MATCH (u:User {id: 7}), (m:Movie {id: 10}) MERGE (u)-[:RATED {rating: 5.0, review: 'Inspirational sports biopic'}]->(m);
MATCH (u:User {id: 7}), (m:Movie {id: 11}) MERGE (u)-[:RATED {rating: 4.5, review: 'Best road trip friendship movie'}]->(m);

// ----------------------------------------------------------------------------
// 8. CONFIRMED BOOKINGS (:BOOKED)
// ----------------------------------------------------------------------------
MATCH (u:User {id: 3}), (m:Movie {id: 1}) MERGE (u)-[:BOOKED]->(m);
MATCH (u:User {id: 3}), (m:Movie {id: 4}) MERGE (u)-[:BOOKED]->(m);
MATCH (u:User {id: 4}), (m:Movie {id: 1}) MERGE (u)-[:BOOKED]->(m);
MATCH (u:User {id: 4}), (m:Movie {id: 8}) MERGE (u)-[:BOOKED]->(m);
MATCH (u:User {id: 5}), (m:Movie {id: 5}) MERGE (u)-[:BOOKED]->(m);
MATCH (u:User {id: 5}), (m:Movie {id: 12}) MERGE (u)-[:BOOKED]->(m);
MATCH (u:User {id: 6}), (m:Movie {id: 2}) MERGE (u)-[:BOOKED]->(m);
MATCH (u:User {id: 7}), (m:Movie {id: 9}) MERGE (u)-[:BOOKED]->(m);

// ----------------------------------------------------------------------------
// 9. VERIFY GRAPH COUNTS & DEMONSTRATE COLLABORATIVE CYPHER QUERY
// ----------------------------------------------------------------------------
// Node counts
MATCH (n) RETURN count(n) AS total_nodes;

// Relationship counts
MATCH ()-[r]->() RETURN count(r) AS total_relationships;

// Interactive Multi-Hop Collaborative Filtering Cypher:
// "Find movies highly rated by users who liked what User 3 (Rohith Raj) liked,
//  excluding movies User 3 already watched or booked."
MATCH (me:User {id: 3})
MATCH (similar:User)-[simEdge]->(common:Movie)<-[myEdge]-(me)
WHERE (type(simEdge) IN ['RATED', 'BOOKED']) AND (type(myEdge) IN ['RATED', 'BOOKED'])
  AND (NOT exists(simEdge.rating) OR simEdge.rating >= 4)
  AND (NOT exists(myEdge.rating) OR myEdge.rating >= 4)
  AND similar <> me
MATCH (similar)-[recEdge:RATED]->(rec:Movie)
WHERE recEdge.rating >= 4
  AND NOT (me)-[:RATED]->(rec)
  AND NOT (me)-[:BOOKED]->(rec)
RETURN rec.id AS movieID,
       rec.title AS recommendedTitle,
       count(DISTINCT similar) AS graphMatchScore,
       collect(DISTINCT common.title) AS sharedTasteMovies
ORDER BY graphMatchScore DESC, movieID ASC
LIMIT 5;
