const form = document.querySelector("#patient-form");
const message = document.querySelector("#form-message");
const submitButton = document.querySelector("#submit-button");
const cancelButton = document.querySelector("#cancel-button");
const activeField = document.querySelector("#active-field");
const patientsBody = document.querySelector("#patients-body");
const patientsWrapper = document.querySelector("#patients-wrapper");
const emptyPatients = document.querySelector("#empty-patients");
const patientsCount = document.querySelector("#patients-count");
const newPatientButton = document.querySelector("#new-patient-button");
const tabButtons = document.querySelectorAll("[data-tab]");
const tabFicha = document.querySelector("#tab-ficha");
const tabCadastrados = document.querySelector("#tab-cadastrados");
let patients = [];
let editingId = null;

function showTab(name) {
  tabFicha.hidden = name !== "ficha";
  tabCadastrados.hidden = name !== "cadastrados";
  tabButtons.forEach((btn) => btn.classList.toggle("tab-button--active", btn.dataset.tab === name));
  if (name === "ficha") tabFicha.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formData() {
  const data = Object.fromEntries(new FormData(form).entries());
  return { ...data, isActive: form.elements.isActive.checked };
}

function cell(value) { const element = document.createElement("td"); element.textContent = value || "—"; return element; }
function button(label, action, id, className = "table-action", title = "") {
  const element = document.createElement("button"); element.type = "button"; element.innerHTML = label;
  element.className = className; element.dataset.action = action; element.dataset.id = id;
  if (title) { element.title = title; element.setAttribute("aria-label", title); }
  return element;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
}

function renderPatients() {
  patientsBody.replaceChildren();
  patientsCount.textContent = `${patients.length} ${patients.length === 1 ? "paciente" : "pacientes"}`;
  emptyPatients.hidden = patients.length > 0; patientsWrapper.hidden = patients.length === 0;
  patients.forEach((item) => {
    const row = document.createElement("tr");
    const actions = document.createElement("td");
    actions.append(
      button(icon("pencil"), "edit", item.id, "table-action table-action--icon", "Editar"),
      button(icon("fileText"), "print", item.id, "table-action table-action--icon", "Gerar PDF"),
      button(icon("trash"), "delete", item.id, "table-action table-action--icon table-action--danger", "Excluir"),
    );
    row.append(cell(item.fullName), cell(formatDate(item.birthDate)), cell(item.isActive ? "Ativo" : "Inativo"), actions);
    patientsBody.append(row);
  });
}

async function loadPatients() { patients = await PatientsRepository.getAll(); renderPatients(); }

function finishEditing(text = "") {
  editingId = null; form.reset(); form.elements.isActive.checked = true;
  activeField.hidden = true; cancelButton.hidden = true; submitButton.textContent = "Cadastrar paciente"; message.textContent = text;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault(); submitButton.disabled = true; message.textContent = "Salvando...";
  try {
    const wasEditing = Boolean(editingId);
    if (wasEditing) {
      await PatientsRepository.update(editingId, formData());
      finishEditing("Paciente atualizado.");
      await loadPatients();
      showTab("cadastrados");
    } else {
      const created = await PatientsRepository.create(formData());
      PatientContext.setCurrentId(String(created.id));
      location.reload();
    }
  } catch (error) { message.textContent = error.message; } finally { submitButton.disabled = false; }
});

patientsBody.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]"); if (!target) return;
  const item = patients.find((entry) => String(entry.id) === target.dataset.id);
  if (target.dataset.action === "edit" && item) {
    editingId = String(item.id);
    Object.entries(item).forEach(([fieldName, value]) => {
      const field = form.elements.namedItem(fieldName);
      if (field && fieldName !== "isActive") field.value = value ?? "";
    });
    form.elements.isActive.checked = item.isActive;
    activeField.hidden = false; cancelButton.hidden = false; submitButton.textContent = "Salvar alterações";
    showTab("ficha");
  }
  if (target.dataset.action === "print") {
    window.open(`ficha-impressao.html?id=${target.dataset.id}`, "_blank");
  }
  if (target.dataset.action === "delete" && window.confirm("Excluir este paciente e todos os registros vinculados a ele?")) {
    try {
      await PatientsRepository.remove(target.dataset.id);
      if (PatientContext.getCurrentId() === target.dataset.id) PatientContext.setCurrentId(null);
      location.reload();
    } catch (error) { message.textContent = error.message; }
  }
});

cancelButton.addEventListener("click", () => { finishEditing(); showTab("cadastrados"); });
newPatientButton.addEventListener("click", () => { finishEditing(); showTab("ficha"); });
tabButtons.forEach((btn) => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
document.querySelector("#current-date").textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(new Date());
loadPatients().catch((error) => { message.textContent = `${error.message}. Verifique se a API está ativa.`; });
