# Sales and Inventory System Prototype

A prototype warehouse inventory and sales dashboard. The repository contains two HTML interfaces, shared styling, browser-side JavaScript, and an ASP.NET Core project intended to serve as the API host.

## Features represented in the interfaces

- View inventory quantities, prices, suppliers, and stock status.
- Record sales and view sales history.
- Update stock and manage supplier details in the manager interface.
- View inventory and sales metrics, run a low-stock report, and request a system-state save.

## Project layout

| Path | Purpose |
| --- | --- |
| `Sales and Inventory System/` | ASP.NET Core web host |
| `Sales and Inventory System/Program.cs` | ASP.NET Core startup and middleware configuration |
| `Sales and Inventory System/wwwroot/` | Pages, styles, and browser script served by the host |
| `wwwroot/` | Root-level copy of the browser files; not served by the nested ASP.NET project |

## Requirements

- .NET 10 SDK
- A modern web browser

## API implementation reference

The current host serves static pages but does not yet implement the `/api/warehouse` endpoints called by the browser. See [API-IMPLEMENTATION-GUIDE.md](./API-IMPLEMENTATION-GUIDE.md) for the current state, endpoint contract, implementation steps, and manual test flow.

## Run the ASP.NET Core project

From the repository root:

```powershell
dotnet run --project "Sales and Inventory System/Sales and Inventory System.csproj" --launch-profile http
```

Open `http://localhost:5240/` for the sales dashboard or `http://localhost:5240/Manager%20interface-1.html` for the manager dashboard. The pages are served, but API-backed features will not work until the routes described in the implementation guide are added.
