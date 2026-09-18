// ==========================================================================
// 1. Configuration & Global State
// ==========================================================================

// Switch API_URL to "http://localhost:5000/api/movies" when backend goes live
const API_URL = "./mock-movies.json";
const BACKEND_API = "/api";
let backendOnline = false;

let allMovies = [];
let selectedMovie = null;
let selectedDate = null;       // "YYYY-MM-DD"
let selectedShowtime = null;   // { showID, price, date, screenName, showTime }
let selectedSeats = [];        // array of seat codes, e.g. ["A2", "A3"]
let ticketTypes = {};          // seat code -> "adult" | "child" | "senior"
let editingBookingId = null;   // set when editing an existing booking instead of creating a new one
let currentUser = JSON.parse(localStorage.getItem("cinemaUser") || "null");
let currentTheme = localStorage.getItem("cinemaTheme") || "light";

// Discount applied per ticket type. Adjust these percentages any time.
const DISCOUNTS = {
    adult: 0,
    child: 0.20,   // 12 & under
    senior: 0.15   // 60 & over
};

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

const moviesPage = document.getElementById("moviesPage");
const bookingsPage = document.getElementById("my-bookings");
const bookingsList = document.getElementById("bookingsList");
const navMovies = document.getElementById("navMovies");
const navBookings = document.getElementById("navBookings");
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
        const iso = d.toISOString().split("T")[0];

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
    return getShowtimesForMovie(movieID, dateStr).find(s => s.showID === showID);
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
});

