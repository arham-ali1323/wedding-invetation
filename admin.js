const loginPanel = document.getElementById("loginPanel");
const loginForm = document.getElementById("loginForm");
const dashboard = document.getElementById("adminDashboard");
const guestForm = document.getElementById("guestForm");
const guestList = document.getElementById("guestList");
const notice = document.getElementById("adminNotice");
const createdLink = document.getElementById("createdLink");
const directoryStorageKey = "weddingGuestDirectory:v1";
const guestNameInput = document.getElementById("guestName");
const guestPhoneInput = document.getElementById("guestPhone");
const guestNotesInput = document.getElementById("guestNotes");
const guestExpiryInput = document.getElementById("guestExpiry");
const personalInput = document.getElementById("personalGuest");
const eventOptions = document.getElementById("newGuestEvents");
const eventFilter = document.getElementById("eventFilter");
const categoryFilter = document.getElementById("categoryFilter");
const searchInput = document.getElementById("guestSearch");
let guests = [];
let eventCatalog = {};
let editingGuestId = null;
let directory = {};

function showNotice(message, isError) {
  notice.textContent = message;
  notice.classList.toggle("error", Boolean(isError));
}

async function request(path, options) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options && options.headers)
    }
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error("The server returned an unreadable response.");
  }
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

function readDirectory() {
  try {
    const saved = localStorage.getItem(directoryStorageKey);
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("The saved guest directory has an invalid format.");
    }
    return parsed;
  } catch (error) {
    showNotice("Could not read the saved guest details from this browser. Check browser storage and try refreshing.", true);
    return {};
  }
}

function saveDirectory(nextDirectory) {
  try {
    localStorage.setItem(directoryStorageKey, JSON.stringify(nextDirectory));
    directory = nextDirectory;
    return true;
  } catch (error) {
    showNotice("Guest permissions were saved, but this browser could not save the phone, notes, or invitation status. Check browser storage.", true);
    return false;
  }
}

function getGuestDetails(guestId) {
  return directory[String(guestId)] || {
    phone: "",
    notes: "",
    personal: false,
    invitationStatus: "pending",
    invitationPath: ""
  };
}

function saveGuestDetails(guestId, updates) {
  return saveDirectory({
    ...directory,
    [String(guestId)]: { ...getGuestDetails(guestId), ...updates }
  });
}

function removeGuestDetails(guestId) {
  const nextDirectory = { ...directory };
  delete nextDirectory[String(guestId)];
  return saveDirectory(nextDirectory);
}

function eventName(eventId) {
  const event = eventCatalog[eventId];
  return event ? event.name : eventId;
}

function makeEventCheckboxes(container, prefix, selected) {
  container.replaceChildren();
  Object.keys(eventCatalog).forEach((eventId) => {
    const label = document.createElement("label");
    label.className = "event-choice";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "events";
    checkbox.value = eventId;
    checkbox.id = `${prefix}-${eventId}`;
    checkbox.checked = selected.includes(eventId);
    const text = document.createElement("span");
    text.textContent = eventName(eventId);
    label.append(checkbox, text);
    container.appendChild(label);
  });
}

function populateEventFilter() {
  eventFilter.replaceChildren();
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All events";
  eventFilter.appendChild(allOption);
  Object.keys(eventCatalog).forEach((eventId) => {
    const option = document.createElement("option");
    option.value = eventId;
    option.textContent = eventName(eventId);
    eventFilter.appendChild(option);
  });
}

function getSelectedEvents(form) {
  return Array.from(form.querySelectorAll('input[name="events"]:checked'), (input) => input.value);
}

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function normalizePakistanPhone(value) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0092")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  if (/^3\d{9}$/.test(digits)) digits = `92${digits}`;
  if (!/^923\d{9}$/.test(digits)) {
    throw new Error("Enter a Pakistani mobile number, such as +92 300 1234567.");
  }
  return `+${digits}`;
}

function categoryFor(guest) {
  const details = getGuestDetails(guest.id);
  if (details.personal) return "personal";
  const totalEvents = Object.keys(eventCatalog).length;
  if (totalEvents > 0 && guest.events.length === totalEvents) return "special";
  if (guest.events.length === 2) return "relative";
  return "personal";
}

function categoryLabel(category) {
  return {
    personal: "Personal Guest",
    special: "Special Guest",
    relative: "Regular Relative"
  }[category];
}

function selectedEventLabels(guest) {
  return guest.events.map(eventName);
}

