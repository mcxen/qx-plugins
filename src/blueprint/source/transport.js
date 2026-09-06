const MCP_VERSION = "2026-07-28";
const META_PROTOCOL = "io.modelcontextprotocol/protocolVersion";
const META_CLIENT = "io.modelcontextprotocol/clientInfo";
const META_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";

export const MAX_MEDIA_ITEM_BYTES = 8 * 1024 * 1024;
export const MAX_MEDIA_CACHE_BYTES = 32 * 1024 * 1024;
export const ASSET_PATH = /^\/api\/v1\/assets\/[A-Za-z0-9_-]{1,128}\/content$/;

export function normalizeEndpoint(value, text) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error(text("Configure the BluePrint MCP endpoint.", "请先配置 BluePrint MCP 地址。"));
  let url;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    throw new Error(text("The BluePrint MCP endpoint is invalid.", "BluePrint MCP 地址无效。"));
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!url.pathname.endsWith("/mcp")) url.pathname = `${url.pathname}/mcp`.replace(/\/+/g, "/");
  return url.toString();
}

export function assetUrl(endpoint, value) {
  try {
    const base = new URL(endpoint);
    const url = new URL(String(value || ""), base);
    // BluePrint returns relative asset paths. Absolute values are accepted only
    // when they still point to the configured server and its asset route. This
    // prevents a forged note response from sending the PAT to another origin.
    if (!/^https?:$/i.test(url.protocol) || url.origin !== base.origin || !ASSET_PATH.test(url.pathname)) {
      return null;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function createTransport(context, { text, message, uuid }) {
  async function config() {
    const endpoint = normalizeEndpoint(await context.getPreference("endpoint"), text);
    const pat = String((await context.getPreference("pat")) || "").trim();
    if (!pat) throw new Error(text("Configure a BluePrint personal access token.", "请先配置 BluePrint 个人访问令牌。"));
    return { endpoint, pat };
  }

  async function browsingPreferences() {
    const [layout, density, showImages] = await Promise.all([
      context.getPreference("layout"),
      context.getPreference("density"),
      context.getPreference("showImages"),
    ]);
    return {
      layout: layout === "list" ? "list" : "cards",
      density: density === "compact" ? "compact" : "comfortable",
      showImages: showImages === false || showImages === "false" || showImages === 0 || showImages === "0"
        ? false
        : true,
    };
  }

  function requestMeta() {
    return {
      [META_PROTOCOL]: MCP_VERSION,
      [META_CLIENT]: { name: "qx-blueprint", version: "1.0.0" },
      [META_CAPABILITIES]: {},
    };
  }

  function protocolError(detail, status = 0) {
    const value = String(detail || text("BluePrint MCP request failed.", "BluePrint MCP 请求失败。"));
    const error = new Error(value);
    if (status === 409 || /version[_ ]conflict|baseversion|conflict/i.test(value)) error.code = "conflict";
    return error;
  }

  async function responseJson(response) {
    try {
      return await response?.json?.();
    } catch {
      throw new Error(text("BluePrint returned an unreadable MCP response.", "BluePrint 返回了无法读取的 MCP 响应。"));
    }
  }

  async function mcpRequest(auth, method, params, name) {
    const body = {
      jsonrpc: "2.0",
      id: uuid(),
      method,
      params: { ...(params || {}), _meta: requestMeta() },
    };
    const headers = {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${auth.pat}`,
      "Content-Type": "application/json",
      "MCP-Protocol-Version": MCP_VERSION,
      "Mcp-Method": method,
    };
    if (name) headers["Mcp-Name"] = name;
    const response = await context.http.fetch(auth.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      timeoutMs: 25_000,
    });
    if (!response?.ok) {
      if (response?.status === 401) throw new Error(text("BluePrint rejected the PAT.", "BluePrint 拒绝了此 PAT。"));
      if (response?.status === 403) throw new Error(text("BluePrint denied this request.", "BluePrint 拒绝了此次请求。"));
      let detail = "";
      try {
        const responseBody = await responseJson(response);
        detail = responseBody?.error?.message || responseBody?.error || responseBody?.message || responseBody?.code || "";
      } catch {
        // Keep the status-specific error when an upstream proxy returns HTML or an empty body.
      }
      throw protocolError(detail || `BluePrint MCP HTTP ${response?.status || "error"}`, response?.status);
    }
    const payload = await responseJson(response);
    if (payload?.error) {
      throw protocolError(payload.error.message || payload.error.code || "MCP error", response?.status);
    }
    return payload?.result;
  }

  async function callToolWithAuth(auth, name, argumentsValue = {}) {
    const result = await mcpRequest(auth, "tools/call", {
      name,
      arguments: argumentsValue,
    }, name);
    if (result?.isError) {
      const detail = (result.content || [])
        .filter((part) => part?.type === "text")
        .map((part) => part.text)
        .join("\n") || "BluePrint tool error";
      throw protocolError(detail || "BluePrint tool error");
    }
    return result?.structuredContent ?? null;
  }

  async function discoverConnection(auth) {
    const [identity, capabilities] = await Promise.all([
      callToolWithAuth(auth, "blueprint_whoami", {}),
      callToolWithAuth(auth, "blueprint_list_capabilities", {}),
    ]);
    const tools = new Set((capabilities?.capabilities || []).flatMap((entry) => entry?.tools || []));
    return { identity, capabilities, tools };
  }

  async function checkConnection() {
    let auth = null;
    try {
      auth = await config();
      const { identity, tools } = await discoverConnection(auth);
      const canRead = tools.has("blueprint_list_xianji_notes") && tools.has("blueprint_get_xianji_note");
      const canWrite = tools.has("blueprint_create_xianji_note") && tools.has("blueprint_update_xianji_note");
      if (!canRead) {
        throw new Error(text(
          "The PAT does not expose the required Xianji read tools.",
          "此 PAT 没有提供随手记读取能力。",
        ));
      }
      const workspace = String(identity?.workspaceName || text("BluePrint workspace", "BluePrint 工作区"));
      const access = canWrite ? text("read and write", "可读写") : text("read only", "只读");
      await context.showToast?.(`${text("Connected to", "已连接")}: ${workspace} · ${access}`);
      return { workspaceName: workspace, readOnly: !canWrite };
    } catch (error) {
      const safe = new Error(message(error, auth?.pat));
      if (error?.code) safe.code = error.code;
      throw safe;
    }
  }

  return {
    config,
    browsingPreferences,
    callTool: callToolWithAuth,
    discoverConnection,
    checkConnection,
  };
}
