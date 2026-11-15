# InventoryHub

A small full-stack inventory app.

- **Back end:** Node.js (built-in `http` module, no packages needed) with a REST API
- **Front end:** one plain HTML/CSS/JavaScript page that talks to the API with `fetch`
- **Data:** kept in memory (25 sample items load on start; changes reset when the server restarts)

## Run it

You only need [Node.js](https://nodejs.org) 18 or newer.

```bash
git clone <your-repo-url>
cd inventoryhub
npm start
```

Then open http://localhost:3000.

## API

Base path: `/api/items`

| Method | Path | What it does |
|--------|------|--------------|
| GET | `/api/items?search=&page=1&limit=10` | List items (search, pagination) |
| GET | `/api/items/:id` | Get one item |
| POST | `/api/items` | Create an item |
| PUT | `/api/items/:id` | Replace an item |
| DELETE | `/api/items/:id` | Delete an item |

### JSON structure

Every response, success or error, has the same four fields:

```json
{
  "success": true,
  "data": { },
  "error": null,
  "meta": null
}
```

**List response** (`GET /api/items?page=1&limit=2`):

```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Sample Item 1", "category": "Office", "quantity": 7, "price": 3.5 },
    { "id": 2, "name": "Sample Item 2", "category": "Furniture", "quantity": 14, "price": 7 }
  ],
  "error": null,
  "meta": { "page": 1, "limit": 2, "total": 25, "totalPages": 13 }
}
```

**Create / update request body:**

```json
{ "name": "Desk Lamp", "category": "Office", "quantity": 12, "price": 19.99 }
```

Rules: `name` is required text, `quantity` is a whole number >= 0, `price` is a number >= 0, `category` is optional.

**Error response** (HTTP 400, 404, 405, 413 or 500):

```json
{
  "success": false,
  "data": null,
  "error": { "message": "Validation failed", "details": ["name is required"] },
  "meta": null
}
```

## Front end and back end communication

`public/index.html` has one helper function, `api()`, that every call goes through. It sends the request, reads the JSON envelope, and throws an error with the server's message when `success` is `false`. The page then shows that message to the user. Because every response has the same shape, loading, success and error states are handled in one place.

## Performance optimizations

- **Pagination:** the server returns one page at a time (max 50), not the whole table.
- **Debounced search:** the page waits 300 ms after typing stops before calling the API.
- **Fast lookups:** items are stored in a `Map`, so finding, updating and deleting by id is O(1).
- **Compression:** responses over 1 KB are gzip-compressed when the browser supports it.
- **Caching:** static files are sent with `Cache-Control: max-age=300`; API responses use `no-cache` so data is always fresh.
- **Safe and small requests:** request bodies over 100 KB are rejected.

## Project structure

```
inventoryhub/
├── server.js          # API + static file server
├── public/index.html  # front end
├── package.json
├── README.md
├── REFLECTION.md      # reflective summary
└── .gitignore
```
