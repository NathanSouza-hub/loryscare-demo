const SEX_LABELS = { Feminino: "Feminino", Masculino: "Masculino", Outro: "Outro" };

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
}

function calculateAge(birthDate) {
  const birth = new Date(`${birthDate}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hasNotHadBirthdayThisYear =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (hasNotHadBirthdayThisYear) age -= 1;
  return age;
}

function field(label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "sheet-field";
  const term = document.createElement("dt");
  term.textContent = label;
  const definition = document.createElement("dd");
  definition.textContent = value && String(value).trim() ? value : "—";
  wrapper.append(term, definition);
  return wrapper;
}

function section(title, fields) {
  const sectionElement = document.createElement("section");
  sectionElement.className = "sheet-section";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const grid = document.createElement("dl");
  grid.className = "sheet-grid";
  grid.append(...fields);
  sectionElement.append(heading, grid);
  return sectionElement;
}

function longField(label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "sheet-field sheet-field--full";
  const term = document.createElement("dt");
  term.textContent = label;
  const definition = document.createElement("dd");
  definition.textContent = value && String(value).trim() ? value : "—";
  wrapper.append(term, definition);
  return wrapper;
}

async function render() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const root = document.querySelector("#sheet-root");
  const errorMessage = document.querySelector("#sheet-error");

  if (!id) {
    errorMessage.textContent = "Nenhum paciente informado.";
    errorMessage.hidden = false;
    return;
  }

  try {
    const patient = await PatientsRepository.getById(id);

    document.title = `Ficha de ${patient.fullName} | Lory's Care`;
    document.querySelector("#sheet-name").textContent = patient.fullName;
    document.querySelector("#sheet-subtitle").textContent =
      `Nascimento: ${formatDate(patient.birthDate)} (${calculateAge(patient.birthDate)} anos) · Emitida em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date())}`;

    root.append(
      section("Dados pessoais", [
        field("Sexo", SEX_LABELS[patient.sex] || "—"),
        field("CPF", patient.cpf),
        field("Cartão SUS", patient.healthCardNumber),
        field("Convênio", patient.healthInsurance),
        field("Telefone", patient.phone),
        longField("Endereço", patient.address),
      ]),
      section("Contato de emergência", [
        field("Nome", patient.emergencyContactName),
        field("Parentesco", patient.emergencyContactRelationship),
        field("Telefone", patient.emergencyContactPhone),
      ]),
      section("Responsável", [
        field("Nome", patient.responsibleName),
        field("Telefone", patient.responsiblePhone),
      ]),
      section("Dados médicos", [
        field("Tipo sanguíneo", patient.bloodType),
        field("Mobilidade", patient.mobility),
        longField("Alergias", patient.allergies),
        longField("Condições crônicas / diagnósticos", patient.chronicConditions),
        longField("Cirurgias anteriores", patient.surgicalHistory),
        longField("Restrições alimentares", patient.dietaryRestrictions),
        longField("Medicações em uso (resumo)", patient.currentMedicationsNotes),
      ]),
      section("Médico responsável", [
        field("Nome", patient.doctorName),
        field("Especialidade", patient.doctorSpecialty),
        field("Telefone", patient.doctorPhone),
      ]),
      section("Plano de cuidados", [longField("Observações gerais", patient.carePlanNotes)]),
    );

    root.hidden = false;
    setTimeout(() => window.print(), 200);
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }
}

document.querySelector("#print-button").addEventListener("click", () => window.print());
render();
