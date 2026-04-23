"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestCaseSchema = exports.TestCaseStepSchema = void 0;
const constants_1 = require("../lib/constants");
const logger_1 = __importDefault(require("../utils/logger"));
const openai_1 = __importDefault(require("openai"));
const zod_1 = require("zod");
const zod_2 = require("openai/helpers/zod");
exports.TestCaseStepSchema = zod_1.z.object({
    step_number: zod_1.z.number(),
    step_instructions: zod_1.z.string(),
    status: zod_1.z.string().nullable(),
});
exports.TestCaseSchema = zod_1.z.object({
    steps: zod_1.z.array(exports.TestCaseStepSchema),
});
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
class TestCaseAgent {
    constructor(login_required = false) {
        this.model = "o3-mini";
        this.login_required = login_required;
        this.developer_prompt = login_required
            ? constants_1.PROMPT_WITH_LOGIN
            : constants_1.PROMPT_WITHOUT_LOGIN;
        logger_1.default.trace(`Developer prompt: ${this.developer_prompt}`);
    }
    /**
     * Generate structured test steps via the Responses API.
     */
    async invokeResponseAPI(userInstruction) {
        logger_1.default.debug("Invoking Response API", { userInstruction });
        const response = await openai.responses.parse({
            model: this.model,
            input: [
                { role: "system", content: this.developer_prompt },
                { role: "user", content: userInstruction },
            ],
            text: {
                format: (0, zod_2.zodTextFormat)(exports.TestCaseSchema, "test_case"),
            },
        });
        logger_1.default.debug("Response API output", { output: response.output_parsed });
        return response.output_parsed;
    }
}
exports.default = TestCaseAgent;
