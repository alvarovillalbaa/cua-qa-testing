"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const test_case_initiation_handler_1 = require("./handlers/test-case-initiation-handler");
const user_messages_handler_1 = require("./handlers/user-messages-handler");
const test_case_update_handler_1 = require("./handlers/test-case-update-handler");
const logger_1 = __importDefault(require("./utils/logger"));
// Configuration
// Listen on port 8000 by default (override with SOCKET_PORT)
const PORT = process.env.SOCKET_PORT
    ? parseInt(process.env.SOCKET_PORT, 10)
    : 8000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
// Create an HTTP server
const httpServer = http_1.default.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Socket.IO server is running.");
});
// Attach Socket.IO server
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: CORS_ORIGIN,
    },
});
io.on("connection", (socket) => {
    logger_1.default.info(`New client connected: ${socket.id}`);
    // Initialize socket data
    socket.data.testCaseReviewAgent = undefined;
    socket.data.lastCallId = undefined;
    socket.data.previousResponseId = undefined;
    socket.data.testCaseStatus = "pending";
    // Log all events
    socket.onAny((event, msg) => {
        logger_1.default.trace(`Received event: ${event} with message: ${JSON.stringify(msg)}`);
    });
    // Handle incoming messages
    socket.on("message", (msg) => {
        (0, user_messages_handler_1.handleSocketMessage)(socket, msg).catch((error) => {
            logger_1.default.error("Error handling socket message", error);
        });
    });
    socket.on("testCaseInitiated", (data) => {
        (0, test_case_initiation_handler_1.handleTestCaseInitiated)(socket, data).catch((error) => {
            logger_1.default.error("Error handling testCaseInitiated", error);
        });
    });
    socket.on("testCaseUpdate", (status) => {
        (0, test_case_update_handler_1.testCaseUpdateHandler)(socket, status).catch((error) => {
            logger_1.default.error("Error handling testCaseUpdate", error);
        });
    });
});
// Start listening
httpServer.listen(PORT, () => {
    logger_1.default.info(`Socket.IO server listening on port ${PORT}`);
    logger_1.default.info(`CORS origin: ${CORS_ORIGIN}`);
});
