const STORAGE_KEYS = {
  bookings: "egmond_bookings_v2",
  requests: "egmond_requests_v2"
};

const MIN_STAY = 3;
const PRICE_PER_NIGHT = 120;

const defaultBookings = [
  { id: "b1", label: "Schmidt", start: "2026-03-16", end: "2026-03-21", type: "full" },
  { id: "b2", label: "Meyer", start: "2026-03-28", end: "2026-04-03", type: "arrival-departure" },
  { id: "b3", label: "Becker", start: "2026-04-18", end: "2026-04-23", type: "full" }
];

function seedData() {
  if (!localStorage.getItem(STORAGE_KEYS.bookings)) {
    localStorage.setItem(STORAGE_KEYS.bookings, JSON.stringify(defaultBookings));
  }
  if (!localStorage.getItem(STORAGE_KEYS.requests)) {
    localStorage.setItem(STORAGE_KEYS.requests, JSON.stringify([]));
  }
}

function getBookings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.bookings) || "[]");
  } catch {
    return [];
  }
}

function getRequests() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.requests) || "[]");
  } catch {
    return [];
  }
}

function setRequests(requests) {
  localStorage.setItem(STORAGE_KEYS.requests, JSON.stringify(requests));
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
  return parseISO(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function diffNights(startIso, endIso) {
  const ms = parseISO(endIso) - parseISO(startIso);
  return Math.round(ms / 86400000);
}

function overlaps(startA, endA, startB, endB) {
  return parseISO(startA) < parseISO(endB) && parseISO(endA) > parseISO(startB);
}

function buildAvailability(bookings) {
  const map = new Map();

  const ensure = (iso) => {
    if (!map.has(iso)) {
      map.set(iso, { booked: false, halfStart: false, halfEnd: false });
    }
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
      } else {
        if (iso !== formatISO(start) && iso !== formatISO(lastNight)) {
          state.booked = true;
        }
      }

      cursor = addDays(cursor, 1);
    }
  });

  return map;
}

const state = {
  monthOffset: 0,
  selectedArrival: null,
  selectedDeparture: null,
  bookings: [],
  availability: new Map()
};

const calendarMount = document.getElementById("calendarMount");
const prevMonthsBtn = document.getElementById("prevMonthsBtn");
const nextMonthsBtn = document.getElementById("nextMonthsBtn");
const selectionHint = document.getElementById("selectionHint");
const nextSlotBox = document.getElementById("nextSlotBox");
const arrivalInput = document.getElementById("arrivalInput");
const departureInput = document.getElementById("departureInput");
const summaryArrival = document.getElementById("summaryArrival");
const summaryDeparture = document.getElementById("summaryDeparture");
const summaryNights = document.getElementById("summaryNights");
const summaryPrice = document.getElementById("summaryPrice");
const bookingForm = document.getElementById("bookingForm");
const formError = document.getElementById("formError");
const formSuccess = document.getElementById("formSuccess");
const submitBtn = document.getElementById("submitBtn");

function isPast(iso) {
  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return parseISO(iso) < current;
}

function getDayState(iso) {
  const availability = state.availability.get(iso);
  if (!availability) return "free";
  if (availability.booked) return "booked";
  if (availability.halfStart) return "half-start";
  if (availability.halfEnd) return "half-end";
  return "free";
}

function isArrivalPossible(iso) {
  const dayState = getDayState(iso);
  if (dayState === "booked" || dayState === "half-end") return false;
  const previousIso = formatISO(addDays(parseISO(iso), -1));
  const prevState = getDayState(previousIso);
  return prevState === "booked" || prevState === "half-start";
}

function canStayRange(startIso, endIso) {
  if (!startIso || !endIso) return false;
  if (parseISO(endIso) <= parseISO(startIso)) return false;
  if (diffNights(startIso, endIso) < MIN_STAY) return false;

  for (const booking of state.bookings) {
    if (overlaps(startIso, endIso, booking.start, booking.end)) {
      if (booking.type === "arrival-departure" && booking.start === endIso) continue;
      if (booking.type === "arrival-departure" && booking.end === startIso) continue;
      return false;
    }
  }
  return true;
}

