// InventoryHub backend: a small REST API plus static file server.
// Uses only built-in Node modules, so there is nothing to install.

const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// ---------- In-memory data ----------
// A Map gives O(1) lookup by id (faster than searching an array every time).
const items = new Map();
let nextId = 1;

const categories = ["Electronics", "Office", "Furniture", "Tools", "Supplies"];
for (let i = 1; i <= 25; i++) {
  items.set(nextId, {
    id: nextId,
    name: `Sample Item ${i}`,
    category: categories[i % categories.length],
    quantity: (i * 7) % 50,
    price: Number((i * 3.5).toFixed(2)),
  });
  nextId++;
}

// ---------- JSON response structure ----------
// Every API response uses the same shape:
// { success: boolean, data: any | null, error: { message, details? } | null, meta: object | null }
function sendJson(req, res, status, payload) {
  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  };
  // Performance: compress larger responses if the browser supports gzip.
  const acceptsGzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  if (acceptsGzip && body.length > 1024) {
    headers["Content-Encoding"] = "gzip";
    res.writeHead(status, headers);
    res.end(zlib.gzipSync(body));
  } else {
    res.writeHead(status, headers);
    res.end(body);
  }
}

const ok = (req, res, data, meta = null, status = 200) =>
  sendJson(req, res, status, { success: true, data, error: null, meta });

const fail = (req, res, status, message, details = null) =>
  sendJson(req, res, status, {
    success: false,
    data: null,
    error: details ? { message, details } : { message },
    meta: null,
  });

// ---------- Validation ----------
function validateItem(body) {
  const errors = [];
  if (typeof body.name !== "string" || body.name.trim() === "") {
    errors.push("name is required");
  }
  if (!Number.isInteger(body.quantity) || body.quantity < 0) {
    errors.push("quantity must be a whole number, 0 or more");
  }
  if (typeof body.price !== "number" || !Number.isFinite(body.price) || body.price < 0) {
    errors.push("price must be a number, 0 or more");
  }
  if (body.category !== undefined && typeof body.category !== "string") {
    errors.push("category must be text");
  }
  return errors;
}

function cleanItem(body) {
  return {
    name: body.name.trim(),
    category: (body.category || "General").trim(),
    quantity: body.quantity,
    price: body.price,
  };
}

// ---------- Reading the request body ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 100000) {
        reject(new Error("TOO_LARGE"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("BAD_JSON"));
      }
    });
  });
}

// ---------- API routes ----------
async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", "items", "3"]
  if (parts[1] !== "items") return fail(req, res, 404, "Unknown API route");
  const id = parts[2] !== undefined ? Number(parts[2]) : null;
  if (parts[2] !== undefined && !Number.isInteger(id)) {
    return fail(req, res, 400, "id must be a number");
  }

  // GET /api/items?search=&page=&limit=
  if (req.method === "GET" && id === null) {
    const search = (url.searchParams.get("search") || "").toLowerCase();
    const page = Math.max(1, parseInt(url.searchParams.get("page")) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit")) || 10));

    let list = [...items.values()];
    if (search) {
      list = list.filter(
        (i) => i.name.toLowerCase().includes(search) || i.category.toLowerCase().includes(search)
      );
    }
    // Performance: pagination, so we never send the whole table at once.
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pageItems = list.slice((page - 1) * limit, page * limit);
    return ok(req, res, pageItems, { page, limit, total, totalPages });
  }

  // GET /api/items/:id
  if (req.method === "GET") {
    const item = items.get(id);
    return item ? ok(req, res, item) : fail(req, res, 404, "Item not found");
  }

  // POST /api/items
  if (req.method === "POST" && id === null) {
    const body = await readBody(req);
    const errors = validateItem(body);
    if (errors.length) return fail(req, res, 400, "Validation failed", errors);
    const item = { id: nextId++, ...cleanItem(body) };
    items.set(item.id, item);
    return ok(req, res, item, null, 201);
  }

  // PUT /api/items/:id
  if (req.method === "PUT" && id !== null) {
    if (!items.has(id)) return fail(req, res, 404, "Item not found");
    const body = await readBody(req);
    const errors = validateItem(body);
    if (errors.length) return fail(req, res, 400, "Validation failed", errors);
    const item = { id, ...cleanItem(body) };
    items.set(id, item);
    return ok(req, res, item);
  }

  // DELETE /api/items/:id
  if (req.method === "DELETE" && id !== null) {
    if (!items.delete(id)) return fail(req, res, 404, "Item not found");
    return ok(req, res, { id });
  }

  return fail(req, res, 405, "Method not allowed");
}

// ---------- Static files (the frontend) ----------
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(requested));
  // Security: never serve anything outside the public folder.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "public, max-age=300", // Performance: let the browser cache the page
    });
    res.end(content);
  });
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (err) {
    if (err.message === "BAD_JSON") return fail(req, res, 400, "Request body is not valid JSON");
    if (err.message === "TOO_LARGE") return fail(req, res, 413, "Request body too large");
    console.error(err);
    fail(req, res, 500, "Something went wrong on the server");
  }
});

server.listen(PORT, () => {
  console.log(`InventoryHub running at http://localhost:${PORT}`);
});
