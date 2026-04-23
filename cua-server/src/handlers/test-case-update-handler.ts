import { Socket } from "socket.io"
import logger from "../utils/logger";

const TERMINAL_STATUSES = new Set(["pass", "fail"]);

export async function testCaseUpdateHandler(socket: Socket, status: string): Promise<void> {
  logger.debug(`Received testCaseUpdate with status: ${status}`)
  const testCaseReviewAgent = socket.data.testCaseReviewAgent;
  const nextStatus = status.toLowerCase() === "failed" ? "fail" : status.toLowerCase();
  const currentStatus = (socket.data.testCaseStatus || "pending").toLowerCase();

  if (TERMINAL_STATUSES.has(currentStatus)) {
    logger.warn(
      `Ignoring testCaseUpdate '${nextStatus}' because run is already terminal: '${currentStatus}'.`
    );
    return;
  }

  if (currentStatus !== "running") {
    logger.warn(
      `Ignoring testCaseUpdate '${nextStatus}' because run is not running (current: '${currentStatus}').`
    );
    return;
  }

  // If the incoming status is "fail", update the socket's testCaseStatus.
  if (nextStatus === "fail") {
    
    logger.debug("Test case failed. Updating status to 'fail'.")
    logger.info("The test case failed. Please review the failed steps and try again.")
    socket.emit("message", "Test case failed. Please review the failed steps and try again.")
    socket.data.testCaseStatus = "fail"
    if (testCaseReviewAgent) {
      testCaseReviewAgent.appendTraceEvent("external_test_status_update", {
        status: "fail",
      });
      testCaseReviewAgent.finalizeRun("fail");
    }

  }

  if (nextStatus === "pass") {
    logger.info("Test case passed. Updating status to 'pass'.")
    logger.info("If you need to run another test case, refresh the page and start a new test case.")
    socket.emit("message", "Test case passed.")
    socket.data.testCaseStatus = "pass"
    if (testCaseReviewAgent) {
      testCaseReviewAgent.appendTraceEvent("external_test_status_update", {
        status: "pass",
      });
      testCaseReviewAgent.finalizeRun("pass");
    }
    
  }

}
