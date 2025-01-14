const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");

// Определяем порт сервера
const PORT = process.argv[2] || 8080;

// Создаем HTTP-сервер
const httpServer = http.createServer((req, res) => {
  // Определяем путь к запрашиваемому файлу
  const filePath =
    req.url === "/"
      ? path.join(__dirname, "../client/index.html")
      : path.join(__dirname, "../client", req.url);

  // Определяем тип содержимого
  const extname = path.extname(filePath);
  const contentType =
    {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
    }[extname] || "application/octet-stream";

  // Читаем файл и отправляем его содержимое
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
      } else {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("500 Internal Server Error");
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    }
  });
});

// Создаем WebSocket-сервер поверх HTTP
const wss = new WebSocket.Server({ server: httpServer });

httpServer.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Хранилища для клиентов и пар
const clientConnections = {};
const waitingClients = [];
const pairs = {};

// Генерация уникальных идентификаторов
let clientIdCounter = 0;
function generateClientId() {
  return ++clientIdCounter;
}

// Подключение нового клиента
wss.on("connection", (ws) => {
  const clientId = generateClientId();
  clientConnections[clientId] = ws;
  console.log(`Client ${clientId} connected.`);

  matchClient(clientId);

  // Уведомляем клиента, если никто не присоединился
  if (!pairs[clientId]) {
    ws.send(
      JSON.stringify({
        method: "waiting",
        message: "Ожидание подключения другого пользователя...",
      })
    );
  }

  // Обработка сообщений от клиента
  ws.on("message", (message) => {
    handleMessage(clientId, message);
  });

  // Обработка отключения клиента
  ws.on("close", () => {
    handleDisconnection(clientId);
    console.log(`Client ${clientId} disconnected.`);
  });
});

// Сопоставление клиентов
function matchClient(clientId) {
  if (waitingClients.length === 0) {
    // Добавляем клиента в очередь ожидания
    waitingClients.push(clientId);
    return;
  }

  const otherClientId = waitingClients.shift();

  // Связываем клиентов как пару
  pairs[clientId] = otherClientId;
  pairs[otherClientId] = clientId;

  // Уведомляем клиентов, что пара найдена
  clientConnections[clientId].send(
    JSON.stringify({
      method: "matched",
      message: "Вы подключены к собеседнику!",
    })
  );
  clientConnections[otherClientId].send(
    JSON.stringify({
      method: "matched",
      message: "Вы подключены к собеседнику!",
    })
  );

  // Уведомляем об успешном подключении
  console.log(
    `Client ${clientId} and Client ${otherClientId} are now connected.`
  );
}

// Обработка сообщений от клиентов
function handleMessage(clientId, message) {
  const otherClientId = pairs[clientId];
  if (!otherClientId) {
    clientConnections[clientId].send(
      JSON.stringify({
        error:
          "Пара пока не найдена. Пожалуйста, подождите подключения другого пользователя.",
      })
    );
    return;
  }

  // Пересылаем сообщение другому клиенту
  clientConnections[otherClientId].send(
    JSON.stringify({ method: "message", message: JSON.parse(message).text })
  );
}

// Обработка отключений
function handleDisconnection(clientId) {
  const otherClientId = pairs[clientId];

  // Если клиент был в паре, уведомляем другого клиента
  if (otherClientId && clientConnections[otherClientId]) {
    clientConnections[otherClientId].send(
      JSON.stringify({
        method: "disconnected",
        message: "Собеседник покинул чат.",
      })
    );
    delete pairs[otherClientId];
  }

  // Удаляем клиента из всех списков
  delete pairs[clientId];
  delete clientConnections[clientId];

  // Удаляем из очереди ожидания, если клиент там был
  const index = waitingClients.indexOf(clientId);
  if (index !== -1) {
    waitingClients.splice(index, 1);
  }
}
