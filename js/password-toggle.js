(() => {
  document.querySelectorAll(".password-toggle").forEach((button) => {
    const input = button.closest(".password-field")?.querySelector("input");
    if (!input) return;

    function apply(visible) {
      input.type = visible ? "text" : "password";
      const label = visible ? "Ocultar senha" : "Mostrar senha";
      button.setAttribute("aria-label", label);
      button.title = label;
      button.innerHTML = icon(visible ? "eyeOff" : "eye");
    }

    button.addEventListener("click", () => apply(input.type === "password"));
  });
})();
