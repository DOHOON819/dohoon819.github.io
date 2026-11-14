const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";
const TOPIC_ROOT = "dohoon819/esp32-light/04fa372de25d455cb9cbfb965edd2193";
const DATA_TOPIC = `${TOPIC_ROOT}/data`;
const STATUS_TOPIC = `${TOPIC_ROOT}/status`;
const MAX_POINTS = 30;

const elements = {
  connection: document.querySelector("#connection"),
  connectionText: document.querySelector("#connectionText"),
  soilCard: document.querySelector("#soilCard"),
  soilState: document.querySelector("#soilState"),
  gauge: document.querySelector("#moistureGauge"),
  soilPercent: document.querySelector("#soilPercent"),
  soilRaw: document.querySelector("#soilRaw"),
  soilDescription: document.querySelector("#soilDescription"),
  moistureFill: document.querySelector("#moistureFill"),
  lastSeen: document.querySelector("#lastSeen"),
  rssi: document.querySelector("#rssiValue"),
  uptime: document.querySelector("#uptimeValue"),
  canvas: document.querySelector("#soilChart"),
  chartEmpty: document.querySelector("#chartEmpty"),
  reconnect: document.querySelector("#reconnectButton"),
  waterStatus: document.querySelector("#waterStatus"),
  waterTitle: document.querySelector("#waterTitle"),
  waterDescription: document.querySelector("#waterDescription"),
};

let client;
let lastMessageAt = 0;
let waitingSince = Date.now();
const readings = [];

function setConnection(state, text) {
  elements.connection.dataset.state = state;
  elements.connectionText.textContent = text;
  if (state !== "offline" || !lastMessageAt) return;
  if (elements.soilCard.dataset.state !== "error") {
    elements.soilCard.dataset.state = "stale";
    elements.soilState.textContent = "마지막 측정";
    elements.soilDescription.textContent = "연결이 끊겨 마지막 측정값을 표시하고 있어요.";
  }
  const empty = elements.waterStatus.dataset.state === "empty";
  if (!empty) {
    elements.waterStatus.dataset.state = "stale";
    elements.waterTitle.textContent = "수위를 다시 확인해야 해요";
  }
  elements.waterDescription.textContent = empty
    ? "마지막 수신 기준 물 부족 상태예요. 연결 후 다시 확인할게요."
    : "연결이 복구되면 현재 물통 상태를 확인할게요.";
}

function describeSoil(percent) {
  if (percent < 20) return "흙이 많이 말랐어요. 물통 상태도 함께 살펴보세요.";
  if (percent < 40) return "흙이 조금 건조해요. 수분의 변화를 지켜봐 주세요.";
  if (percent < 70) return "흙이 적당히 촉촉해요. 오늘도 천천히 자라는 중이에요.";
  if (percent < 90) return "흙에 수분이 충분해요. 촉촉한 상태를 유지하고 있어요.";
  return "수분이 많은 상태예요. 흙이 마를 시간을 주세요.";
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return "--";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

function sensorNumber(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "") || typeof value === "boolean") {
    return NaN;
  }
  return typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
}

function updateWaterStatus(payload) {
  if (typeof payload.waterEmpty !== "boolean") {
    elements.waterStatus.dataset.state = "unknown";
    elements.waterTitle.textContent = "물통 상태 확인 중";
    elements.waterDescription.textContent = "수위 정보가 아직 도착하지 않았어요";
    return;
  }
  elements.waterStatus.dataset.state = payload.waterEmpty ? "empty" : "ok";
  elements.waterTitle.textContent = payload.waterEmpty
    ? "물이 부족합니다"
    : "물통에 물이 있어요";
  elements.waterDescription.textContent = payload.waterEmpty
    ? "물통을 채워주세요. 자동 급수와 센서 측정을 멈췄어요."
    : "수위가 확인됐어요. 물이 부족해지면 여기서 알려드릴게요.";
}

