# Web API Implementation Guide

This is a manual implementation reference for wiring the warehouse dashboard to the ASP.NET Core host. It describes the repository as it currently stands and the work required for an end-to-end run; it does not claim that the API is already implemented.

## Current state

- The ASP.NET Core project is `Sales and Inventory System/`.
- The host's static files are in `Sales and Inventory System/wwwroot/`. This is where the app's HTML, CSS, and JavaScript must be kept.
- There is also a root-level `wwwroot/` copy. ASP.NET does not serve that copy when running the nested project.
- `Program.cs` currently calls `UseDefaultFiles()` and `UseStaticFiles()`, so the host can serve the page files.
- `Program.cs` does not map API routes or controllers. The C# inventory types in it are not registered as an application service, initialized with data, or connected to HTTP requests.
- `Sales and Inventory System/wwwroot/script.js` requests `/api/warehouse/...`. Those routes do not currently exist, so the browser's API-backed operations cannot succeed yet.
- The same script is loaded by both pages, even though the sales page does not contain all the forms and metric elements that the manager page has. The script currently attaches event listeners and updates elements without first checking whether those elements exist.

## Recommended implementation order

### 1. Choose a data store

For the first end-to-end prototype, create a `WarehouseService` containing the inventory, sales, and supplier collections, seed it with a small set of records, and register it with dependency injection as a singleton. A singleton keeps one shared state for all requests while the process runs.

This in-memory approach is useful for proving the browser/API workflow, but all changes are lost when the server restarts. If records must persist, use a database (for example SQLite with Entity Framework Core) instead of treating in-memory state or the save button as persistence.

Decide on one ID type before implementing routes. The browser currently sends numeric item IDs, but `InventoryItem.Id` in `Program.cs` is a string. Either standardize on integer IDs or update the browser and DTOs to use string IDs.

### 2. Create API-facing models

Use explicit request and response DTOs instead of binding HTTP requests directly to domain objects. At minimum, plan for:

- An inventory item response containing `id`, `name`, `quantity`, `price`, and a `supplier` object (or `null`) with `name`, `phone`, and `email`.
- A supplier response containing `name`, `contact`, `phone`, and `email`.
- A sale response containing `itemName`, `quantitySold`, `totalAmount`, and `soldAt`.
- A stock-change request and sale request containing `itemId` and `quantity`.
- A supplier-create request containing `name`, `contact`, `phone`, and `email`.
- A summary response containing `totalStockVolume`, `totalInventoryValue`, `totalRevenue`, and `totalUnitsSold`.

The names and types must agree with the JavaScript. For example, the stock and sale forms send JSON like:

```json
{ "itemId": 2, "quantity": 3 }
```

The sale handler expects a successful response shaped like:

```json
{
  "sale": {
    "itemName": "Example item",
    "quantitySold": 1,
    "totalAmount": 25.0,
    "soldAt": "2026-11-04T16:30:00Z"
  }
}
```

Keep the sale price/total with the sale record. Recalculating historical sales from an item's current price can produce incorrect revenue after a price change.

### 3. Implement business operations in the service

Keep state changes and business rules in `WarehouseService`; HTTP endpoints should validate the request shape, call the service, and translate outcomes into HTTP responses.

Implement and verify these rules:

- Receiving stock changes an existing item's quantity. The resulting quantity must not be negative.
- A sale quantity must be greater than zero; the item must exist; and the requested quantity cannot exceed stock. A successful sale decreases inventory and records the sale.
- Supplier creation requires a non-empty name; validate any other fields required by the product.
- A missing item should be reported to the API caller rather than only printed to the console.
- Return clear client errors for invalid input and missing resources. Typical responses are `400 Bad Request` for invalid requests and `404 Not Found` for unknown IDs.

The existing `Warehouse<T>.ReceiveStock` catches a missing-item exception and writes to the console, which hides failure from an API caller. If you reuse that class, change it to return a result or let an exception reach a layer that can translate it into an HTTP error. The current warehouse class also lacks a public method to add items and a method to list its inventory, so it needs further work before it can back the endpoints.

### 4. Add the HTTP endpoints

The simplest fit for this project is ASP.NET Core Minimal APIs. Register the service before `builder.Build()` and map a route group under `/api/warehouse` after building the app. Alternatively, implement controllers and use both `AddControllers()` and `MapControllers()`; choose one approach rather than adding unused controller configuration.

Implement this contract, or change the JavaScript and this table together:

| Method | Route | Response/operation |
| --- | --- | --- |
| `GET` | `/api/warehouse/items` | JSON array of inventory items |
| `GET` | `/api/warehouse/sales` | JSON array of sales |
| `GET` | `/api/warehouse/summary` | Summary fields listed above |
| `GET` | `/api/warehouse/suppliers` | JSON array of suppliers |
| `POST` | `/api/warehouse/receive` | Adjust stock using `{ itemId, quantity }` |
| `POST` | `/api/warehouse/sale` | Record a sale using `{ itemId, quantity }`; return `{ sale: ... }` |
| `POST` | `/api/warehouse/suppliers` | Add supplier using `{ name, contact, phone, email }` |
| `POST` | `/api/warehouse/save` | Save/export state and return `{ salesLogged, count }`, or remove this UI operation if it is not needed |

The save response fields matter because the browser displays `result.salesLogged` and `result.count`. If the operation writes a file, define its location deliberately and handle I/O errors; for durable application data, prefer a database.

### 5. Align browser initialization with each page

Both `index.html` and `Manager interface-1.html` load the same `script.js`, but the sales page does not include the stock form, supplier form, supplier table, or all manager metrics. Either:

1. Check for each element before adding a listener or updating it, and skip page-specific work when it is absent; or
2. Use separate page-specific scripts and share only common API/rendering functions.

Also check `response.ok` before parsing a response as successful JSON, and display the API's error message when an operation fails. The current script catches several errors but does not consistently report non-success HTTP responses for its read operations or the save operation.

## Manual end-to-end test

Run the host from the repository root:

```powershell
dotnet run --project "Sales and Inventory System/Sales and Inventory System.csproj" --launch-profile http
```

Open:

- `http://localhost:5240/` for the sales page
- `http://localhost:5240/Manager%20interface-1.html` for the manager page

Since the pages and API use the same ASP.NET host, the browser's relative `/api/warehouse` requests are same-origin; CORS setup is not needed for this arrangement. Do not open the HTML using `file://` or use a separate Live Server origin for this workflow.

Test in this order:

1. Request `http://localhost:5240/api/warehouse/items` and confirm it returns the expected JSON array.
2. Load both pages and check the browser developer console for missing-element errors.
3. Record a sale for an item with sufficient quantity. Confirm the response contains the `sale` object, inventory decreases, and the sale appears in history.
4. Try selling more than the remaining quantity and confirm the API rejects it without changing stock.
5. On the manager page, add stock and confirm the item quantity and summary update.
6. Add a supplier and confirm it appears in the supplier directory and relevant item response.
7. Check the low-stock report and save action. Confirm the save response contains `salesLogged` and `count`, or remove/update the save feature if it is not implemented.
8. Restart the host. If the records reset, that is expected for an in-memory service; configure persistent storage if restart persistence is a requirement.

The sample request file `Sales and Inventory System/Sales and Inventory System.http` can be updated with these requests to make the API checks repeatable.
