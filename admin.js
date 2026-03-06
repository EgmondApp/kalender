const ADMIN_STORAGE_KEYS = {
  bookings: "egmond_bookings_v6",
  requests: "egmond_requests_v6",
  session: "egmond_admin_session_v6"
};

const ADMIN_PASSWORD = "FiegePils";
const BRIDGE_DAYS = {
  2026: ["2026-01-02","2026-05-15","2026-06-05"],
  2027: ["2027-05-07","2027-05-28"],
  2028: ["2028-05-26","2028-06-16","2028-10-02"]
};

let currentYear = new Date().getFullYear();
const highlightCache = new Map();
const loadedYears = new Set();

const dom = {
  loginPanel: document.getElementById("adminLoginPanel"),
  dashboardPanel: document.getElementById("dashboardPanel"),
  loginForm: document.getElementById("adminLoginForm"),
  loginError: document.getElementById("adminLoginError"),
  statGrid: document.getElementById("statGrid"),
  bookingList: document.getElementById("bookingList"),
  requestList: document.getElementById("requestList"),
  adminYearGrid: document.getElementById("adminYearGrid"),
  overviewYearTitle: document.getElementById("overviewYearTitle")
};

function getBookings() {
  try { return JSON.parse(localStorage.getItem(ADMIN_STORAGE_KEYS.bookings) || "[]"); }
  catch { return []; }
}
function setBookings(bookings) {
  localStorage.setItem(ADMIN_STORAGE_KEYS.bookings, JSON.stringify(bookings));
}
function getRequests() {
  try { return JSON.parse(localStorage.getItem(ADMIN_STORAGE_KEYS.requests) || "[]"); }
  catch { return []; }
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
function nextArrivalLabel(bookings) {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const future = bookings.filter((b) => parseISO(b.start) >= startOfToday).sort((a, b) => parseISO(a.start) - parseISO(b.start))[0];
  return future ? formatDate(future.start).slice(0, 5) : "–";
}
function buildAvailability(bookings) {
  const map = new Map();
  const ensure = (iso) => {
    if (!map.has(iso)) map.set(iso, { booked: false, halfStart: false, halfEnd: false, label: "" });
    return map.get(iso);
  };
  bookings.forEach((booking) => {
    const start = parseISO(booking.start);
    const end = parseISO(booking.end);
    const lastNight = addDays(end, -1);
    if (booking.type === "arrival-departure") {
      ensure(formatISO(start)).halfStart = true;
      ensure(formatISO(lastNight)).halfEnd = true;
      ensure(formatISO(start)).label = booking.label;
      ensure(formatISO(lastNight)).label = booking.label;
    }
    let cursor = new Date(start);
    while (cursor < end) {
      const iso = formatISO(cursor);
      const stateItem = ensure(iso);
      if (booking.type === "full") {
        stateItem.booked = true;
        stateItem.label = booking.label;
      } else if (iso !== formatISO(start) && iso !== formatISO(lastNight)) {
        stateItem.booked = true;
        stateItem.label = booking.label;
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
function labelFor(map, iso) {
  return map.get(iso)?.label || "";
}
function ensureHighlightEntry(iso) {
  if (!highlightCache.has(iso)) {
    highlightCache.set(iso, { schoolHoliday: false, publicHoliday: false, bridgeDay: false, labels: [] });
  }
  return highlightCache.get(iso);
}
function addSchoolHolidayRange(startIso, endIso, label) {
  let cursor = parseISO(startIso);
  const end = parseISO(endIso);
  while (cursor <= end) {
    const iso = formatISO(cursor);
    const entry = ensureHighlightEntry(iso);
    entry.schoolHoliday = true;
    if (label && !entry.labels.includes(label)) entry.labels.push(label);
    cursor = addDays(cursor, 1);
  }
}
function addPublicHoliday(iso, label) {
  const entry = ensureHighlightEntry(iso);
  entry.publicHoliday = true;
  if (label && !entry.labels.includes(label)) entry.labels.push(label);
}
function addBridgeDay(iso) {
  const entry = ensureHighlightEntry(iso);
  entry.bridgeDay = true;
}
function getHighlightFlags(iso) {
  const entry = highlightCache.get(iso);
  return {
    schoolHoliday: !!entry?.schoolHoliday,
    publicHoliday: !!entry?.publicHoliday,
    bridgeDay: !!entry?.bridgeDay
  };
}
async function loadHighlightYear(year) {
  if (loadedYears.has(year)) return;
  loadedYears.add(year);

  const schoolUrl = `https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&subdivisionCode=DE-NW&languageIsoCode=DE&validFrom=${year}-01-01&validTo=${year}-12-31`;
  const holidayUrl = `https://feiertage-api.de/api/?jahr=${year}&nur_land=NW`;

  try {
    const [schoolRes, holidayRes] = await Promise.all([
      fetch(schoolUrl, { headers: { "Accept": "application/json" } }),
      fetch(holidayUrl, { headers: { "Accept": "application/json" } })
    ]);

    if (schoolRes.ok) {
      const schoolData = await schoolRes.json();
      schoolData.forEach((item) => {
        const label = item.name?.find?.((n) => n.language === "DE")?.text || "Ferien";
        addSchoolHolidayRange(item.startDate, item.endDate, label);
      });
    }
    if (holidayRes.ok) {
      const holidayData = await holidayRes.json();
      Object.entries(holidayData).forEach(([name, item]) => {
        if (item?.datum) addPublicHoliday(item.datum, name);
      });
    }
    (BRIDGE_DAYS[year] || []).forEach(addBridgeDay);
  } catch (error) {
    (BRIDGE_DAYS[year] || []).forEach(addBridgeDay);
  }
}

function openTab(tab, updateHash = true) {
  document.querySelectorAll(".tab-btn").forEach((el) => el.classList.toggle("is-active", el.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== tab));
  if (updateHash) history.replaceState(null, "", `#${tab}`);
}
function handleInitialHash() {
  const hash = location.hash.replace("#", "");
  if (["overview", "bookings", "requests"].includes(hash)) {
    openTab(hash, false);
  }
}
function showDashboard() {
  dom.loginPanel.classList.add("hidden");
  dom.dashboardPanel.classList.remove("hidden");
  refreshDashboard();
  handleInitialHash();
}
function showLogin() {
  dom.loginPanel.classList.remove("hidden");
  dom.dashboardPanel.classList.add("hidden");
}

dom.loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = document.getElementById("adminPassword").value;
  if (value !== ADMIN_PASSWORD) {
    dom.loginError.textContent = "Falsches Passwort.";
    dom.loginError.classList.remove("hidden");
    return;
  }
  dom.loginError.classList.add("hidden");
  setLoggedIn(true);
  showDashboard();
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action], .tab-btn, [data-delete-booking], [data-archive-request], [data-delete-request]");
  if (!target) return;

  if (target.classList.contains("tab-btn")) {
    openTab(target.dataset.tab);
    return;
  }
  if (target.dataset.deleteBooking) {
    const filtered = getBookings().filter((entry) => entry.id !== target.dataset.deleteBooking);
    setBookings(filtered);
    refreshDashboard();
    return;
  }
  if (target.dataset.archiveRequest) {
    const requests = getRequests().map((req) => req.id === target.dataset.archiveRequest ? { ...req, status: "archiviert" } : req);
    setRequests(requests);
    refreshDashboard();
    return;
  }
  if (target.dataset.deleteRequest) {
    const requests = getRequests().filter((req) => req.id !== target.dataset.deleteRequest);
    setRequests(requests);
    refreshDashboard();
    return;
  }

  switch (target.dataset.action) {
    case "logout":
      setLoggedIn(false);
      showLogin();
      break;
    case "prev-year":
      currentYear -= 1;
      renderYearOverview();
      break;
    case "next-year":
      currentYear += 1;
      renderYearOverview();
      break;
    case "print-year":
      printYear();
      break;
    default:
      break;
  }
});

function renderStats() {
  const bookings = getBookings();
  const requests = getRequests();
  const openRequests = requests.filter((r) => r.status !== "archiviert").length;
  const currentMonth = new Date().getMonth();
  const monthBookings = bookings.filter((b) => parseISO(b.start).getMonth() === currentMonth).length;

  const stats = [
    { label: "Buchungen", value: bookings.length },
    { label: "Anfragen offen", value: openRequests },
    { label: "Start diesen Monat", value: monthBookings },
    { label: "Nächste Anreise", value: nextArrivalLabel(bookings) }
  ];
  dom.statGrid.innerHTML = "";
  stats.forEach((stat) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    card.innerHTML = `<div class="label">${stat.label}</div><div class="value">${stat.value}</div>`;
    dom.statGrid.appendChild(card);
  });
}

async function renderYearOverview() {
  await loadHighlightYear(currentYear);
  const bookings = getBookings();
  const availability = buildAvailability(bookings);
  dom.overviewYearTitle.textContent = String(currentYear);
  dom.adminYearGrid.innerHTML = "";

  for (let month = 0; month < 12; month += 1) {
    const monthDate = new Date(currentYear, month, 1);
    const monthEnd = new Date(currentYear, month + 1, 0);
    const firstWeekday = (monthDate.getDay() + 6) % 7;

    const card = document.createElement("article");
    card.className = "year-month";
    card.innerHTML = `<h3 class="year-title">${monthDate.toLocaleDateString("de-DE", { month: "long" })}</h3>`;

    const weekdays = document.createElement("div");
    weekdays.className = "mini-weekdays";
    ["Mo","Di","Mi","Do","Fr","Sa","So"].forEach((label) => {
      const node = document.createElement("div");
      node.className = "mini-weekday";
      node.textContent = label;
      weekdays.appendChild(node);
    });
    card.appendChild(weekdays);

    const grid = document.createElement("div");
    grid.className = "mini-days";
    for (let i = 0; i < firstWeekday; i += 1) {
      const spacer = document.createElement("div");
      spacer.className = "mini-spacer";
      grid.appendChild(spacer);
    }

    const names = new Set();
    for (let day = 1; day <= monthEnd.getDate(); day += 1) {
      const iso = formatISO(new Date(currentYear, month, day));
      const flags = getHighlightFlags(iso);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mini-day";
      btn.dataset.state = dayStateFor(availability, iso);
      btn.dataset.schoolHoliday = String(flags.schoolHoliday);
      btn.dataset.publicHoliday = String(flags.publicHoliday);
      btn.dataset.bridgeDay = String(flags.bridgeDay);
      btn.textContent = String(day);
      const name = labelFor(availability, iso);
      if (name) names.add(name);
      grid.appendChild(btn);
    }
    card.appendChild(grid);

    const nameLine = document.createElement("div");
    nameLine.className = "mini-name";
    nameLine.textContent = Array.from(names).slice(0, 3).join(" · ");
    card.appendChild(nameLine);
    dom.adminYearGrid.appendChild(card);
  }
}

function renderBookingList() {
  const bookings = getBookings().sort((a, b) => parseISO(a.start) - parseISO(b.start));
  dom.bookingList.innerHTML = "";
  if (!bookings.length) {
    dom.bookingList.innerHTML = `<div class="empty-state">Keine Buchungen.</div>`;
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
        <button type="button" class="nav-pill admin" data-delete-booking="${booking.id}">Löschen</button>
      </div>
    `;
    dom.bookingList.appendChild(item);
  });
}

function renderRequestList() {
  const requests = getRequests();
  dom.requestList.innerHTML = "";
  if (!requests.length) {
    dom.requestList.innerHTML = `<div class="empty-state">Keine Anfragen.</div>`;
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
            <span>${request.phone || "–"}</span>
            <span>${formatDate(request.arrival)} – ${formatDate(request.departure)}</span>
          </div>
        </div>
        <span class="pill ${request.status === "archiviert" ? "" : "danger"}">${request.status}</span>
      </div>
      <div>${request.message || "Keine Nachricht."}</div>
      <div class="data-actions">
        <button type="button" class="nav-pill admin" data-archive-request="${request.id}">Archivieren</button>
        <button type="button" class="nav-pill admin" data-delete-request="${request.id}">Löschen</button>
      </div>
    `;
    dom.requestList.appendChild(item);
  });
}

function showFeedback(el, text, type = "success") {
  el.textContent = text;
  el.className = `notice notice-${type}`;
}

document.getElementById("bookingAdminForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const start = document.getElementById("adminStart").value;
  const end = document.getElementById("adminEnd").value;
  const label = document.getElementById("adminLabel").value.trim();
  const feedback = document.getElementById("bookingAdminFeedback");

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
  showFeedback(feedback, "Gespeichert.", "success");
  refreshDashboard();
});

