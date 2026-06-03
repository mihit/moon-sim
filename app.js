const orbitCanvas = document.querySelector("#orbitCanvas");
const moonCanvas = document.querySelector("#moonCanvas");
const orbitCtx = orbitCanvas.getContext("2d");
const moonCtx = moonCanvas.getContext("2d");

const controls = {
  moonAngle: document.querySelector("#moonAngle"),
  timeOfDay: document.querySelector("#timeOfDay"),
  observerLongitude: document.querySelector("#observerLongitude"),
  sunAngle: document.querySelector("#sunAngle"),
  lockSun: document.querySelector("#lockSun"),
};

const labels = {
  phaseName: document.querySelector("#phaseName"),
  moonAge: document.querySelector("#moonAge"),
  timeReadout: document.querySelector("#timeReadout"),
  azimuthReadout: document.querySelector("#azimuthReadout"),
  altitudeReadout: document.querySelector("#altitudeReadout"),
  visibilityReadout: document.querySelector("#visibilityReadout"),
  phaseHint: document.querySelector("#phaseHint"),
};

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const LUNAR_MONTH_DAYS = 29.53;
let orbitLayout = null;
let dragState = null;
let elapsedHours = 0;
let lastClockHour = Number(controls.timeOfDay.value);

function norm360(value) {
  return ((value % 360) + 360) % 360;
}

function angleDiff(a, b) {
  return ((a - b + 540) % 360) - 180;
}

function polar(cx, cy, radius, deg) {
  const rad = deg * DEG;
  return {
    x: cx + Math.cos(rad) * radius,
    y: cy - Math.sin(rad) * radius,
  };
}

function pointAngle(cx, cy, x, y) {
  return norm360(Math.atan2(cy - y, x - cx) / DEG);
}

function sliderAngle(value) {
  const normalized = norm360(value);
  return normalized > 180 ? normalized - 360 : normalized;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resizeCanvas(canvas, ctx) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return rect;
}

function phaseInfo(separation) {
  const angle = norm360(separation);
  const age = (angle / 360) * LUNAR_MONTH_DAYS;
  const phases = [
    [6, "新月", "太陽と同じ方向にあるので見つけにくい。"],
    [35, "新月後", "右側が少しずつ光り始める。"],
    [75, "三日月", "右側が細く光り、夕方の西の空に見えやすい。"],
    [105, "上弦", "右半分が光って見える。"],
    [168, "満月前", "右側が大きく光って見える。"],
    [192, "満月", "太陽の反対側にあり、一晩中見えやすい。"],
    [230, "満月後", "左側を残して少しずつ欠けていく。"],
    [255, "寝待月", "左側が大きく光って見える。"],
    [285, "下弦", "左半分が光って見える。"],
    [325, "有明月", "左側が細く光り、明け方の東の空に見えやすい。"],
    [354, "新月前", "太陽に近づき、明け方でも見つけにくくなる。"],
    [360, "新月", "太陽と同じ方向にあるので見つけにくい。"],
  ];
  const phase = phases.find(([limit]) => angle < limit);
  return {
    age,
    name: phase[1],
    hint: phase[2],
  };
}

function directionName(azimuth) {
  const dirs = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  return dirs[Math.round(norm360(azimuth) / 45) % 8];
}

