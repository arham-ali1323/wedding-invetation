const envelope = document.getElementById("envelope");
const openButton = document.getElementById("openButton");
const invitation = document.getElementById("invitation");
const envelopeScreen = document.getElementById("envelopeScreen");

function openInvite() {
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

// Set your wedding date here. Format: YYYY-MM-DDTHH:MM:SS
const weddingDate = new Date("2026-12-12T19:00:00");
function updateCountdown() {
  let distance = Math.max(0, weddingDate.getTime() - Date.now());
  const values = {
    days: Math.floor(distance / 86400000),
    hours: Math.floor((distance % 86400000) / 3600000),
    minutes: Math.floor((distance % 3600000) / 60000),
    seconds: Math.floor((distance % 60000) / 1000)
  };
  Object.entries(values).forEach(([id, value]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value).padStart(2, "0");
  });
}
updateCountdown();
setInterval(updateCountdown, 1000);

function startPetals() {
  const layer = document.querySelector(".petal-layer");
  for (let i = 0; i < 22; i++) {
    const petal = document.createElement("span");
    petal.className = "petal";
    petal.style.left = Math.random() * 100 + "vw";
    petal.style.animationDuration = (7 + Math.random() * 8) + "s";
    petal.style.animationDelay = (Math.random() * 5) + "s";
    petal.style.setProperty("--drift", (Math.random() * 180 - 90) + "px");
    petal.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(petal);
  }
}
document.getElementById("rsvpForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.getElementById("guestName").value.trim();
  const attendance = document.getElementById("attendance").value;
  document.getElementById("rsvpMessage").textContent =
    `Thank you, ${name}! Your response: ${attendance}. Please send this confirmation to the hosts.`;
  event.target.reset();
});
const backToTop = document.getElementById("backToTop");
window.addEventListener("scroll", () => {
  backToTop.classList.toggle("visible", window.scrollY > 500);
});
backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
