function formatDateTime(date, time) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(`${date}T${time}:00`));
}

function getFilteredRecords(records, filters) {
  return records
    .filter((record) => !filters.startDate || record.date >= filters.startDate)
    .filter((record) => !filters.endDate || record.date <= filters.endDate)
    .filter((record) => !filters.shift || record.shift === filters.shift)
    .sort((first, second) => `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`));
}

function cell(value) {
  const element = document.createElement("td");
  element.textContent = value || "—";
  return element;
}

async function render() {
  const params = new URLSearchParams(location.search);
  const patientId = params.get("patientId");
  const filters = {
    startDate: params.get("startDate") || "",
    endDate: params.get("endDate") || "",
    shift: params.get("shift") || "",
  };
  const root = document.querySelector("#sheet-root");
  const errorMessage = document.querySelector("#sheet-error");
  const tableBody = document.querySelector("#sheet-table-body");
  const table = document.querySelector("#sheet-table");
  const emptyMessage = document.querySelector("#sheet-empty");

  if (!patientId) {
    errorMessage.textContent = "Nenhum paciente informado.";
    errorMessage.hidden = false;
    return;
  }

  try {
    const [patient, records] = await Promise.all([
      PatientsRepository.getById(patientId),
      VitalsRepository.getAll(patientId),
    ]);

    const filteredRecords = getFilteredRecords(records, filters);
    const rangeLabel = [
      filters.startDate ? `de ${filters.startDate}` : "",
      filters.endDate ? `até ${filters.endDate}` : "",
      filters.shift ? `turno ${filters.shift}` : "",
    ].filter(Boolean).join(" · ");

    document.title = `Histórico de ${patient.fullName} | Lory's Care`;
    document.querySelector("#sheet-name").textContent = `Histórico de sinais vitais — ${patient.fullName}`;
    document.querySelector("#sheet-subtitle").textContent =
      `${filteredRecords.length} registro(s)${rangeLabel ? ` · ${rangeLabel}` : ""} · Emitido em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date())}`;

    if (!filteredRecords.length) {
      table.hidden = true;
      emptyMessage.hidden = false;
    } else {
      filteredRecords.forEach((record) => {
        const row = document.createElement("tr");
        row.append(
          cell(formatDateTime(record.date, record.time)),
          cell(record.shift),
          cell(record.bloodPressure),
          cell(record.heartRate ? `${record.heartRate} bpm` : "—"),
          cell(record.oxygenSaturation ? `${record.oxygenSaturation}%` : "—"),
          cell(record.temperature ? `${record.temperature} °C` : "—"),
          cell(record.bloodGlucose ? `${record.bloodGlucose} mg/dL` : "—"),
          cell(record.notes),
        );
        tableBody.append(row);
      });
    }

    root.hidden = false;
    setTimeout(() => window.print(), 200);
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  }
}

document.querySelector("#print-button").addEventListener("click", () => window.print());
render();
