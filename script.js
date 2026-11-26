const envelope = document.getElementById("envelope");
const openButton = document.getElementById("openButton");
const invitation = document.getElementById("invitation");
const envelopeScreen = document.getElementById("envelopeScreen");
const invalidInvitation = document.getElementById("invalidInvitation");
let invitationReady = false;
let opening = false;

function showInvalidInvitation(title, message) {
  document.getElementById("invalidTitle").textContent = title;
  document.getElementById("invalidMessage").textContent = message;
  invalidInvitation.classList.remove("hidden");
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function addText(parent, tag, className, text) {
  const node = element(tag, className, text);
  parent.appendChild(node);
  return node;
}

function createEventCard(event, index) {
  const card = element("article", `event-card event-card--${event.id}`);
  card.style.setProperty("--card-delay", `${index * 140}ms`);

  if (event.id === "mehndi") {
    addText(card, "div", "mehndi-garland", "✿  ·  ❀  ·  ✿");
    addText(card, "p", "event-label", event.label);
    addText(card, "div", "event-icon mehndi-icon", event.symbol);
    addText(card, "h3", "event-title", event.name);
    addText(card, "p", "event-date", event.date);
    addText(card, "div", "event-rule", "✦");
    addText(card, "p", "event-time", event.time);
    const venue = addText(card, "p", "venue", event.venue);
    addText(venue, "span", "", event.city);
    addText(card, "div", "mehndi-diyas", "◈     ◈     ◈");
  } else if (event.id === "barat") {
    const frame = addText(card, "div", "barat-frame", "");
    addText(frame, "span", "barat-corner barat-corner--left", "❧");
    addText(frame, "span", "barat-corner barat-corner--right", "❧");
    const badge = addText(frame, "div", "event-badge", "");
    addText(badge, "span", "badge-line", "");
    addText(badge, "p", "event-label", event.label);
    addText(badge, "span", "badge-line", "");
    addText(frame, "div", "event-icon barat-icon", event.symbol);
    addText(frame, "h3", "event-title", event.name);
    addText(frame, "p", "event-date", event.date);
    addText(frame, "div", "event-rule", "✦");
    addText(frame, "p", "event-time", event.time);
    addText(frame, "p", "venue-name", event.venue);
    addText(frame, "p", "venue-city", event.city);
    addText(frame, "span", "barat-corner barat-corner--bottom-left", "❧");
    addText(frame, "span", "barat-corner barat-corner--bottom-right", "❧");
  } else {
    addText(card, "div", "walima-moon", "☾");
    addText(card, "p", "event-label", event.label);
    addText(card, "div", "event-icon walima-icon", event.symbol);
    addText(card, "h3", "event-title", event.name);
    addText(card, "p", "event-date", event.date);
    addText(card, "div", "event-rule", "✧");
    addText(card, "p", "event-time", event.time);
    const venue = addText(card, "p", "venue", event.venue);
    addText(venue, "span", "", event.city);
    addText(card, "div", "walima-flourish", "❋");
  }
  return card;
}

function showInvitation(data) {
  document.getElementById("guestGreeting").textContent = `Dear ${data.guestName},`;
  document.getElementById("eventsFor").textContent = `Celebrating with ${data.guestName}`;
  document.getElementById("eventsFor").classList.remove("hidden");
  const grid = document.getElementById("eventGrid");
  data.events.forEach((event, index) => grid.appendChild(createEventCard(event, index)));
  invitationReady = true;
  envelopeScreen.classList.remove("hidden");
}

async function loadInvitation() {
  if (window.location.pathname === "/" || window.location.pathname === "/index.html") {
    envelopeScreen.classList.remove("hidden");
    openButton.hidden = true;
    document.querySelector(".open-hint").textContent =
      "GUESTS: PLEASE OPEN YOUR PERSONAL INVITATION LINK";
    envelope.removeAttribute("role");
    envelope.removeAttribute("tabindex");
    envelope.setAttribute("aria-label", "Wedding invitation envelope");
    return;
  }

  const match = window.location.pathname.match(/^\/invite\/([a-f0-9]{64})\/?$/);
  if (!match) {
    showInvalidInvitation(
      "Your invitation link is incomplete",
      "Please open the personal invitation link shared by the hosts, or contact them for a new one."
    );
    return;
  }
  try {
    const response = await fetch(`/api/invitations/${match[1]}`, {
      cache: "no-store",
      credentials: "same-origin"
    });
    const data = await response.json();
    if (!response.ok) {
      showInvalidInvitation(
        response.status === 410 ? "This invitation has expired" : "Invitation unavailable",
        data.error || "This invitation link is invalid or expired. Please contact the hosts for a new link."
      );
      return;
    }
    if (!Array.isArray(data.events) || data.events.length === 0 || !data.guestName) {
      showInvalidInvitation("Invitation unavailable", "Please contact the hosts for a valid invitation link.");
      return;
    }
    showInvitation(data);
  } catch (error) {
    showInvalidInvitation(
      "We could not load your invitation",
      "Please check your connection and try opening your private link again."
    );
  }
}

function openInvite() {
  if (!invitationReady || opening) return;
  opening = true;
  envelope.classList.add("open");
  openButton.disabled = true;
  openButton.textContent = "Your invitation is opening…";
  setTimeout(() => {
    envelopeScreen.style.display = "none";
    invitation.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
    startPetals();
  }, 1050);
}

envelope.addEventListener("click", openInvite);
envelope.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openInvite();
  }
});
openButton.addEventListener("click", (event) => {
  event.stopPropagation();
  openInvite();
});