function formatTime(hourValue) {
  const totalMinutes = Math.round(hourValue * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function snapQuarterHour(hourValue) {
  return Math.round(norm360(hourValue * 15) / 3.75) / 4;
}

function elapsedDegreesFromHours(hours) {
  return (hours / 24 / LUNAR_MONTH_DAYS) * 360;
}

function signedClockDelta(fromHour, toHour) {
  return angleDiff(toHour * 15, fromHour * 15) / 15;
}

function skyInfo(localHour, moonSeparation) {
  const transit = 12 + moonSeparation / 15;
  const hourAngle = angleDiff(localHour * 15, transit * 15);
  const altitudeScore = Math.cos(hourAngle * DEG);
  const azimuth = norm360(180 + hourAngle);
  let altitude = "地平線下";
  if (altitudeScore > 0.82) altitude = "とても高い";
  else if (altitudeScore > 0.38) altitude = "高い";
  else if (altitudeScore > 0.05) altitude = "低い";
  else if (altitudeScore > -0.03) altitude = "地平線近く";

  const part = localHour < 4 ? "深夜" : localHour < 7 ? "明け方" : localHour < 11 ? "朝" : localHour < 15 ? "昼" : localHour < 18 ? "夕方" : localHour < 21 ? "夜" : "夜遅く";
  const visible = altitude !== "地平線下";
  return {
    azimuth,
    altitude,
    visible,
    summary: visible ? `${part}に${directionName(azimuth)}の空` : `${part}は地平線の下`,
  };
}

function drawArrow(ctx, from, to, color, label) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(angle - 0.45) * 14, to.y - Math.sin(angle - 0.45) * 14);
  ctx.lineTo(to.x - Math.cos(angle + 0.45) * 14, to.y - Math.sin(angle + 0.45) * 14);
  ctx.closePath();
  ctx.fill();
  ctx.font = "600 14px system-ui";
  ctx.fillText(label, to.x + 8, to.y - 8);
}

function drawMoonDisc(ctx, x, y, radius, separation, sunFromRight = true) {
  const size = Math.ceil(radius * 2);
  const moonImage = ctx.createImageData(size, size);
  const phaseAngle = norm360(separation) * DEG;
  const lightX = Math.sin(phaseAngle) * (sunFromRight ? 1 : -1);
  const lightZ = -Math.cos(phaseAngle);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const nx = (px + 0.5 - radius) / radius;
      const ny = (py + 0.5 - radius) / radius;
      const dist = Math.hypot(nx, ny);
      if (dist > 1) continue;

      const nz = Math.sqrt(1 - nx * nx - ny * ny);
      const lightAmount = Math.max(0, nx * lightX + nz * lightZ);
      const surface = 0.18 + lightAmount * 0.92;
      const rim = 1 - dist * 0.2;
      const base = lightAmount > 0 ? [245, 241, 223] : [18, 21, 25];
      const shade = lightAmount > 0 ? surface * rim : 0.72 + Math.max(0, -nx * 0.06 - ny * 0.06);
      const edgeAlpha = Math.min(1, Math.max(0, (1 - dist) * 18));
      const idx = (py * size + px) * 4;
      moonImage.data[idx] = Math.round(base[0] * shade);
      moonImage.data[idx + 1] = Math.round(base[1] * shade);
      moonImage.data[idx + 2] = Math.round(base[2] * shade);
      moonImage.data[idx + 3] = Math.round(255 * edgeAlpha);
    }
  }

  ctx.save();
  const bitmapCanvas = document.createElement("canvas");
  bitmapCanvas.width = size;
  bitmapCanvas.height = size;
  bitmapCanvas.getContext("2d").putImageData(moonImage, 0, 0);
  ctx.drawImage(bitmapCanvas, x - radius, y - radius, size, size);
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.stroke();
}

