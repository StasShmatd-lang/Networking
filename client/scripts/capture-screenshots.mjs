import { chromium, devices } from "playwright";
import fs from "fs";
import path from "path";

const base = process.env.BASE_URL || "http://127.0.0.1:5173";
const mediaDir = process.env.MEDIA_DIR || "/cursor/stores/self/media";
fs.mkdirSync(mediaDir, { recursive: true });

const hostOut = path.join(mediaDir, "networking-host.png");
const guestOut = path.join(mediaDir, "networking-guest.png");
const screenOut = path.join(mediaDir, "networking-screen.png");
const searchOut = path.join(mediaDir, "networking-screen-search.png");

const browser = await chromium.launch();
const iPhone = devices["iPhone 13"];

const created = await fetch("http://127.0.0.1:3001/api/events", { method: "POST" }).then((r) => r.json());
const eventId = created.id;
const hostToken = created.hostToken;
console.log("event", eventId);

const seedCtx = await browser.newContext();
const seedPage = await seedCtx.newPage();
await seedPage.goto(base, { waitUntil: "networkidle" });

const guests = await seedPage.evaluate(async () => {
  function canvasColor(hex) {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = hex;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#fff";
    g.font = "bold 42px sans-serif";
    g.fillText(hex.slice(1, 3).toUpperCase(), 36, 76);
    return new Promise((resolve) => c.toBlob(resolve, "image/png"));
  }
  const people = [
    ["Анна К.", "Alpha", "#2A9D8F"],
    ["Илья М.", "Beta Labs", "#C9A66B"],
    ["Мария С.", "Orbit", "#E8573A"],
    ["Пётр В.", "Nord", "#4A6FA5"],
    ["Ольга Р.", "Pulse", "#8B5E3C"],
    ["Кирилл Д.", "Wave", "#3D5A5B"],
  ];
  const out = [];
  for (const [name, company, color] of people) {
    const blob = await canvasColor(color);
    const fd = new FormData();
    fd.append("photo", blob, `${name}.png`);
    const up = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
    out.push({ name, company, photoUrl: up.photoUrl });
  }
  return out;
});

await seedPage.evaluate(
  async ({ eventId, guests }) => {
    const { io } = await import("https://cdn.socket.io/4.8.1/socket.io.esm.min.js");
    const socket = io({ path: "/socket.io", transports: ["websocket"] });
    await new Promise((res) => socket.on("connect", res));
    for (const g of guests) {
      await new Promise((res) => {
        socket.emit("guest:join", { eventId, ...g }, () => res());
      });
    }
    socket.disconnect();
  },
  { eventId, guests },
);

const hostCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
const hostPage = await hostCtx.newPage();
await hostPage.addInitScript((token) => {
  const id = location.pathname.split("/").pop();
  sessionStorage.setItem(`hostToken:${id}`, token);
}, hostToken);
await hostPage.goto(`${base}/host/${eventId}`, { waitUntil: "networkidle" });
await hostPage.getByText("Панель ведущего").waitFor({ timeout: 15000 });
await hostPage.waitForTimeout(800);
await hostPage.screenshot({ path: hostOut, type: "png", fullPage: false });

const guestCtx = await browser.newContext({ ...iPhone, locale: "ru-RU" });
const guestPage = await guestCtx.newPage();
await guestPage.goto(`${base}/join/${eventId}`, { waitUntil: "networkidle" });
const nameInput = guestPage.getByPlaceholder("Как к вам обращаться");
if (await nameInput.count()) {
  await nameInput.fill("София Л.");
  await guestPage.getByPlaceholder("Где работаете").fill("Horizon");
  await guestPage.getByRole("button", { name: "Войти" }).click();
  await guestPage.getByText("Ждём старта").waitFor({ timeout: 15000 });
}
await guestPage.waitForTimeout(600);
await guestPage.screenshot({ path: guestOut, type: "png", fullPage: true });

await seedPage.evaluate(
  async ({ eventId, hostToken }) => {
    const { io } = await import("https://cdn.socket.io/4.8.1/socket.io.esm.min.js");
    const socket = io({ path: "/socket.io", transports: ["websocket"] });
    await new Promise((res) => socket.on("connect", res));
    await new Promise((res) => socket.emit("host:start", { eventId, hostToken }, () => res()));
    await new Promise((r) => setTimeout(r, 400));
    await new Promise((res) => socket.emit("host:skip", { eventId, hostToken }, () => res()));
    await new Promise((r) => setTimeout(r, 400));
    await new Promise((res) => socket.emit("host:skip", { eventId, hostToken }, () => res()));
    socket.disconnect();
  },
  { eventId, hostToken },
);

const screenCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
const screenPage = await screenCtx.newPage();
await screenPage.goto(`${base}/screen/${eventId}`, { waitUntil: "networkidle" });
await screenPage.getByRole("heading", { name: /Говорите|Найдите|Перемешиваем|Сканируйте/ }).waitFor({
  timeout: 15000,
});
await screenPage.waitForTimeout(1000);
await screenPage.screenshot({ path: screenOut, type: "png", fullPage: false });

await seedPage.evaluate(
  async ({ eventId, hostToken }) => {
    const { io } = await import("https://cdn.socket.io/4.8.1/socket.io.esm.min.js");
    const socket = io({ path: "/socket.io", transports: ["websocket"] });
    await new Promise((res) => socket.on("connect", res));
    await new Promise((res) => socket.emit("host:stop", { eventId, hostToken }, () => res()));
    await new Promise((res) => socket.emit("host:start", { eventId, hostToken }, () => res()));
    await new Promise((r) => setTimeout(r, 300));
    await new Promise((res) => socket.emit("host:skip", { eventId, hostToken }, () => res()));
    socket.disconnect();
  },
  { eventId, hostToken },
);
await screenPage.reload({ waitUntil: "networkidle" });
await screenPage.getByRole("heading", { name: /Найдите свою пару/ }).waitFor({ timeout: 15000 });
await screenPage.waitForTimeout(900);
await screenPage.screenshot({ path: searchOut, type: "png", fullPage: false });

await browser.close();
console.log("saved", hostOut, guestOut, screenOut, searchOut);