function buildPrintableHtml(year, bookings) {
  const availability = buildAvailability(bookings);

  const months = Array.from({ length: 12 }, (_, month) => {
    const monthDate = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const firstWeekday = (monthDate.getDay() + 6) % 7;
    let cells = "";

    for (let i = 0; i < firstWeekday; i += 1) cells += `<div class="c empty"></div>`;

    for (let day = 1; day <= monthEnd.getDate(); day += 1) {
      const iso = formatISO(new Date(year, month, day));
      const state = dayStateFor(availability, iso);
      const label = labelFor(availability, iso);
      const flags = getHighlightFlags(iso);
      cells += `<div class="c ${state} ${flags.schoolHoliday ? 'school' : ''} ${flags.publicHoliday ? 'holiday' : ''} ${flags.bridgeDay ? 'bridge' : ''}"><div class="t"></div><div class="d">${day}</div><div class="n">${label || ""}</div><div class="b"></div></div>`;
    }

    return `
      <section class="m">
        <h3>${monthDate.toLocaleDateString("de-DE", { month: "long" })}</h3>
        <div class="w">${["Mo","Di","Mi","Do","Fr","Sa","So"].map((d) => `<div>${d}</div>`).join("")}</div>
        <div class="g">${cells}</div>
      </section>
    `;
  }).join("");

  return `
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Egmond Kalender ${year}</title>
<style>
@page{size:A4 landscape; margin:8mm}
body{font-family:Arial,sans-serif; color:#1b140d; margin:0}
.top{display:flex; justify-content:space-between; align-items:flex-end; gap:12px; margin-bottom:8px}
h1{font-size:17px; margin:0}
.sub{font-size:10px; color:#6a5e50; margin-top:2px}
.legend{display:flex; gap:10px; flex-wrap:wrap; font-size:9px}
.l{display:inline-flex; align-items:center; gap:5px}
.s{width:10px; height:10px; border-radius:3px; display:inline-block; border:1px solid #cfc0ae}
.bk{background:#f5d3d1}.hf{background:linear-gradient(135deg,#fff 0 50%, #f5d3d1 50% 100%)}
.sc{background:linear-gradient(180deg,#fff2cc 0 70%, #fff 70% 100%)} .ph{background:#fff; box-shadow:inset 0 0 0 2px #208256} .br{background:linear-gradient(180deg,#fff 0 68%, #efe6ff 68% 100%)}
.grid{display:grid; grid-template-columns:repeat(4,1fr); gap:7px}
.m{border:1px solid #d9cec1; border-radius:9px; padding:6px; break-inside:avoid; background:#fff}
.m h3{font-size:11px; margin:0 0 5px}
.w,.g{display:grid; grid-template-columns:repeat(7,1fr); gap:2px}
.w div{font-size:7px; text-align:center; color:#6f6253}
.c{position:relative; min-height:29px; border:1px solid #ece3da; border-radius:4px; padding:2px; background:#fff; overflow:hidden}
.c.booked{background:#f5d3d1}
.c.half-start{background:linear-gradient(135deg,#fff 0 50%, #f5d3d1 50% 100%)}
.c.half-end{background:linear-gradient(135deg,#f5d3d1 0 50%, #fff 50% 100%)}
.c.empty{border:none; background:transparent}
.c .t,.c .b{position:absolute; left:2px; right:2px; height:3px; border-radius:999px}
.c .t{top:2px}.c .b{bottom:2px}
.c.school .t{background:#e0a219}
.c.bridge .b{background:#8a4fff}
.c.holiday{box-shadow:inset 0 0 0 1.5px rgba(32,130,86,.65)}
.d{font-size:7px; font-weight:700}
.n{font-size:6px; line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
</style>
</head>
<body>
  <div class="top">
    <div>
      <h1>Egmond – Belegungsübersicht ${year}</h1>
      <div class="sub">A4 Querformat · Druckansicht</div>
    </div>
    <div class="legend">
      <span class="l"><span class="s bk"></span>belegt</span>
      <span class="l"><span class="s hf"></span>halbtags</span>
      <span class="l"><span class="s sc"></span>Ferien NRW</span>
      <span class="l"><span class="s ph"></span>Feiertag</span>
      <span class="l"><span class="s br"></span>Brückentag</span>
    </div>
  </div>
  <div class="grid">${months}</div>
</body>
</html>
  `;
}
async function printYear() {
  await loadHighlightYear(currentYear);
  const printWindow = window.open("", "_blank", "width=1200,height=900");
  if (!printWindow) return;
  printWindow.document.write(buildPrintableHtml(currentYear, getBookings()));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

async function refreshDashboard() {
  renderStats();
  await renderYearOverview();
  renderBookingList();
  renderRequestList();
}

if (isLoggedIn()) showDashboard();
else showLogin();
