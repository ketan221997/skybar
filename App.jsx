import { useState, useEffect } from "react";
import { db } from "./firebase";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const INITIAL_CATEGORIES = {
  "SINGLE MALT": [],
  "WHISKEY": [],
  "BOURBON WHISKEY": [],
  "VODKA": [],
  "GIN": [],
  "TEQUILA": [],
  "RUM": [],
  "COGNAC & BRANDY": [],
  "LIQUEUR": [],
  "RED WINE": [],
  "WHITE WINE": [],
  "ROSE WINE": [],
  "CHAMPAGNE & SPARKLING": [],
  "BEER": []
};

const LOW_STOCK_THRESHOLD = 1.0;

// Firestore document paths
const DOC = {
  inventory:  () => doc(db, "skyHighVK", "inventory"),
  categories: () => doc(db, "skyHighVK", "categories"),
  logs:       () => doc(db, "skyHighVK", "logs"),
};

// ── HELPERS ────────────────────────────────────────────────────────────────
const getCategoryEmoji = (cat) => {
  const map = {
    "SINGLE MALT": "🥃", "WHISKEY": "🥃", "BOURBON WHISKEY": "🥃",
    "VODKA": "🍸", "GIN": "🍸", "TEQUILA": "🍹",
    "RUM": "🍹", "COGNAC & BRANDY": "🥃", "LIQUEUR": "🍾",
    "RED WINE": "🍷", "WHITE WINE": "🥂", "ROSE WINE": "🌸",
    "CHAMPAGNE & SPARKLING": "🍾", "BEER": "🍺"
  };
  return map[cat] || "🍶";
};