let petalsActive = false;

function startPetals() {
  if (petalsActive || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = document.querySelector(".petal-layer");
  if (!layer) return;
  petalsActive = true;

  const colors = [
    "rgba(176, 203, 229, 0.72)",
    "rgba(247, 197, 207, 0.72)",
    "rgba(255, 255, 255, 0.80)",
    "rgba(250, 217, 194, 0.72)",
    "rgba(229, 169, 189, 0.72)"
  ];
  const shapes = [
    "60% 40% 70% 30%",
    "70% 30% 70% 30%",
    "80% 20% 80% 20%",
    "55% 45% 60% 40%",
    "65% 35% 65% 35%"
  ];
  const isMobile = window.matchMedia("(max-width: 700px)").matches;
  const maxPetals = isMobile ? 24 : 44;
  const spawnMs = isMobile ? 650 : 360;

  function spawn() {
    const size = 8 + Math.random() * 13;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const opacity = 0.55 + Math.random() * 0.35;
    const duration = 7 + Math.random() * 11;
    const delay = Math.random() * 4;
    const drift = `${Math.random() * 160 - 80}px`;
    const startRot = `${Math.random() * 360}deg`;
    const endRot = `${Math.random() * 720 - 360}deg`;
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const petal = document.createElement("span");
    petal.className = "petal";
    petal.style.left = `${Math.random() * 100}vw`;
    petal.style.width = `${size}px`;
    petal.style.height = `${size * 1.25}px`;
    petal.style.borderRadius = shape;
    petal.style.background = color;
    petal.style.opacity = opacity;
    petal.style.boxShadow = "inset 1.5px 1.5px 3px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.08)";
    petal.style.animationDuration = `${duration}s`;
    petal.style.animationDelay = `${delay}s`;
    petal.style.setProperty("--petal-drift", drift);
    petal.style.setProperty("--petal-start-rot", startRot);
    petal.style.setProperty("--petal-end-rot", endRot);
    petal.addEventListener("animationend", () => petal.remove());
    setTimeout(() => petal.remove(), (duration + delay + 3) * 1000);
    layer.appendChild(petal);
  }

  let lastSpawn = performance.now();
  function tick(now) {
    if (!petalsActive) return;
    if (now - lastSpawn >= spawnMs && layer.children.length < maxPetals) {
      spawn();
      lastSpawn = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const rsvpForm = document.getElementById("rsvpForm");
if (rsvpForm) {
  rsvpForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("guestName").value.trim();
    const attendance = document.getElementById("attendance").value;
    document.getElementById("rsvpMessage").textContent =
      `Thank you, ${name}! Your response: ${attendance}. Please send this confirmation to the hosts.`;
    event.target.reset();
  });
}

const backToTop = document.getElementById("backToTop");
window.addEventListener("scroll", () => {
  backToTop.classList.toggle("visible", window.scrollY > 500);
});
backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

const section = document.querySelector(".looking-forward");
if (section && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) section.classList.add("show");
    });
  }, { threshold: 0.3 });
  observer.observe(section);
}

loadInvitation();
