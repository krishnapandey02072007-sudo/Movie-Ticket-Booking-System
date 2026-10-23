// ==========================================================================
// 1. Configuration & Global State
// ==========================================================================

// Switch API_URL to "http://localhost:5000/api/movies" when backend goes live
const API_URL = "./mock-movies.json";
const BACKEND_API = "/api";
// Public UPI destination for the standalone/demo checkout. Keep this in sync with backend/.env.
const DEMO_UPI_ID = "rrr97971@upi";
const DEMO_UPI_PAYEE = "CinemaBooking";
let backendOnline = false;

// Fast in-memory caches to eliminate UI lag
const occupiedSeatsCache = new Map();
const showtimesCache = new Map();

let allMovies = [];
let availableShowtimes = [];
let availableShowtimesMovieID = null;
let availableShowtimesDate = null;
let selectedMovie = null;
let selectedDate = null;       // "YYYY-MM-DD"
let selectedShowtime = null;   // { showID, price, date, screenName, showTime }
let selectedSeats = [];        // array of seat codes, e.g. ["A2", "A3"]
let ticketTypes = {};          // seat code -> "adult" | "child" | "senior"
let editingBookingId = null;   // set when editing an existing booking instead of creating a new one
let currentUser = JSON.parse(localStorage.getItem("cinemaUser") || "null");
if (!currentUser) {
    currentUser = { userID: 3, username: "rohith", name: "Rohith Raj", email: "rohith@vit.ac.in" };
    localStorage.setItem("cinemaUser", JSON.stringify(currentUser));
}
let currentTheme = localStorage.getItem("cinemaTheme") || "dark";

// Discount applied per ticket type. Adjust these percentages any time.
const DISCOUNTS = {
    adult: 0,
    child: 0.20,   // 12 & under
    senior: 0.15   // 60 & over
};

// Late-arrival policy. A booking counts as "late" from the show's start time
// until `windowMinutes` later (after that the cinema stops admitting people).
// While late, the customer can switch to another show or take a partial refund.
// When the backend is online, GET /api/late-policy overrides these defaults so
// the numbers shown here always match what the server enforces.
const LATE_POLICY = { windowMinutes: 30, refundPercent: 50 };

// Seat map dimensions (shared by the seat picker and the late-switch seat assignment)
const SEAT_ROWS = ["A", "B", "C", "D", "E"];
const SEATS_PER_ROW = 8;

// ==========================================================================
// 2. DOM Elements
// ==========================================================================
const movieGrid = document.getElementById("movies");
const searchInput = document.getElementById("searchInput");
const languageFilter = document.getElementById("languageFilter");
const typeFilter = document.getElementById("typeFilter");
const bookingModal = document.getElementById("bookingModal");
const modalMovieTitle = document.getElementById("modalMovieTitle");
const dateList = document.getElementById("dateList");
const showtimeList = document.getElementById("showtimeList");
const screenLabel = document.getElementById("screenLabel");
const seatGrid = document.getElementById("seatGrid");
const ticketTypesWrap = document.getElementById("ticketTypes");
const selectedSeatNoElem = document.getElementById("selectedSeatNo");
const totalPriceElem = document.getElementById("totalPrice");
const confirmBookingBtn = document.getElementById("confirmBookingBtn");
const signInBtn = document.getElementById("signInBtn");
const signInModal = document.getElementById("signInModal");
const signInForm = document.getElementById("signInForm");
const signInMessage = document.getElementById("signInMessage");
const profileBtn = document.getElementById("profileBtn");
const profileModal = document.getElementById("profileModal");
const profileForm = document.getElementById("profileForm");
const profileMessage = document.getElementById("profileMessage");
const signOutBtn = document.getElementById("signOutBtn");
const lateModal = document.getElementById("lateModal");
const lateBody = document.getElementById("lateBody");
const manualPaymentModal = document.getElementById("manualPaymentModal");
let pendingManualBooking = null;

const moviesPage = document.getElementById("moviesPage");
const bookingsPage = document.getElementById("my-bookings");
const bookingsList = document.getElementById("bookingsList");
const adminPage = document.getElementById("adminPage");
const navMovies = document.getElementById("navMovies");
const navBookings = document.getElementById("navBookings");
const navAdmin = document.getElementById("navAdmin");
const movieRowWrap = document.querySelector(".movie-row-wrap");

let autoScrollTimer = null;

// Auto-advances the movie row every few seconds, like a Netflix-style
// carousel. Loops back to the start once it reaches the end.
function startAutoScroll() {
    stopAutoScroll();
    autoScrollTimer = setInterval(() => {
        const maxScroll = movieGrid.scrollWidth - movieGrid.clientWidth;
        if (movieGrid.scrollLeft >= maxScroll - 10) {
            movieGrid.scrollTo({ left: 0, behavior: "smooth" });
        } else {
            movieGrid.scrollBy({ left: 600, behavior: "smooth" });
        }
    }, 4000);
}

function stopAutoScroll() {
    if (autoScrollTimer) {
        clearInterval(autoScrollTimer);
        autoScrollTimer = null;
    }
}

// ==========================================================================
// MOCK SCHEDULE GENERATOR
// ---------------------------------------------------------------------
// This whole block is a frontend stand-in for what a real "showtimes" table
// in the database would provide. It fabricates a believable schedule per
// movie/date so every movie gets its own screen + times instead of every
// movie clashing on the exact same 3 slots.
// Swap this out entirely once there's a real GET /showtimes?movieID=&date=
// endpoint - see the note in section 9 below.
// ==========================================================================
const SCREENS = ["Screen 1 - IMAX", "Screen 2 - Standard", "Screen 3 - Standard"];
const BASE_TIMES = ["10:00 AM", "1:30 PM", "5:00 PM", "8:30 PM"];

// Shifts a "10:00 AM" style time string forward by N minutes
function shiftTime(timeStr, minutesToAdd) {
    const [time, period] = timeStr.split(" ");
    let [h, m] = time.split(":").map(Number);
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;

    let totalMinutes = (h * 60 + m + minutesToAdd) % (24 * 60);
    let newH = Math.floor(totalMinutes / 60);
    const newM = totalMinutes % 60;
    const newPeriod = newH >= 12 ? "PM" : "AM";
    let displayH = newH % 12;
    if (displayH === 0) displayH = 12;

    return `${displayH}:${newM.toString().padStart(2, "0")} ${newPeriod}`;
}

// Builds today + the next `days` dates as { iso, label } objects
function getDateOptions(days = 6) {
    const dates = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const iso = toLocalISO(d); // not toISOString(): that is UTC and gives the wrong day for users ahead of/behind UTC

        let label;
        if (i === 0) label = "Today";
        else if (i === 1) label = "Tomorrow";
        else label = `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getDate()}`;

        dates.push({ iso, label });
    }
    return dates;
}

// Deterministic mock schedule: same movie + same date always returns the
// same screen/times/prices, but different movies land on different screens
// and slightly staggered times so they don't clash on the same screen.
function getShowtimesForMovie(movieID, dateStr) {
    const screen = SCREENS[(movieID - 1) % SCREENS.length];
    const staggerMinutes = ((movieID - 1) % 3) * 20; // 0, 20, or 40 min offset

    return BASE_TIMES.map((time, i) => {
        const isIMAX = screen.includes("IMAX");
        return {
            showID: `${movieID}-${dateStr}-${i}`,
            screenName: screen,
            showTime: shiftTime(time, staggerMinutes),
            price: isIMAX ? 280.00 : (i % 2 === 0 ? 180.00 : 220.00)
        };
    });
}

function findShowtime(movieID, dateStr, showID) {
    const shows = (String(availableShowtimesMovieID) === String(movieID) && availableShowtimesDate === dateStr)
        ? availableShowtimes
        : getShowtimesForMovie(movieID, dateStr);
    return shows.find(s => String(s.showID) === String(showID));
}

