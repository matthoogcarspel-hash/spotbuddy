const STORAGE_KEY = "spotbuddy-state";
const ADD_NEW_SPOT_VALUE = "__add_new_spot__";

const defaultState = {
  spots: [
    "Skatepark Centrum",
    "Rivierkade",
    "Station Noord",
    "Scheveningen JT",
    "Scheveningen KZVS",
  ],
  selectedSpot: "Skatepark Centrum",
  sessions: [],
};

const spotSelect = document.getElementById("spot-select");
const addSpotForm = document.getElementById("add-spot-form");
const addSpotBtn = document.getElementById("add-spot-btn");
const addSpotError = document.getElementById("add-spot-error");
const newSpotNameInput = document.getElementById("new-spot-name");
const sessionDateInput = document.getElementById("session-date");
const sessionTimeInput = document.getElementById("session-time");
const sessionNameInput = document.getElementById("session-name");
const sessionLevelInput = document.getElementById("session-level");
const sessionNoteInput = document.getElementById("session-note");
const placeSessionBtn = document.getElementById("place-session-btn");
const sessionFeedback = document.getElementById("session-feedback");
const sessionList = document.getElementById("session-list");
const profileSpotList = document.getElementById("profile-spot-list");
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

let state = initState();

renderAll();

spotSelect.addEventListener("change", (event) => {
  const selectedValue = event.target.value;

  if (selectedValue === ADD_NEW_SPOT_VALUE) {
    toggleAddSpotForm(true);
    return;
  }

  toggleAddSpotForm(false);
  state.selectedSpot = selectedValue;
  saveState();
});

addSpotBtn.addEventListener("click", () => {
  const rawName = newSpotNameInput.value;
  const name = rawName.trim();

  if (!name) {
    showAddSpotError("Voer een spotnaam in.");
    return;
  }

  const nameExists = state.spots.some(
    (spotName) => spotName.toLowerCase() === name.toLowerCase()
  );

  if (nameExists) {
    showAddSpotError("Deze spot bestaat al.");
    return;
  }

  clearAddSpotError();

  state.spots.push(name);
  state.selectedSpot = name;

  saveState();
  renderAll();

  newSpotNameInput.value = "";
  toggleAddSpotForm(false);
  sessionFeedback.textContent = `Spot toegevoegd en geselecteerd: ${name}`;
});

placeSessionBtn.addEventListener("click", () => {
  const session = {
    spot: state.selectedSpot,
    date: sessionDateInput.value,
    time: sessionTimeInput.value,
    name: sessionNameInput.value.trim(),
    level: sessionLevelInput.value,
    note: sessionNoteInput.value.trim(),
  };

  if (!session.spot) {
    sessionFeedback.textContent = "Kies eerst een spot.";
    return;
  }

  if (!session.date || !session.time || !session.name || !session.level) {
    sessionFeedback.textContent = "Vul datum, tijd, naam en niveau in.";
    return;
  }

  state.sessions.push(session);
  saveState();
  renderSessionList();
  resetSessionForm();

  sessionFeedback.textContent = `Sessie geplaatst op ${session.spot} om ${session.time}.`;
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;

    tabs.forEach((currentTab) =>
      currentTab.classList.toggle("active", currentTab === tab)
    );

    panels.forEach((panel) =>
      panel.classList.toggle("active", panel.id === target)
    );
  });
});

function initState() {
  const persisted = loadPersistedState();

  if (!persisted) {
    return {
      ...defaultState,
      spots: [...defaultState.spots],
      sessions: [...defaultState.sessions],
    };
  }

  const mergedSpots = [...defaultState.spots];

  persisted.spots.forEach((spot) => {
    const exists = mergedSpots.some(
      (existingSpot) => existingSpot.toLowerCase() === spot.toLowerCase()
    );

    if (!exists) {
      mergedSpots.push(spot);
    }
  });

  const selectedSpotExists = mergedSpots.some(
    (spot) =>
      spot.toLowerCase() === String(persisted.selectedSpot || "").toLowerCase()
  );

  return {
    spots: mergedSpots,
    selectedSpot: selectedSpotExists ? persisted.selectedSpot : mergedSpots[0] || "",
    sessions: persisted.sessions,
  };
}

function loadPersistedState() {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);

    if (!Array.isArray(parsed.spots)) {
      return null;
    }

    return {
      spots: parsed.spots
        .map((spot) => String(spot).trim())
        .filter((spot) => spot.length > 0),
      selectedSpot: typeof parsed.selectedSpot === "string" ? parsed.selectedSpot : "",
      sessions: sanitizeSessions(parsed.sessions),
    };
  } catch {
    return null;
  }
}

function sanitizeSessions(sessions) {
  if (!Array.isArray(sessions)) {
    return [];
  }

  return sessions
    .map((session) => ({
      spot: String(session.spot || "").trim(),
      date: String(session.date || "").trim(),
      time: String(session.time || "").trim(),
      name: String(session.name || "").trim(),
      level: String(session.level || "").trim(),
      note: String(session.note || "").trim(),
    }))
    .filter((session) => session.spot && session.date && session.time && session.name);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderAll() {
  renderSpotSelect();
  renderSessionList();
  renderProfileSpots();
}

function renderSpotSelect() {
  spotSelect.innerHTML = "";

  state.spots.forEach((spot) => {
    const option = document.createElement("option");
    option.value = spot;
    option.textContent = spot;
    spotSelect.appendChild(option);
  });

  const addOption = document.createElement("option");
  addOption.value = ADD_NEW_SPOT_VALUE;
  addOption.textContent = "+ Nieuwe spot toevoegen";
  spotSelect.appendChild(addOption);

  const selectedExists = state.spots.includes(state.selectedSpot);
  spotSelect.value = selectedExists ? state.selectedSpot : "";

  if (!selectedExists && state.spots.length > 0) {
    state.selectedSpot = state.spots[0];
    spotSelect.value = state.selectedSpot;
    saveState();
  }
}

function renderSessionList() {
  sessionList.innerHTML = "";

  const sortedSessions = [...state.sessions].sort((a, b) => {
    const left = `${a.date}T${a.time}`;
    const right = `${b.date}T${b.time}`;
    return left.localeCompare(right);
  });

  if (sortedSessions.length === 0) {
    const item = document.createElement("li");
    item.className = "session-empty";
    item.textContent = "Nog geen sessies gepland.";
    sessionList.appendChild(item);
    return;
  }

  sortedSessions.forEach((session) => {
    const item = document.createElement("li");
    const summary = `${session.spot} • ${session.name} • ${session.date} ${session.time}`;
    const details = session.note ? ` (${session.level}, ${session.note})` : ` (${session.level})`;
    item.textContent = `${summary}${details}`;
    sessionList.appendChild(item);
  });
}

function renderProfileSpots() {
  profileSpotList.innerHTML = "";

  state.spots.forEach((spot) => {
    const item = document.createElement("li");
    item.textContent = spot;
    profileSpotList.appendChild(item);
  });
}

function resetSessionForm() {
  sessionDateInput.value = "";
  sessionTimeInput.value = "";
  sessionNameInput.value = "";
  sessionLevelInput.value = "";
  sessionNoteInput.value = "";
}

function toggleAddSpotForm(show) {
  addSpotForm.classList.toggle("hidden", !show);
  clearAddSpotError();

  if (show) {
    newSpotNameInput.focus();
  }
}

function showAddSpotError(message) {
  addSpotError.textContent = message;
  addSpotError.classList.remove("hidden");
}

function clearAddSpotError() {
  addSpotError.textContent = "";
  addSpotError.classList.add("hidden");
}
