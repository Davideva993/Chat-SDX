const API_URL = window.location.origin;
const container = document.getElementById("rooms-container");
const statusEl = document.getElementById("status");
const passwordInput = document.getElementById("passwordInput");
const rooms = {};

function render() {
    container.innerHTML = "";
    const keys = Object.keys(rooms);
    const active = keys.filter(function(k) { return rooms[k].state === "active"; });
    const waiting = keys.filter(function(k) { return rooms[k].state === "waiting"; });
    const done = keys.filter(function(k) { return rooms[k].state === "done"; });
    const total = active.length + waiting.length;
    if (total === 0 && done.length === 0) {
        statusEl.textContent = "Waiting for active challenges...";
        return;
    }
    statusEl.textContent = total + " active challenge(s)";
    for (let i = 0; i < active.length; i++) {
        const name = active[i];
        const card = document.createElement("div");
        card.className = "room-card";
        card.innerHTML = "<h3>Room: " + name + "</h3>" +
            "<p class='waiting'>Pick a fruit:</p>" +
            "<div>" +
            "<button class='fruit-btn' data-room='" + name + "' data-fruit='strawberry'>🍓 Strawberry</button>" +
            "<button class='fruit-btn' data-room='" + name + "' data-fruit='lemon'>🍋 Lemon</button>" +
            "<button class='fruit-btn' data-room='" + name + "' data-fruit='banana'>🍌 Banana</button>" +
            "</div>";
        container.appendChild(card);
    }
    for (let j = 0; j < waiting.length; j++) {
        const wname = waiting[j];
        const wcard = document.createElement("div");
        wcard.className = "room-card";
        wcard.innerHTML = "<h3>Room: " + wname + "</h3>" +
            "<p class='waiting'>Waiting for answers...</p>";
        container.appendChild(wcard);
    }
    for (let k = 0; k < done.length; k++) {
        const dname = done[k];
        const r = rooms[dname];
        const dcard = document.createElement("div");
        dcard.className = "room-card";
        dcard.innerHTML = "<h3>Room: " + dname + "</h3>" +
            "<p class='done'>Host: " + (r.results.hostAnswer || "?") + "</p>" +
            "<p class='done'>Joiner: " + (r.results.joinerAnswer || "?") + "</p>";
        container.appendChild(dcard);
    }
    const btns = document.querySelectorAll(".fruit-btn");
    for (let b = 0; b < btns.length; b++) {
        btns[b].addEventListener("click", function () {
            const room = this.getAttribute("data-room");
            const fruit = this.getAttribute("data-fruit");
            submitFruit(room, fruit);
        });
    }
}

async function poll() {
    try {
        const res = await fetch(API_URL + "/api/serverCheckChallenge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: passwordInput.value })
        });
        if (!res.ok) return;
        const data = await res.json();
        const activeRooms = data.activeRooms || [];
        const seen = {};
        for (let i = 0; i < activeRooms.length; i++) {
            const name = activeRooms[i].roomName;
            seen[name] = true;
            if (!rooms[name] || rooms[name].state === "active") {
                rooms[name] = { state: "active" };
            }
        }
        const keys = Object.keys(rooms);
        for (let j = 0; j < keys.length; j++) {
            const k = keys[j];
            if (!seen[k] && rooms[k].state === "active") {
                delete rooms[k];
            }
        }
        render();
    } catch (e) { /* retry next cycle */ }
}

async function readAnswers(roomName) {
    try {
        const res = await fetch(API_URL + "/api/serverReadAnswers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomName: roomName, password: passwordInput.value })
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.results;
    } catch (e) { return null; }
}

async function submitFruit(roomName, fruit) {
    try {
        rooms[roomName] = { state: "waiting" };
        render();
        const res = await fetch(API_URL + "/api/serverAnswerChallenge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomName: roomName, fruit: fruit, password: passwordInput.value })
        });
        if (!res.ok) { rooms[roomName] = { state: "active" }; render(); return; }
        const waiting = setInterval(async function () {
            const results = await readAnswers(roomName);
            if (results) {
                clearInterval(waiting);
                rooms[roomName] = { state: "done", results: results };
                render();
            }
        }, 2000);
    } catch (e) { if (rooms[roomName]) rooms[roomName].state = "active"; render(); }
}

poll();
setInterval(poll, 2000);