async function fetchShowtimesForDate(movieID, dateStr) {
    const cacheKey = `${movieID}_${dateStr}`;
    if (showtimesCache.has(cacheKey)) {
        return showtimesCache.get(cacheKey);
    }
    if (backendOnline) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const response = await fetch(`${BACKEND_API}/showtimes/${movieID}?date=${encodeURIComponent(dateStr)}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.ok) {
                const shows = await response.json();
                const mapped = shows.map(show => ({ ...show, showTime: show.showTime.replace(/^0/, "") }));
                showtimesCache.set(cacheKey, mapped);
                return mapped;
            }
        } catch (error) {
            console.warn("Using the demo schedule because the showtime API is unavailable", error);
        }
    }
    const localShows = getShowtimesForMovie(movieID, dateStr).map(show => ({ ...show, date: dateStr }));
    showtimesCache.set(cacheKey, localShows);
    return localShows;
}

// ==========================================================================
// 3. Application Initialization & Data Fetching
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    fetchMovies();
    setupEventListeners();
    renderBookingsList();
    setupAccountUI();
    renderAccountState();
    setupTheme();
    // Re-check for late bookings every 30s, and when the tab becomes visible again
    window.setInterval(checkLateBookings, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) checkLateBookings(); });
});

async function fetchMovies() {
    let loaded = false;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const response = await fetch(`${BACKEND_API}/movies`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
            allMovies = await response.json();
            backendOnline = true;
            loaded = true;
        }
    } catch (backendError) {
        // Backend offline or timed out; will use instant local catalog
    }

    if (!loaded) {
        backendOnline = false;
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error("Failed to load movie catalog.");
            allMovies = await response.json();
        } catch (error) {
            console.error("Error loading movies:", error);
            movieGrid.innerHTML = `<p class="loading-text">Unable to load movies. Please check connection.</p>`;
            return;
        }
    }

    try {
        renderLanguageFilterOptions();
        renderTypeFilterOptions();
        renderMovieCards(allMovies);
        startAutoScroll();
        // Load popular movies and recommendations concurrently in background without blocking catalog display
        Promise.allSettled([
            loadPopularMovies(),
            refreshRecommendations(),
            loadLatePolicy()
        ]).then(() => {
            checkLateBookings();
        });
    } catch (error) {
        console.error("Error rendering movies:", error);
    }
}

// Build the "All Types" dropdown from whatever movieType values actually
// exist in the data, instead of hardcoding them in the HTML
function renderTypeFilterOptions() {
    const types = [...new Set(allMovies.map(m => m.movieType))];
    types.forEach(type => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type.replace(/_/g, " ");
        typeFilter.appendChild(option);
    });
}

// Build the language dropdown from the catalog so future languages appear automatically.
function renderLanguageFilterOptions() {
    const languages = [...new Set(allMovies.map(m => m.language).filter(Boolean))].sort();
    languages.forEach(language => {
        const option = document.createElement("option");
        option.value = language;
        option.textContent = language;
        languageFilter.appendChild(option);
    });
}

// ==========================================================================
// 4. Catalog Rendering & Filtering
// ==========================================================================
function buildMovieCardHTML(movie) {
    const graphTag = movie.recommendationReason ? `
        <span class="rec-graph-tag" title="${esc(movie.recommendationReason)}">⚡ ${esc(movie.recommendationReason)}</span>
    ` : '';
    return `
        <div class="movie-card" onclick="openBookingModal(${movie.movieID})">
            <div class="poster-wrap">
                <img class="movie-poster" loading="lazy" decoding="async" src="${movie.poster}" alt="${movie.title} poster" onerror="this.onerror=null; this.src='assets/posters/poster-3-idiots.jpg';">
                <span class="rating-badge">&#9733; ${movie.rating}&nbsp;&nbsp;${movie.votes} Votes</span>
            </div>
            <div class="movie-card-body">
                <h3>${movie.title}</h3>
                <p class="movie-genre">${movie.language} &bull; ${movie.movieType.replace(/_/g, " / ")}</p>
                ${graphTag}
                <button class="btn-book" onclick="event.stopPropagation(); openBookingModal(${movie.movieID})">Book Now</button>
            </div>
        </div>
    `;
}

function renderMovieRow(gridElem, movies, emptyMessage) {
    if (!movies || movies.length === 0) {
        gridElem.innerHTML = `<p class="loading-text">${emptyMessage}</p>`;
        return;
    }
    gridElem.innerHTML = movies.map(buildMovieCardHTML).join('');
}

function renderMovieCards(movies) {
    renderMovieRow(movieGrid, movies, "No movies found matching your criteria.");
}

// ==========================================================================
// Recommendations
// ---------------------------------------------------------------------
// "Popular Now" just ranks by vote count. "Recommended For You" is a small
// content-based system: it looks at what genres (movieType) you've booked
// before and surfaces more of that genre, falling back to top-rated movies
// when there's no booking history yet. All of this runs on the mock data
// in the browser - a real recommendation engine would live on the backend
// and use actual user behaviour across everyone, not just localStorage.
// ==========================================================================
function parseVotes(voteStr) {
    const num = parseFloat(voteStr);
    if (voteStr.includes("M")) return num * 1_000_000;
    if (voteStr.includes("K")) return num * 1_000;
    return num;
}

function parseRating(ratingStr) {
    return parseFloat(ratingStr);
}

function getPopularMovies(movies, count = 8) {
    return [...movies]
        .sort((a, b) => parseVotes(b.votes) - parseVotes(a.votes))
        .slice(0, count);
}

function getRecommendedMovies(movies, count = 8) {
    const bookings = getBookings();

    // No booking history yet - just show the highest rated movies
    if (bookings.length === 0) {
        return [...movies].sort((a, b) => parseRating(b.rating) - parseRating(a.rating)).slice(0, count);
    }

    // Count how often each genre shows up in past bookings
    const genreCounts = {};
    bookings.forEach(b => {
        const movie = movies.find(m => m.movieID === b.movieID);
        if (movie) genreCounts[movie.movieType] = (genreCounts[movie.movieType] || 0) + 1;
    });

    const favoriteGenre = Object.keys(genreCounts).sort((a, b) => genreCounts[b] - genreCounts[a])[0];
    const matches = movies
        .filter(m => m.movieType === favoriteGenre)
        .sort((a, b) => parseRating(b.rating) - parseRating(a.rating));

    // Not enough matches in that genre - top up with other highly rated movies
    if (matches.length < count) {
        const others = movies
            .filter(m => !matches.includes(m))
            .sort((a, b) => parseRating(b.rating) - parseRating(a.rating));
        return [...matches, ...others].slice(0, count);
    }

    return matches.slice(0, count);
}

async function loadPopularMovies() {
    const popularGrid = document.getElementById("popularGrid");
    if (!popularGrid) return;
    if (backendOnline) {
        try {
            const response = await fetch(`${BACKEND_API}/recommendations/popular`);
            if (response.ok) {
                const popular = await response.json();
                if (popular && popular.length > 0) {
                    renderMovieRow(popularGrid, popular, "No movies yet.");
                    return;
                }
            }
        } catch (e) {
            console.warn("Could not load popular recommendations from backend:", e);
        }
    }
    renderMovieRow(popularGrid, getPopularMovies(allMovies), "No movies yet.");
}

async function refreshRecommendations() {
    const recommendedGrid = document.getElementById("recommendedGrid");
    if (!recommendedGrid) return;
    if (backendOnline && currentUser) {
        try {
            const response = await fetch(`${BACKEND_API}/recommendations/me`);
            if (response.ok) {
                const recs = await response.json();
                if (recs && recs.length > 0) {
                    renderMovieRow(recommendedGrid, recs, "No recommendations yet.");
                    return;
                }
            }
        } catch (e) {
            console.warn("Could not load Neo4j recommendations from backend:", e);
        }
    }
    renderMovieRow(recommendedGrid, getRecommendedMovies(allMovies), "No recommendations yet.");
}

function setupTheme() {
    const themeToggle = document.getElementById("themeToggle");
    const themeIcon = document.getElementById("themeIcon");
    const themeLabel = document.getElementById("themeLabel");

    const applyTheme = theme => {
        currentTheme = theme;
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("cinemaTheme", theme);
        const isDark = theme === "dark";
        themeIcon.textContent = isDark ? "☀" : "☾";
        themeLabel.textContent = isDark ? "Light" : "Dark";
        themeToggle.setAttribute("aria-pressed", String(isDark));
        themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    };

    applyTheme(currentTheme);
    themeToggle.addEventListener("click", () => {
        applyTheme(currentTheme === "dark" ? "light" : "dark");
    });
}

function setupAccountUI() {
    signInBtn.addEventListener("click", () => openAccountModal(signInModal));
    profileBtn.addEventListener("click", () => {
        populateProfileForm();
        openAccountModal(profileModal);
    });

    document.querySelectorAll("[data-close-account]").forEach(button => {
        button.addEventListener("click", closeAccountModals);
    });

    [signInModal, profileModal].forEach(modal => {
        modal.addEventListener("click", event => {
            if (event.target === modal) closeAccountModals();
        });
    });

    signInForm.addEventListener("submit", async event => {
        event.preventDefault();
        const formData = new FormData(signInForm);
        const name = String(formData.get("name") || "").trim();
        const email = String(formData.get("email") || "").trim().toLowerCase();
        if (name.length < 2 || !email.includes("@")) {
            signInMessage.textContent = "Please enter a name and valid email address.";
            signInMessage.className = "account-message error";
            return;
        }

        if (backendOnline) {
            try {
                const response = await fetch(`${BACKEND_API}/auth/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email }) });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.error || "Sign-in failed");
                currentUser = { ...result, dob: "", gender: "", countryCode: "", areaCode: "", phoneNumber: "", country: "", state: "", city: "", postalCode: "", genre: "" };
            } catch (error) {
                backendOnline = false;
                const username = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "moviegoer";
                currentUser = { username, name, email, dob: "", gender: "", countryCode: "", areaCode: "", phoneNumber: "", country: "", state: "", city: "", postalCode: "", genre: "" };
            }
        } else {
            const username = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "moviegoer";
            currentUser = { username, name, email, dob: "", gender: "", countryCode: "", areaCode: "", phoneNumber: "", country: "", state: "", city: "", postalCode: "", genre: "" };
        }
        localStorage.setItem("cinemaUser", JSON.stringify(currentUser));
        signInForm.reset();
        signInMessage.textContent = backendOnline
            ? "Demo sign-in successful. No password was checked."
            : "Demo sign-in saved in this browser. The booking server must be online to record UPI bookings.";
        signInMessage.className = "account-message success";
        renderAccountState();
        window.setTimeout(() => {
            closeAccountModals();
            populateProfileForm();
            openAccountModal(profileModal);
        }, 500);
    });

    document.getElementById("profileDob").addEventListener("change", event => {
        document.getElementById("profileAge").value = calculateAge(event.target.value);
    });

    profileForm.addEventListener("submit", event => {
        event.preventDefault();
        const formData = new FormData(profileForm);
        const username = String(formData.get("username") || "").trim();
        const name = String(formData.get("name") || "").trim();
        const email = String(formData.get("email") || "").trim().toLowerCase();
        const dob = String(formData.get("dob") || "");
        const newPassword = String(formData.get("newPassword") || "");
        if (username.length < 3 || name.length < 2 || !email.includes("@")) {
            profileMessage.textContent = "Please provide a username, valid name, and email address.";
            profileMessage.className = "account-message error";
            return;
        }
        if (newPassword && newPassword.length < 6) {
            profileMessage.textContent = "A new password must contain at least 6 characters.";
            profileMessage.className = "account-message error";
            return;
        }
        currentUser = {
            ...currentUser,
            username,
            name,
            email,
            dob,
            age: calculateAge(dob),
            gender: String(formData.get("gender") || ""),
            countryCode: String(formData.get("countryCode") || "").trim(),
            areaCode: String(formData.get("areaCode") || "").trim(),
            phoneNumber: String(formData.get("phoneNumber") || "").trim(),
            country: String(formData.get("country") || "").trim(),
            state: String(formData.get("state") || "").trim(),
            city: String(formData.get("city") || "").trim(),
            postalCode: String(formData.get("postalCode") || "").trim(),
            genre: String(formData.get("genre") || "")
        };
        localStorage.setItem("cinemaUser", JSON.stringify(currentUser));
        renderAccountState();
        document.getElementById("profileNewPassword").value = "";
        profileMessage.textContent = newPassword ? "Profile saved. Password changes are not enabled in this demo." : "Profile saved.";
        profileMessage.className = "account-message success";
    });

    signOutBtn.addEventListener("click", async () => {
        if (backendOnline) {
            try { await fetch(`${BACKEND_API}/auth/signout`, { method: "POST" }); }
            catch (error) { console.warn("Could not clear the server demo session", error); }
        }
        currentUser = null;
        localStorage.removeItem("cinemaUser");
        closeAccountModals();
        renderAccountState();
    });
}

function openAccountModal(modal) {
    signInMessage.textContent = "";
    profileMessage.textContent = "";
    modal.classList.remove("hidden");
    const firstInput = modal.querySelector("input");
    if (firstInput) window.setTimeout(() => firstInput.focus(), 0);
}

function closeAccountModals() {
    signInModal.classList.add("hidden");
    profileModal.classList.add("hidden");
}

