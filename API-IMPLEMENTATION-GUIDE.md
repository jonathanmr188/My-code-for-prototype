# Web API Implementation Guide

This guide is based on the current code in `Sales and Inventory System/Program.cs` and `Sales and Inventory System/wwwroot/`. It describes what to implement before the inventory API and browser can work end to end.

## Current status

The project has started moving from a static site toward an API:

- The ASP.NET Core app serves static files from `Sales and Inventory System/wwwroot/`.
- `Program.cs` now attempts to seed a `Warehouse<InventoryItem>`, register it, and map three Minimal API routes:
  - `GET /api/inventory`
  - `GET /api/inventory/{id}`
  - `POST /api/inventory/receive`
- Those routes are not yet a complete API for the pages. The browser requests `/api/warehouse/...`, including sales, summary, suppliers, and save routes.
- The new startup code calls `SeedItem` and `GetAllItems`, but neither method is implemented in the current `Warehouse<T>` class. `builder.Services.Singleton(warehouse)` should be replaced with a supported DI registration such as `builder.Services.AddSingleton(warehouse)`.
- `InventoryItem` only stores an ID, name, and quantity. It has no price or supplier data, which the inventory page displays.
- The browser uses numeric item inputs and converts IDs to numbers. The API request record and seeded IDs use strings (`A1`, `B2`, `C3`). These IDs and types need to be made consistent.
- `Sales and Inventory System/wwwroot/index.html` currently has no `<script src="script.js"></script>`, so it does not run the browser code.
- The shared `script.js` assumes that every page has the same forms and display elements, but the sales page and manager page differ. The current script also ends in the middle of `saveSystemState()` and does not include a complete function body or the `showGlobalAlert()` function, so it must be repaired before it can run.

Until these gaps are addressed, the API is not yet buildable and the browser cannot complete the intended workflows.

## Recommended implementation order

### 1. Make IDs consistent

The current domain model and seed data use string IDs such as `A1`, `B2`, and `C3`. The least disruptive path is to keep string IDs:

1. Change the item ID inputs in both HTML pages from `type="number"` to `type="text"` so users can enter IDs such as `A1`.
2. In `script.js`, send `itemId: id` rather than `itemId: Number(id)`.
3. Keep the API request DTO's `ItemId` as a string and use string keys throughout the warehouse.
4. Update the placeholder text to show a seeded ID, for example `A1`.

Alternatively, convert the domain model, dictionary keys, seeds, DTOs, and browser to integer IDs. Do not mix the two schemes.

### 2. Complete the warehouse collection methods

The existing warehouse uses a private dictionary and currently has no public way to seed or list items. Add methods that:

- Add an item using its ID as the dictionary key.
- Reject duplicate IDs rather than silently replacing records.
- Return all items for the collection endpoint, preferably as a copy or read-only collection.
- Preserve the invariant that an item's `Id` matches its dictionary key.

The `SeedItem` and `GetAllItems` calls already present in `Program.cs` should correspond to these methods. Also make sure stock changes cannot result in a negative quantity. The existing `ReceiveStock` catches missing-item exceptions and logs to the console; API code must be able to distinguish a failed operation from a successful one. Return a result or allow a suitable exception to be handled as an HTTP error.

### 3. Register the warehouse correctly and seed it once

In `Program.cs`, create and seed the warehouse before building the app, then register that exact instance in dependency injection. With the existing `using Microsoft.Extensions.DependencyInjection`, the registration should use the supported `AddSingleton` API, for example `builder.Services.AddSingleton(warehouse)`.

An in-memory singleton is sufficient for a local prototype: the state is shared between requests but is lost when the process restarts. If data must survive restarts, implement a database-backed repository (SQLite is one local option) instead of relying on the singleton or a binary save file.

After adding the missing warehouse methods and fixing registration, run `dotnet build` before proceeding. Resolve compile errors before testing HTTP behavior.

### 4. Choose one API route contract

The current API routes use `/api/inventory`; the browser uses `/api/warehouse`. Pick one contract and use it in both places. To minimize edits to the browser, use `/api/warehouse` and make the routes match these calls in `Sales and Inventory System/wwwroot/script.js`:

| Method | Route | Required behavior |
| --- | --- | --- |
| `GET` | `/api/warehouse/items` | Return the inventory array |
| `GET` | `/api/warehouse/sales` | Return sales history |
| `GET` | `/api/warehouse/summary` | Return dashboard totals |
| `GET` | `/api/warehouse/suppliers` | Return suppliers |
| `POST` | `/api/warehouse/receive` | Adjust stock for an item |
| `POST` | `/api/warehouse/sale` | Decrease stock and record a sale |
| `POST` | `/api/warehouse/suppliers` | Add a supplier |
| `POST` | `/api/warehouse/save` | Save/export state, or remove this UI operation |

