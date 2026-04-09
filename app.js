const STORAGE_KEY = "spotbuddy-state";
const ADD_NEW_SPOT_VALUE = "__add_new_spot__";

const defaultState = {
  spots: ["Skatepark Centrum", "Rivierkade", "Station Noord"],
  selectedSpot: "Skatepark Centrum",
};

const spotSelect = document.getElementById("spot-select");
const addSpotForm = document.getElementById("add-spot-form");
const addSpotBtn = document.getElementById("add-spot-btn");
const addSpotError = document.getElementById("add-spot-error");
const newSpotNameInput = document.getElementById("new-spot-name");
const placeSessionBtn = document.getElementById("place-session-btn");
const sessionFeedback = document.getElementById("session-feedback");
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
  if (!state.selectedSpot) {
    sessionFeedback.textContent = "Kies eerst een spot.";
    return;
  }

  sessionFeedback.textContent = `Sessie geplaatst op ${state.selectedSpot}.`;
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
    return { ...defaultState, spots: [...defaultState.spots] };
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
    };
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderAll() {
  renderSpotSelect();
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

function renderProfileSpots() {
  profileSpotList.innerHTML = "";

  state.spots.forEach((spot) => {
    const item = document.createElement("li");
    item.textContent = spot;
    profileSpotList.appendChild(item);
  });
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
