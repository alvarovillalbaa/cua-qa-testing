"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanTestCaseString = cleanTestCaseString;
exports.convertTestCaseToSteps = convertTestCaseToSteps;
// Utilities for parsing test case JSON into executable steps
/**
 * Removes escaped newline characters and trims extra whitespace from LLM output.
 */
function cleanTestCaseString(testCaseStr) {
    return testCaseStr.replace(/\\n/g, "").trim();
}
function convertTestCaseToSteps(testCase) {
    if (!testCase.steps || !Array.isArray(testCase.steps)) {
        throw new Error("Invalid test case format: missing steps array");
    }
    return testCase.steps
        .map((step) => `Step ${step.step_number}: ${step.step_instructions}`)
        .join("\n");
}