function updateReading(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  if (!("soilRaw" in payload) && !("soilPercent" in payload) && typeof payload.waterEmpty !== "boolean") return false;

  lastMessageAt = Date.now();
  updateWaterStatus(payload);
  const soilRaw = sensorNumber(payload.soilRaw);
  const soilPercent = sensorNumber(payload.soilPercent);
  const valid = Number.isFinite(soilRaw) && Number.isFinite(soilPercent);
  const paused = payload.soilStale === true || payload.waterEmpty === true;
  const error = payload.soilSensorError === true;
  const boundedPercent = valid ? Math.min(100, Math.max(0, soilPercent)) : 0;

  elements.soilRaw.textContent = valid ? Math.round(soilRaw).toLocaleString("ko-KR") : "--";
  elements.soilPercent.textContent = valid
    ? boundedPercent.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) : "--";
  elements.moistureFill.style.width = valid ? `${boundedPercent}%` : "0%";
  elements.gauge.style.setProperty("--moisture", String(boundedPercent));

  if (error) {
    elements.soilCard.dataset.state = "error";
    elements.soilState.textContent = "센서 점검";
    elements.soilDescription.textContent = "수분 센서 오류 · 자동 급수를 멈췄어요. 센서를 점검해 주세요.";
  } else if (paused) {
    elements.soilCard.dataset.state = "paused";
    elements.soilState.textContent = "측정 일시 중단";
    elements.soilDescription.textContent = valid
      ? "측정 중단 전 마지막 수분 값이에요. 물통을 채우면 다시 측정해요."
      : "물 부족으로 측정을 멈췄어요. 물통을 채워주세요.";
  } else if (valid) {
    elements.soilCard.dataset.state = boundedPercent < 40 ? "dry" : "ok";
    elements.soilState.textContent = boundedPercent < 40 ? "건조한 흙" : "촉촉한 흙";
    elements.soilDescription.textContent = describeSoil(boundedPercent);
  } else {
    elements.soilCard.dataset.state = "waiting";
    elements.soilState.textContent = "측정 대기";
    elements.soilDescription.textContent = "수분 센서 값을 기다리고 있어요.";
  }
  // 중단되거나 오류가 있는 값은 새로운 측정 기록으로 추가하지 않는다.
  if (valid && !paused && !error) {
    readings.push(boundedPercent);
    if (readings.length > MAX_POINTS) readings.shift();
    drawChart();
  }
  const rssi = sensorNumber(payload.rssi);
  elements.rssi.textContent = Number.isFinite(rssi) ? `${rssi} dBm` : "--";
  elements.uptime.textContent = formatUptime(sensorNumber(payload.uptime));
  updateLastSeen();
  return true;
}

function updateLastSeen() {
  if (!lastMessageAt) {
    if (Date.now() - waitingSince > 20000 && elements.connection.dataset.state !== "offline") {
      setConnection("offline", "센서 데이터 없음");
    }
    return;
  }
  const seconds = Math.floor((Date.now() - lastMessageAt) / 1000);
  elements.lastSeen.textContent = seconds < 5 ? "방금 전" : `${seconds}초 전`;
  if (seconds > 20 && elements.connection.dataset.state !== "offline") {
    setConnection("offline", "센서 응답 없음");
  }
}

function drawChart() {
  const canvas = elements.canvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const width = rect.width;
  const height = rect.height;
  const padding = 5;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#e8ebdf";
  ctx.lineWidth = 1;
  for (const fraction of [0, 0.5, 1]) {
    const y = padding + fraction * (height - padding * 2);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  if (readings.length === 0) return;
  elements.chartEmpty.hidden = true;
  const points = readings.map((value, index) => ({
    x: readings.length === 1 ? width / 2
      : padding + (index / (readings.length - 1)) * (width - padding * 2),
    y: height - padding - value / 100 * (height - padding * 2),
  }));
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(124, 150, 91, 0.23)");
  gradient.addColorStop(1, "rgba(124, 150, 91, 0.01)");
  ctx.beginPath();
  ctx.moveTo(points[0].x, height - padding);
  points.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.lineTo(points.at(-1).x, height - padding);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = "#7c965b";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  const last = points.at(-1);
  ctx.beginPath();
  ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#6d884c";
  ctx.fill();
  canvas.setAttribute("aria-label", `최근 토양 수분 ${readings.length}개. 마지막 ${readings.at(-1)}%.`);
}

function connect() {
  if (client) client.end(true);
  waitingSince = Date.now();
  if (typeof mqtt === "undefined") {
    setConnection("offline", "연결 모듈을 불러오지 못했어요");
    return;
  }
  setConnection("connecting", "연결 중");

  client = mqtt.connect(BROKER_URL, {
    clientId: `web_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`,
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 3000,
  });

  client.on("connect", () => {
    setConnection("connecting", "센서 확인 중");
    client.subscribe(`${TOPIC_ROOT}/#`, { qos: 0 }, (error) => {
      if (error) {
        console.error("MQTT 구독 오류", error);
        setConnection("offline", "구독 오류");
      } else {
        console.info("MQTT 구독 완료", `${TOPIC_ROOT}/#`);
      }
    });
  });

  client.on("message", (topic, message) => {
    const text = message.toString();
    if (topic === STATUS_TOPIC) {
      if (text === "online") {
        const recent = lastMessageAt && Date.now() - lastMessageAt <= 20000;
        setConnection(recent ? "online" : "connecting", recent ? "센서 연결됨" : "센서 데이터 대기");
      } else {
        setConnection("offline", "센서 꺼짐");
      }
      return;
    }

    if (topic === DATA_TOPIC) {
      try {
        if (updateReading(JSON.parse(text))) {
          setConnection("online", "센서 연결됨");
        }
      } catch (error) {
        console.error("센서 데이터 형식 오류", error);
      }
    }
  });

  client.on("reconnect", () => setConnection("connecting", "재연결 중"));
  client.on("offline", () => setConnection("offline", "네트워크 끊김"));
  client.on("error", (error) => {
    console.error("MQTT 연결 오류", error);
    setConnection("offline", "연결 오류");
  });
}

elements.reconnect.addEventListener("click", connect);
window.addEventListener("resize", drawChart);
drawChart();
setInterval(updateLastSeen, 1000);
connect();