function updateSelectionUI() {
  arrivalInput.value = state.selectedArrival ? formatDate(state.selectedArrival) : "";
  departureInput.value = state.selectedDeparture ? formatDate(state.selectedDeparture) : "";

  summaryArrival.textContent = state.selectedArrival ? formatDate(state.selectedArrival) : "–";
  summaryDeparture.textContent = state.selectedDeparture ? formatDate(state.selectedDeparture) : "–";

  if (state.selectedArrival && state.selectedDeparture) {
    const nights = diffNights(state.selectedArrival, state.selectedDeparture);
    summaryNights.textContent = `${nights}`;
    summaryPrice.textContent = `ca. ${nights * PRICE_PER_NIGHT} €`;
    selectionHint.textContent = "Zeitraum gewählt. Jetzt nur noch Kontaktdaten senden.";
    selectionHint.className = "inline-notice success";
  } else {
    summaryNights.textContent = "–";
    summaryPrice.textContent = "–";
    selectionHint.textContent = "Bitte zuerst den Anreisetag und danach den Abreisetag wählen.";
    selectionHint.className = "inline-notice info";
  }
}

function handleDateClick(iso) {
  formError.classList.add("hidden");
  formSuccess.classList.add("hidden");

  if (isPast(iso)) return;
  if (getDayState(iso) === "booked" || getDayState(iso) === "half-end") return;

  if (!state.selectedArrival || (state.selectedArrival && state.selectedDeparture)) {
    state.selectedArrival = iso;
    state.selectedDeparture = null;
    updateSelectionUI();
    renderCalendar();
    return;
  }

  if (parseISO(iso) <= parseISO(state.selectedArrival)) {
    state.selectedArrival = iso;
    state.selectedDeparture = null;
    updateSelectionUI();
    renderCalendar();
    return;
  }

  if (!canStayRange(state.selectedArrival, iso)) {
    selectionHint.textContent = `Der Zeitraum ist nicht verfügbar oder unterschreitet den Mindestaufenthalt von ${MIN_STAY} Nächten.`;
    selectionHint.className = "inline-notice error";
    state.selectedDeparture = null;
    renderCalendar();
    return;
  }

  state.selectedDeparture = iso;
  updateSelectionUI();
  renderCalendar();
  document.getElementById("bookingPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function createMonthCard(baseDate) {
  const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const monthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  const firstWeekday = (monthStart.getDay() + 6) % 7;

  const card = document.createElement("article");
  card.className = "month-card";

  const head = document.createElement("div");
  head.className = "month-head";
  head.innerHTML = `<div class="month-title">${monthStart.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</div>`;
  card.appendChild(head);

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
    const current = new Date(baseDate.getFullYear(), baseDate.getMonth(), day);
    const iso = formatISO(current);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-btn";
    btn.dataset.date = iso;
    btn.dataset.state = getDayState(iso);
    btn.dataset.past = String(isPast(iso));

    const inRange =
      state.selectedArrival &&
      state.selectedDeparture &&
      parseISO(iso) > parseISO(state.selectedArrival) &&
      parseISO(iso) < parseISO(state.selectedDeparture);

    if (inRange) btn.dataset.inRange = "true";
    if (iso === state.selectedArrival) btn.dataset.boundary = "start";
    if (iso === state.selectedDeparture) btn.dataset.boundary = "end";

    if (getDayState(iso) === "booked" || getDayState(iso) === "half-end" || isPast(iso)) {
      btn.disabled = true;
    }

    btn.innerHTML = `<span class="num">${day}</span>${isArrivalPossible(iso) ? '<span class="arrival-dot" aria-hidden="true"></span>' : ""}`;
    btn.setAttribute("aria-label", `${formatDate(iso)}${getDayState(iso) !== "free" ? ", belegt" : ""}`);
    btn.addEventListener("click", () => handleDateClick(iso));
    grid.appendChild(btn);
  }

  card.appendChild(grid);
  return card;
}

