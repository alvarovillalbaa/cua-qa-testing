"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTargetMetadataForAction = getTargetMetadataForAction;
exports.standardizeActionLabel = standardizeActionLabel;
async function getTargetMetadataForAction(page, action) {
    if (typeof action?.x !== "number" || typeof action?.y !== "number") {
        return null;
    }
    try {
        return await page.evaluate(({ x, y }) => {
            const element = document.elementFromPoint(x, y);
            if (!element)
                return null;
            const text = element.innerText?.trim() ||
                element.textContent?.trim() ||
                "";
            const tagName = element.tagName?.toLowerCase() || "";
            const role = element.getAttribute("role") || "";
            const ariaLabel = element.getAttribute("aria-label") || "";
            const placeholder = element.getAttribute("placeholder") ||
                element.placeholder ||
                "";
            const href = element.href || "";
            const selectorHint = element.id
                ? `#${element.id}`
                : element.className
                    ? `${tagName}.${String(element.className)
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(".")}`
                    : tagName;
            return {
                text,
                tagName,
                role,
                ariaLabel,
                placeholder,
                selectorHint,
                href,
            };
        }, { x: action.x, y: action.y });
    }
    catch {
        return null;
    }
}
function describeTarget(target) {
    if (!target)
        return "current view";
    const label = target.ariaLabel || target.text || target.placeholder;
    if (label) {
        if (target.role === "button" || target.tagName === "button") {
            return `button '${label}'`;
        }
        if (target.tagName === "input" || target.tagName === "textarea") {
            return `input '${label}'`;
        }
        return `'${label}'`;
    }
    return target.selectorHint || "current view";
}
function standardizeActionLabel(action, target) {
    switch (action?.type) {
        case "click":
            return `Clicked ${describeTarget(target)}`;
        case "double_click":
            return `Double-clicked ${describeTarget(target)}`;
        case "type":
            return target &&
                (target.tagName === "textarea" ||
                    target.placeholder ||
                    /chat|message/i.test(target.text))
                ? "Entered prompt into chatbot input"
                : "Entered text into active input";
        case "keypress": {
            const keys = Array.isArray(action?.keys) ? action.keys.join("+") : "key";
            if (Array.isArray(action?.keys) && action.keys.includes("ENTER")) {
                return "Submitted active input";
            }
            return `Pressed ${keys}`;
        }
        case "scroll":
            return "Scrolled current view";
        case "drag":
            return "Dragged across the interface";
        case "wait":
            return "Waited for the UI to settle";
        default:
            return action?.type ? `Executed ${action.type}` : "Executed action";
    }
}
