const API_URL = "/api/inventory";

// Initialize and bind system event handlers on page load
document.addEventListener("DOMContentLoaded", () => {
    loadInventory();
    loadSales();
    loadSuppliers();

    document.getElementById("stock-form").addEventListener("submit", handleStockUpdate);
    document.getElementById("sale-form").addEventListener("submit", handleSale);
    document.getElementById("supplier-form").addEventListener("submit", handleSupplierAdd);
    document.getElementById("btn-report").addEventListener("click", runLowStockReport);
    document.getElementById("btn-save").addEventListener("click", saveSystemState);

    document.getElementById("btn-logout")?.addEventListener("click", async (e) => {
        e.preventDefault();
        await fetch("/api/logout", { method: "POST" });
        window.location.href = "/";
        });
});

                                  // Data Fetching Engines
async function loadInventory() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("Failed to fetch inventory");
        const items = await response.json();
        renderTable(items);
        calculateTotals(items);
        checkLowStockAlerts(items);
    } catch (error) {
        showGlobalAlert("Failed to load inventory from server endpoint.");
    }
}

async function loadSales() {
    try {
        const response = await fetch("/api/sales");
        if (!response.ok) throw new Error("Failed to fetch sales");
        const sales = await response.json();
        renderSalesHistory(sales);
        updateSalesMetrics(sales);
    } catch (error) {
        showGlobalAlert("Failed to load sales tracker data.");
    }
}

async function loadSuppliers() {
    try {
        const response = await fetch("/api/suppliers");
        if (!response.ok) throw new Error("Failed to fetch suppliers");
        const suppliers = await response.json();
        renderSuppliers(suppliers);
    } catch (error) {
        showGlobalAlert("Failed to load supplier list.");
    }
}

                                 // This is for the Data to Render Engine
function renderTable(items) {
    const tableBody = document.getElementById("inventory-table-body");
    tableBody.innerHTML = "";

    items.forEach(item => {
        const statusClass = item.quantity > 0 ? "status-instock" : "status-soldout";
        const statusText = item.status || (item.quantity > 0 ? "In Stock" : "Sold Out");
        const supplierName = typeof item.supplier === "string" 
            ? item.supplier 
            : (item.supplier?.name || "General");

        const row = `
            <tr>
                <td>${item.id}</td>
                <td><strong>${item.name}</strong></td>
                <td>${item.quantity} units</td>
                <td>R ${Number(item.price || 0).toFixed(2)}</td>
                <td><strong>${supplierName}</strong></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });
}

function renderSuppliers(suppliers) {
    const tableBody = document.getElementById("supplier-table-body");
    tableBody.innerHTML = "";

    if (!suppliers || suppliers.length === 0) {
        tableBody.innerHTML = "<tr><td colspan='4'>No suppliers registered yet.</td></tr>";
        return;
    }

    suppliers.forEach(supplier => {
        const row = `
            <tr>
                <td>${supplier.name}</td>
                <td>${supplier.contact || "N/A"}</td>
                <td>${supplier.phone || "N/A"}</td>
                <td>${supplier.email || "N/A"}</td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });
}

function renderSalesHistory(sales) {
    const salesList = document.getElementById("sales-list");
    salesList.innerHTML = "";

    if (!sales || sales.length === 0) {
        salesList.innerHTML = "<li class='sales-empty'>No sales recorded yet.</li>";
        return;
    }

    const recentSales = sales.slice(0, 6);
    recentSales.forEach(sale => {
        const saleDate = new Date(sale.soldAt).toLocaleString();
        const item = `
            <li class="sales-item">
                <div>
                    <strong>${sale.itemName}</strong>
                    <span>${sale.quantitySold} sold</span>
                </div>
                <div>
                    <span>R ${Number(sale.totalAmount || 0).toFixed(2)}</span>
                    <small>${saleDate}</small>
                </div>
            </li>
        `;
        salesList.innerHTML += item;
    });
}

                                // 3. This handles the sale transaction, it Handle the action