function renderCalendar() {
  calendarMount.innerHTML = "";
  const today = new Date();

  [0, 1].forEach((index) => {
    const monthDate = new Date(today.getFullYear(), today.getMonth() + state.monthOffset + index, 1);
    calendarMount.appendChild(createMonthCard(monthDate));
  });
}

function findNextFreeRange(minNights = 5) {
  const today = new Date();
  const horizon = 365;

  for (let offset = 0; offset < horizon; offset += 1) {
    const start = formatISO(addDays(today, offset));
    if (isPast(start)) continue;
    const stateHere = getDayState(start);
    if (stateHere === "booked" || stateHere === "half-end") continue;

    let length = 0;
    while (offset + length < horizon) {
      const current = formatISO(addDays(today, offset + length));
      const next = formatISO(addDays(today, offset + length + 1));
      if (!canStayRange(start, next)) break;
      length += 1;
      if (length >= minNights) {
        return { start, end: formatISO(addDays(parseISO(start), length)) };
      }
    }
  }

  return null;
}

function renderNextSlot() {
  const slot = findNextFreeRange();
  if (!slot) {
    nextSlotBox.textContent = "Aktuell wurde kein längerer freier Zeitraum gefunden.";
    nextSlotBox.className = "inline-notice error";
    return;
  }
  const nights = diffNights(slot.start, slot.end);
  nextSlotBox.textContent = `Nächster freier Zeitraum: ${formatDate(slot.start)} – ${formatDate(slot.end)} (${nights} Nächte)`;
  nextSlotBox.className = "inline-notice success";
}

function validateForm() {
  if (!state.selectedArrival || !state.selectedDeparture) {
    return "Bitte zuerst einen vollständigen Zeitraum im Kalender wählen.";
  }
  const name = document.getElementById("nameInput").value.trim();
  const email = document.getElementById("emailInput").value.trim();
  if (!name) return "Bitte den Namen eintragen.";
  if (!email || !email.includes("@")) return "Bitte eine gültige E-Mail-Adresse eintragen.";
  return "";
}

bookingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  formError.classList.add("hidden");
  formSuccess.classList.add("hidden");

  const validationError = validateForm();
  if (validationError) {
    formError.textContent = validationError;
    formError.classList.remove("hidden");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Anfrage wird gesendet …";

  const requests = getRequests();
  requests.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: new Date().toISOString(),
    arrival: state.selectedArrival,
    departure: state.selectedDeparture,
    nights: diffNights(state.selectedArrival, state.selectedDeparture),
    name: document.getElementById("nameInput").value.trim(),
    email: document.getElementById("emailInput").value.trim(),
    message: document.getElementById("messageInput").value.trim(),
    status: "neu"
  });
  setRequests(requests);

  formSuccess.textContent = "✓ Anfrage gesendet. Wir melden uns zeitnah zurück.";
  formSuccess.classList.remove("hidden");
  bookingForm.reset();
  state.selectedArrival = null;
  state.selectedDeparture = null;
  updateSelectionUI();
  renderCalendar();

  submitBtn.disabled = false;
  submitBtn.textContent = "Anfrage senden";
});

prevMonthsBtn.addEventListener("click", () => {
  state.monthOffset -= 1;
  renderCalendar();
});

nextMonthsBtn.addEventListener("click", () => {
  state.monthOffset += 1;
  renderCalendar();
});

function init() {
  seedData();
  state.bookings = getBookings();
  state.availability = buildAvailability(state.bookings);
  updateSelectionUI();
  renderCalendar();
  renderNextSlot();
}

init();
