import { Page } from "playwright";

export interface ActionTargetMetadata {
  text: string;
  tagName: string;
  role: string;
  ariaLabel: string;
  placeholder: string;
  selectorHint: string;
  href: string;
}

export async function getTargetMetadataForAction(
  page: Page,
  action: any
): Promise<ActionTargetMetadata | null> {
  if (typeof action?.x !== "number" || typeof action?.y !== "number") {
    return null;
  }

  try {
    return await page.evaluate(
      ({ x, y }) => {
        const element = document.elementFromPoint(x, y) as HTMLElement | null;
        if (!element) return null;

        const text =
          element.innerText?.trim() ||
          element.textContent?.trim() ||
          "";
        const tagName = element.tagName?.toLowerCase() || "";
        const role = element.getAttribute("role") || "";
        const ariaLabel = element.getAttribute("aria-label") || "";
        const placeholder =
          element.getAttribute("placeholder") ||
          (element as HTMLInputElement).placeholder ||
          "";
        const href = (element as HTMLAnchorElement).href || "";
        const selectorHint =
          element.id
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
      },
      { x: action.x, y: action.y }
    );
  } catch {
    return null;
  }
}

function describeTarget(target: ActionTargetMetadata | null) {
  if (!target) return "current view";
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

export function standardizeActionLabel(
  action: any,
  target: ActionTargetMetadata | null
) {
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
