using System; 
using System.IO; 
using System.Collections.Generic; 
using System.Linq;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

public enum ItemStatus 
{ 
    InStock, 
    SoldOut, 
    Discount 
}  

public interface IStockable 
{ 
    string Id { get; } 
    string Name { get; }
    int Quantity { get; }
}

public class InventoryItem : IStockable
{
    private string _itemId;
    private string _name;
    private int _quantity;

    public string Id
    {
        get { return _itemId; }
    }

    public int Quantity
    {
        get { return _quantity; }
        set
        {
            if (value < 0)
                throw new ArgumentOutOfRangeException(nameof(value), "Quantity cannot be negative");
            _quantity = value;
        }
    }

    public string Name
    {
        get { return _name; }
        set { _name = value; }
    }
    
    public InventoryItem(string itemId, string name, int quantity) 
    { 
        if (string.IsNullOrWhiteSpace(itemId)) 
            throw new ArgumentException("Item cannot be empty"); 
        
        this._itemId = itemId; 
        this._name = name; 
        this.Quantity = quantity; 
        //this.Status = quantity > 0 ? ItemStatus.InStock : ItemStatus.SoldOut;
    }

    public static bool operator ==(InventoryItem item1, InventoryItem item2) 
    { 
        if (ReferenceEquals(item1, item2)) return true; 
        if (item1 is null || item2 is null) return false; 
        return item1.Id == item2.Id; 
    }

    public static bool operator !=(InventoryItem item1, InventoryItem item2) 
    { 
        return !(item1 == item2);
    }

    public override bool Equals(object obj)
    {
        return obj is InventoryItem item && Id == item.Id;
    }

    public override int GetHashCode()
    {
        return Id?.GetHashCode() ?? 0;
    }
} 

public class Warehouse<T> where T : class, IStockable 
{ 
    private readonly Dictionary<string, T> inventory; 
    
    public delegate void NotifyEventHandler(string itemName); 
    public event NotifyEventHandler LowStockAlert; 

    public Warehouse() 
    { 
        inventory = new Dictionary<string, T>(); 
    } 
 
    public T this[string id] 
    { 
        get { return inventory.ContainsKey(id) ? inventory[id] : null; } 
    }

    public virtual void OnLowStockAlert(string itemName) 
    { 
        LowStockAlert?.Invoke(itemName); 
    } 

    private bool ItemExistsInRepository(string itemId)
    {
        return inventory.ContainsKey(itemId);
    }

    public void ReceiveStock(string itemId, string name, int quantity) 
    {
        try  
        { 
            if (!ItemExistsInRepository(itemId)) 
            { 
                throw new KeyNotFoundException("Item was not found"); 
            } 
            
            var item = inventory[itemId];
            if (item is InventoryItem invItem)
            {
                invItem.Quantity += quantity;
                if (invItem.Quantity < 5)
                {
                    OnLowStockAlert(invItem.Name);
                }
            }
            Console.WriteLine("Stock message updated."); 
        }
        catch (KeyNotFoundException ex) 
        { 
            Console.WriteLine($"Item not found: {ex.Message}");
        }  
    } 

    public void SaveState(string filePath) 
    { 
        using (BinaryWriter writer = new BinaryWriter(File.Open(filePath, FileMode.Create))) 
        {
            foreach (var item in inventory.Values) 
            { 
                writer.Write(item.Id); 
                writer.Write(item.Name); 
                writer.Write(item.Quantity); 
            } 
        }
    }
}

public static class AuditLogger 
{ 
    public static void LogAlert(string itemName) 
    { 
        Console.WriteLine($"Stock is getting low for: {itemName}"); 
    } 
} 

//Register the Warehouse class as a application
//Wire up the LowStockAlert event to the AuditLogger
//Initialize/Seed the Warehouse with mock data
class Program 
{ 
    static void Main(string[] args) 
    { 
        var builder = WebApplication.CreateBuilder(args);

        var warehouse = new Warehouse<InventoryItem>();
        
        warehouse.LowStockAlert += AuditLogger.LogAlert;

        warehouse.SeedItem(1, new InventoryItem(1, "Wireless Mouse", 12));
        warehouse.SeedItem(2, new InventoryItem(2, "Mechanical Keyboard", 3)); // Will trigger low stock alert if processed
        warehouse.SeedItem(3, new InventoryItem(3, "4K Monitor", 7));

        builder.Services.Singleton(warehouse);

        var app = builder.Build();
        
// Configuration for handling static hosting files via Sales and Inventory
        app.UseDefaultFiles();
        app.UseStaticFiles();

        // 4. Map HTTP Minimal API Route endpoints

//get: all inventory items and single item by ID
        app.MapGet("/api/inventory", (Warehouse<InventoryItem> wh) => 
        {
            return Results.Ok(wh.GetAllItems());
        });

        app.MapGet("/api/inventory/{id}", (string id, Warehouse<InventoryItem> wh) => 
        {
            var item = wh[id];
            return item is not null ? Results.Ok(item) : Results.NotFound(new { message = "Item not found" });
        });

        // POST: Update item quantities ensureing that the item exists and quantity is valid above 5
        app.MapPost("/api/inventory/receive", (StockUpdateRequest request, Warehouse<InventoryItem> wh) => 
        {
            var item = wh[request.ItemId];
            if (item is null)
            {
                return Results.NotFound(new { message = $"Item ID '{request.ItemId}' does not exist." });
            }

            // Invokes logic, safety constraints, and delegates tracking
            wh.ReceiveStock(request.ItemId, item.Name, request.Quantity);
            return Results.Ok(new { message = "Stock updated successfully.", currentQuantity = item.Quantity });
        });
        
        app.Run();
    } 
}

// Data Transfer Object for incoming JSON payloads
public record StockUpdateRequest(string ItemId, int Quantity);