function renderAccountState() {
    const avatar = document.getElementById("profileAvatar");
    const modalAvatar = document.getElementById("profileModalAvatar");
    const nameElement = document.getElementById("profileName");
    if (currentUser) {
        const initial = currentUser.name.charAt(0).toUpperCase();
        avatar.textContent = initial;
        modalAvatar.textContent = initial;
        nameElement.textContent = currentUser.name.split(" ")[0];
        signInBtn.classList.add("hidden");
        profileBtn.classList.remove("hidden");
    } else {
        avatar.textContent = "U";
        modalAvatar.textContent = "U";
        nameElement.textContent = "My Profile";
        signInBtn.classList.remove("hidden");
        profileBtn.classList.remove("hidden");
    }
}

function calculateAge(dob) {
    if (!dob) return "";
    const birthDate = new Date(`${dob}T00:00:00`);
    if (Number.isNaN(birthDate.getTime())) return "";
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDifference = today.getMonth() - birthDate.getMonth();
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) age--;
    return age >= 0 && age <= 120 ? age : "";
}

function populateProfileForm() {
    if (!currentUser) return;
    document.getElementById("profileUsername").value = currentUser.username || "";
    document.getElementById("profileFullName").value = currentUser.name || "";
    document.getElementById("profileEmail").value = currentUser.email || "";
    document.getElementById("profileDob").value = currentUser.dob || "";
    document.getElementById("profileAge").value = currentUser.age ?? calculateAge(currentUser.dob) ?? "";
    document.getElementById("profileGender").value = currentUser.gender || "";
    document.getElementById("profileCountryCode").value = currentUser.countryCode || "";
    document.getElementById("profileAreaCode").value = currentUser.areaCode || "";
    document.getElementById("profilePhoneNumber").value = currentUser.phoneNumber || "";
    document.getElementById("profileCountry").value = currentUser.country || "";
    document.getElementById("profileState").value = currentUser.state || "";
    document.getElementById("profileCity").value = currentUser.city || "";
    document.getElementById("profilePostalCode").value = currentUser.postalCode || "";
    document.getElementById("profileGenre").value = currentUser.genre || "";
}

function setupEventListeners() {
    searchInput.addEventListener("input", filterMovies);
    languageFilter.addEventListener("change", filterMovies);
    typeFilter.addEventListener("change", filterMovies);

    navMovies.addEventListener("click", (e) => {
        e.preventDefault();
        showPage("movies");
    });

    navBookings.addEventListener("click", (e) => {
        e.preventDefault();
        showPage("bookings");
    });

    if (navAdmin) {
        navAdmin.addEventListener("click", (e) => {
            e.preventDefault();
            showPage("admin");
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (!manualPaymentModal.classList.contains("hidden")) closeManualPayment();
        else if (editSeatModal && !editSeatModal.classList.contains("hidden")) closeEditSeatModal();
        else if (!bookingModal.classList.contains("hidden")) closeBookingModal();
        if (!signInModal.classList.contains("hidden") || !profileModal.classList.contains("hidden")) closeAccountModals();
        if (!lateModal.classList.contains("hidden")) closeLateModal();
    });

    lateModal.addEventListener("click", (e) => {
        if (e.target === lateModal) closeLateModal();
    });

    bookingModal.addEventListener("click", (e) => {
        if (e.target === bookingModal) closeBookingModal();
    });

    const editSeatModalElem = document.getElementById("editSeatModal");
    if (editSeatModalElem) {
        editSeatModalElem.addEventListener("click", (e) => {
            if (e.target === editSeatModalElem) closeEditSeatModal();
        });
    }

    manualPaymentModal.addEventListener("click", (e) => {
        if (e.target === manualPaymentModal) closeManualPayment();
    });

    // Horizontal scroll arrows - works for the catalog row, Popular row,
    // and Recommended row alike, using each button's data-target
    document.querySelectorAll(".scroll-arrow").forEach(btn => {
        btn.addEventListener("click", () => {
            stopAutoScroll();
            const grid = document.getElementById(btn.dataset.target);
            const direction = btn.classList.contains("prev") ? -600 : 600;
            grid.scrollBy({ left: direction, behavior: "smooth" });
        });
    });

    // Pause the carousel while the person is looking at / interacting with it
    movieRowWrap.addEventListener("mouseenter", stopAutoScroll);
    movieRowWrap.addEventListener("mouseleave", startAutoScroll);
}

function filterMovies() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedLanguage = languageFilter.value;
    const selectedType = typeFilter.value;

    const filtered = allMovies.filter(movie => {
        const matchesSearch = movie.title.toLowerCase().includes(searchTerm);
        const matchesLanguage = (selectedLanguage === "ALL") || (movie.language === selectedLanguage);
        const matchesType = (selectedType === "ALL") || (movie.movieType === selectedType);
        return matchesSearch && matchesLanguage && matchesType;
    });

    renderMovieCards(filtered);
}

// ==========================================================================
// 5. Page Switching (Movies / My Bookings / Admin)
// ==========================================================================
function showPage(page) {
    moviesPage.classList.add("hidden");
    bookingsPage.classList.add("hidden");
    if (adminPage) adminPage.classList.add("hidden");
    navMovies.classList.remove("active");
    navBookings.classList.remove("active");
    if (navAdmin) navAdmin.classList.remove("active");

    if (page === "movies") {
        moviesPage.classList.remove("hidden");
        navMovies.classList.add("active");
        startAutoScroll();
    } else if (page === "bookings") {
        bookingsPage.classList.remove("hidden");
        navBookings.classList.add("active");
        stopAutoScroll();
        renderBookingsList();
    } else if (page === "admin") {
        if (adminPage) adminPage.classList.remove("hidden");
        if (navAdmin) navAdmin.classList.add("active");
        stopAutoScroll();
        loadAdminStats();
    }
}

async function loadAdminStats() {
    try {
        const response = await fetch(`${BACKEND_API}/admin/stats`);
        if (!response.ok) return;
        const data = await response.json();

        // 1. Movie Performance View (V_MOVIE_PERFORMANCE)
        const perfBody = document.getElementById("moviePerfBody");
        if (perfBody && Array.isArray(data.moviePerformance)) {
            let totalRev = 0;
            let totalBk = 0;
            let html = "";
            for (const m of data.moviePerformance) {
                totalRev += Number(m.grossRevenue || 0);
                totalBk += Number(m.totalBookings || 0);
                html += `<tr>
                    <td><strong>${esc(m.movieTitle)}</strong></td>
                    <td>${esc(m.language)}</td>
                    <td><span class="late-badge" style="background:#475569">${esc(m.genre)}</span></td>
                    <td>⭐ ${esc(m.rating)}</td>
                    <td>${m.totalBookings}</td>
                    <td>${m.ticketsSold}</td>
                    <td><strong style="color:#22c55e">${money(m.grossRevenue)}</strong></td>
                </tr>`;
            }
            perfBody.innerHTML = html || `<tr><td colspan="7">No performance records yet.</td></tr>`;
            const revEl = document.getElementById("statTotalRevenue");
            const bkEl = document.getElementById("statTotalBookings");
            if (revEl) revEl.textContent = money(totalRev);
            if (bkEl) bkEl.textContent = totalBk;
        }

        // 2. Active Shows (V_ACTIVE_SHOWS)
        const showsBody = document.getElementById("activeShowsBody");
        if (showsBody && Array.isArray(data.activeShows)) {
            let html = "";
            for (const s of data.activeShows) {
                const occPercent = Math.round((s.bookedSeats / s.capacity) * 100);
                html += `<tr>
                    <td><code>${esc(s.showId)}</code></td>
                    <td>${esc(s.movieTitle)}</td>
                    <td>${esc(s.screenName)}</td>
                    <td>${esc(s.showDate)}</td>
                    <td>${esc(s.showTime)}</td>
                    <td>${s.bookedSeats} / ${s.capacity}</td>
                    <td><span style="color:#22c55e;font-weight:700">${s.availableSeats}</span></td>
                    <td style="min-width:110px">
                        <small>${occPercent}%</small>
                        <div class="occupancy-bar"><div class="occupancy-fill" style="width:${occPercent}%"></div></div>
                    </td>
                </tr>`;
            }
            showsBody.innerHTML = html || `<tr><td colspan="8">No active shows found.</td></tr>`;
        }

        // 3. Audit Trail Log (TRG_AUDIT_BOOKING_STATUS)
        const auditBody = document.getElementById("auditBody");
        if (auditBody && Array.isArray(data.auditLogs)) {
            let html = "";
            for (const a of data.auditLogs) {
                html += `<tr>
                    <td>#${a.logId}</td>
                    <td><strong>#${a.bookingId}</strong></td>
                    <td><span class="late-badge" style="background:${a.actionType.includes('CANCEL') ? '#ef4444' : '#3b82f6'}">${esc(a.actionType)}</span></td>
                    <td>${esc(a.oldStatus || '-')}</td>
                    <td><strong>${esc(a.newStatus || '-')}</strong></td>
                    <td><small>${esc(a.changeTime)}</small></td>
                    <td><small>${esc(a.notes || '')}</small></td>
                </tr>`;
            }
            auditBody.innerHTML = html || `<tr><td colspan="7">No audit logs recorded yet.</td></tr>`;
        }

        // 4. Neo4j Graph Database Metrics & Status
        if (data.neo4j) {
            const neo = data.neo4j;
            const statNeoEl = document.getElementById("statNeo4jStatus");
            const nodesEl = document.getElementById("neoNodesCount");
            const edgesEl = document.getElementById("neoEdgesCount");
            const endpointEl = document.getElementById("neoEndpoint");
            const modeEl = document.getElementById("neoMode");
            const syncEl = document.getElementById("neoSyncTime");

            if (statNeoEl) statNeoEl.textContent = neo.neo4jReachable ? "Connected (Live)" : "Active (In-Memory Engine)";
            if (nodesEl) nodesEl.textContent = neo.nodesCount;
            if (edgesEl) edgesEl.textContent = `${neo.relationshipsCount} relationships`;
            if (endpointEl) endpointEl.textContent = neo.neo4jUrl;
            if (modeEl) modeEl.textContent = neo.engineMode;
            if (syncEl) syncEl.textContent = neo.lastSyncTimestamp || "Synchronized";
        }
    } catch (e) {
        console.error("Failed to load admin stats:", e);
    }
}

