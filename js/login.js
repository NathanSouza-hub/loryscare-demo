const form = document.querySelector("#login-form");
const message = document.querySelector("#form-message");
const submitButton = document.querySelector("#submit-button");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  message.textContent = "Entrando...";

  try {
    const data = Object.fromEntries(new FormData(form).entries());
    const result = await AuthRepository.logIn(data);
    localStorage.setItem("loreroutine:token", result.token);
    localStorage.setItem("loreroutine:userName", result.user.name);
    location.href = "index.html";
  } catch (error) {
    message.textContent = error.message;
    submitButton.disabled = false;
  }
});