async function fetchMovies() {
    try {
        let response = await fetch(`${BACKEND_API}/movies`);
        if (!response.ok) throw new Error("Backend unavailable");
        allMovies = await response.json();
        backendOnline = true;
    } catch (backendError) {
        backendOnline = false;
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("Failed to load movie catalog.");
        allMovies = await response.json();
    }
    try {
        renderLanguageFilterOptions();
        renderTypeFilterOptions();
        renderMovieCards(allMovies);
        renderMovieRow(document.getElementById("popularGrid"), getPopularMovies(allMovies), "No movies yet.");
        refreshRecommendations();
        startAutoScroll();
    } catch (error) {
        console.error("Error loading movies:", error);
        movieGrid.innerHTML = `<p class="loading-text">Unable to load movies. Please check connection.</p>`;
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
    return `
        <div class="movie-card" onclick="openBookingModal(${movie.movieID})">
            <div class="poster-wrap">
                <img class="movie-poster" src="${movie.poster}" alt="${movie.title} poster">
                <span class="rating-badge">&#9733; ${movie.rating}&nbsp;&nbsp;${movie.votes} Votes</span>
            </div>
            <div class="movie-card-body">
                <h3>${movie.title}</h3>
        <p class="movie-genre">${movie.language} &bull; ${movie.movieType.replace(/_/g, " / ")}</p>
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

function refreshRecommendations() {
    renderMovieRow(document.getElementById("recommendedGrid"), getRecommendedMovies(allMovies), "No recommendations yet.");
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
        const password = String(formData.get("password") || "");

        if (name.length < 2 || !email.includes("@") || password.length < 6) {
            signInMessage.textContent = "Please enter a valid name, email, and password of at least 6 characters.";
            signInMessage.className = "account-message error";
            return;
        }

        if (backendOnline) {
            try {
                const response = await fetch(`${BACKEND_API}/auth/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password }) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Sign-in failed");
                currentUser = { ...result, dob: "", gender: "", countryCode: "", areaCode: "", phoneNumber: "", country: "", state: "", city: "", postalCode: "", genre: "" };
            } catch (error) {
                signInMessage.textContent = error.message;
                signInMessage.className = "account-message error";
                return;
            }
        } else {
            const username = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "moviegoer";
            currentUser = { username, name, email, dob: "", gender: "", countryCode: "", areaCode: "", phoneNumber: "", country: "", state: "", city: "", postalCode: "", genre: "" };
        }
        localStorage.setItem("cinemaUser", JSON.stringify(currentUser));
        signInForm.reset();
        signInMessage.textContent = "Signed in successfully.";
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
        profileMessage.textContent = newPassword ? "Profile saved. Password change is ready for backend verification." : "Profile saved.";
        profileMessage.className = "account-message success";
    });

    signOutBtn.addEventListener("click", () => {
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

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (!bookingModal.classList.contains("hidden")) closeBookingModal();
        if (!signInModal.classList.contains("hidden") || !profileModal.classList.contains("hidden")) closeAccountModals();
    });

    bookingModal.addEventListener("click", (e) => {
        if (e.target === bookingModal) closeBookingModal();
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
// 5. Page Switching (Movies / My Bookings)
// ==========================================================================
function showPage(page) {
    if (page === "movies") {
        moviesPage.classList.remove("hidden");
        bookingsPage.classList.add("hidden");
        navMovies.classList.add("active");
        navBookings.classList.remove("active");
        startAutoScroll();
    } else {
        moviesPage.classList.add("hidden");
        bookingsPage.classList.remove("hidden");
        navMovies.classList.remove("active");
        navBookings.classList.add("active");
        stopAutoScroll();
        renderBookingsList();
    }
}

// ==========================================================================
// 6. Booking Modal, Date Picker & Showtime Logic
// ==========================================================================
function openBookingModal(movieID) {
    selectedMovie = allMovies.find(m => m.movieID === movieID);
    if (!selectedMovie) return;

    stopAutoScroll();
    editingBookingId = null;
    modalMovieTitle.innerText = `Book Tickets: ${selectedMovie.title}`;

    selectedShowtime = null;
    selectedSeats = [];
    ticketTypes = {};
    updateSummary();

    seatGrid.innerHTML = "";
    ticketTypesWrap.innerHTML = "";
    screenLabel.innerText = "Screen";

    renderDateSelector();

    // Auto-select the first date (Today) so showtimes appear immediately
    const firstDateBtn = dateList.querySelector(".date-btn");
    if (firstDateBtn) firstDateBtn.click();

    bookingModal.classList.remove("hidden");
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
    seatGrid.innerHTML = "";
    ticketTypesWrap.innerHTML = "";
    screenLabel.innerText = "Screen";

    renderShowtimes();
    updateSummary();
}

function renderShowtimes() {
    const shows = getShowtimesForMovie(selectedMovie.movieID, selectedDate);
    showtimeList.innerHTML = shows.map(show => `
        <button class="time-btn" data-showid="${show.showID}" onclick="selectShowtime(this, '${show.showID}')">
            ${show.showTime} (${show.screenName}) - ₹${show.price.toFixed(2)}
        </button>
    `).join('');
}

function selectShowtime(buttonElem, showID) {
    document.querySelectorAll(".time-btn").forEach(btn => btn.classList.remove("active"));
    buttonElem.classList.add("active");

    const show = findShowtime(selectedMovie.movieID, selectedDate, showID);
    selectedShowtime = { ...show, date: selectedDate };
    screenLabel.innerText = show.screenName;

    selectedSeats = [];
    ticketTypes = {};
    renderSeatGrid();
    renderTicketTypes();
    updateSummary();
}

// ==========================================================================
// 7. Interactive Seat Map Generator (multi-select)
// ==========================================================================
function renderSeatGrid() {
    seatGrid.innerHTML = "";
    const rows = ["A", "B", "C", "D", "E"];
    const seatsPerRow = 8;

    // Seats already booked for THIS movie + THIS date + THIS showtime,
    // pulled from saved bookings instead of a hardcoded list
    const occupiedSeats = getOccupiedSeats(selectedMovie.movieID, selectedShowtime.showID, editingBookingId);

    rows.forEach(row => {
        for (let i = 1; i <= seatsPerRow; i++) {
            const seatNo = `${row}${i}`;
            const isOccupied = occupiedSeats.includes(seatNo);
            const isSelected = selectedSeats.includes(seatNo);

            const seatElem = document.createElement("div");
            seatElem.classList.add("seat");
            seatElem.innerText = seatNo;

            if (isOccupied) {
                seatElem.classList.add("occupied");
            } else {
                seatElem.classList.add(isSelected ? "selected" : "available");
                seatElem.onclick = () => toggleSeatSelection(seatElem, seatNo);
            }

            seatGrid.appendChild(seatElem);
        }
    });
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
        .filter(b => b.movieID === movieID && b.showID === showID && b.id !== excludeBookingId)
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
    doc.text(`Total Paid: INR ${Number(booking.total).toFixed(2)}`, 20, y);
    doc.setFont(undefined, "normal");
    y += 18;
    doc.setFontSize(9);
    doc.setTextColor(117, 111, 101);
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

    // Payload ready to be consumed by MySQL Stored Procedure CreateBookingWithTicket
    const bookingPayload = {
        id: editingBookingId || Date.now(), // reuse the id when editing, otherwise create a new one
        userID: 1, // Simulated logged-in session ID
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

    console.log("Submitting Booking Payload to API:", bookingPayload);

    if (backendOnline && currentUser) {
        try {
            const response = await fetch(`${BACKEND_API}/bookings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bookingPayload) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Booking failed");
            bookingPayload.id = result.id;
        } catch (error) {
            alert(error.message);
            return;
        }
    }
    let bookings = getBookings();
    if (editingBookingId) {
        bookings = bookings.filter(b => b.id !== editingBookingId);
    }
    bookings.push(bookingPayload);
    saveBookings(bookings);
    generateReceiptPDF(bookingPayload);

    alert(`Booking Successful!\n\nMovie: ${selectedMovie.title}\nDate: ${selectedShowtime.date}\nTime: ${selectedShowtime.showTime}\nSeats: ${selectedSeats.join(", ")}\nTotal: ₹${total.toFixed(2)}`);

    closeBookingModal();
    renderBookingsList();
    refreshRecommendations();
}

// ==========================================================================
// 11. My Bookings Rendering
// ==========================================================================
function formatDate(iso) {
    const d = new Date(`${iso}T00:00`);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

async function renderBookingsList() {
    let bookings = getBookings();
    if (backendOnline && currentUser) {
        try {
            const response = await fetch(`${BACKEND_API}/bookings`);
            if (response.ok) bookings = await response.json();
        } catch (error) { console.warn("Using local booking fallback", error); }
    }

    if (bookings.length === 0) {
        bookingsList.innerHTML = `<p class="loading-text">You have no bookings yet.</p>`;
        return;
    }

    bookingsList.innerHTML = bookings.map(b => {
        const seatLabels = b.seats.map(seat => {
            const type = b.ticketTypes[seat] || "adult";
            const label = type === "child" ? "Child" : type === "senior" ? "Senior" : "Adult";
            return `${seat} (${label})`;
        }).join(", ");

        return `
        <div class="booking-card">
            <div>
                <h3>${b.movieTitle}</h3>
                <p>${formatDate(b.date)} &middot; ${b.showTime} &middot; ${b.screenName}</p>
                <p>${seatLabels}</p>
            </div>
            <div class="booking-actions">
                <p><strong>₹${b.total.toFixed(2)}</strong></p>
                <button class="btn-edit" onclick="downloadReceipt(${b.id})">Receipt PDF</button>
                <button class="btn-edit" onclick="editBooking(${b.id})">Edit</button>
                <button class="btn-cancel" onclick="cancelBooking(${b.id})">Cancel</button>
            </div>
        </div>`;
    }).join('');
}

function downloadReceipt(bookingId) {
    const booking = getBookings().find(item => item.id === bookingId);
    if (booking) generateReceiptPDF(booking);
}

// Re-opens the booking modal for an existing booking so the person can pick
// different seats or change ticket types. confirmBooking() overwrites the
// original booking instead of creating a duplicate because editingBookingId
// is set below. The date/showtime themselves can't be changed here - cancel
// and rebook if you need a different day or time.
function editBooking(bookingId) {
    const booking = getBookings().find(b => b.id === bookingId);
    if (!booking) return;

    selectedMovie = allMovies.find(m => m.movieID === booking.movieID);
    if (!selectedMovie) return;

    editingBookingId = bookingId;
    modalMovieTitle.innerText = `Edit Booking: ${selectedMovie.title}`;

    renderDateSelector();
    const dateBtn = [...dateList.querySelectorAll(".date-btn")].find(btn => btn.dataset.date === booking.date);
    if (dateBtn) dateBtn.classList.add("active");
    selectedDate = booking.date;

    renderShowtimes();
    const show = findShowtime(booking.movieID, booking.date, booking.showID);
    selectedShowtime = { ...show, date: booking.date };
    screenLabel.innerText = show.screenName;

    const showtimeBtn = [...showtimeList.querySelectorAll(".time-btn")].find(btn => btn.dataset.showid === booking.showID);
    if (showtimeBtn) showtimeBtn.classList.add("active");

    selectedSeats = [...booking.seats];
    ticketTypes = { ...booking.ticketTypes };

    renderSeatGrid();
    renderTicketTypes();
    updateSummary();

    bookingModal.classList.remove("hidden");
}

async function cancelBooking(bookingId) {
    if (!confirm("Cancel this booking?")) return;
    if (backendOnline && currentUser) {
        await fetch(`${BACKEND_API}/bookings/${bookingId}`, { method: "DELETE" });
    }
    const bookings = getBookings().filter(b => b.id !== bookingId);
    saveBookings(bookings);
    renderBookingsList();
    refreshRecommendations();
}