window.syncNeo4jGraph = async function() {
    const btn = document.getElementById("btnSyncNeo4j");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = "<span>⏳ Synchronizing Oracle to Neo4j...</span>";
    }
    try {
        const response = await fetch(`${BACKEND_API}/admin/neo4j-sync`, { method: "POST" });
        const res = await response.json();
        if (response.ok) {
            alert(`🎉 Neo4j Graph Synchronized Successfully!\n\nNodes Created: ${res.nodesCount}\nRelationships: ${res.relationshipsCount}\nMovies Synced: ${res.syncedMovies}\nRatings Synced: ${res.syncedRatings}\nBookings Synced: ${res.syncedBookings}`);
            loadAdminStats();
            refreshRecommendations();
        } else {
            alert("Sync Failed: " + (res.message || "Unknown error"));
        }
    } catch (err) {
        alert("Failed to sync Neo4j: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = "<span>↻ Sync Oracle ➔ Neo4j Graph</span>";
        }
    }
};

// ==========================================================================
// ==========================================================================
// 6. Booking Modal, Date Picker & Showtime Logic
// ==========================================================================
function openBookingModal(movieID) {
    selectedMovie = allMovies.find(m => String(m.movieID) === String(movieID));
    if (!selectedMovie) return;

    stopAutoScroll();
    editingBookingId = null;
    modalMovieTitle.innerText = `Book Tickets: ${selectedMovie.title}`;

    selectedShowtime = null;
    selectedSeats = [];
    ticketTypes = {};
    updateSummary();

    ticketTypesWrap.innerHTML = "";
    screenLabel.innerText = "Screen";

    // 1. Render date selector instantly
    renderDateSelector();
    bookingModal.classList.remove("hidden");

    // 2. Select first date immediately
    const firstDateBtn = dateList.querySelector(".date-btn");
    if (firstDateBtn) {
        firstDateBtn.classList.add("active");
        selectedDate = firstDateBtn.dataset.date;
    }

    // 3. Render showtimes & seats synchronously (0ms delay!)
    renderShowtimesSync();
}

function closeBookingModal() {
    bookingModal.classList.add("hidden");
    dateList.innerHTML = "";
    showtimeList.innerHTML = "";
    seatGrid.innerHTML = "";
    ticketTypesWrap.innerHTML = "";
    editingBookingId = null;
    selectedDate = null;
    selectedShowtime = null;
    selectedSeats = [];
    ticketTypes = {};
    startAutoScroll();
}

function renderDateSelector() {
    const dates = getDateOptions(6);
    dateList.innerHTML = dates.map(d => `
        <button class="date-btn" data-date="${d.iso}" onclick="selectDate(this, '${d.iso}')">${d.label}</button>
    `).join('');
}

function selectDate(buttonElem, dateStr) {
    document.querySelectorAll(".date-btn").forEach(btn => btn.classList.remove("active"));
    buttonElem.classList.add("active");
    selectedDate = dateStr;

    selectedShowtime = null;
    selectedSeats = [];
    ticketTypes = {};
    ticketTypesWrap.innerHTML = "";
    screenLabel.innerText = "Screen";

    renderShowtimesSync();
}

function renderShowtimesSync() {
    if (!selectedMovie || !selectedDate) return;
    const movieID = selectedMovie.movieID;
    const dateStr = selectedDate;

    // Use cached showtimes or generate local showtimes instantly
    const cacheKey = `${movieID}_${dateStr}`;
    const shows = showtimesCache.get(cacheKey) || getShowtimesForMovie(movieID, dateStr).map(show => ({ ...show, date: dateStr }));
    availableShowtimes = shows;
    availableShowtimesMovieID = movieID;
    availableShowtimesDate = dateStr;

    if (!shows || shows.length === 0) {
        showtimeList.innerHTML = `<p class="muted" style="padding: 10px 0; font-size: 0.95rem; color: #888;">No shows scheduled for this date.</p>`;
        seatGrid.innerHTML = "";
        ticketTypesWrap.innerHTML = "";
        selectedShowtime = null;
        updateSummary();
        return;
    }

    showtimeList.innerHTML = shows.map((show, idx) => `
        <button class="time-btn ${idx === 0 ? 'active' : ''}" data-showid="${show.showID}" onclick="selectShowtime(this, '${show.showID}')">
            ${show.showTime} (${show.screenName}) - ₹${show.price.toFixed(2)}
        </button>
    `).join('');

    // Immediately select first showtime and render seats in 0ms!
    const firstShow = shows[0];
    selectedShowtime = { ...firstShow, date: dateStr };
    screenLabel.innerText = firstShow.screenName;
    selectedSeats = [];
    ticketTypes = {};

    const occKey = `${movieID}_${firstShow.showID}`;
    const cachedOccupied = occupiedSeatsCache.get(occKey) || getOccupiedSeats(movieID, firstShow.showID, editingBookingId);
    renderSeatGrid(cachedOccupied);
    renderTicketTypes();
    updateSummary();

    // Background fetch fresh occupied seats from server if online
    if (backendOnline) {
        fetchBackgroundOccupiedSeats(movieID, firstShow.showID);
    }
}

function selectShowtime(buttonElem, showID) {
    document.querySelectorAll(".time-btn").forEach(btn => btn.classList.remove("active"));
    buttonElem.classList.add("active");

    const show = findShowtime(selectedMovie.movieID, selectedDate, showID);
    if (!show) return;
    selectedShowtime = { ...show, date: selectedDate };
    screenLabel.innerText = show.screenName;

    selectedSeats = [];
    ticketTypes = {};

    const occKey = `${selectedMovie.movieID}_${showID}`;
    const cachedOccupied = occupiedSeatsCache.get(occKey) || getOccupiedSeats(selectedMovie.movieID, showID, editingBookingId);
    renderSeatGrid(cachedOccupied);
    renderTicketTypes();
    updateSummary();

    if (backendOnline) {
        fetchBackgroundOccupiedSeats(selectedMovie.movieID, showID);
    }
}

async function fetchBackgroundOccupiedSeats(movieID, showID) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const response = await fetch(`${BACKEND_API}/showtimes/${movieID}/${encodeURIComponent(showID)}/occupied`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
            const occupiedSeats = await response.json();
            if (Array.isArray(occupiedSeats)) {
                const occKey = `${movieID}_${showID}`;
                occupiedSeatsCache.set(occKey, occupiedSeats);
                if (selectedShowtime && String(selectedShowtime.showID) === String(showID)) {
                    updateOccupiedSeatsInGrid(occupiedSeats);
                }
            }
        }
    } catch (e) {
        // Fallback already rendered smoothly
    }
}

function updateOccupiedSeatsInGrid(databaseOccupiedSeats) {
    if (!databaseOccupiedSeats || !selectedShowtime) return;
    const occupiedSet = new Set(databaseOccupiedSeats);
    const seats = seatGrid.querySelectorAll(".seat");
    let changed = false;
    seats.forEach(seatElem => {
        const seatNo = seatElem.innerText.trim();
        if (occupiedSet.has(seatNo)) {
            if (!seatElem.classList.contains("occupied")) {
                seatElem.className = "seat occupied";
                seatElem.onclick = null;
                changed = true;
            }
            if (selectedSeats.includes(seatNo)) {
                selectedSeats = selectedSeats.filter(s => s !== seatNo);
                delete ticketTypes[seatNo];
                changed = true;
            }
        }
    });
    if (changed) {
        renderTicketTypes();
        updateSummary();
    }
}

// ==========================================================================
// 7. Interactive Seat Map Generator (multi-select)
// ==========================================================================
function renderSeatGrid(databaseOccupiedSeats = null) {
    const rows = SEAT_ROWS;
    const seatsPerRow = SEATS_PER_ROW;
    const occupiedSeats = databaseOccupiedSeats || getOccupiedSeats(selectedMovie.movieID, selectedShowtime.showID, editingBookingId);

    const fragment = document.createDocumentFragment();
    rows.forEach(row => {
        for (let i = 1; i <= seatsPerRow; i++) {
            const seatNo = `${row}${i}`;
            const isOccupied = occupiedSeats.includes(seatNo);
            const isSelected = selectedSeats.includes(seatNo);

            const seatElem = document.createElement("div");
            seatElem.className = "seat";
            seatElem.innerText = seatNo;

            if (isOccupied) {
                seatElem.classList.add("occupied");
            } else {
                seatElem.classList.add(isSelected ? "selected" : "available");
                seatElem.onclick = () => toggleSeatSelection(seatElem, seatNo);
            }

            fragment.appendChild(seatElem);
        }
    });
    seatGrid.replaceChildren(fragment);
}

// Seats can be toggled on/off independently - no limit on how many
function toggleSeatSelection(seatElem, seatNo) {
    if (!selectedShowtime) {
        alert("Please select a showtime first.");
        return;
    }

    if (selectedSeats.includes(seatNo)) {
        selectedSeats = selectedSeats.filter(s => s !== seatNo);
        delete ticketTypes[seatNo];
        seatElem.classList.remove("selected");
        seatElem.classList.add("available");
    } else {
        selectedSeats.push(seatNo);
        ticketTypes[seatNo] = "adult"; // default, can be changed per seat below
        seatElem.classList.remove("available");
        seatElem.classList.add("selected");
    }

    renderTicketTypes();
    updateSummary();
}

// ==========================================================================
// 8. Ticket Type Per Seat (drives the discount)
// ==========================================================================
function renderTicketTypes() {
    if (selectedSeats.length === 0) {
        ticketTypesWrap.innerHTML = "";
        return;
    }

    ticketTypesWrap.innerHTML = `
        <h3>Ticket type per seat</h3>
        ${selectedSeats.map(seat => `
            <div class="ticket-type-row">
                <span>Seat ${seat}</span>
                <select onchange="setTicketType('${seat}', this.value)">
                    <option value="adult" ${ticketTypes[seat] === "adult" ? "selected" : ""}>Adult</option>
                    <option value="child" ${ticketTypes[seat] === "child" ? "selected" : ""}>Child (12 & under) - 20% off</option>
                    <option value="senior" ${ticketTypes[seat] === "senior" ? "selected" : ""}>Senior (60+) - 15% off</option>
                </select>
            </div>
        `).join('')}
    `;
}

function setTicketType(seatNo, type) {
    ticketTypes[seatNo] = type;
    updateSummary();
}

function calculateTotal() {
    if (!selectedShowtime) return 0;
    return selectedSeats.reduce((total, seat) => {
        const type = ticketTypes[seat] || "adult";
        const discount = DISCOUNTS[type] || 0;
        return total + selectedShowtime.price * (1 - discount);
    }, 0);
}

function updateSummary() {
    if (selectedSeats.length > 0 && selectedShowtime) {
        selectedSeatNoElem.innerText = selectedSeats.join(", ");
        totalPriceElem.innerText = calculateTotal().toFixed(2);
        confirmBookingBtn.disabled = false;
    } else {
        selectedSeatNoElem.innerText = "None";
        totalPriceElem.innerText = "0.00";
        confirmBookingBtn.disabled = true;
    }
}

