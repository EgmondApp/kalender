const ADMIN_STORAGE_KEYS = {
  bookings: "egmond_bookings_v2",
  requests: "egmond_requests_v2",
  session: "egmond_admin_session_v2"
};

const ADMIN_PASSWORD = "FiegePils";

const loginPanel = document.getElementById("adminLoginPanel");
const dashboardPanel = document.getElementById("dashboardPanel");
const loginForm = document.getElementById("adminLoginForm");
const loginError = document.getElementById("adminLoginError");
const statGrid = document.getElementById("statGrid");
const adminCalendarPreview = document.getElementById("adminCalendarPreview");
const bookingList = document.getElementById("bookingList");
const requestList = document.getElementById("requestList");

function getBookings() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_STORAGE_KEYS.bookings) || "[]");
  } catch {
    return [];
  }
}
function setBookings(bookings) {
  localStorage.setItem(ADMIN_STORAGE_KEYS.bookings, JSON.stringify(bookings));
}
function getRequests() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_STORAGE_KEYS.requests) || "[]");
  } catch {
    return [];
  }
}
function setRequests(requests) {
  localStorage.setItem(ADMIN_STORAGE_KEYS.requests, JSON.stringify(requests));
}
function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
function formatDate(iso) {
  return parseISO(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function diffNights(startIso, endIso) {
  return Math.round((parseISO(endIso) - parseISO(startIso)) / 86400000);
}
function isLoggedIn() {
  return localStorage.getItem(ADMIN_STORAGE_KEYS.session) === "active";
}
function setLoggedIn(value) {
  if (value) localStorage.setItem(ADMIN_STORAGE_KEYS.session, "active");
  else localStorage.removeItem(ADMIN_STORAGE_KEYS.session);
}
function showDashboard() {
  loginPanel.classList.add("hidden");
  dashboardPanel.classList.remove("hidden");
  renderStats();
  renderCalendarPreview();
  renderBookingList();
  renderRequestList();
}
function showLogin() {
  loginPanel.classList.remove("hidden");
  dashboardPanel.classList.add("hidden");
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = document.getElementById("adminPassword").value;
  if (value !== ADMIN_PASSWORD) {
    loginError.textContent = "Falsches Passwort.";
    loginError.classList.remove("hidden");
    return;
  }
  loginError.classList.add("hidden");
  setLoggedIn(true);
  showDashboard();
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  setLoggedIn(false);
  showLogin();
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((el) => el.classList.remove("is-active"));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.add("hidden"));
    btn.classList.add("is-active");
    document.querySelector(`[data-panel="${btn.dataset.tab}"]`).classList.remove("hidden");
  });
});

function renderStats() {
  const bookings = getBookings();
  const requests = getRequests();
  const openRequests = requests.filter((r) => r.status !== "archiviert").length;
  const currentMonth = new Date().getMonth();
  const monthBookings = bookings.filter((b) => parseISO(b.start).getMonth() === currentMonth).length;

  const stats = [
    { label: "Buchungen gesamt", value: bookings.length },
    { label: "Anfragen offen", value: openRequests },
    { label: "Start diesen Monat", value: monthBookings },
    { label: "Nächste Anreise", value: nextArrivalLabel(bookings) }
  ];

  statGrid.innerHTML = "";
  stats.forEach((stat) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    card.innerHTML = `<div class="stat-label">${stat.label}</div><div class="stat-value">${stat.value}</div>`;
    statGrid.appendChild(card);
  });
}

function nextArrivalLabel(bookings) {
  const today = new Date();
  const future = bookings
    .filter((b) => parseISO(b.start) >= new Date(today.getFullYear(), today.getMonth(), today.getDate()))
    .sort((a, b) => parseISO(a.start) - parseISO(b.start))[0];
  return future ? formatDate(future.start).slice(0, 5) : "–";
}

function buildAvailability(bookings) {
  const map = new Map();
  const ensure = (iso) => {
    if (!map.has(iso)) map.set(iso, { booked: false, halfStart: false, halfEnd: false });
    return map.get(iso);
  };
  bookings.forEach((booking) => {
    const start = parseISO(booking.start);
    const end = parseISO(booking.end);
    const lastNight = addDays(end, -1);
    if (booking.type === "arrival-departure") {
      ensure(formatISO(start)).halfStart = true;
      ensure(formatISO(lastNight)).halfEnd = true;
    }
    let cursor = new Date(start);
    while (cursor < end) {
      const iso = formatISO(cursor);
      const state = ensure(iso);
      if (booking.type === "full") {
        state.booked = true;
      } else if (iso !== formatISO(start) && iso !== formatISO(lastNight)) {
        state.booked = true;
      }
      cursor = addDays(cursor, 1);
    }
  });
  return map;
}

function dayStateFor(map, iso) {
  const entry = map.get(iso);
  if (!entry) return "free";
  if (entry.booked) return "booked";
  if (entry.halfStart) return "half-start";
  if (entry.halfEnd) return "half-end";
  return "free";
}

