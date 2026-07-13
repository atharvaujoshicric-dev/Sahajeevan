let salesFlats = [];

async function initSalesView() {
  document.getElementById("sales-username").textContent = currentUser.full_name || currentUser.username;
  await loadSalesFlats();

  document.getElementById("sales-search").oninput = (e) => {
    renderSalesSeatMap(e.target.value.trim().toUpperCase());
  };

  window.removeEventListener("flats:refresh", salesRefreshHandler);
  window.addEventListener("flats:refresh", salesRefreshHandler);
}

async function salesRefreshHandler() {
  await loadSalesFlats();
  renderSalesSeatMap(document.getElementById("sales-search").value.trim().toUpperCase());
}

async function loadSalesFlats() {
  const { data, error } = await sb.rpc("get_flats", { p_token: currentToken });
  if (error) {
    toast(error.message, "error");
    return;
  }
  salesFlats = data || [];
  renderSalesSeatMap("");
}

function renderSalesSeatMap(filter) {
  const list = filter
    ? salesFlats.filter((f) => f.id.toUpperCase().includes(filter) || f.unit_no.toUpperCase().includes(filter))
    : salesFlats;

  const container = document.getElementById("sales-seatmap");
  renderSeatMap(container, list, (flat) => openFlatDetail(flat, false));

  document.getElementById("sales-count").textContent =
    `${list.length} flats shown · ${list.filter((f) => f.is_selectable && f.status === "Available").length} bookable now`;
}