function updateSummary() {
  const categories = guests.map(categoryFor);
  const sentCount = guests.filter(
    (guest) => getGuestDetails(guest.id).invitationStatus === "sent"
  ).length;
  const summary = {
    totalGuests: guests.length,
    personalGuests: categories.filter((category) => category === "personal").length,
    specialGuests: categories.filter((category) => category === "special").length,
    relativeGuests: categories.filter((category) => category === "relative").length,
    sentInvitations: sentCount,
    pendingInvitations: guests.length - sentCount
  };
  Object.entries(summary).forEach(([id, count]) => {
    document.getElementById(id).textContent = String(count);
  });
}

function getVisibleGuests() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const category = categoryFilter.value;
  const eventId = eventFilter.value;
  return guests.filter((guest) => {
    const details = getGuestDetails(guest.id);
    const searchableName = guest.name.toLocaleLowerCase();
    const queryDigits = query.replace(/\D/g, "");
    const phoneDigits = details.phone.replace(/\D/g, "");
    const localPhoneDigits = phoneDigits.startsWith("92")
      ? `0${phoneDigits.slice(2)}`
      : phoneDigits;
    const matchesSearch = !query ||
      searchableName.includes(query) ||
      (queryDigits && (phoneDigits.includes(queryDigits) || localPhoneDigits.includes(queryDigits)));
    return matchesSearch &&
      (category === "all" || categoryFor(guest) === category) &&
      (eventId === "all" || guest.events.includes(eventId));
  });
}

function makeCategoryBadge(guest) {
  const category = categoryFor(guest);
  const badge = document.createElement("span");
  badge.className = `guest-category-badge guest-category-badge--${category}`;
  badge.textContent = categoryLabel(category);
  return badge;
}

function makeEventBadges(guest) {
  const list = document.createElement("div");
  list.className = "guest-event-badges";
  guest.events.forEach((eventId) => {
    const badge = document.createElement("span");
    badge.className = `guest-event-badge guest-event-badge--${eventId}`;
    badge.textContent = eventName(eventId);
    list.appendChild(badge);
  });
  if (categoryFor(guest) === "special") {
    const allEvents = document.createElement("span");
    allEvents.className = "guest-all-events";
    allEvents.textContent = "All Events";
    list.appendChild(allEvents);
  }
  return list;
}

function createWhatsAppMessage(guest, invitationUrl) {
  const details = getGuestDetails(guest.id);
  const eventLines = guest.events.map((eventId) => {
    const event = eventCatalog[eventId];
    if (!event) return `• ${eventName(eventId)}`;
    return `• ${event.name} — ${event.date}, ${event.time} at ${event.venue}, ${event.city}`;
  });
  const message = [
    `Assalamu Alaikum ${guest.name},`,
    "",
    "With the blessings of Allah, we would be delighted to have you join us for our wedding celebrations.",
    "",
    "You are invited to:",
    ...eventLines,
    "",
    `Your personal invitation: ${invitationUrl}`,
    "",
    "We look forward to celebrating with you!",
    "With love, the families"
  ];
  return `https://wa.me/${details.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message.join("\n"))}`;
}

async function getInvitationPath(guest) {
  const details = getGuestDetails(guest.id);
  if (details.invitationPath) return details.invitationPath;
  const response = await request(`/api/admin/guests/${guest.id}/link`, {
    method: "POST",
    body: "{}"
  });
  saveGuestDetails(guest.id, { invitationPath: response.invitationPath });
  return response.invitationPath;
}

