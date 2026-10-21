const form = document.querySelector("#signup-form");
const message = document.querySelector("#form-message");
const submitButton = document.querySelector("#submit-button");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const data = Object.fromEntries(new FormData(form).entries());
  if (data.password !== data.confirmPassword) {
    message.textContent = "As senhas não coincidem.";
    return;
  }

  submitButton.disabled = true;
  message.textContent = "Criando conta...";

  try {
    const result = await AuthRepository.signUp(data);
    localStorage.setItem("loreroutine:token", result.token);
    localStorage.setItem("loreroutine:userName", result.user.name);
    location.href = "index.html";
  } catch (error) {
    message.textContent = error.message;
    submitButton.disabled = false;
  }
});
