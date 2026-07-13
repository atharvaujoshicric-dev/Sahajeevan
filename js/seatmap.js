// Renders a BookMyShow-style seat map of flats into `container`.
// `flats` is an array of flat rows from Supabase.
// `onSelect(flat)` fires when a clickable flat is clicked.
function renderSeatMap(container, flats, onSelect) {
  container.innerHTML = "";

  const towers = {};
  flats.forEach((f) => {
    towers[f.tower] = towers[f.tower] || {};
    towers[f.tower][f.floor_number] = towers[f.tower][f.floor_number] || [];
    towers[f.tower][f.floor_number].push(f);
  });

  Object.keys(towers).sort().forEach((tower) => {
    const towerEl = document.createElement("div");
    towerEl.className = "tower-block";
    towerEl.innerHTML = `<h3>Tower ${escapeHtml(tower)}</h3>`;

    const floors = towers[tower];
    Object.keys(floors)
      .map(Number)
      .sort((a, b) => b - a) // top floor first, like a building elevation
      .forEach((floorNum) => {
        const row = document.createElement("div");
        row.className = "floor-row";

        const label = document.createElement("div");
        label.className = "floor-label";
        label.textContent = "Fl " + floorNum;
        row.appendChild(label);

        const seats = document.createElement("div");
        seats.className = "seats";

        floors[floorNum]
          .sort((a, b) => a.series - b.series)
          .forEach((flat) => {
            const seat = document.createElement("button");
            seat.type = "button";
            seat.className = "seat " + seatClass(flat);
            seat.title = seatTitle(flat);
            seat.textContent = flat.unit_no;
            if (seatIsClickable(flat)) {
              seat.addEventListener("click", () => onSelect(flat));
            } else {
              seat.disabled = true;
            }
            seats.appendChild(seat);
          });

        row.appendChild(seats);
        towerEl.appendChild(row);
      });

    container.appendChild(towerEl);
  });

  const legend = document.createElement("div");
  legend.className = "legend";
  legend.innerHTML = `
    <span><i class="dot available"></i> Available (bookable)</span>
    <span><i class="dot other-owner"></i> Available (not yet bookable)</span>
    <span><i class="dot booked"></i> Booked</span>
  `;
  container.appendChild(legend);
}

function seatClass(flat) {
  if (flat.status === "Booked") return "booked";
  if (flat.status === "Blocked") return "blocked";
  if (flat.is_selectable) return "available";
  return "other-owner";
}

function seatIsClickable(flat) {
  // Booked/blocked flats can still be opened to view details, just not booked again.
  return true;
}

function seatTitle(flat) {
  return `${flat.id} — ${flat.configuration_type} — ${flat.status}` +
    (flat.is_selectable ? "" : ` (${flat.ownership_detail || "not WPC LLP"})`);
}