function createGuestCard(guest) {
  const details = getGuestDetails(guest.id);
  const card = document.createElement("article");
  card.className = "guest-row directory-guest-row";

  const top = document.createElement("div");
  top.className = "directory-guest-top";
  const identity = document.createElement("div");
  identity.className = "directory-guest-identity";
  const name = document.createElement("h3");
  name.textContent = guest.name;
  const phone = document.createElement("a");
  phone.className = "guest-phone-link";
  phone.href = `tel:${details.phone || ""}`;
  phone.textContent = details.phone || "Phone number unavailable";
  if (!details.phone) phone.removeAttribute("href");
  identity.append(name, phone);
  top.append(identity, makeCategoryBadge(guest));

  const events = makeEventBadges(guest);
  const statusLine = document.createElement("div");
  statusLine.className = "guest-status-line";
  const status = document.createElement("span");
  const isSent = details.invitationStatus === "sent";
  status.className = `invitation-status invitation-status--${isSent ? "sent" : "pending"}`;
  status.textContent = isSent ? "Sent" : "Not Sent";
  const expiry = document.createElement("span");
  expiry.className = "guest-link-status";
  expiry.textContent = guest.expiresAt
    ? `Link expires ${new Date(guest.expiresAt).toLocaleString()}`
    : "No link expiry";
  statusLine.append(status, expiry);

  const notes = document.createElement("p");
  notes.className = "guest-notes";
  notes.textContent = details.notes || "";
  if (!details.notes) notes.classList.add("hidden");

  const actions = document.createElement("div");
  actions.className = "guest-actions directory-guest-actions";
  const whatsapp = document.createElement("button");
  whatsapp.type = "button";
  whatsapp.className = "whatsapp-button";
  whatsapp.textContent = "Send with WhatsApp";
  whatsapp.disabled = !details.phone;
  whatsapp.title = details.phone ? "Open a personalized WhatsApp message" : "Edit this guest to add a phone number";
  whatsapp.addEventListener("click", async () => {
    let phoneNumber;
    try {
      phoneNumber = normalizePakistanPhone(details.phone);
    } catch (error) {
      showNotice(error.message, true);
      return;
    }
    const newTab = window.open("about:blank", "_blank");
    if (!newTab) {
      showNotice("Allow pop-ups to open WhatsApp, then try again.", true);
      return;
    }
    newTab.opener = null;
    try {
      const invitationPath = await getInvitationPath(guest);
      const invitationUrl = new URL(invitationPath, window.location.origin).href;
      newTab.location.href = createWhatsAppMessage(guest, invitationUrl);
      showNotice(`WhatsApp opened with only ${selectedEventLabels(guest).join(", ")} in the invitation. Confirm the message in WhatsApp to send it.`, false);
    } catch (error) {
      newTab.close();
      showNotice(error.message, true);
    }
    if (phoneNumber !== details.phone) saveGuestDetails(guest.id, { phone: phoneNumber });
  });

  const markSent = document.createElement("button");
  markSent.type = "button";
  markSent.className = "quiet-button";
  markSent.textContent = isSent ? "Mark not sent" : "Mark sent";
  markSent.addEventListener("click", () => {
    const nextStatus = isSent ? "pending" : "sent";
    if (saveGuestDetails(guest.id, { invitationStatus: nextStatus })) {
      showNotice(`${guest.name}'s invitation marked ${nextStatus === "sent" ? "sent" : "not sent"}.`, false);
      renderGuestDirectory();
    }
  });

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "quiet-button";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => beginEdit(guest));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "revoke-button";
  remove.textContent = "Delete";
  remove.addEventListener("click", async () => {
    if (!window.confirm(`Delete ${guest.name} and revoke their invitation link?`)) return;
    try {
      await request(`/api/admin/guests/${guest.id}`, { method: "DELETE" });
      removeGuestDetails(guest.id);
      showNotice(`${guest.name} was deleted and their invitation link revoked.`, false);
      await loadGuests();
    } catch (error) {
      showNotice(error.message, true);
    }
  });

  actions.append(whatsapp, markSent, edit, remove);
  card.append(top, events, statusLine, notes, actions);
  return card;
}

function renderGuestDirectory() {
  updateSummary();
  guestList.replaceChildren();
  const visibleGuests = getVisibleGuests();
  if (!visibleGuests.length) {
    const empty = document.createElement("p");
    empty.className = "empty-guests";
    empty.textContent = guests.length
      ? "No guests match the selected search and filters."
      : "No guests yet. Add your first guest above to create a private invitation.";
    guestList.appendChild(empty);
    return;
  }
  const categories = [
    ["personal", "Personal Guests"],
    ["special", "Special Guests"],
    ["relative", "Regular Relatives"]
  ];
  if (categoryFilter.value !== "all") {
    visibleGuests.forEach((guest) => guestList.appendChild(createGuestCard(guest)));
    return;
  }
  categories.forEach(([category, label]) => {
    const categoryGuests = visibleGuests.filter((guest) => categoryFor(guest) === category);
    if (!categoryGuests.length) return;
    const section = document.createElement("section");
    section.className = `guest-category-section guest-category-section--${category}`;
    const heading = document.createElement("h3");
    heading.textContent = `${label} · ${categoryGuests.length}`;
    const list = document.createElement("div");
    list.className = "guest-category-list";
    categoryGuests.forEach((guest) => list.appendChild(createGuestCard(guest)));
    section.append(heading, list);
    guestList.appendChild(section);
  });
}

async function loadGuests() {
  const data = await request("/api/admin/guests");
  if (!data.events || typeof data.events !== "object") {
    throw new Error("The server did not return the wedding event list.");
  }
  eventCatalog = data.events;
  directory = readDirectory();
  guests = data.guests.map((guest) => ({
    ...guest,
    id: String(guest.id),
    events: Array.isArray(guest.events) ? guest.events : []
  }));
  makeEventCheckboxes(eventOptions, "new-guest", []);
  populateEventFilter();
  renderGuestDirectory();
}

function showDashboard() {
  loginPanel.classList.add("hidden");
  dashboard.classList.remove("hidden");
  return loadGuests();
}