function drawEarth(ctx, cx, cy, radius, sunAngle, rotationAngle) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.clip();

  const ocean = ctx.createRadialGradient(cx - radius * 0.25, cy - radius * 0.28, radius * 0.1, cx, cy, radius);
  ocean.addColorStop(0, "#8fd2ef");
  ocean.addColorStop(0.48, "#4d94bb");
  ocean.addColorStop(1, "#1f3548");
  ctx.fillStyle = ocean;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-rotationAngle * DEG);
  ctx.fillStyle = "rgba(102, 193, 116, 0.55)";
  ctx.beginPath();
  ctx.ellipse(-radius * 0.32, -radius * 0.16, radius * 0.22, radius * 0.1, 0.35, 0, TAU);
  ctx.ellipse(radius * 0.28, radius * 0.08, radius * 0.28, radius * 0.13, -0.55, 0, TAU);
  ctx.ellipse(-radius * 0.02, radius * 0.33, radius * 0.18, radius * 0.08, 0.15, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1.2;
  for (let x = -radius * 0.75; x <= radius * 0.75; x += radius * 0.38) {
    ctx.beginPath();
    ctx.ellipse(x, 0, radius * 0.12, radius * 0.92, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  const sunDx = Math.cos(sunAngle * DEG);
  const sunDy = -Math.sin(sunAngle * DEG);
  const daylight = ctx.createLinearGradient(
    cx - sunDx * radius,
    cy - sunDy * radius,
    cx + sunDx * radius,
    cy + sunDy * radius
  );
  daylight.addColorStop(0, "rgba(5, 10, 18, 0.58)");
  daylight.addColorStop(0.48, "rgba(5, 10, 18, 0.1)");
  daylight.addColorStop(1, "rgba(255, 246, 205, 0.16)");
  ctx.fillStyle = daylight;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();

  ctx.strokeStyle = "#9fd7f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.stroke();
}

function drawOrbit(state) {
  const rect = resizeCanvas(orbitCanvas, orbitCtx);
  const width = rect.width;
  const height = rect.height;
  const cx = width * 0.48;
  const cy = height * 0.52;
  const orbitRadius = Math.min(width, height) * 0.31;
  const earthRadius = Math.min(width, height) * 0.085;
  const moonRadius = Math.min(width, height) * 0.038;
  const rotationRadius = earthRadius + 22;
  const sunAngle = state.lockSun ? 0 : state.sunAngle;
  const moonSeparation = norm360(state.moonAngle + elapsedDegreesFromHours(elapsedHours));
  const moonAngle = norm360(moonSeparation + sunAngle);
  const observerAngle = norm360(sunAngle + state.timeOfDay * 15 + state.observerLongitude - 180);
  const moon = polar(cx, cy, orbitRadius, moonAngle);
  const observer = polar(cx, cy, earthRadius + 3, observerAngle);
  const rotationHandle = polar(cx, cy, rotationRadius, observerAngle);
  const rayStart = polar(cx, cy, orbitRadius + 115, sunAngle);
  const rayEnd = polar(cx, cy, earthRadius + 70, sunAngle);
  const sunGlow = polar(cx, cy, orbitRadius + 100, sunAngle);
  orbitLayout = { cx, cy, orbitRadius, earthRadius, moonRadius, rotationRadius, moon, observer, rotationHandle, sunAngle, rayStart, rayEnd, sunGlow };

  orbitCtx.clearRect(0, 0, width, height);
  orbitCtx.fillStyle = "#0f1216";
  orbitCtx.fillRect(0, 0, width, height);

  for (let i = 0; i < 140; i += 1) {
    const x = (Math.sin(i * 57.2) * 0.5 + 0.5) * width;
    const y = (Math.cos(i * 31.7) * 0.5 + 0.5) * height;
    orbitCtx.fillStyle = i % 9 === 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)";
    orbitCtx.fillRect(x, y, 1.3, 1.3);
  }

  orbitCtx.strokeStyle = "rgba(255,255,255,0.22)";
  orbitCtx.lineWidth = 2;
  orbitCtx.beginPath();
  orbitCtx.arc(cx, cy, orbitRadius, 0, TAU);
  orbitCtx.stroke();

  drawArrow(orbitCtx, rayStart, rayEnd, "#f5c15a", "太陽光");

  drawEarth(orbitCtx, cx, cy, earthRadius, sunAngle, observerAngle);

  orbitCtx.strokeStyle = "rgba(141,209,141,0.36)";
  orbitCtx.lineWidth = 2;
  orbitCtx.beginPath();
  orbitCtx.arc(cx, cy, rotationRadius, 0, TAU);
  orbitCtx.stroke();

  orbitCtx.strokeStyle = "rgba(141,209,141,0.8)";
  orbitCtx.lineWidth = 2;
  orbitCtx.beginPath();
  orbitCtx.moveTo(observer.x, observer.y);
  orbitCtx.lineTo(rotationHandle.x, rotationHandle.y);
  orbitCtx.stroke();

  orbitCtx.fillStyle = "#8dd18d";
  orbitCtx.beginPath();
  orbitCtx.arc(rotationHandle.x, rotationHandle.y, 8, 0, TAU);
  orbitCtx.fill();
  orbitCtx.strokeStyle = "#0d0f12";
  orbitCtx.lineWidth = 2;
  orbitCtx.stroke();

  orbitCtx.fillStyle = "#73c76f";
  orbitCtx.beginPath();
  orbitCtx.arc(observer.x, observer.y, 7, 0, TAU);
  orbitCtx.fill();
  orbitCtx.strokeStyle = "#0d0f12";
  orbitCtx.lineWidth = 2;
  orbitCtx.stroke();

  orbitCtx.strokeStyle = "rgba(141,209,141,0.75)";
  orbitCtx.setLineDash([5, 6]);
  orbitCtx.beginPath();
  orbitCtx.moveTo(observer.x, observer.y);
  orbitCtx.lineTo(moon.x, moon.y);
  orbitCtx.stroke();
  orbitCtx.setLineDash([]);

  drawMoonDisc(orbitCtx, moon.x, moon.y, moonRadius, moonSeparation, Math.cos(sunAngle * DEG) >= 0);

  orbitCtx.fillStyle = "#f4f0e8";
  orbitCtx.font = "700 16px system-ui";
  orbitCtx.fillText("地球", cx - 18, cy + 5);
  orbitCtx.fillText("月", moon.x + moonRadius + 8, moon.y + 5);
  orbitCtx.fillStyle = "#8dd18d";
  orbitCtx.fillText("観測者", observer.x + 10, observer.y - 10);

  orbitCtx.fillStyle = "rgba(245,193,90,0.12)";
  orbitCtx.beginPath();
  orbitCtx.arc(sunGlow.x, sunGlow.y, 42, 0, TAU);
  orbitCtx.fill();
}

function drawObservedMoon(state) {
  resizeCanvas(moonCanvas, moonCtx);
  const rect = moonCanvas.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  moonCtx.clearRect(0, 0, rect.width, rect.height);
  drawMoonDisc(moonCtx, cx, cy, Math.min(rect.width, rect.height) * 0.39, state.moonSeparation, true);
}

function render() {
  const state = {
    moonAngle: Number(controls.moonAngle.value),
    timeOfDay: Number(controls.timeOfDay.value),
    observerLongitude: Number(controls.observerLongitude.value),
    sunAngle: Number(controls.sunAngle.value),
    lockSun: controls.lockSun.checked,
  };
  state.moonSeparation = norm360(state.moonAngle + elapsedDegreesFromHours(elapsedHours));
  const phase = phaseInfo(state.moonSeparation);
  const localHour = norm360(state.timeOfDay * 15 + state.observerLongitude) / 15;
  const sky = skyInfo(localHour, state.moonSeparation);

  labels.phaseName.textContent = phase.name;
  labels.moonAge.textContent = `月齢 ${phase.age.toFixed(1)}`;
  labels.timeReadout.textContent = formatTime(state.timeOfDay);
  labels.azimuthReadout.textContent = sky.visible ? directionName(sky.azimuth) : "見えない";
  labels.altitudeReadout.textContent = sky.altitude;
  labels.visibilityReadout.textContent = sky.summary;
  labels.phaseHint.textContent = phase.hint;
  controls.sunAngle.disabled = state.lockSun;

  drawOrbit(state);
  drawObservedMoon(state);
}

function canvasPoint(event) {
  const rect = orbitCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function hitTarget(point) {
  if (!orbitLayout) return null;
  const moonHitRadius = Math.max(28, orbitLayout.moonRadius + 12);
  const observerHitRadius = 22;
  const handleHitRadius = 28;
  const sunHitRadius = 58;
  const orbitDistance = Math.abs(distance(point, { x: orbitLayout.cx, y: orbitLayout.cy }) - orbitLayout.orbitRadius);
  const rotationDistance = Math.abs(distance(point, { x: orbitLayout.cx, y: orbitLayout.cy }) - orbitLayout.rotationRadius);

  if (distance(point, orbitLayout.moon) <= moonHitRadius || orbitDistance < 14) return "moon";
  if (distance(point, orbitLayout.rotationHandle) <= handleHitRadius || rotationDistance < 10 || distance(point, orbitLayout.observer) <= observerHitRadius) return "earth";
  if (distance(point, orbitLayout.sunGlow) <= sunHitRadius || distance(point, orbitLayout.rayStart) <= sunHitRadius) return "sun";
  return null;
}

function syncFromDrag(point) {
  if (!dragState || !orbitLayout) return;
  const angle = pointAngle(orbitLayout.cx, orbitLayout.cy, point.x, point.y);
  const currentSunAngle = controls.lockSun.checked ? 0 : Number(controls.sunAngle.value);

  if (dragState.target === "moon") {
    controls.moonAngle.value = Math.round(norm360(angle - currentSunAngle - elapsedDegreesFromHours(elapsedHours)));
  }

  if (dragState.target === "earth") {
    const stepDelta = angleDiff(angle, dragState.lastAngle);
    dragState.cumulativeAngle += stepDelta;
    dragState.lastAngle = angle;
    const deltaAngle = dragState.cumulativeAngle;
    const rawElapsedHours = dragState.startElapsedHours + deltaAngle / 15;
    elapsedHours = Math.round(rawElapsedHours * 4) / 4;
    const clockHour = snapQuarterHour(dragState.startClockHour + deltaAngle / 15);
    controls.timeOfDay.value = clockHour;
    lastClockHour = clockHour;
  }

  if (dragState.target === "sun") {
    if (controls.lockSun.checked) controls.lockSun.checked = false;
    controls.sunAngle.value = Math.round(sliderAngle(angle));
    controls.moonAngle.value = Math.round(norm360(dragState.absoluteMoonAngle - angle - elapsedDegreesFromHours(elapsedHours)));
  }

  render();
}

orbitCanvas.addEventListener("pointerdown", (event) => {
  const point = canvasPoint(event);
  const target = hitTarget(point);
  if (!target || !orbitLayout) return;

  dragState = {
    target,
    startAngle: pointAngle(orbitLayout.cx, orbitLayout.cy, point.x, point.y),
    lastAngle: pointAngle(orbitLayout.cx, orbitLayout.cy, point.x, point.y),
    cumulativeAngle: 0,
    startClockHour: Number(controls.timeOfDay.value),
    startElapsedHours: elapsedHours,
    absoluteMoonAngle: norm360(Number(controls.moonAngle.value) + elapsedDegreesFromHours(elapsedHours) + orbitLayout.sunAngle),
  };
  orbitCanvas.classList.add("dragging");
  orbitCanvas.setPointerCapture(event.pointerId);
  syncFromDrag(point);
});

orbitCanvas.addEventListener("pointermove", (event) => {
  const point = canvasPoint(event);
  if (dragState) {
    syncFromDrag(point);
    return;
  }

  const target = hitTarget(point);
  orbitCanvas.classList.toggle("can-drag", Boolean(target));
});

function stopDrag(event) {
  if (!dragState) return;
  dragState = null;
  orbitCanvas.classList.remove("dragging");
  if (orbitCanvas.hasPointerCapture(event.pointerId)) {
    orbitCanvas.releasePointerCapture(event.pointerId);
  }
}

orbitCanvas.addEventListener("pointerup", stopDrag);
orbitCanvas.addEventListener("pointercancel", stopDrag);
orbitCanvas.addEventListener("pointerleave", () => {
  if (!dragState) orbitCanvas.classList.remove("can-drag");
});

document.querySelectorAll("[data-angle]").forEach((button) => {
  button.addEventListener("click", () => {
    controls.moonAngle.value = button.dataset.angle;
    elapsedHours = 0;
    lastClockHour = Number(controls.timeOfDay.value);
    render();
  });
});

Object.values(controls).forEach((control) => {
  control.addEventListener("input", () => {
    if (control === controls.timeOfDay) {
      const nextClockHour = Number(controls.timeOfDay.value);
      elapsedHours += signedClockDelta(lastClockHour, nextClockHour);
      elapsedHours = Math.round(elapsedHours * 4) / 4;
      lastClockHour = nextClockHour;
    }
    render();
  });
});
window.addEventListener("resize", render);
render();
