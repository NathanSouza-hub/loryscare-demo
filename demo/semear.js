// Popula a demo com dados 100% fictícios, passando pela própria API
// (e, portanto, pelas mesmas validações do back-end real).
// `chamar(metodo, url, corpo, cabecalhos)` devolve { status, body }.
async function semearLorys(chamar) {
  const pad = (n) => String(n).padStart(2, "0");
  const dataISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const diasDepois = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return dataISO(d);
  };
  const turnoDe = (hora) => (hora < 6 ? "Madrugada" : hora < 12 ? "Manhã" : hora < 18 ? "Tarde" : "Noite");

  async function api(metodo, url, corpo, cabecalhos) {
    const r = await chamar(metodo, url, corpo, cabecalhos);
    if (r.status >= 400) throw new Error(`${metodo} ${url} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body?.data ?? r.body;
  }

  const conta = await api("POST", "/api/auth/signup", { name: "Família Duarte", email: "demo@loryscare.dev", password: "demo1234" });
  const auth = { Authorization: `Bearer ${conta.token}` };

  await api("PUT", "/api/auth/profile", { name: "Família Duarte", email: "demo@loryscare.dev", phone: "(11) 90000-0000" }, auth);

  const paciente = await api("POST", "/api/patients", {
    fullName: "Helena Duarte",
    birthDate: "1941-03-12",
    sex: "Feminino",
    bloodType: "O+",
    phone: "(11) 3000-0000",
    address: "Rua das Acácias, 120 · São Paulo, SP",
    healthInsurance: "Plano Exemplo Saúde",
    emergencyContactName: "Marcos Duarte",
    emergencyContactRelationship: "Filho",
    emergencyContactPhone: "(11) 98888-0000",
    responsibleName: "Marcos Duarte",
    responsiblePhone: "(11) 98888-0000",
    allergies: "Dipirona",
    chronicConditions: "Hipertensão, diabetes tipo 2",
    mobility: "Com auxílio",
    dietaryRestrictions: "Pouco sal e pouco açúcar",
    doctorName: "Dra. Paula Ribeiro",
    doctorSpecialty: "Geriatria",
    doctorPhone: "(11) 3111-0000",
    carePlanNotes: "Estimular hidratação e caminhada leve diária.",
  }, auth);
  const patientId = paciente.id;

  const cores = ["#2563eb", "#db2777", "#059669"];
  const perfis = [];
  for (const [i, nome] of ["Ana Souza", "Bruno Lima", "Carla Mendes"].entries()) {
    perfis.push(await api("POST", "/api/caregiver-profiles", { name: nome, avatarColor: cores[i], pin: "1234" }, auth));
  }
  const comPerfil = (perfil) => ({ ...auth, "X-Profile-Id": String(perfil.id) });

  const inicio = diasDepois(-20);
  const medicamentos = [
    { name: "Losartana", dosage: "50 mg", instructions: "Após o café e após o jantar", times: ["08:00", "20:00"], isFixed: true },
    { name: "Metformina", dosage: "850 mg", instructions: "Junto com as refeições", times: ["07:30", "19:30"], isFixed: true },
    { name: "Sinvastatina", dosage: "20 mg", instructions: "À noite", times: ["21:00"], isFixed: true },
    { name: "Vitamina D", dosage: "1 cápsula", instructions: "No almoço", times: ["12:00"] },
  ];
  for (const m of medicamentos) await api("POST", "/api/medications", { ...m, startDate: inicio, patientId }, auth);

  const rotinas = [
    { title: "Banho assistido", category: "Higiene", time: "09:00", isFixed: true },
    { title: "Caminhada leve", category: "Atividade física", time: "10:30" },
    { title: "Lanche da tarde", category: "Alimentação", time: "15:30", isFixed: true },
    { title: "Exercícios de fisioterapia", category: "Fisioterapia", time: "16:30" },
    { title: "Leitura em voz alta", category: "Lazer", time: "18:00" },
  ];
  for (const r of rotinas) await api("POST", "/api/routines", { ...r, startDate: inicio, patientId }, auth);

  const eventos = [
    { title: "Consulta com a geriatra", category: "Consulta", eventDate: diasDepois(2), eventTime: "14:00", important: true, notes: "Levar os últimos exames." },
    { title: "Coleta de sangue em jejum", category: "Exame", eventDate: diasDepois(5), eventTime: "07:30", notes: "Jejum de 8 horas." },
    { title: "Visita da neta", category: "Visita", eventDate: diasDepois(1), eventTime: "16:00" },
    { title: "Retorno com o cardiologista", category: "Consulta", eventDate: diasDepois(12), eventTime: "10:00" },
  ];
  for (const e of eventos) await api("POST", "/api/events", { ...e, patientId }, auth);

  // Sinais vitais dos últimos 7 dias, de manhã e à noite
  const agora = new Date();
  for (let d = 6; d >= 0; d--) {
    for (const [hora, minuto] of [[8, 15], [20, 10]]) {
      const quando = new Date();
      quando.setDate(quando.getDate() - d);
      quando.setHours(hora, minuto, 0, 0);
      if (quando > agora) continue;
      const k = d * 2 + (hora > 12 ? 1 : 0);
      await api("POST", "/api/vitals", {
        patientId,
        date: dataISO(quando),
        time: `${pad(hora)}:${pad(minuto)}`,
        shift: turnoDe(hora),
        bloodPressure: `${124 + ((k * 7) % 14)}/${78 + ((k * 3) % 8)}`,
        heartRate: 68 + ((k * 5) % 14),
        oxygenSaturation: 95 + (k % 4),
        temperature: 36.2 + ((k * 3) % 6) / 10,
        bloodGlucose: 104 + ((k * 11) % 40),
      }, comPerfil(perfis[k % perfis.length]));
    }
  }

  const anotacoes = [
    [3, "09:40", "Paciente acordou bem disposta, aceitou todo o café da manhã. Caminhou com andador até a varanda.", false],
    [2, "15:10", "Relatou leve dor no joelho direito após a fisioterapia. Aplicada compressa morna, melhora em 30 minutos.", true],
    [1, "21:30", "Noite tranquila. Tomou as medicações no horário e dormiu às 22h.", false],
    [0, "08:50", "Glicemia em jejum dentro do esperado. Hidratação reforçada pela manhã.", false],
  ];
  for (const [dias, hora, texto, destaque] of anotacoes) {
    const data = diasDepois(-dias);
    if (dias === 0 && hora > `${pad(agora.getHours())}:${pad(agora.getMinutes())}`) continue;
    await api("POST", "/api/nursing-notes", {
      patientId, noteDate: data, noteTime: hora, shift: turnoDe(Number(hora.slice(0, 2))), noteText: texto, isHighlighted: destaque,
    }, auth);
  }

  // Escala do mês atual: plantões de 12h revezando entre os três cuidadores
  await api("POST", "/api/schedule-months", {
    year: agora.getFullYear(),
    month: agora.getMonth() + 1,
    durationHours: 12,
    firstStartTime: "07:00",
    secondStartTime: "19:00",
    caregiverIds: perfis.map((p) => p.id),
    shiftRate: 180,
  }, auth);

  // Doses e rotinas de hoje que já passaram do horário aparecem como feitas
  const hoje = dataISO(agora);
  const horaAgora = `${pad(agora.getHours())}:${pad(agora.getMinutes())}`;
  const doses = await api("GET", `/api/medications/daily?date=${hoje}&patientId=${patientId}`, undefined, auth);
  for (const dose of doses.filter((x) => x.time < horaAgora)) {
    await api("PATCH", `/api/medications/${dose.medicationId}/schedules/${dose.scheduleId}/administration`, { date: hoje, status: "taken" }, comPerfil(perfis[0]));
  }
  const tarefas = await api("GET", `/api/routines/daily?date=${hoje}&patientId=${patientId}`, undefined, auth);
  for (const tarefa of tarefas.filter((x) => x.time < horaAgora)) {
    await api("PATCH", `/api/routines/${tarefa.routineId ?? tarefa.id}/completion`, { date: hoje, status: "completed" }, comPerfil(perfis[0]));
  }

  return { patientId, perfis, auth };
}

if (typeof module !== "undefined") module.exports = semearLorys;