async function handleStockUpdate(e) {
    e.preventDefault();
    const itemId = document.getElementById("item-id").value.trim();
    const quantity = parseInt(document.getElementById("item-qty").value, 10);

    try {
        const response = await fetch(`${API_URL}/receive`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId, quantity })
        });

        const result = await response.json().catch(() => null);

        if (response.ok) {
            document.getElementById("stock-form").reset();
            await loadInventory();
            showGlobalAlert(result?.message || "Stock updated successfully.", false);
        } else {
            showGlobalAlert(result?.message || "Unable to update stock.");
        }
    } catch (error) {
        showGlobalAlert("Network tracking error: connection refused.");
    }
}

async function handleSale(e) {
    e.preventDefault();
    const itemId = document.getElementById("sale-item-id").value.trim();
    const quantity = parseInt(document.getElementById("sale-qty").value, 10);

    try {
        const response = await fetch("/api/sales", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId, quantity })
        });

        const result = await response.json().catch(() => null);

        if (response.ok) {
            document.getElementById("sale-form").reset();
            await loadInventory();
            await loadSales();
            showGlobalAlert(
                `Sale recorded: ${result.itemName} (${result.quantitySold} units) for R ${Number(result.totalAmount).toFixed(2)}`,
                false
            );
        } else {
            showGlobalAlert(result?.message || "Unable to record sale.");
        }
    } catch (error) {
        showGlobalAlert("Sales processing failed. Please try again.");
    }
}

async function handleSupplierAdd(e) {
    e.preventDefault();

    const payload = {
        name: document.getElementById("supplier-name").value.trim(),
        contact: document.getElementById("supplier-contact").value.trim(),
        phone: document.getElementById("supplier-phone").value.trim(),
        email: document.getElementById("supplier-email").value.trim()
    };

    try {
        const response = await fetch("/api/suppliers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            document.getElementById("supplier-form").reset();
            await loadSuppliers();
            showGlobalAlert("Supplier added successfully.", false);
        } else {
            const errText = await response.text();
            showGlobalAlert(errText || "Failed to save supplier.");
        }
    } catch (error) {
        showGlobalAlert("Supplier save failed.");
    }
}



function calculateTotals(items) {
    const total = items.reduce((sum, item) => sum + item.quantity, 0);
    const inventoryValue = items.reduce((sum, item) => sum + (item.quantity * Number(item.price || 0)), 0);

    document.querySelectorAll("#total-volume").forEach(el => {
        el.innerText = total;
    });
    document.getElementById("inventory-value").innerText = `R ${inventoryValue.toFixed(2)}`;
}

function updateSalesMetrics(sales) {
    const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
    const unitsSold = sales.reduce((sum, sale) => sum + Number(sale.quantitySold || 0), 0);

    document.getElementById("total-revenue").innerText = `R ${totalRevenue.toFixed(2)}`;
    document.getElementById("units-sold").innerText = unitsSold;
}



                                        // Sales Audit System
function checkLowStockAlerts(items) {
    const lowStock = items.filter(item => item.quantity < 5);
    const alertBanner = document.getElementById("alert-banner");

    if (lowStock.length > 0) {
        const names = lowStock.map(i => i.name).join(", ");
        alertBanner.innerText = `Low Stock Alert (<5 remaining): ${names}`;
        alertBanner.classList.remove("hidden");
    } else {
        alertBanner.classList.add("hidden");
    }
}

async function runLowStockReport() {
    try {
        const response = await fetch(API_URL);
        const items = await response.json();
        const lowStock = items.filter(item => item.quantity < 5);

        if (lowStock.length === 0) {
            alert("LINQ Audit Status: All items securely stocked above minimum thresholds!");
            return;
        }
        alert("Low Stock Items:\n" + lowStock.map(i => `- ${i.name}: ${i.quantity} left`).join("\n"));
    } catch (err) {
        showGlobalAlert("Failed to compile target audit arrays.");
    }
}

async function saveSystemState() {
    try {
        const res = await fetch(`${API_URL}/save`, { method: "POST" });
        if (res.ok) {
            const result = await res.json();
            alert(result.message || "System state saved successfully.");
        } else {
            showGlobalAlert("Failed to save system state.");
        }
    } catch (e) {
        showGlobalAlert("File I/O operations halted.");
    }
}

function showGlobalAlert(message, isError = true) {
    const banner = document.getElementById("alert-banner");
    banner.innerText = isError ? `Error: ${message}` : `✅ ${message}`;
    banner.classList.remove("hidden");
    setTimeout(() => banner.classList.add("hidden"), 5000);
}
