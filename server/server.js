const WebSocket = require("ws");
const http = require("http");

// Определяем порт сервера
const PORT = process.argv[2] || 8080;

// Создаем HTTP-сервер и WebSocket-сервер
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket server is running\n");
});
const wss = new WebSocket.Server({ server: httpServer });

httpServer.listen(PORT, () => {
  console.log(`Server is running on ws://localhost:${PORT}`);
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
  clientConnections[clientId].send(JSON.stringify({ method: "matched" }));
  clientConnections[otherClientId].send(JSON.stringify({ method: "matched" }));
}

// Обработка сообщений от клиентов
function handleMessage(clientId, message) {
  const otherClientId = pairs[clientId];
  if (!otherClientId) {
    clientConnections[clientId].send(
      JSON.stringify({ error: "No match yet. Please wait for a stranger." })
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
        message: "Stranger has left the chat.",
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