// ==========================================================================
// 9. Booking Storage (localStorage stand-in until the backend is wired up)
// ---------------------------------------------------------------------
// EVERYTHING BELOW THIS LINE - and the schedule generator up top - is
// frontend simulation. This is exactly where a real backend takes over:
//   - getBookings()/saveBookings() -> becomes GET/POST/DELETE /bookings
//   - getShowtimesForMovie()       -> becomes GET /showtimes?movieID=&date=
//   - getOccupiedSeats()           -> the backend would return this as part
//                                     of the showtimes response, computed
//                                     from real rows in a bookings table
// None of this needs a database or server course to build - it's normal
// frontend work. The moment someone plugs in real API calls here instead
// of localStorage, that's backend territory.
// ==========================================================================
function getBookings() {
    return JSON.parse(localStorage.getItem("bookings") || "[]");
}

function saveBookings(bookings) {
    localStorage.setItem("bookings", JSON.stringify(bookings));
}

function getOccupiedSeats(movieID, showID, excludeBookingId = null) {
    return getBookings()
        .filter(b => String(b.movieID) === String(movieID) && String(b.showID) === String(showID) && String(b.id) !== String(excludeBookingId))
        .flatMap(b => b.seats);
}

function generateReceiptPDF(booking) {
    const jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) {
        alert("Booking successful, but the receipt library could not be loaded. Please check your internet connection and try again.");
        return;
    }

    const doc = new jsPDF();
    const bookedMovie = allMovies.find(movie => movie.movieID === booking.movieID);
    const language = booking.language || (bookedMovie && bookedMovie.language) || "";
    const ticketLines = booking.seats.map(seat => {
        const type = booking.ticketTypes[seat] || "adult";
        return `Seat ${seat} - ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    });

    doc.setFillColor(123, 38, 56);
    doc.rect(0, 0, 210, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont(undefined, "bold");
    doc.text("CinemaBooking", 20, 19);
    doc.setFontSize(11);
    doc.setFont(undefined, "normal");
    doc.text("Movie Ticket Receipt", 145, 19);

    doc.setTextColor(37, 35, 31);
    doc.setFontSize(11);
    let y = 48;
    const addLine = (label, value) => {
        doc.setFont(undefined, "bold");
        doc.text(`${label}:`, 20, y);
        doc.setFont(undefined, "normal");
        doc.text(String(value), 65, y);
        y += 9;
    };

    addLine("Booking ID", booking.id);
    addLine("Issued", new Date().toLocaleString());
    addLine("Movie", booking.movieTitle);
    addLine("Language", language);
    addLine("Date", booking.date);
    addLine("Showtime", booking.showTime);
    addLine("Screen", booking.screenName);

    y += 5;
    doc.setDrawColor(210, 200, 190);
    doc.line(20, y, 190, y);
    y += 12;
    doc.setFont(undefined, "bold");
    doc.text("Tickets", 20, y);
    y += 9;
    doc.setFont(undefined, "normal");
    ticketLines.forEach(line => {
        doc.text(line, 25, y);
        y += 8;
    });

    y += 5;
    doc.line(20, y, 190, y);
    y += 12;
    doc.setFont(undefined, "bold");
    doc.text(`Booking amount: INR ${Number(booking.total).toFixed(2)}`, 20, y);
    doc.setFont(undefined, "normal");
    y += 18;
    doc.setFontSize(9);
    doc.setTextColor(117, 111, 101);
    doc.text("UPI transfer reported by customer; not verified by the app.", 20, y);
    y += 7;
    doc.text("Please show this receipt at the cinema entrance.", 20, y);
    doc.text("Thank you for booking with CinemaBooking.", 20, y + 7);

    doc.save(`cinema-booking-receipt-${booking.id}.pdf`);
}

// ==========================================================================
// 10. Booking Submission Handler
// ==========================================================================
async function confirmBooking() {
    if (selectedSeats.length === 0 || !selectedShowtime) return;

    const total = calculateTotal();

    const bookingPayload = {
        movieID: selectedMovie.movieID,
        movieTitle: selectedMovie.title,
        language: selectedMovie.language,
        date: selectedShowtime.date,
        showID: selectedShowtime.showID,
        showTime: selectedShowtime.showTime,
        screenName: selectedShowtime.screenName,
        seats: [...selectedSeats],
        ticketTypes: { ...ticketTypes },
        total: total
    };

    if (editingBookingId) {
        bookingPayload.editingBookingId = editingBookingId;
        if (backendOnline && currentUser) {
            try {
                const response = await fetch(`${BACKEND_API}/bookings`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(bookingPayload)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Failed to update booking.");
                alert("Booking updated successfully via JDBC stored procedure!");
                editingBookingId = null;
                closeBookingModal();
                await renderBookingsList();
                showPage("bookings");
                return;
            } catch (err) {
                alert("Error updating booking: " + err.message);
                return;
            }
        }
    }

    pendingManualBooking = bookingPayload;
    const amountElement = document.getElementById("manualPaymentAmount");
    const upiIdElement = document.getElementById("manualPaymentUpiId");
    const qrImage = document.getElementById("manualPaymentQr");
    const payLink = document.getElementById("manualPaymentLink");
    const message = document.getElementById("manualPaymentMessage");
    const submitButton = document.getElementById("manualPaymentSubmit");
    const reference = document.getElementById("manualPaymentReference");
    message.textContent = "Preparing your payment QR…";
    amountElement.textContent = money(total);
    reference.value = "";
    submitButton.disabled = true;
    const params = new URLSearchParams({ pa: DEMO_UPI_ID, pn: DEMO_UPI_PAYEE, am: total.toFixed(2), cu: "INR", tn: "Movie ticket booking" });
    let details = {
        upiId: DEMO_UPI_ID,
        upiLink: `upi://pay?${params.toString()}`,
        qrUrl: "assets/payment-qr.png",
        staticQr: true
    };
    if (backendOnline) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 800);
            const response = await fetch(`${BACKEND_API}/payment-details?amount=${encodeURIComponent(total.toFixed(2))}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            const serverDetails = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(serverDetails.error || "Could not prepare server payment details.");
            details = {
                ...serverDetails,
                upiId: serverDetails.upiId || DEMO_UPI_ID,
                qrUrl: "assets/payment-qr.png" // Always use the BHIM QR code image
            };
        } catch (error) {
            console.warn("Using the standalone UPI QR because the payment API is unavailable", error);
            backendOnline = false;
        }
    }
    upiIdElement.textContent = details.upiId || DEMO_UPI_ID;
    qrImage.src = details.qrUrl;
    qrImage.alt = `BHIM UPI QR code for ${details.upiId || DEMO_UPI_ID}${details.staticQr ? " (enter the amount shown separately)" : `, amount ${money(total)}`}`;
    payLink.href = details.upiLink;
    payLink.classList.remove("hidden");
    message.textContent = details.staticQr
        ? "Scan the BHIM QR code and enter the exact amount shown, or tap below to open your UPI app."
        : "Scan the BHIM QR from another device, or open your UPI app. Return here after sending the exact amount.";
    submitButton.disabled = false;
    manualPaymentModal.classList.remove("hidden");
}

async function completeManualPayment() {
    // 1. Seat Modification Payment Flow (?40 extra per seat)
    if (pendingSeatModification) {
        const submitButton = document.getElementById("manualPaymentSubmit");
        const message = document.getElementById("manualPaymentMessage");
        submitButton.disabled = true;
        message.textContent = "Processing seat update via Oracle SP_EDIT_TICKET_SEAT...";

        const paymentReference = document.getElementById("manualPaymentReference").value.trim() || `UPI-MOD-${Date.now()}`;
        const { bookingId, oldSeats, newSeats, fee } = pendingSeatModification;

        try {
            if (backendOnline && currentUser) {
                const response = await fetch(`${BACKEND_API}/bookings/${bookingId}/edit-seats`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        oldSeats,
                        newSeats,
                        fee,
                        paymentReference
                    })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Failed to update seats in database.");
            }

            // Synchronize local bookings cache
            const bookings = getBookings();
            const b = bookings.find(item => String(item.id) === String(bookingId));
            if (b) {
                b.seats = [...newSeats];
                b.total = (b.total || 0) + fee;
                const newTypes = {};
                newSeats.forEach((seat, idx) => {
                    const oldKey = oldSeats[idx] || oldSeats[0];
                    newTypes[seat] = (b.ticketTypes && b.ticketTypes[seat]) || (b.ticketTypes && b.ticketTypes[oldKey]) || "adult";
                });
                b.ticketTypes = newTypes;
                saveBookings(bookings);
            }

            pendingSeatModification = null;
            manualPaymentModal.classList.add("hidden");
            closeEditSeatModal();

            // Refresh user bookings list from server
            await renderBookingsList();

            // Generate updated PDF Receipt with new seats & total
            const updatedBooking = (currentLoadedBookings && currentLoadedBookings.find(item => String(item.id) === String(bookingId))) || b;
            if (updatedBooking) {
                generateReceiptPDF(updatedBooking);
            }

            alert(`🎉 Seat(s) updated successfully to [${newSeats.join(", ")}]!\n` +
                  `Modification fee of ${money(fee)} (?40/seat) was recorded and charged to your booking via Oracle Stored Procedure SP_EDIT_TICKET_SEAT.`);
            return;
        } catch (error) {
            message.textContent = "Error: " + error.message;
            submitButton.disabled = false;
            return;
        }
    }

    // 2. Regular New Booking Payment Flow
    if (!pendingManualBooking) return;
    const submitButton = document.getElementById("manualPaymentSubmit");
    const message = document.getElementById("manualPaymentMessage");
    submitButton.disabled = true;
    message.textContent = "Recording your payment report…";
    const payload = {
        ...pendingManualBooking,
        paymentReference: document.getElementById("manualPaymentReference").value.trim()
    };
    try {
        if (!backendOnline || !currentUser) {
            const booking = { ...payload, id: Date.now(), paymentStatus: "USER_REPORTED" };
            saveBookings([...getBookings(), booking]);
            pendingManualBooking = null;
            manualPaymentModal.classList.add("hidden");
            closeBookingModal();
            generateReceiptPDF(booking);
            alert(`Demo booking saved locally for ${money(booking.total)}. Payment has not been verified; keep your UPI receipt.`);
            renderBookingsList();
            refreshRecommendations();
            return;
        }
        const response = await fetch(`${BACKEND_API}/bookings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Booking could not be recorded.");
        const booking = { ...payload, id: result.id, paymentStatus: result.paymentStatus || "USER_REPORTED" };
        saveBookings([...getBookings().filter(item => item.id !== booking.id), booking]);
        pendingManualBooking = null;
        manualPaymentModal.classList.add("hidden");
        closeBookingModal();
        generateReceiptPDF(booking);
        alert(`Payment report recorded for ${money(booking.total)}. The transfer has not been verified by the app; keep your UPI receipt until the cinema confirms it.`);
        renderBookingsList();
        refreshRecommendations();
    } catch (error) {
        message.textContent = error.message;
        submitButton.disabled = false;
    }
}

