/**
 * Before an agent is built against a URL, the URL is fetched and what came
 * back is described. This is the part that decides what a response actually is
 * — not what its address suggested.
 *
 * The point is narrow but load-bearing: an agent must never be designed
 * against a response nobody has seen. A listing page and its JSON API look
 * equally plausible in a conversation, and only one of them carries data.
 */

export type ResponseKind = "json" | "html-shell" | "html" | "text" | "error";

export type JsonShape = {
  rootShape: "array" | "object" | "scalar" | null;
  /** Length of the list, when the payload is or contains one. */
  itemCount: number | null;
  /** Field names on the first item, so rules can be written against real keys. */
  fields: string[];
};

export type ProbeInput = {
  status: number;
  contentType: string;
  body: string;
};

export type ProbeVerdict = JsonShape & {
  ok: boolean;
  kind: ResponseKind;
  problem: string | null;
};

const MAX_FIELDS = 30;

/**
 * A browser-rendered page returns markup with no data in it: the content
 * arrives later via JavaScript that a plain GET never runs. Bot-challenge
 * interstitials look the same from here and are treated the same way.
 */
export function looksLikeAppShell(contentType: string, body: string): boolean {
  const isHtml = contentType.includes("html") || /^\s*<(!doctype|html)/i.test(body);
  if (!isHtml) return false;

  const sample = body.slice(0, 4000).toLowerCase();
  if (sample.includes("just a moment") || sample.includes("cf-browser-verification")) return true;

  const bodyOpen = body.toLowerCase().indexOf("<body");
  if (bodyOpen === -1) return true;

  const visible = body
    .slice(bodyOpen)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return visible.length < 400;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function describeJsonShape(body: string): JsonShape {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { rootShape: null, itemCount: null, fields: [] };
  }

  if (Array.isArray(parsed)) {
    const first = parsed[0];
    return {
      rootShape: "array",
      itemCount: parsed.length,
      fields: isObject(first) ? Object.keys(first).slice(0, MAX_FIELDS) : [],
    };
  }

  if (isObject(parsed)) {
    const keys = Object.keys(parsed);
    // A list response is usually one array of objects hanging off the root.
    // An array of scalars is just another field, not the payload.
    const listKey = keys.find((key) => {
      const value = parsed[key];
      return Array.isArray(value) && value.length > 0 && isObject(value[0]);
    });

    if (listKey) {
      const list = parsed[listKey] as unknown[];
      const first = list[0];
      return {
        rootShape: "object",
        itemCount: list.length,
        fields: isObject(first)
          ? [`${listKey}[]`, ...Object.keys(first).slice(0, MAX_FIELDS - 1)]
          : [listKey],
      };
    }

    return { rootShape: "object", itemCount: null, fields: keys.slice(0, MAX_FIELDS) };
  }

  return { rootShape: "scalar", itemCount: null, fields: [] };
}

export function classifyResponse(input: ProbeInput): ProbeVerdict {
  const shell = looksLikeAppShell(input.contentType, input.body);
  const isJson = input.contentType.includes("json") || /^\s*[[{]/.test(input.body);
  const shape = isJson ? describeJsonShape(input.body) : { rootShape: null, itemCount: null, fields: [] };

  const kind: ResponseKind = isJson
    ? "json"
    : shell
      ? "html-shell"
      : input.contentType.includes("html") ? "html" : "text";

  // A page shell is diagnosed before any status code: a site challenging an
  // automated request answers 403, but calling that an auth wall sends the
  // reader looking for a key that would not help.
  let problem: string | null = null;
  if (shell) {
    problem = "This is a browser page, not a data endpoint: the response carries no data because the content loads later via JavaScript, or the site is challenging automated requests. Look for this site's JSON API instead.";
  } else if (input.status === 401 || input.status === 403) {
    problem = "This endpoint needs authentication. GARDN can only send plain unauthenticated GET requests.";
  } else if (input.status >= 400) {
    problem = `The endpoint answered ${input.status}.`;
  } else if (isJson && shape.rootShape === null) {
    problem = "The response claims to be JSON but could not be parsed.";
  }

  return { ok: input.status < 400 && !shell && problem === null, kind, ...shape, problem };
}