function renderCalendarPreview() {
  adminCalendarPreview.innerHTML = "";
  const bookings = getBookings();
  const availability = buildAvailability(bookings);
  const today = new Date();

  [0, 1].forEach((offset) => {
    const monthDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const firstWeekday = (monthDate.getDay() + 6) % 7;

    const card = document.createElement("article");
    card.className = "month-card";
    card.innerHTML = `<div class="month-head"><div class="month-title">${monthDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</div></div>`;

    const weekdays = document.createElement("div");
    weekdays.className = "weekdays";
    ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].forEach((label) => {
      const w = document.createElement("div");
      w.className = "weekday";
      w.textContent = label;
      weekdays.appendChild(w);
    });
    card.appendChild(weekdays);

    const grid = document.createElement("div");
    grid.className = "days-grid";
    for (let i = 0; i < firstWeekday; i += 1) {
      const spacer = document.createElement("div");
      spacer.className = "day-spacer";
      grid.appendChild(spacer);
    }
    for (let day = 1; day <= monthEnd.getDate(); day += 1) {
      const iso = formatISO(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day-btn";
      btn.disabled = true;
      btn.dataset.state = dayStateFor(availability, iso);
      btn.innerHTML = `<span class="num">${day}</span>`;
      grid.appendChild(btn);
    }
    card.appendChild(grid);
    adminCalendarPreview.appendChild(card);
  });
}

function renderBookingList() {
  const bookings = getBookings().sort((a, b) => parseISO(a.start) - parseISO(b.start));
  bookingList.innerHTML = "";

  if (!bookings.length) {
    bookingList.innerHTML = `<div class="empty-state">Noch keine Buchungen vorhanden.</div>`;
    return;
  }

  bookings.forEach((booking) => {
    const item = document.createElement("article");
    item.className = "data-item";
    item.innerHTML = `
      <div class="data-item-head">
        <div>
          <h3>${booking.label}</h3>
          <div class="data-meta">
            <span>${formatDate(booking.start)} – ${formatDate(booking.end)}</span>
            <span>${diffNights(booking.start, booking.end)} Nächte</span>
          </div>
        </div>
        <span class="pill ${booking.type === "arrival-departure" ? "" : "danger"}">${booking.type === "arrival-departure" ? "Halbtags-Wechsel" : "Normal"}</span>
      </div>
      <div class="data-actions">
        <button type="button" class="ghost-btn" data-delete-booking="${booking.id}">Löschen</button>
      </div>
    `;
    bookingList.appendChild(item);
  });

  bookingList.querySelectorAll("[data-delete-booking]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const filtered = getBookings().filter((entry) => entry.id !== btn.dataset.deleteBooking);
      setBookings(filtered);
      refreshDashboard();
    });
  });
}

function renderRequestList() {
  const requests = getRequests();
  requestList.innerHTML = "";

  if (!requests.length) {
    requestList.innerHTML = `<div class="empty-state">Noch keine Anfragen eingegangen.</div>`;
    return;
  }

  requests.forEach((request) => {
    const item = document.createElement("article");
    item.className = "data-item";
    item.innerHTML = `
      <div class="data-item-head">
        <div>
          <h3>${request.name}</h3>
          <div class="data-meta">
            <span>${request.email}</span>
            <span>${formatDate(request.arrival)} – ${formatDate(request.departure)}</span>
            <span>${request.nights} Nächte</span>
          </div>
        </div>
        <span class="pill ${request.status === "archiviert" ? "" : "danger"}">${request.status}</span>
      </div>
      <div>${request.message || "Keine zusätzliche Nachricht."}</div>
      <div class="data-actions">
        <button type="button" class="ghost-btn" data-archive-request="${request.id}">Archivieren</button>
        <button type="button" class="ghost-btn" data-delete-request="${request.id}">Löschen</button>
      </div>
    `;
    requestList.appendChild(item);
  });

  requestList.querySelectorAll("[data-archive-request]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const requests = getRequests().map((req) => req.id === btn.dataset.archiveRequest ? { ...req, status: "archiviert" } : req);
      setRequests(requests);
      refreshDashboard();
    });
  });

  requestList.querySelectorAll("[data-delete-request]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const requests = getRequests().filter((req) => req.id !== btn.dataset.deleteRequest);
      setRequests(requests);
      refreshDashboard();
    });
  });
}

function showFeedback(el, text, type = "success") {
  el.textContent = text;
  el.className = `inline-notice ${type}`;
}

document.getElementById("quickBookingForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const start = document.getElementById("quickStart").value;
  const end = document.getElementById("quickEnd").value;
  const label = document.getElementById("quickLabel").value.trim();
  const feedback = document.getElementById("quickFeedback");

  if (!start || !end || !label || parseISO(end) <= parseISO(start)) {
    showFeedback(feedback, "Bitte gültige Daten eingeben.", "error");
    return;
  }

  const bookings = getBookings();
  bookings.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    start,
    end,
    label,
    type: "full"
  });
  setBookings(bookings);
  event.target.reset();
  showFeedback(feedback, "Buchung eingetragen.", "success");
  refreshDashboard();
});

document.getElementById("bookingAdminForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const start = document.getElementById("adminStart").value;
  const end = document.getElementById("adminEnd").value;
  const label = document.getElementById("adminLabel").value.trim();
  const type = document.getElementById("adminType").value;
  const feedback = document.getElementById("bookingAdminFeedback");

  if (!start || !end || !label || parseISO(end) <= parseISO(start)) {
    showFeedback(feedback, "Bitte gültige An- und Abreisedaten eingeben.", "error");
    return;
  }

  const bookings = getBookings();
  bookings.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    start,
    end,
    label,
    type
  });
  setBookings(bookings);
  event.target.reset();
  showFeedback(feedback, "Buchung gespeichert.", "success");
  refreshDashboard();
});

function refreshDashboard() {
  renderStats();
  renderCalendarPreview();
  renderBookingList();
  renderRequestList();
}

if (isLoggedIn()) {
  showDashboard();
} else {
  showLogin();
}
