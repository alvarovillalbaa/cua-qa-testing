"use strict";
// ────────────────────────────────────────────────────────────────
// lib/services/login-service.ts
/**
 * Fills the generic “Username / Password” form and completes login.
 * Works with the demo page implemented in /login/page.tsx.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginService = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
class LoginService {
    /**
     * Fill the Username + Password fields.
     */
    async fillin_login_credentials(username, password, page) {
        try {
            /* Username */
            await page
                .getByPlaceholder("Username")
                .first()
                .fill(username, { timeout: 5000 });
            /* Password */
            await page
                .getByPlaceholder("Password")
                .first()
                .fill(password, { timeout: 5000 });
            logger_1.default.debug("Login credentials filled in.");
            return true;
        }
        catch (error) {
            logger_1.default.error("❌ Error filling login credentials:", error);
            return false;
        }
    }
    /**
     * Click the “Login” button and wait for the router to navigate
     * to “/home” (or at least for the network to go idle).
     */
    async click_login_button(page) {
        try {
            /* Playwright’s role query works well here */
            const loginBtn = page
                .getByRole("button", { name: /log\s?in/i })
                .first();
            await Promise.all([
                /* Either the URL becomes “/home”… */
                page.waitForURL("**/home", { timeout: 10000 }).catch(() => { }),
                /* …or network goes idle (fallback) */
                page.waitForLoadState("networkidle", { timeout: 10000 }),
                loginBtn.click(),
            ]);
            logger_1.default.debug("Login successful – navigation finished.");
            return true;
        }
        catch (error) {
            logger_1.default.error("❌ Error clicking login button:", error);
            return false;
        }
    }
}
exports.LoginService = LoginService;