You can keep `GET /api/inventory/{id}` as an additional useful endpoint. If you prefer to keep the current `/api/inventory` route names, update every browser request to match and still implement sales, suppliers, summary, and save if those UI features are retained.

Use a route group such as `app.MapGroup("/api/warehouse")` to avoid repeating the prefix. Keep endpoint handlers thin: validate/request-bind, call the warehouse/service, and return an HTTP result. Keep state changes and business rules in the warehouse/service.

### 5. Add models for data the UI actually displays

The current `InventoryItem` only has `Id`, `Name`, and `Quantity`. Extend the domain model or map it to response DTOs so `GET /items` returns at least:

```json
{
  "id": "A1",
  "name": "Wireless Mouse",
  "quantity": 12,
  "price": 249.99,
  "supplier": {
    "name": "Example Supplier",
    "phone": "0123456789",
    "email": "supplier@example.com"
  }
}
```

The UI also needs these shapes:

- Stock request: `{ "itemId": "A1", "quantity": 3 }`
- Sale request: `{ "itemId": "A1", "quantity": 2 }`
- Supplier request: `{ "name": "...", "contact": "...", "phone": "...", "email": "..." }`
- Sale response: `{ "sale": { "itemName": "...", "quantitySold": 2, "totalAmount": 499.98, "soldAt": "..." } }`
- Summary response: `{ "totalStockVolume": 12, "totalInventoryValue": 2999.88, "totalRevenue": 499.98, "totalUnitsSold": 2 }`
- Save response, if retained: `{ "salesLogged": 1, "count": 3 }`

Use separate sales and supplier records. A sale should store its own quantity, unit price or total, item name/ID, and timestamp. Otherwise, changing an item's price later can corrupt the displayed historical revenue.

### 6. Implement and validate operations

For each mutation:

- Reject invalid or missing request data with `400 Bad Request`.
- Return `404 Not Found` when the requested item does not exist.
- Reject a sale quantity less than one or greater than available stock.
- Reject stock adjustments that would leave quantity negative.
- On a successful sale, reduce stock and append the sale record as one logical operation.
- Validate the supplier name and any other required supplier fields.
- Return structured JSON errors that the browser can display.

The current manager UI describes stock quantity as a modification, allowing positive and negative values. If negative adjustments are supported, calculate the proposed new quantity and validate it before changing the item. Do not allow an unhandled `ArgumentOutOfRangeException` to become a generic server error.

### 7. Repair and align the browser

Before API testing, repair `Sales and Inventory System/wwwroot/script.js`:

1. Complete `saveSystemState()` and restore its error handling and closing braces. The current file ends after parsing the response, which leaves the JavaScript syntactically incomplete.
2. Restore or implement `showGlobalAlert()`, which other functions call.
3. Add `<script src="script.js"></script>` to `index.html` before `</body>` if the sales page should use the API.
4. Since the pages do not contain the same controls, only bind an event listener if its form/button exists. Likewise, only render into or update metric elements that exist. Alternatively, split manager and sales scripts.
5. Check `response.ok` on GET requests before treating the response body as valid data. For mutations, display the API's error body on non-success responses.
6. Make form IDs and value types match the selected ID scheme and request DTOs.

Do this in the nested project's `wwwroot` directory. The repository-root `wwwroot/` is a separate copy and is not the static root used when running the nested ASP.NET project.

### 8. Test the API and pages

From the repository root:

```powershell
dotnet build "Sales and Inventory System/Sales and Inventory System.csproj"
dotnet run --project "Sales and Inventory System/Sales and Inventory System.csproj" --launch-profile http
```

Open `http://localhost:5240/` and `http://localhost:5240/Manager%20interface-1.html`. Because the same ASP.NET app serves pages and API, requests to relative `/api/...` URLs are same-origin; CORS is not needed. Do not use `file://` or a different Live Server origin for this setup.

Verify in this order:

1. `GET http://localhost:5240/api/warehouse/items` returns seeded item JSON with the fields the table uses.
2. `GET /api/warehouse/sales`, `/summary`, and `/suppliers` each return valid JSON with the documented fields.
3. Both pages load without JavaScript syntax errors or null-element errors in the browser developer console.
4. A valid stock adjustment updates the returned item quantity. An unknown ID and a negative resulting quantity return errors without corrupting state.
5. A valid sale reduces stock and appears in sales history. Attempting to sell more than available stock returns an error and does not create a sale.
6. Supplier creation returns success and the supplier appears in the directory.
7. Summary values change consistently after stock and sales operations.
8. The save button returns the fields the browser expects, or is removed if saving is not implemented.
9. Restart the host and confirm expected persistence behavior. In-memory state resets; persistent storage requires a database.

Update `Sales and Inventory System/Sales and Inventory System.http` with these requests to make the API checks repeatable.
