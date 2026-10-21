(() => {
  const mount = document.querySelector("#account-menu");
  if (!mount) return;

  function initials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    const first = parts[0][0] || "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "account-menu__button";
  button.setAttribute("aria-label", "Menu da conta");

  function renderAvatar() {
    const avatar = AuthContext.getAvatar();
    button.replaceChildren();
    if (avatar) {
      const img = document.createElement("img");
      img.src = avatar;
      img.alt = "";
      button.append(img);
    } else {
      button.textContent = initials(AuthContext.getUserName());
    }
  }

  const panel = document.createElement("div");
  panel.className = "account-menu__panel";
  panel.hidden = true;

  const name = document.createElement("p");
  name.className = "account-menu__name";

  const list = document.createElement("div");
  list.className = "account-menu__links";
  [
    ["Editar cadastro", "perfil.html?tab=cadastro"],
    ["Mudar senha", "perfil.html?tab=senha"],
    ["Informações adicionais", "perfil.html?tab=info"],
    ["Colocar foto", "perfil.html?tab=foto"],
  ].forEach(([label, href]) => {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    list.append(link);
  });

  const logoutButton = document.createElement("button");
  logoutButton.type = "button";
  logoutButton.className = "account-menu__logout";
  logoutButton.textContent = "Sair";
  logoutButton.addEventListener("click", () => AuthContext.logout());

  panel.append(name, list, logoutButton);
  mount.append(button, panel);

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    panel.hidden = !panel.hidden;
  });

  document.addEventListener("click", (event) => {
    if (!panel.hidden && !mount.contains(event.target)) panel.hidden = true;
  });

  name.textContent = AuthContext.getUserName();
  if (typeof CaregiverContext !== "undefined" && CaregiverContext.getCurrentName()) {
    const activeProfile = document.createElement("p");
    activeProfile.className = "account-menu__profile";
    activeProfile.textContent = `Cuidador ativo: ${CaregiverContext.getCurrentName()}`;
    name.after(activeProfile);
  }
  renderAvatar();
})();