function closeManualPayment() {
    manualPaymentModal.classList.add("hidden");
    pendingManualBooking = null;
    pendingSeatModification = null;
    document.getElementById("manualPaymentReference").value = "";
}

// ==========================================================================
// 11. My Bookings Rendering
// ==========================================================================
function formatDate(iso) {
    const d = new Date(`${iso}T00:00`);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// The current user's bookings: from the API when signed in and online, else localStorage.
let currentLoadedBookings = [];
let activeEditBooking = null;
let editOriginalSeats = [];
let editSelectedSeats = [];
let pendingSeatModification = null;

// The current user's bookings: from the API when signed in and online, else localStorage.
async function loadBookings() {
    let bookings = getBookings();
    if (backendOnline && currentUser) {
        try {
            const response = await fetch(`${BACKEND_API}/bookings`);
            if (response.ok) {
                bookings = await response.json();
                saveBookings(bookings);
            }
        } catch (error) { console.warn("Using local booking fallback", error); }
    }
    currentLoadedBookings = bookings;
    return bookings;
}

async function renderBookingsList() {
    const bookings = await loadBookings();

    if (bookings.length === 0) {
        bookingsList.innerHTML = `<p class="loading-text">You have no bookings yet.</p>`;
        return;
    }

    bookingsList.innerHTML = bookings.map(b => {
        const seatLabels = b.seats.map(seat => {
            const type = (b.ticketTypes && b.ticketTypes[seat]) || "adult";
            const label = type === "child" ? "Child" : type === "senior" ? "Senior" : "Adult";
            return `${seat} (${label})`;
        }).join(", ");

        const late = getLateInfo(b);
        // Once a show has started, its seats/date can't be edited any more
        const editButton = late.status === "upcoming"
            ? `<button class="btn-edit" onclick="openEditSeatModal(${b.id})">Edit Seats</button>` : "";
        let lateBlock = "";
        if (late.status === "late") {
            lateBlock = b.refundRequestedAt ? "" : `
            <div class="late-banner" role="status">
                <p><strong>Running late?</strong> Your show started ${late.minutesLate} min ago and entry closes in ${late.minutesLeft} min.
                You can switch to the next show or request a refund. Refunds are handled manually.</p>
                <div class="late-banner-actions">
                    <button class="btn-late primary" onclick="openLateModal(${b.id}, 'switch')">Switch to closest show</button>
                    <button class="btn-late" onclick="openLateModal(${b.id}, 'refund')">Request ${money(refundFor(b.total))}</button>
                </div>
            </div>`;
        } else if (late.status === "expired") {
            lateBlock = `<p class="late-expired">This show has started and the late-entry window has closed.</p>`;
        }

        return `
        <div class="booking-card${late.status === "late" ? " is-late" : ""}">
            <div>
                <h3>${esc(b.movieTitle)}</h3>
                <p>${formatDate(b.date)} &middot; ${esc(b.showTime)} &middot; ${esc(b.screenName)}</p>
                <p>${seatLabels}</p>
                <p class="payment-status">${b.paymentStatus === "USER_REPORTED" ? "UPI transfer reported — not verified" : "Payment status: " + esc(b.paymentStatus || "UNVERIFIED")}${b.paymentReference ? ` · UTR: ${esc(b.paymentReference)}` : ""}</p>
                ${b.refundRequestedAt ? `<p class="refund-status">Refund request ${money(b.refundRequestAmount || refundFor(b.total))} is pending manual handling. No money has been sent automatically.</p>` : ""}
            </div>
            <div class="booking-actions">
                <p><strong>₹${b.total.toFixed(2)}</strong></p>
                <button class="btn-edit" onclick="downloadReceipt(${b.id})">Receipt PDF</button>
                ${editButton}
                <button class="btn-cancel" onclick="cancelBooking(${b.id})">Cancel</button>
            </div>
            ${lateBlock}
        </div>`;
    }).join('');
}

function downloadReceipt(bookingId) {
    const booking = (currentLoadedBookings && currentLoadedBookings.find(item => String(item.id) === String(bookingId))) ||
                    getBookings().find(item => String(item.id) === String(bookingId));
    if (booking) generateReceiptPDF(booking);
}

// ==========================================================================
// Seat Modification Flow (?40 / seat modification fee)
// ==========================================================================
async function openEditSeatModal(bookingId) {
    const booking = (currentLoadedBookings && currentLoadedBookings.find(b => String(b.id) === String(bookingId))) ||
                    getBookings().find(b => String(b.id) === String(bookingId));
    if (!booking) {
        alert("Booking not found. Please refresh your bookings.");
        return;
    }

    activeEditBooking = booking;
    editOriginalSeats = [...booking.seats];
    editSelectedSeats = [...booking.seats];

    const editBookingHeader = document.getElementById("editBookingHeader");
    const editScreenLabel = document.getElementById("editScreenLabel");
    const editSeatMessage = document.getElementById("editSeatMessage");
    const editSeatModal = document.getElementById("editSeatModal");

    if (editBookingHeader) {
        editBookingHeader.innerHTML = `
            <h3>${esc(booking.movieTitle)}</h3>
            <p>${formatDate(booking.date)} &middot; ${esc(booking.showTime)} &middot; ${esc(booking.screenName)}</p>
            <div>
                <span class="current-seats-pill">Current Seats: <strong>${booking.seats.join(", ")}</strong> (${booking.seats.length} seat${booking.seats.length > 1 ? "s" : ""})</span>
            </div>
        `;
    }

    if (editScreenLabel) editScreenLabel.innerText = booking.screenName;
    if (editSeatMessage) editSeatMessage.textContent = "";

    // Fetch occupied seats for this show (excluding current booking's seats)
    let occupied = [];
    try {
        occupied = await fetchOccupiedSeats(booking.movieID, booking.showID);
    } catch (e) {
        console.warn("Could not fetch occupied seats:", e);
    }
    const otherOccupied = occupied.filter(s => !editOriginalSeats.includes(s));

    renderEditSeatGrid(otherOccupied);
    updateEditSummary();

    if (editSeatModal) editSeatModal.classList.remove("hidden");
}

function renderEditSeatGrid(otherOccupied) {
    const editSeatGrid = document.getElementById("editSeatGrid");
    if (!editSeatGrid) return;
    editSeatGrid.innerHTML = "";

    SEAT_ROWS.forEach(row => {
        for (let i = 1; i <= SEATS_PER_ROW; i++) {
            const seatCode = `${row}${i}`;
            const seatElem = document.createElement("div");
            seatElem.className = "seat";
            seatElem.innerText = seatCode;
            seatElem.dataset.seat = seatCode;

            const isOccupied = otherOccupied.includes(seatCode);
            const isSelected = editSelectedSeats.includes(seatCode);
            const isOriginal = editOriginalSeats.includes(seatCode);

            if (isOccupied) {
                seatElem.classList.add("occupied");
                seatElem.title = `Seat ${seatCode} is already booked by another guest`;
            } else {
                if (isSelected) {
                    if (isOriginal) {
                        seatElem.classList.add("current");
                        seatElem.title = `Seat ${seatCode} (Your current seat)`;
                    } else {
                        seatElem.classList.add("selected");
                        seatElem.title = `Seat ${seatCode} (New selected seat)`;
                    }
                } else {
                    seatElem.classList.add("available");
                    seatElem.title = `Seat ${seatCode} (Available - ?40 fee if changed)`;
                }

                seatElem.addEventListener("click", () => handleEditSeatClick(seatCode, otherOccupied));
            }

            editSeatGrid.appendChild(seatElem);
        }
    });
}

function handleEditSeatClick(seatCode, otherOccupied) {
    if (otherOccupied.includes(seatCode)) return;

    const maxSeats = editOriginalSeats.length;

    if (editSelectedSeats.includes(seatCode)) {
        if (editSelectedSeats.length > 1) {
            editSelectedSeats = editSelectedSeats.filter(s => s !== seatCode);
        } else {
            editSelectedSeats = [];
        }
    } else {
        if (editSelectedSeats.length < maxSeats) {
            editSelectedSeats.push(seatCode);
        } else {
            // Replace a non-original seat or last seat
            const nonOrigIdx = editSelectedSeats.findIndex(s => !editOriginalSeats.includes(s));
            if (nonOrigIdx !== -1) {
                editSelectedSeats[nonOrigIdx] = seatCode;
            } else {
                editSelectedSeats[editSelectedSeats.length - 1] = seatCode;
            }
        }
    }

    renderEditSeatGrid(otherOccupied);
    updateEditSummary();
}

function updateEditSummary() {
    const editOldSeatsLabel = document.getElementById("editOldSeatsLabel");
    const editNewSeatsLabel = document.getElementById("editNewSeatsLabel");
    const editChangedCountLabel = document.getElementById("editChangedCountLabel");
    const editFeeAmountLabel = document.getElementById("editFeeAmountLabel");
    const btnConfirmEditSeat = document.getElementById("btnConfirmEditSeat");
    const editSeatMessage = document.getElementById("editSeatMessage");

    const requiredSeats = editOriginalSeats.length;
    const currentCount = editSelectedSeats.length;

    const sortedOld = [...editOriginalSeats].sort();
    const sortedNew = [...editSelectedSeats].sort();

    if (editOldSeatsLabel) editOldSeatsLabel.innerText = sortedOld.join(", ");
    if (editNewSeatsLabel) editNewSeatsLabel.innerText = sortedNew.length > 0 ? sortedNew.join(", ") : "None selected";

    const addedSeats = editSelectedSeats.filter(s => !editOriginalSeats.includes(s));
    const changedCount = addedSeats.length;
    const fee = changedCount * 40.0;

    if (editChangedCountLabel) editChangedCountLabel.innerText = `${changedCount} seat${changedCount === 1 ? "" : "s"} changed`;
    if (editFeeAmountLabel) editFeeAmountLabel.innerText = money(fee);

    if (!btnConfirmEditSeat) return;

    if (currentCount !== requiredSeats) {
        btnConfirmEditSeat.disabled = true;
        btnConfirmEditSeat.innerText = `Select ${requiredSeats} Seats (${currentCount}/${requiredSeats})`;
        if (editSeatMessage) editSeatMessage.textContent = `Please select exactly ${requiredSeats} seat${requiredSeats > 1 ? "s" : ""} to proceed.`;
    } else if (changedCount === 0) {
        btnConfirmEditSeat.disabled = true;
        btnConfirmEditSeat.innerText = "No Seats Changed";
        if (editSeatMessage) editSeatMessage.textContent = "Click any available seat above to change your seat (?40 extra fee per modified seat).";
    } else {
        btnConfirmEditSeat.disabled = false;
        btnConfirmEditSeat.innerText = `Pay ${money(fee)} & Confirm New Seats`;
        if (editSeatMessage) editSeatMessage.textContent = `Modification fee: ${money(fee)} (${changedCount} × ?40.00). Click below to pay and confirm.`;
    }
}

function closeEditSeatModal() {
    const editSeatModal = document.getElementById("editSeatModal");
    if (editSeatModal) editSeatModal.classList.add("hidden");
    activeEditBooking = null;
    editOriginalSeats = [];
    editSelectedSeats = [];
    const editSeatMessage = document.getElementById("editSeatMessage");
    if (editSeatMessage) editSeatMessage.textContent = "";
}

function proceedToEditSeatPayment() {
    if (!activeEditBooking) return;
    const addedSeats = editSelectedSeats.filter(s => !editOriginalSeats.includes(s));
    const changedCount = addedSeats.length;
    if (changedCount === 0) return;

    const fee = changedCount * 40.0;
    pendingSeatModification = {
        bookingId: activeEditBooking.id,
        movieTitle: activeEditBooking.movieTitle,
        oldSeats: [...editOriginalSeats],
        newSeats: [...editSelectedSeats],
        changedCount: changedCount,
        fee: fee
    };

    const amountElement = document.getElementById("manualPaymentAmount");
    const upiIdElement = document.getElementById("manualPaymentUpiId");
    const qrImage = document.getElementById("manualPaymentQr");
    const payLink = document.getElementById("manualPaymentLink");
    const message = document.getElementById("manualPaymentMessage");
    const submitButton = document.getElementById("manualPaymentSubmit");
    const reference = document.getElementById("manualPaymentReference");

    const manualPaymentTitle = document.getElementById("manualPaymentTitle");
    if (manualPaymentTitle) manualPaymentTitle.innerText = "Pay Seat Change Fee";

    if (amountElement) amountElement.textContent = money(fee);
    if (reference) reference.value = "";
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerText = `I've paid ${money(fee)} — confirm seat change`;
    }

    const params = new URLSearchParams({
        pa: DEMO_UPI_ID,
        pn: DEMO_UPI_PAYEE,
        am: fee.toFixed(2),
        cu: "INR",
        tn: `Seat change fee for Booking #${activeEditBooking.id}`
    });

    if (upiIdElement) upiIdElement.textContent = DEMO_UPI_ID;
    if (qrImage) qrImage.src = "assets/payment-qr.png";
    if (payLink) {
        payLink.href = `upi://pay?${params.toString()}`;
        payLink.classList.remove("hidden");
    }
    if (message) {
        message.textContent = `Pay ${money(fee)} (?40 × ${changedCount} seat${changedCount > 1 ? "s" : ""}) to change your seats to [${editSelectedSeats.join(", ")}]. Database will atomically update seats via SP_EDIT_TICKET_SEAT.`;
    }

    manualPaymentModal.classList.remove("hidden");
}