// ── COMPONENT ──────────────────────────────────────────────────────────────
export default function LiquorInventory() {

  // ── STATE ──
  const [inventory,      setInventory]      = useState({});
  const [categories,     setCategories]     = useState(INITIAL_CATEGORIES);
  const [consumptionLog, setConsumptionLog] = useState([]);
  const [restockLog,     setRestockLog]     = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [syncStatus,     setSyncStatus]     = useState("synced"); // "synced" | "saving" | "error"

  const [activeTab,      setActiveTab]      = useState("inventory");
  const [searchTerm,     setSearchTerm]     = useState("");
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [showLowStock,   setShowLowStock]   = useState(false);
  const [toast,          setToast]          = useState(null);

  const [showConsumptionModal, setShowConsumptionModal] = useState(false);
  const [consumptionDate,      setConsumptionDate]      = useState(new Date().toISOString().split("T")[0]);
  const [consumptionEntries,   setConsumptionEntries]   = useState([{ item: "", qty: "", unit: "BTL" }]);

  const [showRestockModal, setShowRestockModal] = useState(false);
  const [restockDate,      setRestockDate]      = useState(new Date().toISOString().split("T")[0]);
  const [restockEntries,   setRestockEntries]   = useState([{ item: "", isNew: false, newName: "", newUom: 750, newUnit: "BTL", qty: "", category: "WHISKEY" }]);

  const [showRebaseModal,    setShowRebaseModal]    = useState(false);
  const [rebaseDate,         setRebaseDate]         = useState(new Date().toISOString().split("T")[0]);
  const [rebaseValues,       setRebaseValues]       = useState({});
  const [rebaseSearch,       setRebaseSearch]       = useState("");
  const [rebaseMode,         setRebaseMode]         = useState("manual");
  const [rebaseUploadStatus, setRebaseUploadStatus] = useState(null);
  const [rebaseUploadMsg,    setRebaseUploadMsg]    = useState("");

  // ── FIREBASE REAL-TIME LISTENERS ──
  // Subscribe to all 3 documents on mount — updates arrive live across all devices
  useEffect(() => {
    let loaded = { inventory: false, categories: false, logs: false };
    const checkLoaded = () => {
      if (loaded.inventory && loaded.categories && loaded.logs) setLoading(false);
    };

    const unsubInv = onSnapshot(DOC.inventory(), (snap) => {
      if (snap.exists()) setInventory(snap.data().items || {});
      loaded.inventory = true; checkLoaded();
    }, () => { loaded.inventory = true; checkLoaded(); });

    const unsubCat = onSnapshot(DOC.categories(), (snap) => {
      if (snap.exists()) {
        const saved = snap.data().data || {};
        // Merge with INITIAL_CATEGORIES to ensure all keys always exist
        const merged = { ...INITIAL_CATEGORIES };
        Object.entries(saved).forEach(([cat, items]) => {
          if (merged[cat] !== undefined) merged[cat] = items;
        });
        setCategories(merged);
      }
      loaded.categories = true; checkLoaded();
    }, () => { loaded.categories = true; checkLoaded(); });

    const unsubLogs = onSnapshot(DOC.logs(), (snap) => {
      if (snap.exists()) {
        setConsumptionLog(snap.data().consumption || []);
        setRestockLog(snap.data().restock || []);
      }
      loaded.logs = true; checkLoaded();
    }, () => { loaded.logs = true; checkLoaded(); });

    return () => { unsubInv(); unsubCat(); unsubLogs(); };
  }, []);

  // ── FIREBASE SAVE HELPERS ──
  const saveInventory = async (inv) => {
    setSyncStatus("saving");
    try {
      await setDoc(DOC.inventory(), { items: inv });
      setSyncStatus("synced");
    } catch { setSyncStatus("error"); showToast("⚠ Failed to save — check connection", "error"); }
  };

  const saveCategories = async (cats) => {
    try { await setDoc(DOC.categories(), { data: cats }); }
    catch { showToast("⚠ Failed to save categories", "error"); }
  };

  const saveLogs = async (consumption, restock) => {
    try { await setDoc(DOC.logs(), { consumption, restock }); }
    catch { showToast("⚠ Failed to save logs", "error"); }
  };

  // ── HELPERS ──
  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };
  const getTotal  = (item) => inventory[item]?.total || 0;
  const getCategoryForItem = (item) => {
    for (const [cat, items] of Object.entries(categories)) { if (items.includes(item)) return cat; }
    return "OTHER";
  };

  // ── DELETE ITEM ──
  const deleteItem = async (item) => {
    const updated = { ...inventory };
    delete updated[item];
    const updatedCats = { ...categories };
    Object.keys(updatedCats).forEach(cat => { updatedCats[cat] = updatedCats[cat].filter(i => i !== item); });
    setInventory(updated);
    setCategories(updatedCats);
    await saveInventory(updated);
    await saveCategories(updatedCats);
    showToast(`✓ "${item}" removed`);
  };

  // ── CLEAR ALL DATA ──
  const clearAllData = async () => {
    if (!window.confirm("⚠ This will permanently delete ALL inventory, items, and logs. Are you sure?")) return;
    if (!window.confirm("Are you absolutely sure? This cannot be undone.")) return;
    const emptyInv  = {};
    const emptyCats = { ...INITIAL_CATEGORIES };
    setInventory(emptyInv);
    setCategories(emptyCats);
    setConsumptionLog([]);
    setRestockLog([]);
    await saveInventory(emptyInv);
    await saveCategories(emptyCats);
    await saveLogs([], []);
    showToast("✓ All data cleared. Starting fresh.");
  };

  // ── CONSUMPTION ──
  const applyConsumption = async () => {
    const valid = consumptionEntries.filter(e => e.item && parseFloat(e.qty) > 0);
    if (!valid.length) { showToast("Please add at least one valid entry", "error"); return; }

    const updated   = { ...inventory };
    const logEntry  = { date: consumptionDate, entries: [], id: Date.now() };

    for (const e of valid) {
      const rawQty    = parseFloat(e.qty);
      if (!updated[e.item]) continue;
      const bottleMl  = updated[e.item].uom || 750;
      const qtyInBtl  = e.unit === "ML" ? rawQty / bottleMl : rawQty;
      const before    = updated[e.item].total || 0;
      updated[e.item] = { ...updated[e.item], total: Math.max(0, before - qtyInBtl) };
      const after     = updated[e.item].total;
      logEntry.entries.push({ item: e.item, qtyInBtl, rawQty, unit: e.unit, before, after });
    }

    const newLog = [logEntry, ...consumptionLog];
    setInventory(updated);
    setConsumptionLog(newLog);
    setShowConsumptionModal(false);
    setConsumptionEntries([{ item: "", qty: "", unit: "BTL" }]);
    await saveInventory(updated);
    await saveLogs(newLog, restockLog);
    showToast(`✓ Consumption recorded for ${consumptionDate}`);
  };

  // ── RESTOCK ──
  const applyRestock = async () => {
    const valid = restockEntries.filter(e => (e.isNew ? e.newName.trim() : e.item) && e.qty !== "");
    if (!valid.length) { showToast("Please add at least one valid entry", "error"); return; }

    const updated     = { ...inventory };
    const updatedCats = { ...categories, ...Object.fromEntries(Object.entries(categories).map(([k,v]) => [k,[...v]])) };
    const logEntry    = { date: restockDate, entries: [], id: Date.now() };

    for (const e of valid) {
      const qty = parseFloat(e.qty) || 0;
      let itemName = e.item;

      if (e.isNew) {
        itemName = e.newName.trim().toUpperCase();
        if (!updated[itemName]) {
          updated[itemName]          = { uom: parseInt(e.newUom), total: 0, unit: e.newUnit };
          updatedCats[e.category]    = [...(updatedCats[e.category] || [])];
          if (!updatedCats[e.category].includes(itemName)) updatedCats[e.category].push(itemName);
        }
      }

      const before         = updated[itemName]?.total || 0;
      updated[itemName]    = { ...updated[itemName], total: before + qty };
      logEntry.entries.push({ item: itemName, qty, before, after: updated[itemName].total, isNew: e.isNew });
    }

    const newRestockLog = [logEntry, ...restockLog];
    setInventory(updated);
    setCategories(updatedCats);
    setRestockLog(newRestockLog);
    setShowRestockModal(false);
    setRestockEntries([{ item: "", isNew: false, newName: "", newUom: 750, newUnit: "BTL", qty: "", category: "WHISKEY" }]);
    await saveInventory(updated);
    await saveCategories(updatedCats);
    await saveLogs(consumptionLog, newRestockLog);
    showToast(`✓ Restock recorded for ${restockDate}`);
  };

  // ── REBASE ──
  const openRebaseModal = () => {
    const vals = {};
    Object.entries(inventory).forEach(([item, data]) => { vals[item] = data.total || 0; });
    setRebaseValues(vals);
    setShowRebaseModal(true);
  };

  const applyRebase = async () => {
    const newInv = {};
    Object.entries(inventory).forEach(([item, data]) => {
      newInv[item] = { ...data, total: parseFloat(rebaseValues[item] ?? data.total) || 0 };
    });
    setInventory(newInv);
    setConsumptionLog([]);
    setRestockLog([]);
    setShowRebaseModal(false);
    await saveInventory(newInv);
    await saveLogs([], []);
    showToast("✓ Inventory re-based as of " + rebaseDate);
  };

  // ── CSV UPLOAD ──
  const handleCSVUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setRebaseUploadStatus("parsing");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const lines      = ev.target.result.split("\n").map(l => l.trim()).filter(Boolean);
        const hasHeader  = lines[0].toLowerCase().includes("item") || lines[0].toLowerCase().includes("name");
        const dataLines  = hasHeader ? lines.slice(1) : lines;
        const matched    = {}, unmatched = [];
        const allNames   = Object.keys(inventory);
        dataLines.forEach(line => {
          const cols    = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
          if (cols.length < 2) return;
          const rawName = cols[0].toUpperCase();
          const totalVal = parseFloat(cols[1]) || 0;
          const key     = allNames.find(n => n === rawName) || allNames.find(n => n.includes(rawName) || rawName.includes(n.substring(0, 6)));
          if (key) matched[key] = totalVal; else unmatched.push(rawName);
        });
        setRebaseValues(prev => ({ ...prev, ...matched }));
        setRebaseUploadMsg(`✓ Matched ${Object.keys(matched).length} items.${unmatched.length ? ` ${unmatched.length} unrecognised: ${unmatched.slice(0,3).join(", ")}${unmatched.length>3?"…":""}` : ""}`);
        setRebaseUploadStatus("done");
      } catch { setRebaseUploadStatus("error"); setRebaseUploadMsg("Could not parse CSV."); }
    };
    reader.readAsText(file); e.target.value = "";
  };

  // ── IMAGE UPLOAD (AI) ──
  const handleImageUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setRebaseUploadStatus("parsing"); setRebaseUploadMsg("AI is reading your stock sheet…");
    try {
      const base64   = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
      const allNames = Object.keys(inventory);
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 2000,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } },
            { type: "text",  text: `Parse this liquor stock report. Extract total stock quantity per item. Return ONLY a JSON array: [{"item":"NAME","total":0}, ...]. Known items: ${allNames.join(", ")}. No other text.` }
          ]}]
        })
      });
      const data   = await response.json();
      const parsed = JSON.parse(data.content?.map(c => c.text||"").join("").replace(/```json|```/g,"").trim());
      const matched = {}, unmatched = [];
      parsed.forEach(({ item, total }) => {
        const raw = item.toUpperCase();
        const key = allNames.find(n => n === raw) || allNames.find(n => n.includes(raw) || raw.includes(n.substring(0,6)));
        if (key) matched[key] = parseFloat(total)||0; else unmatched.push(raw);
      });
      setRebaseValues(prev => ({ ...prev, ...matched }));
      setRebaseUploadMsg(`✓ AI matched ${Object.keys(matched).length} of ${parsed.length} items.${unmatched.length ? ` Unmatched: ${unmatched.slice(0,3).join(", ")}` : ""}`);
      setRebaseUploadStatus("done");
    } catch { setRebaseUploadStatus("error"); setRebaseUploadMsg("AI parsing failed. Try a clearer image or use CSV."); }
    e.target.value = "";
  };

  // ── DERIVED ──
  const allItems       = Object.keys(inventory);
  const lowStockItems  = allItems.filter(item => getTotal(item) < LOW_STOCK_THRESHOLD);
  const filteredItems  = allItems.filter(item => {
    const matchSearch = item.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat    = filterCategory === "ALL" || categories[filterCategory]?.includes(item);
    const matchLow    = !showLowStock || getTotal(item) < LOW_STOCK_THRESHOLD;
    return matchSearch && matchCat && matchLow;
  });

  // ── STYLE HELPERS ──
  const S = {
    dark:   { background: "#1a1200", border: "1px solid #3a2a0a", borderRadius: "6px", padding: "9px 12px", color: "#e8d5b0", fontSize: "12px", fontFamily: "inherit" },
    green:  { background: "#0d1a0d", border: "1px solid #1a3a1a", borderRadius: "6px", padding: "9px 12px", color: "#e8d5b0", fontSize: "12px", fontFamily: "inherit" },
    purple: { background: "#1a1230", border: "1px solid #3a2a5a", borderRadius: "6px", padding: "9px 14px", color: "#e8d5b0", fontSize: "13px", fontFamily: "inherit" },
  };

  // ── LOADING SCREEN ──
  if (loading) return (
    <div style={{ fontFamily: "'Courier New', monospace", background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
      <div style={{ fontSize: "48px" }}>🥃</div>
      <div style={{ color: "#c8960c", fontSize: "14px", letterSpacing: "4px" }}>LOADING INVENTORY…</div>
      <div style={{ color: "#3a2a0a", fontSize: "11px" }}>Connecting to database</div>
    </div>
  );

  // ── RENDER ──
  return (
    <div style={{ fontFamily: "'Courier New', monospace", background: "#0a0a0a", minHeight: "100vh", color: "#e8d5b0" }}>

      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg,#1a0a00,#2d1500,#1a0a00)", borderBottom: "2px solid #c8960c", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ fontSize: "10px", letterSpacing: "4px", color: "#c8960c", marginBottom: "4px" }}>THE SKY HIGH VK</div>
          <div style={{ fontSize: "22px", fontWeight: "bold", color: "#f5e6c8", letterSpacing: "1px" }}>🥃 LIQUOR STOCK TRACKER</div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
            <div style={{ fontSize: "11px", color: "#8a7a5a" }}>Base: {rebaseDate} · Live sync</div>
            <div style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", letterSpacing: "1px",
              background: syncStatus === "saving" ? "#1a1200" : syncStatus === "error" ? "#2a0000" : "#001a00",
              color:      syncStatus === "saving" ? "#c8960c"  : syncStatus === "error" ? "#cc3300"  : "#44cc66",
              border:     `1px solid ${syncStatus === "saving" ? "#3a2a0a" : syncStatus === "error" ? "#cc3300" : "#1a4a1a"}`
            }}>
              {syncStatus === "saving" ? "⟳ SAVING…" : syncStatus === "error" ? "✗ SYNC ERROR" : "● LIVE"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {lowStockItems.length > 0 && (
            <div onClick={() => { setShowLowStock(!showLowStock); setActiveTab("inventory"); }}
              style={{ background: "#3d0000", border: "1px solid #cc3300", borderRadius: "6px", padding: "8px 14px", fontSize: "12px", color: "#ff6644", cursor: "pointer" }}>
              ⚠ {lowStockItems.length} LOW STOCK
            </div>
          )}
          <button onClick={clearAllData} style={{ background: "#1a0000", border: "1px solid #cc2200", borderRadius: "6px", padding: "10px 18px", color: "#cc2200", fontWeight: "bold", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", letterSpacing: "1px" }}>🗑 CLEAR ALL</button>
          <button onClick={() => setShowRestockModal(true)} style={{ background: "#1a3a1a", border: "1px solid #44cc66", borderRadius: "6px", padding: "10px 18px", color: "#44cc66", fontWeight: "bold", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", letterSpacing: "1px" }}>+ ADD STOCK</button>
          <button onClick={() => setShowConsumptionModal(true)} style={{ background: "#c8960c", border: "none", borderRadius: "6px", padding: "10px 18px", color: "#0a0a0a", fontWeight: "bold", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", letterSpacing: "1px" }}>+ LOG CONSUMPTION</button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", borderBottom: "1px solid #2a2010", background: "#0f0a00", padding: "0 24px", overflowX: "auto" }}>
        {[["inventory","📦 Inventory"],["log","📋 Consumption"],["restock","📥 Restock Log"],["summary","📊 Summary"]].map(([key,label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{ background: "none", border: "none", borderBottom: activeTab===key ? "2px solid #c8960c" : "2px solid transparent", color: activeTab===key ? "#c8960c" : "#6a5a3a", padding: "14px 20px", cursor: "pointer", fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase", fontFamily: "inherit", whiteSpace: "nowrap" }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: "20px 24px" }}>

        {/* ── INVENTORY TAB ── */}
        {activeTab === "inventory" && (
          <div>
            <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="🔍 Search item..." style={{ ...S.dark, flex: "1", minWidth: "180px" }} />
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={S.dark}>
                <option value="ALL">All Categories</option>
                {Object.keys(categories).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer", color: "#c8960c" }}>
                <input type="checkbox" checked={showLowStock} onChange={e => setShowLowStock(e.target.checked)} /> LOW STOCK ONLY
              </label>
              <button onClick={openRebaseModal} style={{ background: "#1a0a1a", border: "1px solid #8844cc", borderRadius: "6px", padding: "10px 16px", color: "#bb88ff", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", letterSpacing: "1px", fontWeight: "bold" }}>⚑ RE-BASE STOCK</button>
            </div>

            {filteredItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 20px", color: "#3a2a0a" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>🍶</div>
                <div style={{ fontSize: "14px" }}>No items yet. Use <strong style={{color:"#44cc66"}}>+ ADD STOCK</strong> to add your first bottle.</div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #3a2a0a" }}>
                      {["ITEM", "CATEGORY", "UOM (ML)", "TOTAL STOCK", "BOTTLES", "REMAINING ML", "STATUS", ""].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: h==="ITEM"||h==="CATEGORY" ? "left" : "right", color: "#c8960c", letterSpacing: "1px", fontSize: "10px", fontWeight: "normal", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, i) => {
                      const data         = inventory[item];
                      const total        = data?.total || 0;
                      const isLow        = total < LOW_STOCK_THRESHOLD;
                      const cat          = getCategoryForItem(item);
                      const wholeBottles = Math.floor(total);
                      const remainingMl  = Math.round((total - wholeBottles) * (data?.uom || 750));
                      return (
                        <tr key={item} style={{ background: i%2===0 ? "#0d0800" : "#0a0600", borderBottom: "1px solid #1a1200", opacity: total===0 ? 0.6 : 1 }}>
                          <td style={{ padding: "9px 12px", color: isLow ? "#ff6644" : "#e8d5b0", maxWidth: "260px" }}>{item}</td>
                          <td style={{ padding: "9px 12px", color: "#6a5a3a", fontSize: "10px", letterSpacing: "1px", whiteSpace: "nowrap" }}>{getCategoryEmoji(cat)} {cat}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: "#6a5a3a" }}>{data?.uom}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: "bold", color: isLow ? "#ff6644" : "#f5e6c8" }}>{total.toFixed(3)} {data?.unit}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: "#a0d0ff", fontWeight: "bold" }}>{wholeBottles}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", color: remainingMl > 0 ? "#ffcc66" : "#3a2a0a" }}>{remainingMl > 0 ? `${remainingMl} mL` : "—"}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right" }}>
                            {total===0 ? <span style={{ color: "#cc0000", fontSize: "10px" }}>● OUT</span>
                              : isLow ? <span style={{ color: "#ff8800", fontSize: "10px" }}>⚠ LOW</span>
                              : <span style={{ color: "#44cc66", fontSize: "10px" }}>✓ OK</span>}
                          </td>
                          <td style={{ padding: "9px 6px", textAlign: "right" }}>
                            <button onClick={() => { if (window.confirm(`Delete "${item}" from inventory?`)) deleteItem(item); }}
                              style={{ background: "none", border: "1px solid #3a1010", borderRadius: "4px", color: "#663333", padding: "3px 8px", cursor: "pointer", fontSize: "11px", fontFamily: "inherit" }}
                              title="Delete item">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ marginTop: "12px", fontSize: "11px", color: "#4a3a1a" }}>Showing {filteredItems.length} of {allItems.length} items</div>
          </div>
        )}

        {/* ── CONSUMPTION LOG TAB ── */}
        {activeTab === "log" && (
          <div>
            <div style={{ fontSize: "13px", color: "#6a5a3a", marginBottom: "20px" }}>{consumptionLog.length} consumption entries recorded</div>
            {consumptionLog.length === 0
              ? <div style={{ textAlign: "center", padding: "60px", color: "#3a2a0a", fontSize: "14px" }}>No consumption logged yet.</div>
              : consumptionLog.map(log => (
                <div key={log.id} style={{ background: "#0d0800", border: "1px solid #2a1a00", borderRadius: "8px", marginBottom: "12px", overflow: "hidden" }}>
                  <div style={{ background: "#1a0e00", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #2a1a00" }}>
                    <span style={{ color: "#c8960c", fontWeight: "bold" }}>📅 {log.date}</span>
                    <span style={{ color: "#6a5a3a", fontSize: "11px" }}>{log.entries.length} item(s)</span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1a1000" }}>
                        {["ITEM","CONSUMED","BEFORE","AFTER"].map(h => (
                          <th key={h} style={{ padding: "8px 16px", textAlign: h==="ITEM"?"left":"right", color: "#4a3a1a", fontSize: "10px", letterSpacing: "1px" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {log.entries.map((e, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #150c00" }}>
                          <td style={{ padding: "8px 16px", color: "#e8d5b0" }}>{e.item}</td>
                          <td style={{ padding: "8px 16px", textAlign: "right", color: "#ff8866" }}>
                            {e.unit==="ML" ? `-${e.rawQty}mL (${e.qtyInBtl.toFixed(3)} BTL)` : `-${e.qtyInBtl.toFixed(3)} BTL`}
                          </td>
                          <td style={{ padding: "8px 16px", textAlign: "right", color: "#6a5a3a" }}>{e.before.toFixed(3)} BTL</td>
                          <td style={{ padding: "8px 16px", textAlign: "right", color: e.after<LOW_STOCK_THRESHOLD?"#ff6644":"#c8960c" }}>{e.after.toFixed(3)} BTL</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        )}

        {/* ── RESTOCK LOG TAB ── */}
        {activeTab === "restock" && (
          <div>
            <div style={{ fontSize: "13px", color: "#6a5a3a", marginBottom: "20px" }}>{restockLog.length} restock entries recorded</div>
            {restockLog.length === 0
              ? <div style={{ textAlign: "center", padding: "60px", color: "#3a2a0a", fontSize: "14px" }}>No restocks logged yet.</div>
              : restockLog.map(log => (
                <div key={log.id} style={{ background: "#0d0800", border: "1px solid #0a2a0a", borderRadius: "8px", marginBottom: "12px", overflow: "hidden" }}>
                  <div style={{ background: "#0a1a0a", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1a2a1a" }}>
                    <span style={{ color: "#44cc66", fontWeight: "bold" }}>📥 {log.date}</span>
                    <span style={{ color: "#6a5a3a", fontSize: "11px" }}>{log.entries.length} item(s)</span>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1a1000" }}>
                        {["ITEM","ADDED","BEFORE","AFTER"].map(h => (
                          <th key={h} style={{ padding: "8px 16px", textAlign: h==="ITEM"?"left":"right", color: "#4a3a1a", fontSize: "10px", letterSpacing: "1px" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {log.entries.map((e, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #150c00" }}>
                          <td style={{ padding: "8px 16px", color: "#e8d5b0" }}>
                            {e.item}{e.isNew && <span style={{ marginLeft: "8px", fontSize: "10px", color: "#44cc66", background: "#0a2a0a", padding: "2px 6px", borderRadius: "4px" }}>NEW</span>}
                          </td>
                          <td style={{ padding: "8px 16px", textAlign: "right", color: "#44cc66" }}>+{(e.qty||0).toFixed(3)}</td>
                          <td style={{ padding: "8px 16px", textAlign: "right", color: "#6a5a3a" }}>{(e.before||0).toFixed(3)}</td>
                          <td style={{ padding: "8px 16px", textAlign: "right", color: "#c8960c" }}>{(e.after||0).toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        )}

        {/* ── SUMMARY TAB ── */}
        {activeTab === "summary" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "16px", marginBottom: "28px" }}>
              {Object.entries(categories).filter(([,items]) => items.length > 0).map(([cat, items]) => {
                const emoji      = getCategoryEmoji(cat);
                const totalUnits = items.reduce((s,i) => s+(inventory[i]?.total||0), 0);
                const lowCount   = items.filter(i => (inventory[i]?.total||0) < LOW_STOCK_THRESHOLD).length;
                return (
                  <div key={cat} style={{ background: "#0d0800", border: "1px solid #2a1a00", borderRadius: "10px", padding: "20px" }}>
                    <div style={{ fontSize: "22px", marginBottom: "8px" }}>{emoji}</div>
                    <div style={{ fontSize: "11px", letterSpacing: "2px", color: "#6a5a3a", marginBottom: "6px" }}>{cat}</div>
                    <div style={{ fontSize: "28px", fontWeight: "bold", color: "#f5e6c8" }}>{totalUnits.toFixed(1)}</div>
                    <div style={{ fontSize: "11px", color: "#4a3a1a", marginTop: "4px" }}>total units · {items.length} SKUs</div>
                    {lowCount > 0 && <div style={{ marginTop: "8px", fontSize: "11px", color: "#ff8800" }}>⚠ {lowCount} items low</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ background: "#0d0800", border: "1px solid #2a1a00", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", letterSpacing: "2px", color: "#c8960c", marginBottom: "16px" }}>LOW STOCK ALERTS</div>
              {lowStockItems.length === 0
                ? <div style={{ color: "#44cc66", fontSize: "13px" }}>✓ All items above threshold</div>
                : lowStockItems.map(item => (
                  <div key={item} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #1a1000", padding: "8px 0", fontSize: "12px" }}>
                    <span style={{ color: "#e8d5b0" }}>{item}</span>
                    <span style={{ color: getTotal(item)===0?"#cc0000":"#ff8800" }}>{getTotal(item)===0?"OUT OF STOCK":`${getTotal(item).toFixed(3)} remaining`}</span>
                  </div>
                ))}
            </div>
            <div style={{ background: "#0d0800", border: "1px solid #2a1a00", borderRadius: "10px", padding: "20px" }}>
              <div style={{ fontSize: "11px", letterSpacing: "2px", color: "#c8960c", marginBottom: "16px" }}>ACTIVITY</div>
              <div style={{ fontSize: "13px", color: "#6a5a3a" }}>Consumption entries: <span style={{ color: "#e8d5b0" }}>{consumptionLog.length}</span></div>
              <div style={{ fontSize: "13px", color: "#6a5a3a", marginTop: "8px" }}>
                Total BTL consumed: <span style={{ color: "#e8d5b0" }}>{consumptionLog.reduce((s,l)=>s+l.entries.reduce((s2,e)=>s2+(e.qtyInBtl||0),0),0).toFixed(3)}</span>
              </div>
              {consumptionLog.length > 0 && <div style={{ fontSize: "13px", color: "#6a5a3a", marginTop: "8px" }}>Last logged: <span style={{ color: "#c8960c" }}>{consumptionLog[0].date}</span></div>}
            </div>
          </div>
        )}
      </div>

      {/* ── CONSUMPTION MODAL ── */}
      {showConsumptionModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "20px" }}>
          <div style={{ background: "#0f0a00", border: "1px solid #c8960c", borderRadius: "12px", width: "100%", maxWidth: "600px", maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #2a1a00", display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "16px", fontWeight: "bold", color: "#f5e6c8" }}>Log Consumption</div>
                <div style={{ fontSize: "11px", color: "#6a5a3a", marginTop: "2px" }}>Enter what was consumed</div>
              </div>
              <button onClick={() => setShowConsumptionModal(false)} style={{ background: "none", border: "none", color: "#6a5a3a", fontSize: "20px", cursor: "pointer" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "11px", color: "#c8960c", letterSpacing: "1px", display: "block", marginBottom: "6px" }}>DATE</label>
                <input type="date" value={consumptionDate} onChange={e => setConsumptionDate(e.target.value)} style={S.dark} />
              </div>
              {consumptionEntries.map((entry, idx) => {
                const bottleMl  = inventory[entry.item]?.uom || 750;
                const rawQty    = parseFloat(entry.qty) || 0;
                const entryUnit = entry.unit || "BTL";
                const previewBtl = entryUnit==="ML" ? rawQty/bottleMl : rawQty;
                const previewMl  = entryUnit==="BTL" ? rawQty*bottleMl : rawQty;
                const afterBtl   = entry.item ? Math.max(0, getTotal(entry.item) - previewBtl) : null;
                return (
                  <div key={idx} style={{ marginBottom: "14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px", marginBottom: "6px" }}>
                      <select value={entry.item} onChange={e => { const u=[...consumptionEntries]; u[idx].item=e.target.value; setConsumptionEntries(u); }} style={S.dark}>
                        <option value="">Select item...</option>
                        {Object.entries(categories).map(([cat, items]) => items.length > 0 && (
                          <optgroup key={cat} label={cat}>
                            {items.map(item => <option key={item} value={item}>{item} ({getTotal(item).toFixed(3)} left)</option>)}
                          </optgroup>
                        ))}
                      </select>
                      <button onClick={() => { if(consumptionEntries.length>1) setConsumptionEntries(consumptionEntries.filter((_,i)=>i!==idx)); }}
                        style={{ background:"none", border:"1px solid #3a0000", borderRadius:"6px", color:"#cc3300", padding:"9px 12px", cursor:"pointer", fontSize:"13px" }}>×</button>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input type="number" step="any" min="0" placeholder={entryUnit==="ML"?"e.g. 60":"e.g. 0.5"} value={entry.qty}
                        onChange={e => { const u=[...consumptionEntries]; u[idx].qty=e.target.value; setConsumptionEntries(u); }}
                        style={{ ...S.dark, width:"110px", color: entryUnit==="ML"?"#ffcc66":"#e8d5b0" }} />
                      <div style={{ display:"flex", borderRadius:"6px", overflow:"hidden", border:"1px solid #3a2a0a" }}>
                        {["BTL","ML"].map(u => (
                          <button key={u} onClick={() => { const upd=[...consumptionEntries]; upd[idx].unit=u; setConsumptionEntries(upd); }} style={{
                            background: entryUnit===u ? (u==="ML"?"#2a1a00":"#1a1200") : "#0f0900",
                            border:"none", padding:"8px 14px", cursor:"pointer",
                            color: entryUnit===u ? (u==="ML"?"#ffcc66":"#c8960c") : "#4a3a1a",
                            fontSize:"12px", fontFamily:"inherit", fontWeight: entryUnit===u?"bold":"normal"
                          }}>{u}</button>
                        ))}
                      </div>
                      {rawQty > 0 && entry.item && (
                        <div style={{ fontSize:"11px", color:"#6a5a3a", flex:1, background:"#120e00", borderRadius:"6px", padding:"8px 10px", lineHeight:"1.6" }}>
                          {entryUnit==="ML"
                            ? <><span style={{color:"#ffcc66"}}>{rawQty}mL</span> = <span style={{color:"#c8960c"}}>{previewBtl.toFixed(3)} BTL</span></>
                            : <><span style={{color:"#c8960c"}}>{rawQty} BTL</span> = <span style={{color:"#ffcc66"}}>{previewMl.toFixed(0)}mL</span></>}
                          {afterBtl!==null && <> · after: <span style={{color:afterBtl<0.5?"#ff6644":"#a0d0a0"}}>{afterBtl.toFixed(3)}</span></>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <button onClick={() => setConsumptionEntries([...consumptionEntries,{item:"",qty:"",unit:"BTL"}])}
                style={{ background:"none", border:"1px dashed #3a2a0a", borderRadius:"6px", padding:"10px", color:"#6a5a3a", cursor:"pointer", width:"100%", fontSize:"12px", fontFamily:"inherit", marginTop:"4px" }}>
                + Add another item
              </button>
              <div style={{ display:"flex", gap:"10px", marginTop:"20px" }}>
                <button onClick={() => setShowConsumptionModal(false)} style={{ flex:1, background:"none", border:"1px solid #2a1a00", borderRadius:"6px", padding:"12px", color:"#6a5a3a", cursor:"pointer", fontFamily:"inherit", fontSize:"13px" }}>CANCEL</button>
                <button onClick={applyConsumption} style={{ flex:2, background:"#c8960c", border:"none", borderRadius:"6px", padding:"12px", color:"#0a0a0a", fontWeight:"bold", cursor:"pointer", fontFamily:"inherit", fontSize:"13px", letterSpacing:"1px" }}>APPLY CONSUMPTION</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RESTOCK MODAL ── */}
      {showRestockModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:"20px" }}>
          <div style={{ background:"#0a0f0a", border:"1px solid #44cc66", borderRadius:"12px", width:"100%", maxWidth:"600px", maxHeight:"85vh", overflow:"auto" }}>
            <div style={{ padding:"20px 24px", borderBottom:"1px solid #1a2a1a", display:"flex", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:"16px", fontWeight:"bold", color:"#f5e6c8" }}>📥 Add Stock / Restock</div>
                <div style={{ fontSize:"11px", color:"#6a5a3a", marginTop:"2px" }}>Add incoming bottles</div>
              </div>
              <button onClick={() => setShowRestockModal(false)} style={{ background:"none", border:"none", color:"#6a5a3a", fontSize:"20px", cursor:"pointer" }}>×</button>
            </div>
            <div style={{ padding:"20px 24px" }}>
              <div style={{ marginBottom:"16px" }}>
                <label style={{ fontSize:"11px", color:"#44cc66", letterSpacing:"1px", display:"block", marginBottom:"6px" }}>DATE</label>
                <input type="date" value={restockDate} onChange={e => setRestockDate(e.target.value)} style={S.green} />
              </div>
              {restockEntries.map((entry, idx) => (
                <div key={idx} style={{ background:"#0d150d", border:"1px solid #1a2a1a", borderRadius:"8px", padding:"14px", marginBottom:"12px" }}>
                  <div style={{ display:"flex", gap:"10px", marginBottom:"10px" }}>
                    {["EXISTING ITEM","+ NEW ITEM"].map((label,i) => (
                      <button key={i} onClick={() => { const u=[...restockEntries]; u[idx].isNew=i===1; setRestockEntries(u); }} style={{ flex:1, padding:"7px", borderRadius:"6px", cursor:"pointer", fontFamily:"inherit", fontSize:"11px", letterSpacing:"1px", background:entry.isNew===(i===1)?"#1a3a1a":"none", border:`1px solid ${entry.isNew===(i===1)?"#44cc66":"#2a2a1a"}`, color:entry.isNew===(i===1)?"#44cc66":"#4a4a3a" }}>{label}</button>
                    ))}
                  </div>
                  {!entry.isNew ? (
                    <select value={entry.item} onChange={e => { const u=[...restockEntries]; u[idx].item=e.target.value; setRestockEntries(u); }} style={{ ...S.green, width:"100%", marginBottom:"10px" }}>
                      <option value="">Select item...</option>
                      {Object.entries(categories).map(([cat, items]) => items.length > 0 && (
                        <optgroup key={cat} label={cat}>
                          {items.map(item => <option key={item} value={item}>{item} (current: {getTotal(item).toFixed(3)})</option>)}
                        </optgroup>
                      ))}
                    </select>
                  ) : (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto auto", gap:"8px", marginBottom:"10px" }}>
                      <input placeholder="Item name" value={entry.newName} onChange={e => { const u=[...restockEntries]; u[idx].newName=e.target.value; setRestockEntries(u); }} style={S.green} />
                      <input type="number" placeholder="ML" value={entry.newUom} onChange={e => { const u=[...restockEntries]; u[idx].newUom=e.target.value; setRestockEntries(u); }} style={{ ...S.green, width:"70px" }} />
                      <select value={entry.newUnit} onChange={e => { const u=[...restockEntries]; u[idx].newUnit=e.target.value; setRestockEntries(u); }} style={S.green}><option value="BTL">BTL</option><option value="PCS">PCS</option></select>
                      <select value={entry.category} onChange={e => { const u=[...restockEntries]; u[idx].category=e.target.value; setRestockEntries(u); }} style={{ ...S.green, fontSize:"11px" }}>
                        {Object.keys(categories).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  )}
                  <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                    <input type="number" step="0.01" min="0" placeholder="Qty to add" value={entry.qty}
                      onChange={e => { const u=[...restockEntries]; u[idx].qty=e.target.value; setRestockEntries(u); }}
                      style={{ ...S.green, width:"120px", color:"#44cc66" }} />
                    <button onClick={() => { if(restockEntries.length>1) setRestockEntries(restockEntries.filter((_,i)=>i!==idx)); }}
                      style={{ background:"none", border:"1px solid #3a0000", borderRadius:"6px", color:"#cc3300", padding:"9px 14px", cursor:"pointer", fontSize:"13px" }}>× Remove</button>
                  </div>
                </div>
              ))}
              <button onClick={() => setRestockEntries([...restockEntries,{item:"",isNew:false,newName:"",newUom:750,newUnit:"BTL",qty:"",category:"WHISKEY"}])}
                style={{ background:"none", border:"1px dashed #1a3a1a", borderRadius:"6px", padding:"10px", color:"#4a6a4a", cursor:"pointer", width:"100%", fontSize:"12px", fontFamily:"inherit", marginTop:"4px" }}>+ Add another item</button>
              <div style={{ display:"flex", gap:"10px", marginTop:"20px" }}>
                <button onClick={() => setShowRestockModal(false)} style={{ flex:1, background:"none", border:"1px solid #1a2a1a", borderRadius:"6px", padding:"12px", color:"#6a5a3a", cursor:"pointer", fontFamily:"inherit", fontSize:"13px" }}>CANCEL</button>
                <button onClick={applyRestock} style={{ flex:2, background:"#44cc66", border:"none", borderRadius:"6px", padding:"12px", color:"#0a0a0a", fontWeight:"bold", cursor:"pointer", fontFamily:"inherit", fontSize:"13px", letterSpacing:"1px" }}>CONFIRM RESTOCK</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REBASE MODAL ── */}
      {showRebaseModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:"20px" }}>
          <div style={{ background:"#0d0a1a", border:"2px solid #8844cc", borderRadius:"14px", width:"100%", maxWidth:"700px", maxHeight:"92vh", overflow:"auto" }}>
            <div style={{ padding:"20px 24px", borderBottom:"1px solid #2a1a4a", display:"flex", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:"18px", fontWeight:"bold", color:"#f5e6c8" }}>⚑ Re-Base Stock</div>
                <div style={{ fontSize:"11px", color:"#8844cc", marginTop:"4px", letterSpacing:"1px" }}>SET NEW OPENING STOCK · ALL LOGS WILL BE CLEARED</div>
              </div>
              <button onClick={() => { setShowRebaseModal(false); setRebaseUploadStatus(null); }} style={{ background:"none", border:"none", color:"#6a5a3a", fontSize:"22px", cursor:"pointer" }}>×</button>
            </div>
            <div style={{ display:"flex", borderBottom:"1px solid #2a1a4a", padding:"0 24px", background:"#0a0815" }}>
              {[["image","📷 Photo"],["csv","📄 CSV"],["manual","✏️ Manual"]].map(([key,label]) => (
                <button key={key} onClick={() => { setRebaseMode(key); setRebaseUploadStatus(null); setRebaseUploadMsg(""); }} style={{ background:"none", border:"none", borderBottom:rebaseMode===key?"2px solid #8844cc":"2px solid transparent", color:rebaseMode===key?"#bb88ff":"#4a3a6a", padding:"12px 20px", cursor:"pointer", fontSize:"12px", letterSpacing:"1px", fontFamily:"inherit" }}>{label}</button>
              ))}
            </div>
            <div style={{ padding:"24px" }}>
              <div style={{ marginBottom:"20px" }}>
                <label style={{ fontSize:"10px", color:"#bb88ff", letterSpacing:"1px", display:"block", marginBottom:"6px" }}>RE-BASE DATE</label>
                <input type="date" value={rebaseDate} onChange={e => setRebaseDate(e.target.value)} style={S.purple} />
              </div>
              {rebaseMode === "image" && (
                <div style={{ marginBottom:"16px" }}>
                  <label style={{ display:"flex", flexDirection:"column", alignItems:"center", border:"2px dashed #3a2a5a", borderRadius:"12px", padding:"36px 24px", textAlign:"center", background:"#0a0815", cursor:"pointer", marginBottom:"12px" }}>
                    <div style={{ fontSize:"36px", marginBottom:"10px" }}>📷</div>
                    <div style={{ color:"#bb88ff", fontSize:"14px", fontWeight:"bold", marginBottom:"6px" }}>Upload Stock Report Photo</div>
                    <div style={{ color:"#6a5a3a", fontSize:"12px", marginBottom:"16px" }}>AI reads item names & quantities automatically</div>
                    <div style={{ background:"#8844cc", borderRadius:"8px", padding:"10px 24px", color:"#fff", fontSize:"13px", fontWeight:"bold" }}>CHOOSE IMAGE</div>
                    <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display:"none" }} />
                  </label>
                  {rebaseUploadStatus==="parsing" && <div style={{ color:"#bb88ff", textAlign:"center", padding:"12px", fontSize:"13px" }}>🤖 AI is reading your stock sheet…</div>}
                  {rebaseUploadStatus && rebaseUploadStatus!=="parsing" && (
                    <div style={{ background:rebaseUploadStatus==="done"?"#0a1a0a":"#1a0a0a", border:`1px solid ${rebaseUploadStatus==="done"?"#44cc66":"#cc3300"}`, borderRadius:"8px", padding:"12px 16px", fontSize:"12px", color:rebaseUploadStatus==="done"?"#44cc66":"#ff6644" }}>{rebaseUploadMsg}</div>
                  )}
                </div>
              )}
              {rebaseMode === "csv" && (
                <div style={{ marginBottom:"16px" }}>
                  <div style={{ background:"#0a0815", border:"1px solid #2a1a4a", borderRadius:"10px", padding:"14px 18px", marginBottom:"12px" }}>
                    <div style={{ fontSize:"11px", color:"#bb88ff", marginBottom:"8px" }}>FORMAT: Item Name, Total Qty</div>
                    <div style={{ fontFamily:"monospace", fontSize:"12px", color:"#a0d0ff" }}>GLENLIVET 12, 5.5<br/><span style={{color:"#6a5a3a"}}>CORONA, 84</span></div>
                  </div>
                  <label style={{ display:"flex", flexDirection:"column", alignItems:"center", border:"2px dashed #3a2a5a", borderRadius:"12px", padding:"28px", textAlign:"center", background:"#0a0815", cursor:"pointer", marginBottom:"12px" }}>
                    <div style={{ fontSize:"32px", marginBottom:"8px" }}>📄</div>
                    <div style={{ color:"#bb88ff", fontSize:"13px", fontWeight:"bold" }}>CHOOSE CSV FILE</div>
                    <input type="file" accept=".csv,.txt" onChange={handleCSVUpload} style={{ display:"none" }} />
                  </label>
                  {rebaseUploadStatus && rebaseUploadStatus!=="parsing" && (
                    <div style={{ background:rebaseUploadStatus==="done"?"#0a1a0a":"#1a0a0a", border:`1px solid ${rebaseUploadStatus==="done"?"#44cc66":"#cc3300"}`, borderRadius:"8px", padding:"12px 16px", marginBottom:"12px", fontSize:"12px", color:rebaseUploadStatus==="done"?"#44cc66":"#ff6644" }}>{rebaseUploadMsg}</div>
                  )}
                  <button onClick={() => {
                    const rows = ["Item Name,Total Qty", ...Object.keys(inventory).map(i => `"${i}",${inventory[i].total||0}`)];
                    const blob = new Blob([rows.join("\n")],{type:"text/csv"});
                    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="sky_high_stock.csv"; a.click();
                  }} style={{ background:"none", border:"1px solid #3a2a5a", borderRadius:"6px", padding:"10px 18px", color:"#6a5a8a", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" }}>⬇ DOWNLOAD CURRENT STOCK AS CSV</button>
                </div>
              )}
              <div style={{ marginTop:"16px" }}>
                <div style={{ background:"#1a0a2a", border:"1px solid #6622aa", borderRadius:"8px", padding:"12px 16px", marginBottom:"16px", fontSize:"12px", color:"#cc99ff" }}>
                  ⚠ Confirming will overwrite all stock values and clear all logs.
                </div>
                <input value={rebaseSearch} onChange={e => setRebaseSearch(e.target.value)} placeholder="🔍 Filter items..." style={{ ...S.purple, width:"100%", marginBottom:"16px" }} />
                {Object.entries(categories).map(([cat, items]) => {
                  const filtered = items.filter(i => i.toLowerCase().includes(rebaseSearch.toLowerCase()));
                  if (!filtered.length) return null;
                  return (
                    <div key={cat} style={{ marginBottom:"20px" }}>
                      <div style={{ fontSize:"10px", letterSpacing:"2px", color:"#8844cc", borderBottom:"1px solid #2a1a4a", paddingBottom:"6px", marginBottom:"10px" }}>
                        {getCategoryEmoji(cat)} {cat}
                      </div>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"12px" }}>
                        <thead>
                          <tr>{["ITEM","CURRENT","NEW TOTAL"].map(h=><th key={h} style={{padding:"5px 8px",textAlign:h==="ITEM"?"left":"right",color:"#4a3a6a",fontSize:"10px",letterSpacing:"1px",fontWeight:"normal"}}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {filtered.map((item, i) => {
                            const cur    = inventory[item]?.total || 0;
                            const newVal = rebaseValues[item] ?? cur;
                            const changed = parseFloat(newVal) !== cur;
                            return (
                              <tr key={item} style={{ background:changed?"#130d22":(i%2===0?"#0d0a18":"#0a0815"), borderBottom:"1px solid #1a1230", borderLeft:changed?"2px solid #8844cc":"2px solid transparent" }}>
                                <td style={{ padding:"7px 8px", color:changed?"#cc99ff":"#807070" }}>{item}</td>
                                <td style={{ padding:"7px 8px", textAlign:"right", color:"#4a3a5a", fontSize:"11px" }}>{cur.toFixed(3)}</td>
                                <td style={{ padding:"5px 8px", textAlign:"right" }}>
                                  <input type="number" step="0.001" min="0" value={newVal}
                                    onChange={e => setRebaseValues(prev => ({...prev,[item]:e.target.value}))}
                                    style={{ background:"#1a1230", border:`1px solid ${changed?"#6622aa":"#2a1a4a"}`, borderRadius:"5px", padding:"5px 8px", color:"#f5e6c8", fontSize:"12px", fontFamily:"inherit", width:"100px", textAlign:"right" }} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
                <div style={{ fontSize:"12px", color:"#8844cc", marginBottom:"16px", textAlign:"right" }}>
                  {Object.entries(rebaseValues).filter(([item]) => parseFloat(rebaseValues[item]) !== (inventory[item]?.total||0)).length} item(s) modified
                </div>
                <div style={{ display:"flex", gap:"10px" }}>
                  <button onClick={() => { setShowRebaseModal(false); setRebaseUploadStatus(null); }} style={{ flex:1, background:"none", border:"1px solid #2a1a4a", borderRadius:"6px", padding:"13px", color:"#6a5a3a", cursor:"pointer", fontFamily:"inherit", fontSize:"13px" }}>CANCEL</button>
                  <button onClick={() => { const z={}; Object.keys(inventory).forEach(i=>{z[i]=0;}); setRebaseValues(z); }} style={{ flex:1, background:"none", border:"1px solid #4a1a1a", borderRadius:"6px", padding:"13px", color:"#cc6644", cursor:"pointer", fontFamily:"inherit", fontSize:"12px" }}>ZERO ALL</button>
                  <button onClick={applyRebase} style={{ flex:2, background:"#8844cc", border:"none", borderRadius:"6px", padding:"13px", color:"#fff", fontWeight:"bold", cursor:"pointer", fontFamily:"inherit", fontSize:"13px", letterSpacing:"1px" }}>⚑ CONFIRM RE-BASE</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position:"fixed", bottom:"24px", right:"24px", background:toast.type==="error"?"#3d0000":"#0a2a00", border:`1px solid ${toast.type==="error"?"#cc3300":"#44cc66"}`, borderRadius:"8px", padding:"14px 20px", color:toast.type==="error"?"#ff6644":"#44cc66", fontSize:"13px", zIndex:300, maxWidth:"320px", boxShadow:"0 4px 20px rgba(0,0,0,0.5)" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
