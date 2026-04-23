"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testCaseUpdateHandler = testCaseUpdateHandler;
const logger_1 = __importDefault(require("../utils/logger"));
const TERMINAL_STATUSES = new Set(["pass", "fail"]);
async function testCaseUpdateHandler(socket, status) {
    logger_1.default.debug(`Received testCaseUpdate with status: ${status}`);
    const testCaseReviewAgent = socket.data.testCaseReviewAgent;
    const nextStatus = status.toLowerCase() === "failed" ? "fail" : status.toLowerCase();
    const currentStatus = (socket.data.testCaseStatus || "pending").toLowerCase();
    if (TERMINAL_STATUSES.has(currentStatus)) {
        logger_1.default.warn(`Ignoring testCaseUpdate '${nextStatus}' because run is already terminal: '${currentStatus}'.`);
        return;
    }
    if (currentStatus !== "running") {
        logger_1.default.warn(`Ignoring testCaseUpdate '${nextStatus}' because run is not running (current: '${currentStatus}').`);
        return;
    }
    // If the incoming status is "fail", update the socket's testCaseStatus.
    if (nextStatus === "fail") {
        logger_1.default.debug("Test case failed. Updating status to 'fail'.");
        logger_1.default.info("The test case failed. Please review the failed steps and try again.");
        socket.emit("message", "Test case failed. Please review the failed steps and try again.");
        socket.data.testCaseStatus = "fail";
        if (testCaseReviewAgent) {
            testCaseReviewAgent.appendTraceEvent("external_test_status_update", {
                status: "fail",
            });
            testCaseReviewAgent.finalizeRun("fail");
        }
    }
    if (nextStatus === "pass") {
        logger_1.default.info("Test case passed. Updating status to 'pass'.");
        logger_1.default.info("If you need to run another test case, refresh the page and start a new test case.");
        socket.emit("message", "Test case passed.");
        socket.data.testCaseStatus = "pass";
        if (testCaseReviewAgent) {
            testCaseReviewAgent.appendTraceEvent("external_test_status_update", {
                status: "pass",
            });
            testCaseReviewAgent.finalizeRun("pass");
        }
    }
}