function editBooking(bookingId) {
    openEditSeatModal(bookingId);
}

async function cancelBooking(bookingId) {
    if (!confirm("Cancel this booking? Any payment or refund must be handled manually; the app will not move money.")) return;
    if (backendOnline && currentUser) {
        await fetch(`${BACKEND_API}/bookings/${bookingId}`, { method: "DELETE" });
    }
    const bookings = getBookings().filter(b => b.id !== bookingId);
    saveBookings(bookings);
    renderBookingsList();
    refreshRecommendations();
}

// ==========================================================================
// 12. Running Late: switch to the closest show, or take a refund
// ---------------------------------------------------------------------
// Flow: a booking is "late" from its show's start time until
// LATE_POLICY.windowMinutes later. While late, the person is prompted
// (automatically, and via buttons on the booking card) to either
//   - SWITCH to the closest upcoming show of the same movie that still has
//     enough free seats (same number of seats and ticket types; the original
//     seat labels are kept where they're free), or
//   - get a REFUND of LATE_POLICY.refundPercent of what they paid.
// With the backend online the server re-checks everything (it is the source of
// truth for the clock and for seat availability); offline, the same rules are
// applied to the localStorage bookings so the demo still works.
// ==========================================================================
const LATE_PROMPTED_KEY = "lateBookingsPrompted";
let lateFlow = null;               // state of the open late-arrival dialog
let lastBookingsSignature = "";

function pad2(n) { return String(n).padStart(2, "0"); }

// "YYYY-MM-DD" in the browser's LOCAL time zone
function toLocalISO(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function esc(value) {
    return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function money(amount) { return `₹${Number(amount).toFixed(2)}`; }
function round2(n) { return Math.round(n * 100) / 100; }
function refundFor(total) { return Math.round(total * LATE_POLICY.refundPercent) / 100; }

// ("2026-10-20", "1:30 PM") -> Date in local time
function parseShowStart(dateStr, timeStr) {
    const [time, period] = timeStr.split(" ");
    let [h, m] = time.split(":").map(Number);
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day, h, m);
}

// status: "upcoming" (not started) | "late" (started, entry still open) | "expired"
function getLateInfo(booking, at = new Date()) {
    const sinceStart = at - parseShowStart(booking.date, booking.showTime);
    const windowMs = LATE_POLICY.windowMinutes * 60000;
    if (sinceStart < 0) return { status: "upcoming" };
    if (sinceStart <= windowMs) {
        return {
            status: "late",
            minutesLate: Math.floor(sinceStart / 60000),
            minutesLeft: Math.max(0, Math.ceil((windowMs - sinceStart) / 60000))
        };
    }
    return { status: "expired" };
}

async function loadLatePolicy() {
    if (!backendOnline) return;
    try {
        const response = await fetch(`${BACKEND_API}/late-policy`);
        if (!response.ok) return;
        const policy = await response.json();
        if (Number.isFinite(policy.windowMinutes)) LATE_POLICY.windowMinutes = policy.windowMinutes;
        if (Number.isFinite(policy.refundPercent)) LATE_POLICY.refundPercent = policy.refundPercent;
    } catch (error) { console.warn("Using default late-arrival policy", error); }
}

// Seats already taken for a show: from the server when online, else local bookings
async function fetchOccupiedSeats(movieID, showID) {
    if (backendOnline) {
        try {
            const response = await fetch(`${BACKEND_API}/showtimes/${movieID}/${showID}/occupied`);
            if (response.ok) return await response.json();
        } catch (error) { console.warn("Using local seat data", error); }
    }
    return getOccupiedSeats(movieID, showID);
}

// Pick seats in another show for the same party: keep each original seat label
// if it's free there, otherwise take the nearest free seat (same row first).
// Returns an array aligned with `originalSeats`.
function assignSeats(originalSeats, occupied) {
    const taken = new Set(occupied);
    const used = new Set();
    const result = originalSeats.map(seat => {
        if (taken.has(seat)) return null;
        used.add(seat);
        return seat;
    });
    const spare = [];
    SEAT_ROWS.forEach((row, r) => {
        for (let n = 1; n <= SEATS_PER_ROW; n++) {
            const seat = `${row}${n}`;
            if (!taken.has(seat) && !used.has(seat)) spare.push({ seat, r, n });
        }
    });
    return result.map((seat, i) => {
        if (seat) return seat;
        const wantRow = SEAT_ROWS.indexOf(originalSeats[i][0]);
        const wantNum = Number(originalSeats[i].slice(1));
        let best = 0;
        spare.forEach((candidate, k) => {
            const score = Math.abs(candidate.r - wantRow) * 100 + Math.abs(candidate.n - wantNum);
            if (score < Math.abs(spare[best].r - wantRow) * 100 + Math.abs(spare[best].n - wantNum)) best = k;
        });
        return spare.splice(best, 1)[0].seat;
    });
}

// Upcoming shows of the same movie (today and tomorrow) that still have room
// for the whole party, soonest first.
async function findSwitchOptions(booking, limit = 4) {
    const now = new Date();
    const today = toLocalISO(now);
    const tomorrow = toLocalISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const options = [];

    for (const date of [today, tomorrow]) {
        for (const show of await fetchShowtimesForDate(booking.movieID, date)) {
            const start = parseShowStart(date, show.showTime);
            if (start <= now || show.showID === booking.showID) continue;

            const occupied = await fetchOccupiedSeats(booking.movieID, show.showID);
            if (SEAT_ROWS.length * SEATS_PER_ROW - occupied.length < booking.seats.length) continue;

            const seats = assignSeats(booking.seats, occupied);
            const types = {};
            booking.seats.forEach((oldSeat, i) => { types[seats[i]] = booking.ticketTypes[oldSeat] || "adult"; });
            const total = round2(seats.reduce((sum, seat) => sum + show.price * (1 - (DISCOUNTS[types[seat]] || 0)), 0));
            options.push({
                ...show, date, start, seats, ticketTypes: types, total,
                difference: round2(total - booking.total)   // > 0 pay extra, < 0 get the difference back
            });
        }
    }
    options.sort((a, b) => a.start - b.start);
    return options.slice(0, limit);
}

function dayLabel(iso) {
    const today = new Date();
    if (iso === toLocalISO(today)) return "Today";
    if (iso === toLocalISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))) return "Tomorrow";
    return formatDate(iso);
}

// ---- Automatic prompt ----------------------------------------------------
function getPrompted() {
    try { return JSON.parse(sessionStorage.getItem(LATE_PROMPTED_KEY) || "[]"); } catch (e) { return []; }
}
function markPrompted(booking) {
    try { sessionStorage.setItem(LATE_PROMPTED_KEY, JSON.stringify([...getPrompted(), `${booking.id}:${booking.showID}`])); } catch (e) { /* storage unavailable: prompt may repeat, which is harmless */ }
}