function resetGuestForm() {
  guestForm.reset();
  editingGuestId = null;
  document.getElementById("guestFormTitle").textContent = "Add a guest";
  document.getElementById("saveGuestButton").textContent = "Add guest";
  document.getElementById("cancelEditButton").classList.add("hidden");
  makeEventCheckboxes(eventOptions, "new-guest", []);
  createdLink.classList.add("hidden");
  createdLink.replaceChildren();
}

function beginEdit(guest) {
  const details = getGuestDetails(guest.id);
  editingGuestId = guest.id;
  guestNameInput.value = guest.name;
  guestPhoneInput.value = details.phone;
  guestNotesInput.value = details.notes;
  personalInput.checked = Boolean(details.personal);
  guestExpiryInput.value = toLocalDateTime(guest.expiresAt);
  makeEventCheckboxes(eventOptions, "edit-guest", guest.events);
  document.getElementById("guestFormTitle").textContent = `Edit ${guest.name}`;
  document.getElementById("saveGuestButton").textContent = "Save changes";
  document.getElementById("cancelEditButton").classList.remove("hidden");
  createdLink.classList.add("hidden");
  guestForm.scrollIntoView({ behavior: "smooth", block: "start" });
  guestNameInput.focus({ preventScroll: true });
}

function checkDuplicatePhone(phone, guestId) {
  const duplicate = guests.find((guest) =>
    guest.id !== String(guestId || "") &&
    getGuestDetails(guest.id).phone &&
    normalizePakistanPhone(getGuestDetails(guest.id).phone) === phone
  );
  if (duplicate) throw new Error(`This phone number is already assigned to ${duplicate.name}.`);
}

function displayCreatedLink(guest, invitationPath) {
  const label = document.createElement("p");
  label.textContent = `Private invitation link for ${guest.name}:`;
  const link = document.createElement("a");
  link.href = new URL(invitationPath, window.location.origin).href;
  link.textContent = link.href;
  link.rel = "noreferrer";
  const note = document.createElement("small");
  note.textContent = "Share this link privately. The server stores its token securely; this link is also kept in this browser for WhatsApp invitations.";
  createdLink.replaceChildren(label, link, note);
  createdLink.classList.remove("hidden");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector("button");
  button.disabled = true;
  try {
    await request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: document.getElementById("adminPassword").value })
    });
    loginForm.reset();
    showNotice("Signed in. Phone numbers, notes, and send status are stored in this browser; event permissions remain server-checked.", false);
    await showDashboard();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    button.disabled = false;
  }
});

guestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("saveGuestButton");
  button.disabled = true;
  try {
    const phone = normalizePakistanPhone(guestPhoneInput.value);
    checkDuplicatePhone(phone, editingGuestId);
    const selectedEvents = getSelectedEvents(guestForm);
    if (!selectedEvents.length) throw new Error("Select at least one invited event.");
    const localExpiry = guestExpiryInput.value;
    const payload = {
      name: guestNameInput.value.trim(),
      events: selectedEvents,
      expiresAt: localExpiry ? new Date(localExpiry).toISOString() : null
    };
    const details = {
      phone,
      notes: guestNotesInput.value.trim(),
      personal: personalInput.checked
    };

    if (editingGuestId) {
      const guestId = editingGuestId;
      await request(`/api/admin/guests/${guestId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      const savedLocally = saveGuestDetails(guestId, details);
      if (savedLocally) {
        showNotice(`${payload.name}'s details and event access were updated.`, false);
      }
      resetGuestForm();
    } else {
      const created = await request("/api/admin/guests", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const savedLocally = saveGuestDetails(created.id, {
        ...details,
        invitationStatus: "pending",
        invitationPath: created.invitationPath
      });
      displayCreatedLink(created, created.invitationPath);
      guestForm.reset();
      makeEventCheckboxes(eventOptions, "new-guest", []);
      if (savedLocally) {
        showNotice("Guest added. The private invitation link is ready to copy or send with WhatsApp.", false);
      }
    }
    await loadGuests();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("refreshButton").addEventListener("click", async () => {
  try {
    await loadGuests();
    showNotice("Guest directory is up to date.", false);
  } catch (error) {
    showNotice(error.message, true);
  }
});

document.getElementById("cancelEditButton").addEventListener("click", resetGuestForm);
searchInput.addEventListener("input", renderGuestDirectory);
categoryFilter.addEventListener("change", renderGuestDirectory);
eventFilter.addEventListener("change", renderGuestDirectory);

document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    await request("/api/admin/logout", { method: "POST", body: "{}" });
    dashboard.classList.add("hidden");
    loginPanel.classList.remove("hidden");
    resetGuestForm();
    showNotice("You have signed out.", false);
  } catch (error) {
    showNotice(error.message, true);
  }
});

request("/api/admin/guests")
  .then(() => showDashboard())
  .catch(() => {
    loginPanel.classList.remove("hidden");
    dashboard.classList.add("hidden");
  });
