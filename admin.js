const loginPanel = document.getElementById("loginPanel");
const loginForm = document.getElementById("loginForm");
const dashboard = document.getElementById("adminDashboard");
const guestForm = document.getElementById("guestForm");
const guestList = document.getElementById("guestList");
const notice = document.getElementById("adminNotice");
const createdLink = document.getElementById("createdLink");
const eventNames = { mehndi: "Mehndi", barat: "Barat", walima: "Walima" };

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

function makeEventCheckboxes(container, prefix, selected) {
  container.replaceChildren();
  Object.entries(eventNames).forEach(([id, name]) => {
    const label = document.createElement("label");
    label.className = "event-choice";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "events";
    checkbox.value = id;
    checkbox.id = `${prefix}-${id}`;
    checkbox.checked = selected.includes(id);
    const text = document.createElement("span");
    text.textContent = name;
    label.append(checkbox, text);
    container.appendChild(label);
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

function createGuestCard(guest) {
  const card = document.createElement("article");
  card.className = "guest-row";
  const heading = document.createElement("div");
  heading.className = "guest-row-heading";
  const title = document.createElement("h3");
  title.textContent = guest.name;
  const status = document.createElement("span");
  status.className = "guest-link-status";
  status.textContent = guest.expiresAt ? `Expires ${new Date(guest.expiresAt).toLocaleString()}` : "No expiry";
  heading.append(title, status);

  const form = document.createElement("form");
  form.className = "guest-edit-form";
  const eventFieldset = document.createElement("fieldset");
  eventFieldset.className = "admin-events";
  const legend = document.createElement("legend");
  legend.textContent = "Invited events";
  const choices = document.createElement("div");
  choices.className = "event-options";
  makeEventCheckboxes(choices, `guest-${guest.id}`, guest.events);
  eventFieldset.append(legend, choices);

  const expiryLabel = document.createElement("label");
  expiryLabel.textContent = "Link expires (optional)";
  const expiryInput = document.createElement("input");
  expiryInput.name = "expiresAt";
  expiryInput.type = "datetime-local";
  expiryInput.value = toLocalDateTime(guest.expiresAt);
  expiryLabel.appendChild(expiryInput);

  const actions = document.createElement("div");
  actions.className = "guest-actions";
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save permissions";
  const revoke = document.createElement("button");
  revoke.type = "button";
  revoke.className = "revoke-button";
  revoke.textContent = "Revoke link";
  actions.append(save, revoke);
  form.append(eventFieldset, expiryLabel, actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const localExpiry = expiryInput.value;
      await request(`/api/admin/guests/${guest.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: guest.name,
          events: getSelectedEvents(form),
          expiresAt: localExpiry ? new Date(localExpiry).toISOString() : null
        })
      });
      showNotice(`Saved event access for ${guest.name}.`, false);
      await loadGuests();
    } catch (error) {
      showNotice(error.message, true);
    }
  });

  revoke.addEventListener("click", async () => {
    if (!window.confirm(`Revoke ${guest.name}'s invitation link? They will no longer be able to open it.`)) return;
    try {
      await request(`/api/admin/guests/${guest.id}`, { method: "DELETE" });
      showNotice(`Revoked the invitation link for ${guest.name}.`, false);
      await loadGuests();
    } catch (error) {
      showNotice(error.message, true);
    }
  });

  card.append(heading, form);
  return card;
}

async function loadGuests() {
  const data = await request("/api/admin/guests");
  guestList.replaceChildren();
  if (!data.guests.length) {
    const empty = document.createElement("p");
    empty.className = "empty-guests";
    empty.textContent = "No guest invitations yet. Add a guest above to create the first private link.";
    guestList.appendChild(empty);
  }
  data.guests.forEach((guest) => guestList.appendChild(createGuestCard(guest)));
}

function showDashboard() {
  loginPanel.classList.add("hidden");
  dashboard.classList.remove("hidden");
  makeEventCheckboxes(document.getElementById("newGuestEvents"), "new-guest", []);
  return loadGuests();
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
    showNotice("You are signed in. Guest links are private; share each link only with its guest.", false);
    await showDashboard();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    button.disabled = false;
  }
});

guestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = guestForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const localExpiry = guestForm.elements.expiresAt.value;
    const guest = await request("/api/admin/guests", {
      method: "POST",
      body: JSON.stringify({
        name: guestForm.elements.name.value,
        events: getSelectedEvents(guestForm),
        expiresAt: localExpiry ? new Date(localExpiry).toISOString() : null
      })
    });
    const label = document.createElement("p");
    label.textContent = `Private invitation link for ${guest.name}:`;
    const link = document.createElement("a");
    link.href = `${window.location.origin}${guest.invitationPath}`;
    link.textContent = link.href;
    link.rel = "noreferrer";
    const note = document.createElement("small");
    note.textContent = "Copy and share this link now. The private token is shown only once and cannot be recovered later.";
    createdLink.replaceChildren(label, link, note);
    createdLink.classList.remove("hidden");
    guestForm.reset();
    makeEventCheckboxes(document.getElementById("newGuestEvents"), "new-guest", []);
    showNotice("Invitation link created. Share it privately with this guest.", false);
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
    showNotice("Guest list is up to date.", false);
  } catch (error) {
    showNotice(error.message, true);
  }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    await request("/api/admin/logout", { method: "POST", body: "{}" });
    dashboard.classList.add("hidden");
    loginPanel.classList.remove("hidden");
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