// Looks for bookings whose show has started. Re-renders the bookings page when
// a status changes and, once per booking per browser session, opens the
// dialog by itself (unless the person is in the middle of something else).
async function checkLateBookings() {
    const bookings = await loadBookings();
    const infos = bookings.map(b => ({ booking: b, info: getLateInfo(b) }));

    const signature = infos.map(({ booking, info }) => `${booking.id}:${info.status}:${info.minutesLeft ?? ""}`).join("|");
    if (signature !== lastBookingsSignature) {
        lastBookingsSignature = signature;
        if (!bookingsPage.classList.contains("hidden")) renderBookingsList();
    }

    const busy = [bookingModal, signInModal, profileModal, lateModal].some(m => !m.classList.contains("hidden"));
    if (busy) return;
    const prompted = getPrompted();
    const next = infos.find(({ booking, info }) => info.status === "late" && !prompted.includes(`${booking.id}:${booking.showID}`));
    if (next) {
        markPrompted(next.booking);
        openLateModal(next.booking.id);
    }
}

// ---- Dialog ----------------------------------------------------------------
async function openLateModal(bookingId, startView = "choose") {
    const booking = (await loadBookings()).find(b => b.id === bookingId);
    if (!booking) return;

    const flow = { booking, view: "choose", options: null, selected: 0, error: "", busy: false, result: null };
    lateFlow = flow;
    lateModal.classList.remove("hidden");
    renderLateModal();

    flow.options = await findSwitchOptions(booking);
    if (lateFlow !== flow) return; // closed or replaced while we were looking
    if (startView === "switch" && flow.options.length) flow.view = "switch";
    if (startView === "refund") flow.view = "refund";
    renderLateModal();
}

function closeLateModal() {
    lateFlow = null;
    lateModal.classList.add("hidden");
    lateBody.innerHTML = "";
}

function lateGo(view) {
    if (!lateFlow) return;
    lateFlow.view = view;
    lateFlow.error = "";
    renderLateModal();
}

function selectLateOption(index) {
    if (!lateFlow) return;
    lateFlow.selected = index;
    renderLateModal();
}

function priceNote(difference) {
    if (difference > 0) return `Pay ${money(difference)} more`;
    if (difference < 0) return `${money(-difference)} refunded`;
    return "Same price";
}

function renderLateModal() {
    if (!lateFlow) return;
    const { booking, view, options, selected, error, busy, result } = lateFlow;
    const late = getLateInfo(booking);
    const refund = refundFor(booking.total);
    const errorHTML = error ? `<p class="account-message error" role="alert">${esc(error)}</p>` : "";
    const summary = `
        <div class="late-summary">
            <h3>${esc(booking.movieTitle)}</h3>
            <p>${dayLabel(booking.date)} &middot; ${esc(booking.showTime)} &middot; ${esc(booking.screenName)}</p>
            <p>Seats ${booking.seats.map(esc).join(", ")} &middot; ${money(booking.total)}</p>
        </div>`;
    let html = "";

    if (view === "done") {
        html = `
            <h2 id="lateTitle">${esc(result.title)}</h2>
            <p class="late-lead">${esc(result.message)}</p>
            <div class="late-actions">
                ${result.receipt ? `<button class="btn-late" onclick="downloadLateReceipt()">Download updated receipt</button>` : ""}
                <button class="btn-late primary" onclick="closeLateModal()">Done</button>
            </div>`;
    } else if (view === "switch") {
        html = `
            <h2 id="lateTitle">Switch to another show</h2>
            ${summary}
            <p class="late-lead">Pick a new show. You keep the same number of seats and ticket types.</p>
            <div class="late-options" role="radiogroup" aria-label="Available shows">
                ${options.map((o, i) => `
                    <button type="button" class="late-option${i === selected ? " active" : ""}" role="radio" aria-checked="${i === selected}" onclick="selectLateOption(${i})">
                        <span class="late-option-main">
                            <strong>${dayLabel(o.date)}, ${esc(o.showTime)}${i === 0 ? ` <span class="late-badge">Closest</span>` : ""}</strong>
                            <small>${esc(o.screenName)} &middot; Seats ${o.seats.join(", ")}</small>
                        </span>
                        <span class="late-option-price">${money(o.total)}<small>${priceNote(o.difference)}</small></span>
                    </button>`).join("")}
            </div>
            ${errorHTML}
            <div class="late-actions">
                <button class="btn-late" onclick="lateGo('choose')" ${busy ? "disabled" : ""}>Back</button>
                <button class="btn-late primary" onclick="confirmLateSwitch()" ${busy ? "disabled" : ""}>${busy ? "Switching…" : "Confirm switch"}</button>
            </div>`;
    } else if (view === "refund") {
        html = `
            <h2 id="lateTitle">Refund this booking?</h2>
            ${summary}
            <p class="late-lead">You'll get <strong>${money(refund)}</strong> back (${LATE_POLICY.refundPercent}% of ${money(booking.total)}). The booking is cancelled and your seats are released. This can't be undone.</p>
            ${errorHTML}
            <div class="late-actions">
                <button class="btn-late" onclick="lateGo('choose')" ${busy ? "disabled" : ""}>Back</button>
                <button class="btn-late danger" onclick="confirmLateRefund()" ${busy ? "disabled" : ""}>${busy ? "Processing…" : `Refund ${money(refund)}`}</button>
            </div>`;
    } else { // "choose"
        const expired = late.status !== "late";
        const lead = late.status === "late"
            ? `Your show started ${late.minutesLate} min ago and entry closes in ${late.minutesLeft} min. What would you like to do?`
            : late.status === "upcoming" ? "This show hasn't started yet." : "The late-entry window for this show has closed.";
        let switchCard;
        if (options === null) {
            switchCard = `<div class="late-choice disabled"><strong>Switch to the closest show</strong><span>Checking other shows…</span></div>`;
        } else if (options.length === 0) {
            switchCard = `<div class="late-choice disabled"><strong>Switch to the closest show</strong><span>No other upcoming shows have enough free seats.</span></div>`;
        } else {
            const o = options[0];
            switchCard = `<button type="button" class="late-choice" onclick="lateGo('switch')" ${expired ? "disabled" : ""}>
                <strong>Switch to the closest show</strong>
                <span>${dayLabel(o.date)}, ${esc(o.showTime)} &middot; ${esc(o.screenName)}</span>
                <small>${priceNote(o.difference)}${options.length > 1 ? ` &middot; ${options.length - 1} more show${options.length > 2 ? "s" : ""} to choose from` : ""}</small>
            </button>`;
        }
        html = `
            <h2 id="lateTitle">Running late?</h2>
            ${summary}
            <p class="late-lead">${lead}</p>
            <div class="late-choices">
                ${switchCard}
                <button type="button" class="late-choice" onclick="lateGo('refund')" ${expired ? "disabled" : ""}>
                    <strong>Request a refund</strong>
                    <span>Request ${money(refund)} (${LATE_POLICY.refundPercent}% of ${money(booking.total)})</span>
                    <small>Recorded for manual handling; no payment is sent automatically</small>
                </button>
            </div>
            ${errorHTML}
            <div class="late-actions"><button class="btn-late" onclick="closeLateModal()">Not now</button></div>`;
    }
    lateBody.innerHTML = html;
}

// ---- Actions -----------------------------------------------------------------
// Shared pre-flight for both actions: the window may have closed while the dialog was open
function lateStillOpen() {
    if (getLateInfo(lateFlow.booking).status === "late") return true;
    lateFlow.error = "The late-entry window for this show has just closed, so this can no longer be changed.";
    lateFlow.view = "choose";
    renderLateModal();
    renderBookingsList();
    return false;
}

async function confirmLateRefund() {
    if (!lateFlow || lateFlow.busy || !lateStillOpen()) return;
    const flow = lateFlow;
    const { booking } = flow;
    flow.busy = true; flow.error = ""; renderLateModal();

    let amount = refundFor(booking.total);
    try {
        if (backendOnline && currentUser) {
            const response = await fetch(`${BACKEND_API}/bookings/${booking.id}/late-refund`, { method: "POST" });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Refund failed");
            amount = result.refundAmount;
        }
    } catch (error) {
        flow.busy = false; flow.error = error.message;
        if (lateFlow === flow) renderLateModal();
        return;
    }

    const updated = getBookings().map(item => item.id === booking.id
        ? { ...item, refundRequestedAt: new Date().toISOString(), refundRequestAmount: amount }
        : item);
    saveBookings(updated);
    flow.busy = false;
    flow.view = "done";
    flow.result = {
        title: "Refund request recorded",
        message: `Your request for ${money(amount)} has been recorded for ${booking.movieTitle}. The app does not send money or notify the owner automatically; contact the cinema to arrange the refund. Your booking remains active until it is handled manually.`
    };
    renderLateModal();
    renderBookingsList();
}

async function confirmLateSwitch() {
    if (!lateFlow || lateFlow.busy || !lateStillOpen()) return;
    const flow = lateFlow;
    const { booking } = flow;
    const option = flow.options[flow.selected];
    if (!option) return;
    flow.busy = true; flow.error = ""; renderLateModal();

    const update = {
        date: option.date, showID: option.showID, showTime: option.showTime, screenName: option.screenName,
        seats: option.seats, ticketTypes: option.ticketTypes, total: option.total
    };
    try {
        if (backendOnline && currentUser) {
            const response = await fetch(`${BACKEND_API}/bookings/${booking.id}/late-switch`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Switch failed");
        } else if (getOccupiedSeats(booking.movieID, option.showID).some(seat => option.seats.includes(seat))) {
            throw new Error("One or more of those seats were just taken. Please pick again.");
        }
    } catch (error) {
        flow.busy = false; flow.error = error.message;
        // Seats may have changed under us: refresh the list so the next try is accurate
        flow.options = await findSwitchOptions(booking);
        flow.selected = 0;
        if (flow.options.length === 0) flow.view = "choose";
        if (lateFlow === flow) renderLateModal();
        return;
    }

    const updated = { ...booking, ...update };
    saveBookings(getBookings().map(b => (b.id === booking.id ? updated : b)));
    flow.busy = false;
    flow.view = "done";
    flow.booking = updated;
    flow.result = {
        title: "Show switched",
        message: `You're now booked for ${dayLabel(option.date)} at ${option.showTime} (${option.screenName}), seats ${option.seats.join(", ")}. ${option.difference > 0 ? `Extra amount due: ${money(option.difference)}. Pay and verify it with the cinema manually; the app has not charged you.` : option.difference < 0 ? `${money(-option.difference)} is due back as a manual refund request; the app has not sent any money.` : "There's no price difference."}`,
        receipt: true
    };
    renderLateModal();
    renderBookingsList();
}

function downloadLateReceipt() {
    if (lateFlow && lateFlow.booking) generateReceiptPDF(lateFlow.booking);
}
