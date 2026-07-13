let currentProfile = null; // { id, username, full_name, role }

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await loadProfileAndRoute();
  } else {
    showView("login");
  }

  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      currentProfile = null;
      showView("login");
    }
  });
}

async function loadProfileAndRoute() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    showView("login");
    return;
  }
  const { data: profile, error } = await sb
    .from("profiles")
    .select("id, username, full_name, role, active")
    .eq("id", user.id)
    .single();

  if (error || !profile || !profile.active) {
    toast("Account not found or deactivated. Contact admin.", "error");
    await sb.auth.signOut();
    showView("login");
    return;
  }

  currentProfile = profile;

  if (profile.role === "admin") {
    showView("admin");
    initAdminView();
  } else {
    showView("sales");
    initSalesView();
  }
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

  const email = usernameToEmail(username);
  const { error } = await sb.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.textContent = "Sign in";

  if (error) {
    errEl.textContent = "Invalid ID or password.";
    return;
  }
  await loadProfileAndRoute();
}

async function handleLogout() {
  await sb.auth.signOut();
  currentProfile = null;
  showView("login");
}

function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + name).classList.add("active");
}
