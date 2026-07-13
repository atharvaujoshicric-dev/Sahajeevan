// Custom lightweight auth (no Supabase Auth): a session token is issued by the
// login()/bootstrap_admin() database functions and stored in localStorage.
// Every RPC call that needs to know "who is this" is passed this token.

let currentUser = null;   // { id, username, full_name, role }
let currentToken = null;  // uuid string

const TOKEN_KEY = "sahjeevan_token";

async function initAuth() {
  currentToken = localStorage.getItem(TOKEN_KEY);

  if (currentToken) {
    const { data, error } = await sb.rpc("whoami", { p_token: currentToken });
    if (!error && data && data.length) {
      currentUser = data[0];
      routeToDashboard();
      return;
    }
    // stale/expired token
    localStorage.removeItem(TOKEN_KEY);
    currentToken = null;
  }

  await showLoginOrBootstrap();
}

async function showLoginOrBootstrap() {
  const { data: exists, error } = await sb.rpc("admin_exists");
  if (error) {
    toast("Could not reach the database: " + error.message, "error");
    // Safe default: bootstrap_admin refuses on its own if an admin already
    // exists, so this never lets someone create a second admin by accident.
    showView("bootstrap");
    return;
  }
  showView(exists ? "login" : "bootstrap");
}

function routeToDashboard() {
  if (currentUser.role === "admin") {
    showView("admin");
    initAdminView();
  } else {
    showView("sales");
    initSalesView();
  }
}

async function handleBootstrap(e) {
  e.preventDefault();
  const username = document.getElementById("bootstrap-username").value.trim();
  const password = document.getElementById("bootstrap-password").value;
  const fullName = document.getElementById("bootstrap-fullname").value.trim();
  const errEl = document.getElementById("bootstrap-error");
  errEl.textContent = "";

  const { data, error } = await sb.rpc("bootstrap_admin", {
    p_username: username,
    p_password: password,
    p_full_name: fullName,
  });

  if (error) {
    errEl.textContent = error.message;
    return;
  }

  const row = data[0];
  currentToken = row.token;
  currentUser = { id: row.id, username: row.username, full_name: row.full_name, role: row.role };
  localStorage.setItem(TOKEN_KEY, currentToken);
  toast("Admin account created — welcome!");
  routeToDashboard();
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const btn = document.getElementById("login-btn");
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Signing in...";

  const { data, error } = await sb.rpc("login", { p_username: username, p_password: password });

  btn.disabled = false;
  btn.textContent = "Sign in";

  if (error) {
    errEl.textContent = error.message || "Invalid ID or password.";
    return;
  }

  const row = data[0];
  currentToken = row.token;
  currentUser = { id: row.id, username: row.username, full_name: row.full_name, role: row.role };
  localStorage.setItem(TOKEN_KEY, currentToken);
  routeToDashboard();
}

async function handleLogout() {
  if (currentToken) {
    await sb.rpc("logout", { p_token: currentToken });
  }
  localStorage.removeItem(TOKEN_KEY);
  currentToken = null;
  currentUser = null;
  await showLoginOrBootstrap();
}

function showView(name) {
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.remove("active");
    v.style.display = "none"; // belt-and-braces: don't rely on CSS alone
  });
  const target = document.getElementById("view-" + name);
  target.classList.add("active");
  target.style.display = ""; // let the stylesheet decide (some views need flex, not block)
}
