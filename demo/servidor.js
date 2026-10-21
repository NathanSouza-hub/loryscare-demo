var process = globalThis.process || { env: {} }; var __dirname = '/';
var LorysServidor = (() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // shims/pg.js
  var require_pg = __commonJS({
    "shims/pg.js"(exports, module) {
      var banco = null;
      var fila = Promise.resolve();
      function definirBanco(db) {
        banco = db;
      }
      function adquirir() {
        let liberar;
        const anterior = fila;
        fila = new Promise((resolve) => liberar = resolve);
        return anterior.then(() => liberar);
      }
      async function consultar(texto, params) {
        const resultado = await banco.query(texto, params ?? []);
        const rowCount = resultado.rows.length > 0 ? resultado.rows.length : resultado.affectedRows ?? 0;
        return { rows: resultado.rows, rowCount, fields: resultado.fields };
      }
      var Pool = class {
        async query(texto, params) {
          const liberar = await adquirir();
          try {
            return await consultar(texto, params);
          } finally {
            liberar();
          }
        }
        async connect() {
          const liberar = await adquirir();
          let liberado = false;
          return {
            query: consultar,
            release() {
              if (!liberado) {
                liberado = true;
                liberar();
              }
            }
          };
        }
        on() {
        }
        end() {
        }
      };
      module.exports = { Pool, definirBanco };
    }
  });

  // shims/path.js
  var require_path = __commonJS({
    "shims/path.js"(exports, module) {
      module.exports = { join: (...partes) => partes.join("/"), resolve: (...partes) => partes.join("/") };
    }
  });

  // shims/passa.js
  var require_passa = __commonJS({
    "shims/passa.js"(exports, module) {
      module.exports = () => (req, res, next) => next();
    }
  });

  // shims/express.js
  var require_express = __commonJS({
    "shims/express.js"(exports, module) {
      var METODOS = ["get", "post", "put", "patch", "delete"];
      function compilar(caminho) {
        const nomes = [];
        const fonte = caminho.replace(/\/+$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:(\w+)/g, (_, nome) => {
          nomes.push(nome);
          return "([^/]+)";
        });
        return { regex: new RegExp(`^${fonte}/?$`), nomes };
      }
      function aguardar(resultado, continuar) {
        if (resultado && typeof resultado.then === "function") resultado.then(void 0, continuar);
      }
      function criarRoteador() {
        const camadas = [];
        function roteador(req, res, next) {
          let i = 0;
          const baseOriginal = req.baseUrl || "";
          const caminhoOriginal = req.path;
          function proximo(erro) {
            const camada = camadas[i++];
            if (!camada) {
              req.baseUrl = baseOriginal;
              req.path = caminhoOriginal;
              return next(erro);
            }
            if (camada.tipo === "use") {
              const prefixo = camada.prefixo;
              const casa = prefixo === "/" || caminhoOriginal === prefixo || caminhoOriginal.startsWith(prefixo + "/");
              if (!casa) return proximo(erro);
              req.baseUrl = prefixo === "/" ? baseOriginal : baseOriginal + prefixo;
              req.path = prefixo === "/" ? caminhoOriginal : caminhoOriginal.slice(prefixo.length) || "/";
              return executar(camada.handler, erro, () => {
                req.baseUrl = baseOriginal;
                req.path = caminhoOriginal;
              });
            }
            if (camada.metodo !== req.method) return proximo(erro);
            const encontrado = camada.padrao.regex.exec(caminhoOriginal);
            if (!encontrado) return proximo(erro);
            req.params = {};
            camada.padrao.nomes.forEach((nome, k) => {
              req.params[nome] = decodeURIComponent(encontrado[k + 1]);
            });
            return executar(camada.handler, erro);
          }
          function executar(handler, erro, restaurar) {
            const continuar = (e) => {
              if (restaurar) restaurar();
              proximo(e);
            };
            try {
              if (erro) {
                if (handler.length === 4) return aguardar(handler(erro, req, res, continuar), continuar);
                return continuar(erro);
              }
              if (handler.length === 4) return continuar();
              return aguardar(handler(req, res, continuar), continuar);
            } catch (e) {
              continuar(e);
            }
          }
          proximo();
        }
        roteador.use = (...args) => {
          const prefixo = typeof args[0] === "string" ? args.shift().replace(/\/+$/, "") || "/" : "/";
          for (const handler of args) camadas.push({ tipo: "use", prefixo, handler });
          return roteador;
        };
        for (const metodo of METODOS) {
          roteador[metodo] = (caminho, ...handlers) => {
            const padrao = compilar(caminho);
            for (const handler of handlers) camadas.push({ tipo: "rota", metodo: metodo.toUpperCase(), padrao, handler });
            return roteador;
          };
        }
        return roteador;
      }
      function express() {
        const app = criarRoteador();
        app.atender = ({ method, url, headers = {}, body }) => new Promise((resolve) => {
          const endereco = new URL(url, "http://demo.local");
          const cabecalhos = {};
          for (const [k, v] of Object.entries(headers)) cabecalhos[k.toLowerCase()] = v;
          const req = {
            method: method.toUpperCase(),
            url: endereco.pathname + endereco.search,
            path: endereco.pathname,
            baseUrl: "",
            query: Object.fromEntries(endereco.searchParams),
            headers: cabecalhos,
            body,
            params: {},
            get: (nome) => cabecalhos[nome.toLowerCase()],
            on() {
            }
          };
          const res = {
            statusCode: 200,
            status(codigo) {
              this.statusCode = codigo;
              return this;
            },
            json(dados) {
              resolve({ status: this.statusCode, body: dados });
              return this;
            },
            send(dados) {
              resolve({ status: this.statusCode, body: dados ?? null });
              return this;
            },
            end() {
              resolve({ status: this.statusCode, body: null });
              return this;
            },
            sendStatus(codigo) {
              return this.status(codigo).end();
            },
            set() {
              return this;
            },
            setHeader() {
            },
            flushHeaders() {
            },
            write() {
            }
          };
          app(req, res, (erro) => {
            if (erro) {
              console.error("Erro na API da demo:", erro);
              resolve({ status: 500, body: { error: "Erro interno do servidor" } });
            } else {
              resolve({ status: 404, body: { error: "Rota n\xE3o encontrada" } });
            }
          });
        });
        return app;
      }
      express.Router = criarRoteador;
      express.json = () => (req, res, next) => next();
      express.static = () => (req, res, next) => next();
      module.exports = express;
      module.exports.Router = criarRoteador;
    }
  });

  // ../Loryscare/backend/src/config/database.js
  var require_database = __commonJS({
    "../Loryscare/backend/src/config/database.js"(exports, module) {
      var { Pool } = require_pg();
      var pool = void 0 ? new Pool({
        connectionString: void 0,
        ssl: { rejectUnauthorized: false }
      }) : new Pool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
      });
      pool.on("error", (error) => {
        console.error("Erro inesperado na conex\xE3o com o PostgreSQL:", error.message);
      });
      module.exports = pool;
    }
  });

  // ../Loryscare/backend/src/errors/validation-error.js
  var require_validation_error = __commonJS({
    "../Loryscare/backend/src/errors/validation-error.js"(exports, module) {
      var ValidationError = class extends Error {
        constructor(details) {
          super("Dados de sinais vitais inv\xE1lidos");
          this.name = "ValidationError";
          this.details = details;
        }
      };
      module.exports = ValidationError;
    }
  });

  // ../Loryscare/backend/src/errors/not-found-error.js
  var require_not_found_error = __commonJS({
    "../Loryscare/backend/src/errors/not-found-error.js"(exports, module) {
      var NotFoundError = class extends Error {
        constructor() {
          super("Registro de sinais vitais n\xE3o encontrado");
          this.name = "NotFoundError";
        }
      };
      module.exports = NotFoundError;
    }
  });

  // ../Loryscare/backend/src/errors/vital-sign-ownership-error.js
  var require_vital_sign_ownership_error = __commonJS({
    "../Loryscare/backend/src/errors/vital-sign-ownership-error.js"(exports, module) {
      var VitalSignOwnershipError = class extends Error {
        constructor(message = "S\xF3 quem registrou este sinal vital pode edit\xE1-lo") {
          super(message);
          this.name = "VitalSignOwnershipError";
        }
      };
      module.exports = VitalSignOwnershipError;
    }
  });

  // ../Loryscare/backend/src/controllers/vitals-controller.js
  var require_vitals_controller = __commonJS({
    "../Loryscare/backend/src/controllers/vitals-controller.js"(exports, module) {
      var ValidationError = require_validation_error();
      var NotFoundError = require_not_found_error();
      var VitalSignOwnershipError = require_vital_sign_ownership_error();
      function handleKnownError(error, response) {
        if (error instanceof ValidationError) {
          response.status(400).json({ error: error.message, details: error.details });
          return true;
        }
        if (error instanceof NotFoundError) {
          response.status(404).json({ error: error.message });
          return true;
        }
        if (error instanceof VitalSignOwnershipError) {
          response.status(403).json({ error: error.message });
          return true;
        }
        return false;
      }
      function createVitalsController(vitalsService, changeBus) {
        async function create(request, response, next) {
          try {
            const vitalSigns = await vitalsService.create(request.body, request.userId, request.profileId);
            changeBus.publish(request.userId, { resource: "vitals", action: "created" });
            response.status(201).json({ data: vitalSigns });
          } catch (error) {
            if (!handleKnownError(error, response)) next(error);
          }
        }
        async function getAll(request, response, next) {
          try {
            const vitalSigns = await vitalsService.getAll(request.query.patientId, request.userId);
            response.status(200).json({ data: vitalSigns });
          } catch (error) {
            if (!handleKnownError(error, response)) next(error);
          }
        }
        async function update(request, response, next) {
          try {
            const vitalSigns = await vitalsService.update(request.params.id, request.body, request.userId, request.profileId);
            changeBus.publish(request.userId, { resource: "vitals", action: "updated" });
            response.status(200).json({ data: vitalSigns });
          } catch (error) {
            if (!handleKnownError(error, response)) next(error);
          }
        }
        async function remove(request, response, next) {
          try {
            await vitalsService.remove(request.params.id, request.userId);
            changeBus.publish(request.userId, { resource: "vitals", action: "removed" });
            response.status(204).send();
          } catch (error) {
            if (!handleKnownError(error, response)) next(error);
          }
        }
        return Object.freeze({ create, getAll, remove, update });
      }
      module.exports = createVitalsController;
    }
  });

  // ../Loryscare/backend/src/repositories/vitals-repository.js
  var require_vitals_repository = __commonJS({
    "../Loryscare/backend/src/repositories/vitals-repository.js"(exports, module) {
      var pool = require_database();
      var RETURNING_FIELDS = `
  id,
  measured_at AS "measuredAt",
  shift,
  systolic_pressure AS "systolicPressure",
  diastolic_pressure AS "diastolicPressure",
  heart_rate AS "heartRate",
  oxygen_saturation AS "oxygenSaturation",
  temperature::FLOAT AS temperature,
  blood_glucose AS "bloodGlucose",
  notes,
  author_profile_id AS "authorProfileId",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;
      async function getAll(patientId, userId) {
        const result = await pool.query(`
    SELECT v.id, v.measured_at AS "measuredAt", v.shift,
      v.systolic_pressure AS "systolicPressure", v.diastolic_pressure AS "diastolicPressure",
      v.heart_rate AS "heartRate", v.oxygen_saturation AS "oxygenSaturation",
      v.temperature::FLOAT AS temperature, v.blood_glucose AS "bloodGlucose", v.notes,
      v.author_profile_id AS "authorProfileId", cp.name AS "authorProfileName",
      v.created_at AS "createdAt", v.updated_at AS "updatedAt"
    FROM vital_signs v
    LEFT JOIN caregiver_profiles cp ON cp.id = v.author_profile_id
    WHERE v.patient_id = $1 AND v.patient_id IN (SELECT id FROM patients WHERE user_id = $2)
    ORDER BY v.measured_at DESC
  `, [patientId, userId]);
        return result.rows;
      }
      async function patientBelongsToUser(patientId, userId) {
        const result = await pool.query("SELECT 1 FROM patients WHERE id = $1 AND user_id = $2", [patientId, userId]);
        return result.rowCount > 0;
      }
      async function findById(id, userId) {
        const result = await pool.query(
          `SELECT id, author_profile_id AS "authorProfileId"
     FROM vital_signs
     WHERE id = $1 AND patient_id IN (SELECT id FROM patients WHERE user_id = $2)`,
          [id, userId]
        );
        return result.rows[0] ?? null;
      }
      async function create(vitalSigns) {
        const query = `
    INSERT INTO vital_signs (
      measured_at,
      shift,
      systolic_pressure,
      diastolic_pressure,
      heart_rate,
      oxygen_saturation,
      temperature,
      blood_glucose,
      notes,
      patient_id,
      author_profile_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING ${RETURNING_FIELDS}
  `;
        const values = [
          vitalSigns.measuredAt,
          vitalSigns.shift,
          vitalSigns.systolicPressure,
          vitalSigns.diastolicPressure,
          vitalSigns.heartRate,
          vitalSigns.oxygenSaturation,
          vitalSigns.temperature,
          vitalSigns.bloodGlucose,
          vitalSigns.notes,
          vitalSigns.patientId,
          vitalSigns.authorProfileId
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
      }
      async function update(id, vitalSigns, userId) {
        const query = `
    UPDATE vital_signs
    SET
      measured_at = $1,
      shift = $2,
      systolic_pressure = $3,
      diastolic_pressure = $4,
      heart_rate = $5,
      oxygen_saturation = $6,
      temperature = $7,
      blood_glucose = $8,
      notes = $9,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $10 AND patient_id IN (SELECT id FROM patients WHERE user_id = $11)
    RETURNING ${RETURNING_FIELDS}
  `;
        const values = [
          vitalSigns.measuredAt,
          vitalSigns.shift,
          vitalSigns.systolicPressure,
          vitalSigns.diastolicPressure,
          vitalSigns.heartRate,
          vitalSigns.oxygenSaturation,
          vitalSigns.temperature,
          vitalSigns.bloodGlucose,
          vitalSigns.notes,
          id,
          userId
        ];
        const result = await pool.query(query, values);
        return result.rows[0] ?? null;
      }
      async function remove(id, userId) {
        const result = await pool.query(
          "DELETE FROM vital_signs WHERE id = $1 AND patient_id IN (SELECT id FROM patients WHERE user_id = $2) RETURNING id",
          [id, userId]
        );
        return result.rowCount > 0;
      }
      module.exports = Object.freeze({ create, findById, getAll, patientBelongsToUser, remove, update });
    }
  });

  // ../Loryscare/backend/src/routes/vitals-routes.js
  var require_vitals_routes = __commonJS({
    "../Loryscare/backend/src/routes/vitals-routes.js"(exports, module) {
      var { Router } = require_express();
      function createVitalsRouter(vitalsController) {
        const router = Router();
        router.get("/", vitalsController.getAll);
        router.post("/", vitalsController.create);
        router.put("/:id", vitalsController.update);
        router.delete("/:id", vitalsController.remove);
        return router;
      }
      module.exports = createVitalsRouter;
    }
  });

  // ../Loryscare/backend/src/services/vitals-service.js
  var require_vitals_service = __commonJS({
    "../Loryscare/backend/src/services/vitals-service.js"(exports, module) {
      var ValidationError = require_validation_error();
      var NotFoundError = require_not_found_error();
      var VitalSignOwnershipError = require_vital_sign_ownership_error();
      var VALID_SHIFTS = /* @__PURE__ */ new Set(["Manh\xE3", "Tarde", "Noite", "Madrugada"]);
      function isValidDate(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!match) return false;
        const [, year, month, day] = match.map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
      }
      function parseNumber(value, field, details, { integer = false, min, max }) {
        const parsedValue = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
        if (!Number.isFinite(parsedValue) || integer && !Number.isInteger(parsedValue) || parsedValue < min || parsedValue > max) {
          details[field] = `Deve ser um n\xFAmero entre ${min} e ${max}`;
        }
        return parsedValue;
      }
      function hasValue(value) {
        return value !== void 0 && value !== null && String(value).trim() !== "";
      }
      function parseOptionalNumber(value, field, details, rules) {
        return hasValue(value) ? parseNumber(value, field, details, rules) : null;
      }
      function validateAndMap(input, editing = false) {
        const details = {};
        const date = typeof input.date === "string" ? input.date.trim() : "";
        const patientId = input.patientId;
        const time = typeof input.time === "string" ? input.time.trim() : "";
        const shift = typeof input.shift === "string" ? input.shift.trim() : "";
        const bloodPressure = typeof input.bloodPressure === "string" ? input.bloodPressure.trim() : "";
        if (!isValidDate(date)) details.date = "Informe uma data v\xE1lida no formato AAAA-MM-DD";
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
          details.time = "Informe um hor\xE1rio v\xE1lido no formato HH:MM";
        }
        if (!VALID_SHIFTS.has(shift)) details.shift = "Informe um turno v\xE1lido";
        const pressureMatch = /^(\d{2,3})\/(\d{2,3})$/.exec(bloodPressure);
        if (bloodPressure && !pressureMatch) {
          details.bloodPressure = "Informe a press\xE3o no formato 120/80";
        }
        const heartRate = parseOptionalNumber(input.heartRate, "heartRate", details, {
          integer: true,
          min: 1,
          max: 300
        });
        const oxygenSaturation = parseOptionalNumber(
          input.oxygenSaturation,
          "oxygenSaturation",
          details,
          { integer: true, min: 1, max: 100 }
        );
        const temperature = parseOptionalNumber(input.temperature, "temperature", details, {
          min: 30,
          max: 45
        });
        let bloodGlucose = null;
        if (hasValue(input.bloodGlucose)) {
          bloodGlucose = parseNumber(input.bloodGlucose, "bloodGlucose", details, {
            integer: true,
            min: 1,
            max: 1e3
          });
        }
        const notes = typeof input.notes === "string" ? input.notes.trim() : "";
        if (notes.length > 500) details.notes = "Deve ter no m\xE1ximo 500 caracteres";
        if (!editing && !/^\d+$/.test(String(patientId ?? ""))) details.patientId = "Selecione um paciente";
        if (Object.keys(details).length > 0) throw new ValidationError(details);
        return {
          measuredAt: `${date}T${time}:00-03:00`,
          shift,
          systolicPressure: pressureMatch ? Number(pressureMatch[1]) : null,
          diastolicPressure: pressureMatch ? Number(pressureMatch[2]) : null,
          heartRate,
          oxygenSaturation,
          temperature,
          bloodGlucose,
          notes: notes || null,
          patientId
        };
      }
      function createVitalsService(repository) {
        function validateId(id, field = "id") {
          if (!/^\d+$/.test(String(id ?? "")) || id === "0") {
            throw new ValidationError({ [field]: "Informe um identificador v\xE1lido" });
          }
        }
        async function create(input, userId, profileId) {
          const vitalSigns = { ...validateAndMap(input ?? {}), authorProfileId: profileId ?? null };
          if (!await repository.patientBelongsToUser(vitalSigns.patientId, userId)) {
            throw new ValidationError({ patientId: "Paciente n\xE3o encontrado" });
          }
          return repository.create(vitalSigns);
        }
        async function getAll(patientId, userId) {
          validateId(patientId, "patientId");
          return repository.getAll(patientId, userId);
        }
        async function update(id, input, userId, profileId) {
          validateId(id);
          const existing = await repository.findById(id, userId);
          if (!existing) throw new NotFoundError();
          if (existing.authorProfileId != null && String(existing.authorProfileId) !== String(profileId ?? "")) {
            throw new VitalSignOwnershipError();
          }
          const updatedRecord = await repository.update(id, validateAndMap(input ?? {}, true), userId);
          if (!updatedRecord) throw new NotFoundError();
          return updatedRecord;
        }
        async function remove(id, userId) {
          validateId(id);
          const removed = await repository.remove(id, userId);
          if (!removed) throw new NotFoundError();
        }
        return Object.freeze({ create, getAll, remove, update });
      }
      module.exports = createVitalsService;
    }
  });

  // ../Loryscare/backend/src/errors/medication-not-found-error.js
  var require_medication_not_found_error = __commonJS({
    "../Loryscare/backend/src/errors/medication-not-found-error.js"(exports, module) {
      var MedicationNotFoundError = class extends Error {
        constructor(message = "Medicamento n\xE3o encontrado") {
          super(message);
          this.name = "MedicationNotFoundError";
        }
      };
      module.exports = MedicationNotFoundError;
    }
  });

  // ../Loryscare/backend/src/errors/medication-validation-error.js
  var require_medication_validation_error = __commonJS({
    "../Loryscare/backend/src/errors/medication-validation-error.js"(exports, module) {
      var MedicationValidationError = class extends Error {
        constructor(details) {
          super("Dados do medicamento inv\xE1lidos");
          this.name = "MedicationValidationError";
          this.details = details;
        }
      };
      module.exports = MedicationValidationError;
    }
  });

  // ../Loryscare/backend/src/errors/medication-administration-conflict-error.js
  var require_medication_administration_conflict_error = __commonJS({
    "../Loryscare/backend/src/errors/medication-administration-conflict-error.js"(exports, module) {
      var MedicationAdministrationConflictError = class extends Error {
        constructor({ authorProfileName, administeredAt } = {}) {
          super(
            authorProfileName ? `Esta dose j\xE1 foi registrada por ${authorProfileName}` : "Esta dose j\xE1 foi registrada por outro cuidador"
          );
          this.name = "MedicationAdministrationConflictError";
          this.authorProfileName = authorProfileName ?? null;
          this.administeredAt = administeredAt ?? null;
        }
      };
      module.exports = MedicationAdministrationConflictError;
    }
  });

  // ../Loryscare/backend/src/controllers/medications-controller.js
  var require_medications_controller = __commonJS({
    "../Loryscare/backend/src/controllers/medications-controller.js"(exports, module) {
      var MedicationNotFoundError = require_medication_not_found_error();
      var MedicationValidationError = require_medication_validation_error();
      var MedicationAdministrationConflictError = require_medication_administration_conflict_error();
      function handle(error, response, next) {
        if (error instanceof MedicationValidationError) {
          response.status(400).json({ error: error.message, details: error.details });
        } else if (error instanceof MedicationNotFoundError) {
          response.status(404).json({ error: error.message });
        } else if (error instanceof MedicationAdministrationConflictError) {
          response.status(409).json({
            error: error.message,
            authorProfileName: error.authorProfileName,
            administeredAt: error.administeredAt
          });
        } else {
          next(error);
        }
      }
      function createMedicationsController(service, changeBus) {
        const action = (callback) => async (request, response, next) => {
          try {
            await callback(request, response);
          } catch (error) {
            handle(error, response, next);
          }
        };
        return Object.freeze({
          getAll: action(async (request, response) => response.json({ data: await service.getAll(request.query.patientId, request.userId) })),
          create: action(async (request, response) => {
            const data = await service.create(request.body, request.userId);
            changeBus.publish(request.userId, { resource: "medications", action: "created" });
            response.status(201).json({ data });
          }),
          update: action(async (request, response) => {
            await service.update(request.params.id, request.body, request.userId);
            changeBus.publish(request.userId, { resource: "medications", action: "updated" });
            response.status(204).send();
          }),
          remove: action(async (request, response) => {
            await service.remove(request.params.id, request.userId);
            changeBus.publish(request.userId, { resource: "medications", action: "removed" });
            response.status(204).send();
          }),
          getDaily: action(async (request, response) => response.json({ data: await service.getDaily(request.query.date, request.query.patientId, request.userId) })),
          getMissed: action(async (request, response) => response.json({ data: await service.getMissed(request.query.patientId, request.userId) })),
          setAdministration: action(async (request, response) => {
            const data = await service.setAdministration(request.params.id, request.params.scheduleId, request.body, request.userId, request.profileId);
            changeBus.publish(request.userId, { resource: "medications", action: "administration-updated" });
            response.json({ data });
          })
        });
      }
      module.exports = createMedicationsController;
    }
  });

  // ../Loryscare/backend/src/repositories/medications-repository.js
  var require_medications_repository = __commonJS({
    "../Loryscare/backend/src/repositories/medications-repository.js"(exports, module) {
      var pool = require_database();
      async function getAll(patientId, userId) {
        const result = await pool.query(`
    SELECT
      m.id,
      m.name,
      m.dosage,
      m.instructions,
      to_char(m.start_date, 'YYYY-MM-DD') AS "startDate",
      CASE
        WHEN m.end_date IS NULL THEN NULL
        ELSE to_char(m.end_date, 'YYYY-MM-DD')
      END AS "endDate",
      m.is_active AS "isActive",
      m.is_fixed AS "isFixed",
      m.created_at AS "createdAt",
      m.updated_at AS "updatedAt",
      COALESCE(
        json_agg(
          json_build_object(
            'id', s.id,
            'time', to_char(s.scheduled_time, 'HH24:MI')
          ) ORDER BY s.scheduled_time
        ) FILTER (WHERE s.id IS NOT NULL),
        '[]'::json
      ) AS schedules
    FROM medications m
    LEFT JOIN medication_schedules s ON s.medication_id = m.id AND s.is_active = TRUE
    WHERE m.patient_id = $1 AND m.patient_id IN (SELECT id FROM patients WHERE user_id = $2)
    GROUP BY m.id
    ORDER BY m.is_active DESC, m.name
  `, [patientId, userId]);
        return result.rows;
      }
      async function patientBelongsToUser(patientId, userId) {
        const result = await pool.query("SELECT 1 FROM patients WHERE id = $1 AND user_id = $2", [patientId, userId]);
        return result.rowCount > 0;
      }
      async function create(medication) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await client.query(
            `INSERT INTO medications (name, dosage, instructions, start_date, end_date, patient_id, is_fixed)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
            [
              medication.name,
              medication.dosage,
              medication.instructions,
              medication.startDate,
              medication.endDate,
              medication.patientId,
              medication.isFixed
            ]
          );
          const id = result.rows[0].id;
          for (const time of medication.times) {
            await client.query(
              "INSERT INTO medication_schedules (medication_id, scheduled_time) VALUES ($1, $2)",
              [id, time]
            );
          }
          await client.query("COMMIT");
          return id;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      async function update(id, medication, userId) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await client.query(
            `UPDATE medications
       SET name = $1, dosage = $2, instructions = $3, start_date = $4,
           end_date = $5, is_active = $6, is_fixed = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND patient_id IN (SELECT id FROM patients WHERE user_id = $9) RETURNING id`,
            [
              medication.name,
              medication.dosage,
              medication.instructions,
              medication.startDate,
              medication.endDate,
              medication.isActive,
              medication.isFixed,
              id,
              userId
            ]
          );
          if (!result.rowCount) {
            await client.query("ROLLBACK");
            return false;
          }
          await client.query(
            "UPDATE medication_schedules SET is_active = FALSE WHERE medication_id = $1",
            [id]
          );
          for (const time of medication.times) {
            await client.query(
              `INSERT INTO medication_schedules (medication_id, scheduled_time)
         VALUES ($1, $2)
         ON CONFLICT (medication_id, scheduled_time)
         DO UPDATE SET is_active = TRUE`,
              [id, time]
            );
          }
          await client.query("COMMIT");
          return true;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      async function remove(id, userId) {
        const result = await pool.query(
          "DELETE FROM medications WHERE id = $1 AND patient_id IN (SELECT id FROM patients WHERE user_id = $2) RETURNING id",
          [id, userId]
        );
        return result.rowCount > 0;
      }
      async function getDaily(date, patientId, userId) {
        const result = await pool.query(
          `SELECT
       m.id AS "medicationId", m.name, m.dosage, m.instructions,
       s.id AS "scheduleId", to_char(s.scheduled_time, 'HH24:MI') AS time,
       COALESCE(a.status, 'pending') AS status,
       a.administered_at AS "administeredAt", a.notes,
       a.author_profile_id AS "authorProfileId", cp.name AS "authorProfileName"
     FROM medications m
     JOIN medication_schedules s ON s.medication_id = m.id AND s.is_active = TRUE
     LEFT JOIN medication_administrations a
       ON a.schedule_id = s.id AND a.scheduled_date = $1
     LEFT JOIN caregiver_profiles cp ON cp.id = a.author_profile_id
     WHERE m.is_active = TRUE
       AND m.start_date <= $1
       AND (m.end_date IS NULL OR m.end_date >= $1)
       AND m.patient_id = $2
       AND m.patient_id IN (SELECT id FROM patients WHERE user_id = $3)
     ORDER BY s.scheduled_time, m.name`,
          [date, patientId, userId]
        );
        return result.rows;
      }
      async function scheduleBelongsToMedication(medicationId, scheduleId, userId) {
        const result = await pool.query(
          `SELECT 1 FROM medication_schedules s
     JOIN medications m ON m.id = s.medication_id
     WHERE s.id = $1 AND s.medication_id = $2 AND s.is_active = TRUE
       AND m.patient_id IN (SELECT id FROM patients WHERE user_id = $3)`,
          [scheduleId, medicationId, userId]
        );
        return result.rowCount > 0;
      }
      async function findAdministration(scheduleId, date) {
        const result = await pool.query(
          `SELECT a.id, a.status, a.administered_at AS "administeredAt", a.notes,
            a.author_profile_id AS "authorProfileId", cp.name AS "authorProfileName"
     FROM medication_administrations a
     LEFT JOIN caregiver_profiles cp ON cp.id = a.author_profile_id
     WHERE a.schedule_id = $1 AND a.scheduled_date = $2`,
          [scheduleId, date]
        );
        return result.rows[0] ?? null;
      }
      async function insertAdministration(data) {
        const result = await pool.query(
          `INSERT INTO medication_administrations
       (schedule_id, scheduled_date, status, administered_at, notes, author_profile_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (schedule_id, scheduled_date) DO NOTHING
     RETURNING id, status, administered_at AS "administeredAt", notes,
       author_profile_id AS "authorProfileId"`,
          [data.scheduleId, data.date, data.status, data.administeredAt, data.notes, data.authorProfileId]
        );
        return result.rows[0] ?? null;
      }
      async function updateAdministration(id, data) {
        const result = await pool.query(
          `UPDATE medication_administrations
     SET status = $1, administered_at = $2, notes = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $4
     RETURNING id, status, administered_at AS "administeredAt", notes,
       author_profile_id AS "authorProfileId"`,
          [data.status, data.administeredAt, data.notes, id]
        );
        return result.rows[0];
      }
      async function getMissed(date, patientId, userId) {
        const result = await pool.query(
          `SELECT m.id AS "medicationId", s.id AS "scheduleId", m.name AS title,
       to_char(s.scheduled_time, 'HH24:MI') AS time, shift."onDutyProfileName"
     FROM medications m
     JOIN medication_schedules s ON s.medication_id = m.id AND s.is_active = TRUE
     LEFT JOIN medication_administrations a ON a.schedule_id = s.id AND a.scheduled_date = $1
     LEFT JOIN LATERAL (
       SELECT cp.name AS "onDutyProfileName"
       FROM schedule_shifts ss
       JOIN caregiver_profiles cp ON cp.id = ss.profile_id
       WHERE ss.user_id = $3
         AND ss.scheduled_start_at <= ($1::text || ' ' || to_char(s.scheduled_time, 'HH24:MI'))::timestamp
         AND ss.scheduled_end_at > ($1::text || ' ' || to_char(s.scheduled_time, 'HH24:MI'))::timestamp
       ORDER BY ss.scheduled_start_at DESC
       LIMIT 1
     ) shift ON TRUE
     WHERE m.is_active = TRUE
       AND m.start_date <= $1 AND (m.end_date IS NULL OR m.end_date >= $1)
       AND m.patient_id = $2
       AND m.patient_id IN (SELECT id FROM patients WHERE user_id = $3)
       AND COALESCE(a.status, 'pending') = 'pending'
     ORDER BY s.scheduled_time, m.name`,
          [date, patientId, userId]
        );
        return result.rows;
      }
      async function removeAdministration(id) {
        const result = await pool.query("DELETE FROM medication_administrations WHERE id = $1 RETURNING id", [id]);
        return result.rowCount > 0;
      }
      module.exports = Object.freeze({
        create,
        findAdministration,
        getAll,
        getDaily,
        getMissed,
        insertAdministration,
        patientBelongsToUser,
        remove,
        removeAdministration,
        scheduleBelongsToMedication,
        update,
        updateAdministration
      });
    }
  });

  // ../Loryscare/backend/src/routes/medications-routes.js
  var require_medications_routes = __commonJS({
    "../Loryscare/backend/src/routes/medications-routes.js"(exports, module) {
      var { Router } = require_express();
      function createMedicationsRouter(controller) {
        const router = Router();
        router.get("/daily", controller.getDaily);
        router.get("/missed", controller.getMissed);
        router.get("/", controller.getAll);
        router.post("/", controller.create);
        router.put("/:id", controller.update);
        router.delete("/:id", controller.remove);
        router.patch("/:id/schedules/:scheduleId/administration", controller.setAdministration);
        return router;
      }
      module.exports = createMedicationsRouter;
    }
  });

  // ../Loryscare/backend/src/services/medications-service.js
  var require_medications_service = __commonJS({
    "../Loryscare/backend/src/services/medications-service.js"(exports, module) {
      var MedicationNotFoundError = require_medication_not_found_error();
      var MedicationValidationError = require_medication_validation_error();
      var MedicationAdministrationConflictError = require_medication_administration_conflict_error();
      function isDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [year, month, day] = value.split("-").map(Number);
        const parsed = new Date(Date.UTC(year, month - 1, day));
        return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
      }
      function validateId(value, field = "id") {
        if (!/^\d+$/.test(value) || value === "0") {
          throw new MedicationValidationError({ [field]: "Identificador inv\xE1lido" });
        }
      }
      function validateMedication(input, editing = false) {
        const details = {};
        const name = typeof input.name === "string" ? input.name.trim() : "";
        const dosage = typeof input.dosage === "string" ? input.dosage.trim() : "";
        const instructions = typeof input.instructions === "string" ? input.instructions.trim() : "";
        const startDate = typeof input.startDate === "string" ? input.startDate : "";
        const endDate = typeof input.endDate === "string" && input.endDate ? input.endDate : null;
        const times = Array.isArray(input.times) ? [...new Set(input.times.map((time) => String(time).trim()))].sort() : [];
        const patientId = input.patientId;
        if (!name || name.length > 120) details.name = "Informe um nome com at\xE9 120 caracteres";
        if (!dosage || dosage.length > 80) details.dosage = "Informe uma dosagem com at\xE9 80 caracteres";
        if (instructions.length > 500) details.instructions = "Use no m\xE1ximo 500 caracteres";
        if (!isDate(startDate)) details.startDate = "Informe uma data inicial v\xE1lida";
        if (endDate && !isDate(endDate)) details.endDate = "Informe uma data final v\xE1lida";
        if (endDate && isDate(startDate) && endDate < startDate) {
          details.endDate = "A data final n\xE3o pode ser anterior \xE0 inicial";
        }
        if (!times.length || times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
          details.times = "Informe ao menos um hor\xE1rio v\xE1lido";
        }
        if (!editing && !/^\d+$/.test(String(patientId ?? ""))) details.patientId = "Selecione um paciente";
        if (Object.keys(details).length) throw new MedicationValidationError(details);
        return {
          name,
          dosage,
          instructions: instructions || null,
          startDate,
          endDate,
          times,
          patientId,
          isActive: editing ? input.isActive !== false : true,
          isFixed: Boolean(input.isFixed)
        };
      }
      function createMedicationsService(repository) {
        async function getAll(patientId, userId) {
          validateId(patientId, "patientId");
          return repository.getAll(patientId, userId);
        }
        async function create(input, userId) {
          const medication = validateMedication(input ?? {});
          if (!await repository.patientBelongsToUser(medication.patientId, userId)) {
            throw new MedicationValidationError({ patientId: "Paciente n\xE3o encontrado" });
          }
          const id = await repository.create(medication);
          return { id };
        }
        async function update(id, input, userId) {
          validateId(id);
          const updated = await repository.update(id, validateMedication(input ?? {}, true), userId);
          if (!updated) throw new MedicationNotFoundError();
        }
        async function remove(id, userId) {
          validateId(id);
          if (!await repository.remove(id, userId)) throw new MedicationNotFoundError();
        }
        async function getDaily(date, patientId, userId) {
          if (!isDate(date)) throw new MedicationValidationError({ date: "Informe uma data v\xE1lida" });
          validateId(patientId, "patientId");
          return repository.getDaily(date, patientId, userId);
        }
        async function setAdministration(medicationId, scheduleId, input, userId, profileId) {
          validateId(medicationId, "medicationId");
          validateId(scheduleId, "scheduleId");
          const details = {};
          const date = typeof input.date === "string" ? input.date : "";
          const status = input.status;
          const notes = typeof input.notes === "string" ? input.notes.trim() : "";
          if (!isDate(date)) details.date = "Informe uma data v\xE1lida";
          if (!(/* @__PURE__ */ new Set(["taken", "skipped", "pending"])).has(status)) details.status = "Status inv\xE1lido";
          if (notes.length > 500) details.notes = "Use no m\xE1ximo 500 caracteres";
          if (Object.keys(details).length) throw new MedicationValidationError(details);
          if (!await repository.scheduleBelongsToMedication(medicationId, scheduleId, userId)) {
            throw new MedicationNotFoundError("Hor\xE1rio do medicamento n\xE3o encontrado");
          }
          if (status === "pending") {
            const existing2 = await repository.findAdministration(scheduleId, date);
            if (!existing2) return null;
            if (existing2.authorProfileId != null && String(existing2.authorProfileId) !== String(profileId ?? null)) {
              throw new MedicationAdministrationConflictError({
                authorProfileName: existing2.authorProfileName,
                administeredAt: existing2.administeredAt
              });
            }
            await repository.removeAdministration(existing2.id);
            return null;
          }
          const administeredAt = status === "taken" ? /* @__PURE__ */ new Date() : null;
          const normalizedNotes = notes || null;
          const authorProfileId = profileId ?? null;
          function applyEdit(record) {
            if (record.authorProfileId != null && String(record.authorProfileId) !== String(authorProfileId)) {
              throw new MedicationAdministrationConflictError({
                authorProfileName: record.authorProfileName,
                administeredAt: record.administeredAt
              });
            }
            return repository.updateAdministration(record.id, {
              status,
              administeredAt: record.administeredAt ?? administeredAt,
              notes: normalizedNotes
            });
          }
          const existing = await repository.findAdministration(scheduleId, date);
          if (!existing) {
            const inserted = await repository.insertAdministration({
              scheduleId,
              date,
              status,
              administeredAt,
              notes: normalizedNotes,
              authorProfileId
            });
            if (inserted) return inserted;
            const refetched = await repository.findAdministration(scheduleId, date);
            if (!refetched) {
              throw new MedicationAdministrationConflictError({ authorProfileName: null, administeredAt: null });
            }
            return applyEdit(refetched);
          }
          return applyEdit(existing);
        }
        function yesterday() {
          const date = /* @__PURE__ */ new Date();
          date.setDate(date.getDate() - 1);
          const pad = (value) => String(value).padStart(2, "0");
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        }
        async function getMissed(patientId, userId) {
          validateId(patientId, "patientId");
          return repository.getMissed(yesterday(), patientId, userId);
        }
        return Object.freeze({ create, getAll, getDaily, getMissed, remove, setAdministration, update });
      }
      module.exports = createMedicationsService;
    }
  });

  // ../Loryscare/backend/src/errors/routine-not-found-error.js
  var require_routine_not_found_error = __commonJS({
    "../Loryscare/backend/src/errors/routine-not-found-error.js"(exports, module) {
      var RoutineNotFoundError = class extends Error {
        constructor(message = "Rotina n\xE3o encontrada") {
          super(message);
          this.name = "RoutineNotFoundError";
        }
      };
      module.exports = RoutineNotFoundError;
    }
  });

  // ../Loryscare/backend/src/errors/routine-validation-error.js
  var require_routine_validation_error = __commonJS({
    "../Loryscare/backend/src/errors/routine-validation-error.js"(exports, module) {
      var RoutineValidationError = class extends Error {
        constructor(details) {
          super("Dados da rotina inv\xE1lidos");
          this.name = "RoutineValidationError";
          this.details = details;
        }
      };
      module.exports = RoutineValidationError;
    }
  });

  // ../Loryscare/backend/src/errors/routine-completion-conflict-error.js
  var require_routine_completion_conflict_error = __commonJS({
    "../Loryscare/backend/src/errors/routine-completion-conflict-error.js"(exports, module) {
      var RoutineCompletionConflictError = class extends Error {
        constructor({ authorProfileName, completedAt } = {}) {
          super(
            authorProfileName ? `Esta atividade j\xE1 foi registrada por ${authorProfileName}` : "Esta atividade j\xE1 foi registrada por outro cuidador"
          );
          this.name = "RoutineCompletionConflictError";
          this.authorProfileName = authorProfileName ?? null;
          this.completedAt = completedAt ?? null;
        }
      };
      module.exports = RoutineCompletionConflictError;
    }
  });

  // ../Loryscare/backend/src/controllers/routines-controller.js
  var require_routines_controller = __commonJS({
    "../Loryscare/backend/src/controllers/routines-controller.js"(exports, module) {
      var RoutineNotFoundError = require_routine_not_found_error();
      var RoutineValidationError = require_routine_validation_error();
      var RoutineCompletionConflictError = require_routine_completion_conflict_error();
      function handle(error, response, next) {
        if (error instanceof RoutineValidationError) response.status(400).json({ error: error.message, details: error.details });
        else if (error instanceof RoutineNotFoundError) response.status(404).json({ error: error.message });
        else if (error instanceof RoutineCompletionConflictError) {
          response.status(409).json({ error: error.message, authorProfileName: error.authorProfileName, completedAt: error.completedAt });
        } else next(error);
      }
      function createRoutinesController(service, changeBus) {
        const action = (callback) => async (request, response, next) => {
          try {
            await callback(request, response);
          } catch (error) {
            handle(error, response, next);
          }
        };
        return Object.freeze({
          getAll: action(async (request, response) => response.json({ data: await service.getAll(request.query.patientId, request.userId) })),
          create: action(async (request, response) => {
            const data = await service.create(request.body, request.userId);
            changeBus.publish(request.userId, { resource: "routines", action: "created" });
            response.status(201).json({ data });
          }),
          update: action(async (request, response) => {
            await service.update(request.params.id, request.body, request.userId);
            changeBus.publish(request.userId, { resource: "routines", action: "updated" });
            response.status(204).send();
          }),
          remove: action(async (request, response) => {
            await service.remove(request.params.id, request.userId);
            changeBus.publish(request.userId, { resource: "routines", action: "removed" });
            response.status(204).send();
          }),
          getDaily: action(async (request, response) => response.json({ data: await service.getDaily(request.query.date, request.query.patientId, request.userId) })),
          getMissed: action(async (request, response) => response.json({ data: await service.getMissed(request.query.patientId, request.userId) })),
          setCompletion: action(async (request, response) => {
            const data = await service.setCompletion(request.params.id, request.body, request.userId, request.profileId);
            changeBus.publish(request.userId, { resource: "routines", action: "completion-updated" });
            response.json({ data });
          })
        });
      }
      module.exports = createRoutinesController;
    }
  });

  // ../Loryscare/backend/src/repositories/routines-repository.js
  var require_routines_repository = __commonJS({
    "../Loryscare/backend/src/repositories/routines-repository.js"(exports, module) {
      var pool = require_database();
      async function getAll(patientId, userId) {
        const result = await pool.query(
          `
    SELECT id, title, category, to_char(scheduled_time, 'HH24:MI') AS time,
      notes, to_char(start_date, 'YYYY-MM-DD') AS "startDate",
      is_active AS "isActive", is_fixed AS "isFixed"
    FROM routines
    WHERE patient_id = $1 AND patient_id IN (SELECT id FROM patients WHERE user_id = $2)
    ORDER BY is_active DESC, scheduled_time, title`,
          [patientId, userId]
        );
        return result.rows;
      }
      async function patientBelongsToUser(patientId, userId) {
        const result = await pool.query("SELECT 1 FROM patients WHERE id = $1 AND user_id = $2", [patientId, userId]);
        return result.rowCount > 0;
      }
      async function create(routine) {
        const result = await pool.query(
          `INSERT INTO routines (title, category, scheduled_time, notes, start_date, patient_id, is_fixed)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [routine.title, routine.category, routine.time, routine.notes, routine.startDate, routine.patientId, routine.isFixed]
        );
        return result.rows[0].id;
      }
      async function update(id, routine, userId) {
        const result = await pool.query(
          `UPDATE routines SET title = $1, category = $2, scheduled_time = $3, notes = $4,
      start_date = $5, is_active = $6, is_fixed = $7, updated_at = CURRENT_TIMESTAMP
     WHERE id = $8 AND patient_id IN (SELECT id FROM patients WHERE user_id = $9) RETURNING id`,
          [routine.title, routine.category, routine.time, routine.notes, routine.startDate, routine.isActive, routine.isFixed, id, userId]
        );
        return result.rowCount > 0;
      }
      async function remove(id, userId) {
        const result = await pool.query(
          "DELETE FROM routines WHERE id = $1 AND patient_id IN (SELECT id FROM patients WHERE user_id = $2) RETURNING id",
          [id, userId]
        );
        return result.rowCount > 0;
      }
      async function getDaily(date, patientId, userId) {
        const result = await pool.query(
          `SELECT r.id, r.title, r.category, to_char(r.scheduled_time, 'HH24:MI') AS time,
      r.notes, r.is_fixed AS "isFixed", COALESCE(c.status, 'pending') AS status, c.completed_at AS "completedAt",
      c.author_profile_id AS "authorProfileId", cp.name AS "authorProfileName"
     FROM routines r
     LEFT JOIN routine_completions c ON c.routine_id = r.id AND c.scheduled_date = $1
     LEFT JOIN caregiver_profiles cp ON cp.id = c.author_profile_id
     WHERE r.is_active = TRUE AND r.start_date <= $1
       AND r.patient_id = $2
       AND r.patient_id IN (SELECT id FROM patients WHERE user_id = $3)
     ORDER BY r.scheduled_time, r.title`,
          [date, patientId, userId]
        );
        return result.rows;
      }
      async function existsOnDate(id, date, userId) {
        const result = await pool.query(
          `SELECT 1 FROM routines WHERE id = $1 AND is_active = TRUE AND start_date <= $2
       AND patient_id IN (SELECT id FROM patients WHERE user_id = $3)`,
          [id, date, userId]
        );
        return result.rowCount > 0;
      }
      async function findCompletion(routineId, date) {
        const result = await pool.query(
          `SELECT c.id, c.status, c.completed_at AS "completedAt",
            c.author_profile_id AS "authorProfileId", cp.name AS "authorProfileName"
     FROM routine_completions c
     LEFT JOIN caregiver_profiles cp ON cp.id = c.author_profile_id
     WHERE c.routine_id = $1 AND c.scheduled_date = $2`,
          [routineId, date]
        );
        return result.rows[0] ?? null;
      }
      async function insertCompletion(data) {
        const result = await pool.query(
          `INSERT INTO routine_completions (routine_id, scheduled_date, status, completed_at, author_profile_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (routine_id, scheduled_date) DO NOTHING
     RETURNING id, status, completed_at AS "completedAt", author_profile_id AS "authorProfileId"`,
          [data.routineId, data.date, data.status, data.completedAt, data.authorProfileId]
        );
        return result.rows[0] ?? null;
      }
      async function updateCompletion(id, data) {
        const result = await pool.query(
          `UPDATE routine_completions
     SET status = $1, completed_at = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING id, status, completed_at AS "completedAt", author_profile_id AS "authorProfileId"`,
          [data.status, data.completedAt, id]
        );
        return result.rows[0];
      }
      async function getMissed(date, patientId, userId) {
        const result = await pool.query(
          `SELECT r.id, r.title, to_char(r.scheduled_time, 'HH24:MI') AS time,
       shift."onDutyProfileName"
     FROM routines r
     LEFT JOIN routine_completions c ON c.routine_id = r.id AND c.scheduled_date = $1
     LEFT JOIN LATERAL (
       SELECT cp.name AS "onDutyProfileName"
       FROM schedule_shifts ss
       JOIN caregiver_profiles cp ON cp.id = ss.profile_id
       WHERE ss.user_id = $3
         AND ss.scheduled_start_at <= ($1::text || ' ' || to_char(r.scheduled_time, 'HH24:MI'))::timestamp
         AND ss.scheduled_end_at > ($1::text || ' ' || to_char(r.scheduled_time, 'HH24:MI'))::timestamp
       ORDER BY ss.scheduled_start_at DESC
       LIMIT 1
     ) shift ON TRUE
     WHERE r.is_active = TRUE AND r.start_date <= $1
       AND r.patient_id = $2
       AND r.patient_id IN (SELECT id FROM patients WHERE user_id = $3)
       AND COALESCE(c.status, 'pending') = 'pending'
     ORDER BY r.scheduled_time, r.title`,
          [date, patientId, userId]
        );
        return result.rows;
      }
      async function removeCompletion(id) {
        const result = await pool.query("DELETE FROM routine_completions WHERE id = $1 RETURNING id", [id]);
        return result.rowCount > 0;
      }
      module.exports = Object.freeze({
        create,
        existsOnDate,
        findCompletion,
        getAll,
        getDaily,
        getMissed,
        insertCompletion,
        patientBelongsToUser,
        remove,
        removeCompletion,
        update,
        updateCompletion
      });
    }
  });

  // ../Loryscare/backend/src/routes/routines-routes.js
  var require_routines_routes = __commonJS({
    "../Loryscare/backend/src/routes/routines-routes.js"(exports, module) {
      var { Router } = require_express();
      function createRoutinesRouter(controller) {
        const router = Router();
        router.get("/daily", controller.getDaily);
        router.get("/missed", controller.getMissed);
        router.get("/", controller.getAll);
        router.post("/", controller.create);
        router.put("/:id", controller.update);
        router.delete("/:id", controller.remove);
        router.patch("/:id/completion", controller.setCompletion);
        return router;
      }
      module.exports = createRoutinesRouter;
    }
  });

  // ../Loryscare/backend/src/services/routines-service.js
  var require_routines_service = __commonJS({
    "../Loryscare/backend/src/services/routines-service.js"(exports, module) {
      var RoutineNotFoundError = require_routine_not_found_error();
      var RoutineValidationError = require_routine_validation_error();
      var RoutineCompletionConflictError = require_routine_completion_conflict_error();
      function isDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [year, month, day] = value.split("-").map(Number);
        const parsed = new Date(Date.UTC(year, month - 1, day));
        return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
      }
      function validateId(value, field = "id") {
        if (!/^\d+$/.test(String(value ?? "")) || value === "0") {
          throw new RoutineValidationError({ [field]: "Identificador inv\xE1lido" });
        }
      }
      function validateRoutine(input, editing = false) {
        const details = {};
        const title = typeof input.title === "string" ? input.title.trim() : "";
        const category = typeof input.category === "string" ? input.category.trim() : "";
        const time = typeof input.time === "string" ? input.time.trim() : "";
        const notes = typeof input.notes === "string" ? input.notes.trim() : "";
        const startDate = typeof input.startDate === "string" ? input.startDate : "";
        const patientId = input.patientId;
        if (!title || title.length > 120) details.title = "Informe uma atividade com at\xE9 120 caracteres";
        if (!category || category.length > 40) details.category = "Informe uma categoria v\xE1lida";
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) details.time = "Informe um hor\xE1rio v\xE1lido";
        if (notes.length > 500) details.notes = "Use no m\xE1ximo 500 caracteres";
        if (!isDate(startDate)) details.startDate = "Informe uma data inicial v\xE1lida";
        if (!editing && !/^\d+$/.test(String(patientId ?? ""))) details.patientId = "Selecione um paciente";
        if (Object.keys(details).length) throw new RoutineValidationError(details);
        return {
          title,
          category,
          time,
          notes: notes || null,
          startDate,
          patientId,
          isActive: editing ? input.isActive !== false : true,
          isFixed: Boolean(input.isFixed)
        };
      }
      function createRoutinesService(repository) {
        async function getAll(patientId, userId) {
          validateId(patientId, "patientId");
          return repository.getAll(patientId, userId);
        }
        async function create(input, userId) {
          const routine = validateRoutine(input ?? {});
          if (!await repository.patientBelongsToUser(routine.patientId, userId)) {
            throw new RoutineValidationError({ patientId: "Paciente n\xE3o encontrado" });
          }
          return { id: await repository.create(routine) };
        }
        async function update(id, input, userId) {
          validateId(id);
          if (!await repository.update(id, validateRoutine(input ?? {}, true), userId)) throw new RoutineNotFoundError();
        }
        async function remove(id, userId) {
          validateId(id);
          if (!await repository.remove(id, userId)) throw new RoutineNotFoundError();
        }
        async function getDaily(date, patientId, userId) {
          if (!isDate(date)) throw new RoutineValidationError({ date: "Informe uma data v\xE1lida" });
          validateId(patientId, "patientId");
          return repository.getDaily(date, patientId, userId);
        }
        async function setCompletion(id, input, userId, profileId) {
          validateId(id);
          const details = {};
          const date = typeof input.date === "string" ? input.date : "";
          const status = input.status;
          if (!isDate(date)) details.date = "Informe uma data v\xE1lida";
          if (!(/* @__PURE__ */ new Set(["completed", "skipped", "pending"])).has(status)) details.status = "Status inv\xE1lido";
          if (Object.keys(details).length) throw new RoutineValidationError(details);
          if (!await repository.existsOnDate(id, date, userId)) throw new RoutineNotFoundError("Atividade n\xE3o encontrada nesta data");
          if (status === "pending") {
            const existing2 = await repository.findCompletion(id, date);
            if (!existing2) return null;
            if (existing2.authorProfileId != null && String(existing2.authorProfileId) !== String(profileId ?? null)) {
              throw new RoutineCompletionConflictError({
                authorProfileName: existing2.authorProfileName,
                completedAt: existing2.completedAt
              });
            }
            await repository.removeCompletion(existing2.id);
            return null;
          }
          const completedAt = status === "completed" ? /* @__PURE__ */ new Date() : null;
          const authorProfileId = profileId ?? null;
          function applyEdit(record) {
            if (record.authorProfileId != null && String(record.authorProfileId) !== String(authorProfileId)) {
              throw new RoutineCompletionConflictError({
                authorProfileName: record.authorProfileName,
                completedAt: record.completedAt
              });
            }
            return repository.updateCompletion(record.id, { status, completedAt: record.completedAt ?? completedAt });
          }
          const existing = await repository.findCompletion(id, date);
          if (!existing) {
            const inserted = await repository.insertCompletion({ routineId: id, date, status, completedAt, authorProfileId });
            if (inserted) return inserted;
            const refetched = await repository.findCompletion(id, date);
            if (!refetched) {
              throw new RoutineCompletionConflictError({ authorProfileName: null, completedAt: null });
            }
            return applyEdit(refetched);
          }
          return applyEdit(existing);
        }
        function yesterday() {
          const date = /* @__PURE__ */ new Date();
          date.setDate(date.getDate() - 1);
          const pad = (value) => String(value).padStart(2, "0");
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        }
        async function getMissed(patientId, userId) {
          validateId(patientId, "patientId");
          return repository.getMissed(yesterday(), patientId, userId);
        }
        return Object.freeze({ create, getAll, getDaily, getMissed, remove, setCompletion, update });
      }
      module.exports = createRoutinesService;
    }
  });

  // ../Loryscare/backend/src/errors/event-completion-conflict-error.js
  var require_event_completion_conflict_error = __commonJS({
    "../Loryscare/backend/src/errors/event-completion-conflict-error.js"(exports, module) {
      var EventCompletionConflictError = class extends Error {
        constructor({ authorProfileName, completedAt } = {}) {
          super(
            authorProfileName ? `Este evento j\xE1 foi registrado por ${authorProfileName}` : "Este evento j\xE1 foi registrado por outro cuidador"
          );
          this.name = "EventCompletionConflictError";
          this.authorProfileName = authorProfileName ?? null;
          this.completedAt = completedAt ?? null;
        }
      };
      module.exports = EventCompletionConflictError;
    }
  });

  // ../Loryscare/backend/src/errors/event-not-found-error.js
  var require_event_not_found_error = __commonJS({
    "../Loryscare/backend/src/errors/event-not-found-error.js"(exports, module) {
      var EventNotFoundError = class extends Error {
        constructor(message = "Evento n\xE3o encontrado") {
          super(message);
          this.name = "EventNotFoundError";
        }
      };
      module.exports = EventNotFoundError;
    }
  });

  // ../Loryscare/backend/src/errors/event-validation-error.js
  var require_event_validation_error = __commonJS({
    "../Loryscare/backend/src/errors/event-validation-error.js"(exports, module) {
      var EventValidationError = class extends Error {
        constructor(details) {
          super("Dados do evento inv\xE1lidos");
          this.name = "EventValidationError";
          this.details = details;
        }
      };
      module.exports = EventValidationError;
    }
  });

  // ../Loryscare/backend/src/controllers/events-controller.js
  var require_events_controller = __commonJS({
    "../Loryscare/backend/src/controllers/events-controller.js"(exports, module) {
      var EventCompletionConflictError = require_event_completion_conflict_error();
      var EventNotFoundError = require_event_not_found_error();
      var EventValidationError = require_event_validation_error();
      function handle(error, response, next) {
        if (error instanceof EventValidationError) response.status(400).json({ error: error.message, details: error.details });
        else if (error instanceof EventNotFoundError) response.status(404).json({ error: error.message });
        else if (error instanceof EventCompletionConflictError) {
          response.status(409).json({ error: error.message, authorProfileName: error.authorProfileName, completedAt: error.completedAt });
        } else next(error);
      }
      function createEventsController(service, changeBus) {
        const action = (callback) => async (request, response, next) => {
          try {
            await callback(request, response);
          } catch (error) {
            handle(error, response, next);
          }
        };
        return Object.freeze({
          getAll: action(async (request, response) => response.json({
            data: await service.getAll(request.query.patientId, request.userId, {
              start: request.query.start,
              end: request.query.end
            })
          })),
          create: action(async (request, response) => {
            const data = await service.create(request.body, request.userId, request.profileId);
            changeBus.publish(request.userId, { resource: "events", action: "created" });
            response.status(201).json({ data });
          }),
          update: action(async (request, response) => {
            await service.update(request.params.id, request.body, request.userId);
            changeBus.publish(request.userId, { resource: "events", action: "updated" });
            response.status(204).send();
          }),
          remove: action(async (request, response) => {
            await service.remove(request.params.id, request.userId);
            changeBus.publish(request.userId, { resource: "events", action: "removed" });
            response.status(204).send();
          }),
          getDaily: action(async (request, response) => response.json({ data: await service.getDaily(request.query.date, request.query.patientId, request.userId) })),
          getUpcoming: action(async (request, response) => response.json({
            data: await service.getUpcoming(request.query.patientId, request.userId, request.query.days || "3")
          })),
          getMissed: action(async (request, response) => response.json({ data: await service.getMissed(request.query.patientId, request.userId) })),
          setStatus: action(async (request, response) => {
            const data = await service.setStatus(request.params.id, request.body, request.userId, request.profileId);
            changeBus.publish(request.userId, { resource: "events", action: "status-updated" });
            response.json({ data });
          })
        });
      }
      module.exports = createEventsController;
    }
  });

  // ../Loryscare/backend/src/repositories/events-repository.js
  var require_events_repository = __commonJS({
    "../Loryscare/backend/src/repositories/events-repository.js"(exports, module) {
      var pool = require_database();
      async function getAll(patientId, userId, { start, end } = {}) {
        const result = await pool.query(
          `
    SELECT e.id, e.title, e.category, to_char(e.event_date, 'YYYY-MM-DD') AS "eventDate",
      to_char(e.event_time, 'HH24:MI') AS "eventTime", e.notes, e.status, e.important,
      e.completed_at AS "completedAt",
      e.author_profile_id AS "authorProfileId", author.name AS "authorProfileName",
      e.completed_by_profile_id AS "completedByProfileId", completer.name AS "completedByProfileName"
    FROM events e
    LEFT JOIN caregiver_profiles author ON author.id = e.author_profile_id
    LEFT JOIN caregiver_profiles completer ON completer.id = e.completed_by_profile_id
    WHERE e.patient_id = $1 AND e.patient_id IN (SELECT id FROM patients WHERE user_id = $2)
      AND ($3::date IS NULL OR e.event_date >= $3)
      AND ($4::date IS NULL OR e.event_date <= $4)
    ORDER BY e.event_date, e.event_time, e.title`,
          [patientId, userId, start || null, end || null]
        );
        return result.rows;
      }
      async function patientBelongsToUser(patientId, userId) {
        const result = await pool.query("SELECT 1 FROM patients WHERE id = $1 AND user_id = $2", [patientId, userId]);
        return result.rowCount > 0;
      }
      async function create(event) {
        const result = await pool.query(
          `INSERT INTO events (title, category, event_date, event_time, notes, patient_id, author_profile_id, important)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [event.title, event.category, event.eventDate, event.eventTime, event.notes, event.patientId, event.authorProfileId, event.important]
        );
        return result.rows[0].id;
      }
      async function createMany(events) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const ids = [];
          for (const event of events) {
            const result = await client.query(
              `INSERT INTO events (title, category, event_date, event_time, notes, patient_id, author_profile_id, important)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
              [event.title, event.category, event.eventDate, event.eventTime, event.notes, event.patientId, event.authorProfileId, event.important]
            );
            ids.push(result.rows[0].id);
          }
          await client.query("COMMIT");
          return ids;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      async function update(id, event, userId) {
        const result = await pool.query(
          `UPDATE events SET title = $1, category = $2, event_date = $3, event_time = $4, notes = $5,
      important = $6, updated_at = CURRENT_TIMESTAMP
     WHERE id = $7 AND patient_id IN (SELECT id FROM patients WHERE user_id = $8) RETURNING id`,
          [event.title, event.category, event.eventDate, event.eventTime, event.notes, event.important, id, userId]
        );
        return result.rowCount > 0;
      }
      async function remove(id, userId) {
        const result = await pool.query(
          "DELETE FROM events WHERE id = $1 AND patient_id IN (SELECT id FROM patients WHERE user_id = $2) RETURNING id",
          [id, userId]
        );
        return result.rowCount > 0;
      }
      async function getDaily(date, patientId, userId) {
        const result = await pool.query(
          `SELECT e.id, e.title, e.category, to_char(e.event_time, 'HH24:MI') AS time, e.notes, e.status,
       e.completed_by_profile_id AS "completedByProfileId", cp.name AS "completedByProfileName"
     FROM events e
     LEFT JOIN caregiver_profiles cp ON cp.id = e.completed_by_profile_id
     WHERE e.event_date = $1 AND e.patient_id = $2
       AND e.patient_id IN (SELECT id FROM patients WHERE user_id = $3)
     ORDER BY e.event_time, e.title`,
          [date, patientId, userId]
        );
        return result.rows;
      }
      async function getUpcoming(patientId, userId, days) {
        const result = await pool.query(
          `SELECT id, title, category, to_char(event_date, 'YYYY-MM-DD') AS "eventDate",
      to_char(event_time, 'HH24:MI') AS "eventTime"
     FROM events
     WHERE status = 'pending' AND important = true AND patient_id = $1
       AND patient_id IN (SELECT id FROM patients WHERE user_id = $2)
       AND event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $3::integer
     ORDER BY event_date, event_time`,
          [patientId, userId, days]
        );
        return result.rows;
      }
      async function setStatus(id, status, userId, profileId) {
        const completedAt = status === "completed" ? /* @__PURE__ */ new Date() : null;
        const completedByProfileId = status === "pending" ? null : profileId;
        const result = await pool.query(
          `UPDATE events SET status = $1, completed_at = $2, completed_by_profile_id = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $4 AND patient_id IN (SELECT id FROM patients WHERE user_id = $5)
       AND (completed_by_profile_id IS NULL OR completed_by_profile_id = $6)
     RETURNING id, status, completed_at AS "completedAt", completed_by_profile_id AS "completedByProfileId"`,
          [status, completedAt, completedByProfileId, id, userId, profileId]
        );
        return result.rows[0] ?? null;
      }
      async function findById(id, userId) {
        const result = await pool.query(
          `SELECT e.id, e.status, e.completed_at AS "completedAt",
       e.completed_by_profile_id AS "completedByProfileId", cp.name AS "completedByProfileName"
     FROM events e
     LEFT JOIN caregiver_profiles cp ON cp.id = e.completed_by_profile_id
     WHERE e.id = $1 AND e.patient_id IN (SELECT id FROM patients WHERE user_id = $2)`,
          [id, userId]
        );
        return result.rows[0] ?? null;
      }
      async function getMissed(date, patientId, userId) {
        const result = await pool.query(
          `SELECT e.id, e.title, to_char(e.event_time, 'HH24:MI') AS time,
       shift."onDutyProfileName"
     FROM events e
     LEFT JOIN LATERAL (
       SELECT cp.name AS "onDutyProfileName"
       FROM schedule_shifts ss
       JOIN caregiver_profiles cp ON cp.id = ss.profile_id
       WHERE ss.user_id = $3
         AND ss.scheduled_start_at <= ($1::text || ' ' || to_char(e.event_time, 'HH24:MI'))::timestamp
         AND ss.scheduled_end_at > ($1::text || ' ' || to_char(e.event_time, 'HH24:MI'))::timestamp
       ORDER BY ss.scheduled_start_at DESC
       LIMIT 1
     ) shift ON TRUE
     WHERE e.event_date = $1::date AND e.status = 'pending'
       AND e.patient_id = $2
       AND e.patient_id IN (SELECT id FROM patients WHERE user_id = $3)
     ORDER BY e.event_time, e.title`,
          [date, patientId, userId]
        );
        return result.rows;
      }
      module.exports = Object.freeze({
        create,
        createMany,
        findById,
        getAll,
        getDaily,
        getMissed,
        getUpcoming,
        patientBelongsToUser,
        remove,
        setStatus,
        update
      });
    }
  });

  // ../Loryscare/backend/src/routes/events-routes.js
  var require_events_routes = __commonJS({
    "../Loryscare/backend/src/routes/events-routes.js"(exports, module) {
      var { Router } = require_express();
      function createEventsRouter(controller) {
        const router = Router();
        router.get("/daily", controller.getDaily);
        router.get("/missed", controller.getMissed);
        router.get("/upcoming", controller.getUpcoming);
        router.get("/", controller.getAll);
        router.post("/", controller.create);
        router.put("/:id", controller.update);
        router.delete("/:id", controller.remove);
        router.patch("/:id/status", controller.setStatus);
        return router;
      }
      module.exports = createEventsRouter;
    }
  });

  // ../Loryscare/backend/src/services/events-service.js
  var require_events_service = __commonJS({
    "../Loryscare/backend/src/services/events-service.js"(exports, module) {
      var EventCompletionConflictError = require_event_completion_conflict_error();
      var EventNotFoundError = require_event_not_found_error();
      var EventValidationError = require_event_validation_error();
      function isDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [year, month, day] = value.split("-").map(Number);
        const parsed = new Date(Date.UTC(year, month - 1, day));
        return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
      }
      function validateId(value, field = "id") {
        if (!/^\d+$/.test(String(value ?? "")) || value === "0") {
          throw new EventValidationError({ [field]: "Identificador inv\xE1lido" });
        }
      }
      function validateEvent(input, editing = false) {
        const details = {};
        const title = typeof input.title === "string" ? input.title.trim() : "";
        const category = typeof input.category === "string" ? input.category.trim() : "";
        const eventTime = typeof input.eventTime === "string" ? input.eventTime.trim() : "";
        const notes = typeof input.notes === "string" ? input.notes.trim() : "";
        const eventDate = typeof input.eventDate === "string" ? input.eventDate : "";
        const patientId = input.patientId;
        if (!title || title.length > 120) details.title = "Informe um t\xEDtulo com at\xE9 120 caracteres";
        if (category.length > 40) details.category = "Use no m\xE1ximo 40 caracteres";
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(eventTime)) details.eventTime = "Informe um hor\xE1rio v\xE1lido";
        if (notes.length > 500) details.notes = "Use no m\xE1ximo 500 caracteres";
        if (!isDate(eventDate)) details.eventDate = "Informe uma data v\xE1lida";
        if (!editing && !/^\d+$/.test(String(patientId ?? ""))) details.patientId = "Selecione um paciente";
        if (Object.keys(details).length) throw new EventValidationError(details);
        const important = input.important !== false;
        return { title, category: category || null, eventDate, eventTime, notes: notes || null, patientId, important };
      }
      function recurringDates(start, end, weekdays) {
        const dates = [];
        const cursor = /* @__PURE__ */ new Date(`${start}T00:00:00Z`);
        const last = /* @__PURE__ */ new Date(`${end}T00:00:00Z`);
        while (cursor <= last) {
          if (weekdays.has(cursor.getUTCDay())) dates.push(cursor.toISOString().slice(0, 10));
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        return dates;
      }
      function createEventsService(repository) {
        async function getAll(patientId, userId, range) {
          validateId(patientId, "patientId");
          return repository.getAll(patientId, userId, range);
        }
        async function create(input, userId, profileId) {
          const source = input ?? {};
          const event = { ...validateEvent(source), authorProfileId: profileId ?? null };
          if (!await repository.patientBelongsToUser(event.patientId, userId)) {
            throw new EventValidationError({ patientId: "Paciente n\xE3o encontrado" });
          }
          if (!source.repeatWeekly) return { id: await repository.create(event) };
          const repeatUntil = typeof source.repeatUntil === "string" ? source.repeatUntil : "";
          const weekdays = new Set(Array.isArray(source.repeatWeekdays) ? source.repeatWeekdays.map(Number) : []);
          const maxDate = /* @__PURE__ */ new Date(`${event.eventDate}T00:00:00Z`);
          maxDate.setUTCFullYear(maxDate.getUTCFullYear() + 1);
          if (!isDate(repeatUntil) || repeatUntil < event.eventDate || /* @__PURE__ */ new Date(`${repeatUntil}T00:00:00Z`) > maxDate) {
            throw new EventValidationError({ repeatUntil: "Informe uma data final entre a data inicial e um ano" });
          }
          if (!weekdays.size || [...weekdays].some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
            throw new EventValidationError({ repeatWeekdays: "Selecione pelo menos um dia da semana" });
          }
          const dates = recurringDates(event.eventDate, repeatUntil, weekdays);
          if (!dates.length) throw new EventValidationError({ repeatWeekdays: "Nenhuma ocorr\xEAncia encontrada no per\xEDodo" });
          const ids = await repository.createMany(dates.map((eventDate) => ({ ...event, eventDate })));
          return { ids, count: ids.length };
        }
        async function update(id, input, userId) {
          validateId(id);
          if (!await repository.update(id, validateEvent(input ?? {}, true), userId)) throw new EventNotFoundError();
        }
        async function remove(id, userId) {
          validateId(id);
          if (!await repository.remove(id, userId)) throw new EventNotFoundError();
        }
        async function getDaily(date, patientId, userId) {
          if (!isDate(date)) throw new EventValidationError({ date: "Informe uma data v\xE1lida" });
          validateId(patientId, "patientId");
          return repository.getDaily(date, patientId, userId);
        }
        async function getUpcoming(patientId, userId, days) {
          validateId(patientId, "patientId");
          const parsedDays = Number(days);
          if (!Number.isInteger(parsedDays) || parsedDays < 0 || parsedDays > 365) {
            throw new EventValidationError({ days: "Informe um n\xFAmero de dias v\xE1lido" });
          }
          return repository.getUpcoming(patientId, userId, parsedDays);
        }
        async function setStatus(id, input, userId, profileId) {
          validateId(id);
          const status = input.status;
          if (!(/* @__PURE__ */ new Set(["completed", "skipped", "pending"])).has(status)) throw new EventValidationError({ status: "Status inv\xE1lido" });
          const result = await repository.setStatus(id, status, userId, profileId ?? null);
          if (result) return result;
          const existing = await repository.findById(id, userId);
          if (!existing) throw new EventNotFoundError();
          throw new EventCompletionConflictError({
            authorProfileName: existing.completedByProfileName,
            completedAt: existing.completedAt
          });
        }
        function yesterday() {
          const date = /* @__PURE__ */ new Date();
          date.setDate(date.getDate() - 1);
          const pad = (value) => String(value).padStart(2, "0");
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        }
        async function getMissed(patientId, userId) {
          validateId(patientId, "patientId");
          return repository.getMissed(yesterday(), patientId, userId);
        }
        return Object.freeze({ create, getAll, getDaily, getMissed, getUpcoming, remove, setStatus, update });
      }
      module.exports = createEventsService;
    }
  });

  // ../Loryscare/backend/src/errors/nursing-note-not-found-error.js
  var require_nursing_note_not_found_error = __commonJS({
    "../Loryscare/backend/src/errors/nursing-note-not-found-error.js"(exports, module) {
      var NursingNoteNotFoundError = class extends Error {
        constructor(message = "Anota\xE7\xE3o n\xE3o encontrada") {
          super(message);
          this.name = "NursingNoteNotFoundError";
        }
      };
      module.exports = NursingNoteNotFoundError;
    }
  });

  // ../Loryscare/backend/src/errors/nursing-note-validation-error.js
  var require_nursing_note_validation_error = __commonJS({
    "../Loryscare/backend/src/errors/nursing-note-validation-error.js"(exports, module) {
      var NursingNoteValidationError = class extends Error {
        constructor(details) {
          super("Dados da anota\xE7\xE3o inv\xE1lidos");
          this.name = "NursingNoteValidationError";
          this.details = details;
        }
      };
      module.exports = NursingNoteValidationError;
    }
  });

  // ../Loryscare/backend/src/errors/nursing-note-ownership-error.js
  var require_nursing_note_ownership_error = __commonJS({
    "../Loryscare/backend/src/errors/nursing-note-ownership-error.js"(exports, module) {
      var NursingNoteOwnershipError = class extends Error {
        constructor(message = "S\xF3 quem registrou esta anota\xE7\xE3o pode edit\xE1-la") {
          super(message);
          this.name = "NursingNoteOwnershipError";
        }
      };
      module.exports = NursingNoteOwnershipError;
    }
  });

  // ../Loryscare/backend/src/errors/nursing-note-shift-conflict-error.js
  var require_nursing_note_shift_conflict_error = __commonJS({
    "../Loryscare/backend/src/errors/nursing-note-shift-conflict-error.js"(exports, module) {
      var NursingNoteShiftConflictError = class extends Error {
        constructor(message = "Este hor\xE1rio pertence ao plant\xE3o de outro cuidador") {
          super(message);
          this.name = "NursingNoteShiftConflictError";
        }
      };
      module.exports = NursingNoteShiftConflictError;
    }
  });

  // ../Loryscare/backend/src/controllers/nursing-notes-controller.js
  var require_nursing_notes_controller = __commonJS({
    "../Loryscare/backend/src/controllers/nursing-notes-controller.js"(exports, module) {
      var NursingNoteNotFoundError = require_nursing_note_not_found_error();
      var NursingNoteValidationError = require_nursing_note_validation_error();
      var NursingNoteOwnershipError = require_nursing_note_ownership_error();
      var NursingNoteShiftConflictError = require_nursing_note_shift_conflict_error();
      function handle(error, response, next) {
        if (error instanceof NursingNoteValidationError) response.status(400).json({ error: error.message, details: error.details });
        else if (error instanceof NursingNoteNotFoundError) response.status(404).json({ error: error.message });
        else if (error instanceof NursingNoteOwnershipError) response.status(403).json({ error: error.message });
        else if (error instanceof NursingNoteShiftConflictError) response.status(403).json({ error: error.message });
        else next(error);
      }
      function createNursingNotesController(service, changeBus) {
        const action = (callback) => async (request, response, next) => {
          try {
            await callback(request, response);
          } catch (error) {
            handle(error, response, next);
          }
        };
        return Object.freeze({
          getAll: action(async (request, response) => response.json({
            data: await service.getAll(request.query.patientId, request.userId, {
              date: request.query.date,
              shift: request.query.shift
            })
          })),
          create: action(async (request, response) => {
            const data = await service.create(request.body, request.userId, request.profileId);
            changeBus.publish(request.userId, { resource: "nursing-notes", action: "created" });
            response.status(201).json({ data });
          }),
          update: action(async (request, response) => {
            await service.update(request.params.id, request.body, request.userId, request.profileId);
            changeBus.publish(request.userId, { resource: "nursing-notes", action: "updated" });
            response.status(204).send();
          }),
          remove: action(async (request, response) => {
            await service.remove(request.params.id, request.userId);
            changeBus.publish(request.userId, { resource: "nursing-notes", action: "removed" });
            response.status(204).send();
          })
        });
      }
      module.exports = createNursingNotesController;
    }
  });

  // ../Loryscare/backend/src/repositories/nursing-notes-repository.js
  var require_nursing_notes_repository = __commonJS({
    "../Loryscare/backend/src/repositories/nursing-notes-repository.js"(exports, module) {
      var pool = require_database();
      async function getAll(patientId, userId, { date, shift } = {}) {
        const result = await pool.query(
          `
    SELECT n.id, to_char(n.note_date, 'YYYY-MM-DD') AS "noteDate",
      to_char(n.note_time, 'HH24:MI') AS "noteTime", n.shift,
      n.author_name AS "authorName", n.author_profile_id AS "authorProfileId",
      cp.name AS "authorProfileName", n.note_text AS "noteText",
      n.is_highlighted AS "isHighlighted", n.created_at AS "createdAt", n.updated_at AS "updatedAt"
    FROM nursing_notes n
    LEFT JOIN caregiver_profiles cp ON cp.id = n.author_profile_id
    WHERE n.patient_id = $1 AND n.patient_id IN (SELECT id FROM patients WHERE user_id = $2)
      AND ($3::date IS NULL OR n.note_date = $3)
      AND ($4::varchar IS NULL OR n.shift = $4)
    ORDER BY n.note_date DESC, n.note_time DESC`,
          [patientId, userId, date, shift]
        );
        return result.rows;
      }
      async function patientBelongsToUser(patientId, userId) {
        const result = await pool.query("SELECT 1 FROM patients WHERE id = $1 AND user_id = $2", [patientId, userId]);
        return result.rowCount > 0;
      }
      async function create(note) {
        const result = await pool.query(
          `INSERT INTO nursing_notes (note_date, note_time, shift, author_name, author_profile_id, note_text, is_highlighted, patient_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [note.noteDate, note.noteTime, note.shift, note.authorName, note.authorProfileId, note.noteText, note.isHighlighted, note.patientId]
        );
        return result.rows[0].id;
      }
      async function update(id, note, userId) {
        const result = await pool.query(
          `UPDATE nursing_notes SET note_date = $1, note_time = $2, shift = $3,
      note_text = $4, is_highlighted = $5, updated_at = CURRENT_TIMESTAMP
     WHERE id = $6 AND patient_id IN (SELECT id FROM patients WHERE user_id = $7) RETURNING id`,
          [note.noteDate, note.noteTime, note.shift, note.noteText, note.isHighlighted, id, userId]
        );
        return result.rowCount > 0;
      }
      async function findById(id, userId) {
        const result = await pool.query(
          `SELECT id, author_profile_id AS "authorProfileId"
     FROM nursing_notes
     WHERE id = $1 AND patient_id IN (SELECT id FROM patients WHERE user_id = $2)`,
          [id, userId]
        );
        return result.rows[0] ?? null;
      }
      async function remove(id, userId) {
        const result = await pool.query(
          "DELETE FROM nursing_notes WHERE id = $1 AND patient_id IN (SELECT id FROM patients WHERE user_id = $2) RETURNING id",
          [id, userId]
        );
        return result.rowCount > 0;
      }
      module.exports = Object.freeze({ create, findById, getAll, patientBelongsToUser, remove, update });
    }
  });

  // ../Loryscare/backend/src/routes/nursing-notes-routes.js
  var require_nursing_notes_routes = __commonJS({
    "../Loryscare/backend/src/routes/nursing-notes-routes.js"(exports, module) {
      var { Router } = require_express();
      function createNursingNotesRouter(controller) {
        const router = Router();
        router.get("/", controller.getAll);
        router.post("/", controller.create);
        router.put("/:id", controller.update);
        router.delete("/:id", controller.remove);
        return router;
      }
      module.exports = createNursingNotesRouter;
    }
  });

  // ../Loryscare/backend/src/services/nursing-notes-service.js
  var require_nursing_notes_service = __commonJS({
    "../Loryscare/backend/src/services/nursing-notes-service.js"(exports, module) {
      var NursingNoteNotFoundError = require_nursing_note_not_found_error();
      var NursingNoteValidationError = require_nursing_note_validation_error();
      var NursingNoteOwnershipError = require_nursing_note_ownership_error();
      var NursingNoteShiftConflictError = require_nursing_note_shift_conflict_error();
      var VALID_SHIFTS = /* @__PURE__ */ new Set(["Manh\xE3", "Tarde", "Noite", "Madrugada"]);
      function isDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [year, month, day] = value.split("-").map(Number);
        const parsed = new Date(Date.UTC(year, month - 1, day));
        return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
      }
      function validateId(value, field = "id") {
        if (!/^\d+$/.test(String(value ?? "")) || value === "0") {
          throw new NursingNoteValidationError({ [field]: "Identificador inv\xE1lido" });
        }
      }
      function validateNote(input, editing = false) {
        const details = {};
        const noteDate = typeof input.noteDate === "string" ? input.noteDate : "";
        const noteTime = typeof input.noteTime === "string" ? input.noteTime.trim() : "";
        const shift = typeof input.shift === "string" ? input.shift.trim() : "";
        const noteText = typeof input.noteText === "string" ? input.noteText.trim() : "";
        const patientId = input.patientId;
        if (!isDate(noteDate)) details.noteDate = "Informe uma data v\xE1lida";
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(noteTime)) details.noteTime = "Informe um hor\xE1rio v\xE1lido";
        if (!VALID_SHIFTS.has(shift)) details.shift = "Informe um turno v\xE1lido";
        if (!noteText || noteText.length > 2e3) details.noteText = "Informe o texto da evolu\xE7\xE3o com at\xE9 2000 caracteres";
        if (!editing && !/^\d+$/.test(String(patientId ?? ""))) details.patientId = "Selecione um paciente";
        if (Object.keys(details).length) throw new NursingNoteValidationError(details);
        return { noteDate, noteTime, shift, noteText, patientId, isHighlighted: Boolean(input.isHighlighted) };
      }
      function createNursingNotesService(repository, workShiftsRepository) {
        async function checkShift(note, userId, profileId) {
          if (!profileId || !workShiftsRepository) return;
          const eventAt = `${note.noteDate} ${note.noteTime}:00`;
          const covering = await workShiftsRepository.findCovering(userId, eventAt);
          if (covering && String(covering.profileId) !== String(profileId)) {
            throw new NursingNoteShiftConflictError(
              `Este hor\xE1rio pertence ao plant\xE3o de ${covering.profileName} (${covering.startedTime}\u2013${covering.endTime})`
            );
          }
        }
        async function create(input, userId, profileId) {
          const note = { ...validateNote(input ?? {}), authorName: null, authorProfileId: profileId ?? null };
          if (!await repository.patientBelongsToUser(note.patientId, userId)) {
            throw new NursingNoteValidationError({ patientId: "Paciente n\xE3o encontrado" });
          }
          await checkShift(note, userId, profileId);
          return { id: await repository.create(note) };
        }
        async function getAll(patientId, userId, { date, shift } = {}) {
          validateId(patientId, "patientId");
          if (date && !isDate(date)) throw new NursingNoteValidationError({ date: "Informe uma data v\xE1lida" });
          if (shift && !VALID_SHIFTS.has(shift)) throw new NursingNoteValidationError({ shift: "Informe um turno v\xE1lido" });
          return repository.getAll(patientId, userId, { date: date || null, shift: shift || null });
        }
        async function update(id, input, userId, profileId) {
          validateId(id);
          const existing = await repository.findById(id, userId);
          if (!existing) throw new NursingNoteNotFoundError();
          if (existing.authorProfileId != null && String(existing.authorProfileId) !== String(profileId ?? "")) {
            throw new NursingNoteOwnershipError();
          }
          const note = validateNote(input ?? {}, true);
          await checkShift(note, userId, profileId);
          if (!await repository.update(id, note, userId)) throw new NursingNoteNotFoundError();
        }
        async function remove(id, userId) {
          validateId(id);
          if (!await repository.remove(id, userId)) throw new NursingNoteNotFoundError();
        }
        return Object.freeze({ create, getAll, remove, update });
      }
      module.exports = createNursingNotesService;
    }
  });

  // ../Loryscare/backend/src/errors/patient-not-found-error.js
  var require_patient_not_found_error = __commonJS({
    "../Loryscare/backend/src/errors/patient-not-found-error.js"(exports, module) {
      var PatientNotFoundError = class extends Error {
        constructor(message = "Paciente n\xE3o encontrado") {
          super(message);
          this.name = "PatientNotFoundError";
        }
      };
      module.exports = PatientNotFoundError;
    }
  });

  // ../Loryscare/backend/src/errors/patient-validation-error.js
  var require_patient_validation_error = __commonJS({
    "../Loryscare/backend/src/errors/patient-validation-error.js"(exports, module) {
      var PatientValidationError = class extends Error {
        constructor(details) {
          super("Dados do paciente inv\xE1lidos");
          this.name = "PatientValidationError";
          this.details = details;
        }
      };
      module.exports = PatientValidationError;
    }
  });

  // ../Loryscare/backend/src/controllers/patients-controller.js
  var require_patients_controller = __commonJS({
    "../Loryscare/backend/src/controllers/patients-controller.js"(exports, module) {
      var PatientNotFoundError = require_patient_not_found_error();
      var PatientValidationError = require_patient_validation_error();
      function handle(error, response, next) {
        if (error instanceof PatientValidationError) response.status(400).json({ error: error.message, details: error.details });
        else if (error instanceof PatientNotFoundError) response.status(404).json({ error: error.message });
        else next(error);
      }
      function createPatientsController(service) {
        const action = (callback) => async (request, response, next) => {
          try {
            await callback(request, response);
          } catch (error) {
            handle(error, response, next);
          }
        };
        return Object.freeze({
          getAll: action(async (request, response) => response.json({ data: await service.getAll(request.userId) })),
          getById: action(async (request, response) => response.json({ data: await service.getById(request.params.id, request.userId) })),
          create: action(async (request, response) => response.status(201).json({ data: await service.create(request.body, request.userId) })),
          update: action(async (request, response) => {
            await service.update(request.params.id, request.body, request.userId);
            response.status(204).send();
          }),
          remove: action(async (request, response) => {
            await service.remove(request.params.id, request.userId);
            response.status(204).send();
          })
        });
      }
      module.exports = createPatientsController;
    }
  });

  // ../Loryscare/backend/src/repositories/patients-repository.js
  var require_patients_repository = __commonJS({
    "../Loryscare/backend/src/repositories/patients-repository.js"(exports, module) {
      var pool = require_database();
      var RETURNING_FIELDS = `
  id,
  full_name AS "fullName",
  to_char(birth_date, 'YYYY-MM-DD') AS "birthDate",
  sex,
  cpf,
  health_card_number AS "healthCardNumber",
  health_insurance AS "healthInsurance",
  phone,
  address,
  emergency_contact_name AS "emergencyContactName",
  emergency_contact_relationship AS "emergencyContactRelationship",
  emergency_contact_phone AS "emergencyContactPhone",
  responsible_name AS "responsibleName",
  responsible_phone AS "responsiblePhone",
  blood_type AS "bloodType",
  allergies,
  chronic_conditions AS "chronicConditions",
  surgical_history AS "surgicalHistory",
  mobility,
  dietary_restrictions AS "dietaryRestrictions",
  current_medications_notes AS "currentMedicationsNotes",
  doctor_name AS "doctorName",
  doctor_specialty AS "doctorSpecialty",
  doctor_phone AS "doctorPhone",
  care_plan_notes AS "carePlanNotes",
  is_active AS "isActive"
`;
      var FIELDS = [
        "fullName",
        "birthDate",
        "sex",
        "cpf",
        "healthCardNumber",
        "healthInsurance",
        "phone",
        "address",
        "emergencyContactName",
        "emergencyContactRelationship",
        "emergencyContactPhone",
        "responsibleName",
        "responsiblePhone",
        "bloodType",
        "allergies",
        "chronicConditions",
        "surgicalHistory",
        "mobility",
        "dietaryRestrictions",
        "currentMedicationsNotes",
        "doctorName",
        "doctorSpecialty",
        "doctorPhone",
        "carePlanNotes"
      ];
      var COLUMNS = [
        "full_name",
        "birth_date",
        "sex",
        "cpf",
        "health_card_number",
        "health_insurance",
        "phone",
        "address",
        "emergency_contact_name",
        "emergency_contact_relationship",
        "emergency_contact_phone",
        "responsible_name",
        "responsible_phone",
        "blood_type",
        "allergies",
        "chronic_conditions",
        "surgical_history",
        "mobility",
        "dietary_restrictions",
        "current_medications_notes",
        "doctor_name",
        "doctor_specialty",
        "doctor_phone",
        "care_plan_notes"
      ];
      async function getAll(userId) {
        const result = await pool.query(
          `
    SELECT ${RETURNING_FIELDS}
    FROM patients
    WHERE user_id = $1
    ORDER BY is_active DESC, full_name`,
          [userId]
        );
        return result.rows;
      }
      async function getById(id, userId) {
        const result = await pool.query(
          `SELECT ${RETURNING_FIELDS} FROM patients WHERE id = $1 AND user_id = $2`,
          [id, userId]
        );
        return result.rows[0] ?? null;
      }
      async function create(patient, userId) {
        const values = FIELDS.map((field) => patient[field]);
        const placeholders = COLUMNS.map((_, index) => `$${index + 1}`).join(", ");
        const result = await pool.query(
          `INSERT INTO patients (${COLUMNS.join(", ")}, user_id) VALUES (${placeholders}, $${COLUMNS.length + 1}) RETURNING id`,
          [...values, userId]
        );
        return result.rows[0].id;
      }
      async function update(id, patient, userId) {
        const assignments = COLUMNS.map((column, index) => `${column} = $${index + 1}`).join(", ");
        const values = FIELDS.map((field) => patient[field]);
        const result = await pool.query(
          `UPDATE patients SET ${assignments}, is_active = $${COLUMNS.length + 1}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${COLUMNS.length + 2} AND user_id = $${COLUMNS.length + 3} RETURNING id`,
          [...values, patient.isActive, id, userId]
        );
        return result.rowCount > 0;
      }
      async function remove(id, userId) {
        const result = await pool.query(
          "DELETE FROM patients WHERE id = $1 AND user_id = $2 RETURNING id",
          [id, userId]
        );
        return result.rowCount > 0;
      }
      module.exports = Object.freeze({ create, getAll, getById, remove, update });
    }
  });

  // ../Loryscare/backend/src/routes/patients-routes.js
  var require_patients_routes = __commonJS({
    "../Loryscare/backend/src/routes/patients-routes.js"(exports, module) {
      var { Router } = require_express();
      function createPatientsRouter(controller) {
        const router = Router();
        router.get("/", controller.getAll);
        router.get("/:id", controller.getById);
        router.post("/", controller.create);
        router.put("/:id", controller.update);
        router.delete("/:id", controller.remove);
        return router;
      }
      module.exports = createPatientsRouter;
    }
  });

  // ../Loryscare/backend/src/services/patients-service.js
  var require_patients_service = __commonJS({
    "../Loryscare/backend/src/services/patients-service.js"(exports, module) {
      var PatientNotFoundError = require_patient_not_found_error();
      var PatientValidationError = require_patient_validation_error();
      var SEX_OPTIONS = /* @__PURE__ */ new Set(["Feminino", "Masculino", "Outro"]);
      var MOBILITY_OPTIONS = /* @__PURE__ */ new Set(["Independente", "Com aux\xEDlio", "Cadeirante", "Acamado"]);
      var OPTIONAL_TEXT_FIELDS = [
        ["sex", 20],
        ["cpf", 20],
        ["healthCardNumber", 40],
        ["healthInsurance", 120],
        ["phone", 30],
        ["address", 255],
        ["emergencyContactName", 120],
        ["emergencyContactRelationship", 60],
        ["emergencyContactPhone", 30],
        ["responsibleName", 120],
        ["responsiblePhone", 30],
        ["bloodType", 5],
        ["allergies", 500],
        ["chronicConditions", 1e3],
        ["surgicalHistory", 1e3],
        ["mobility", 30],
        ["dietaryRestrictions", 500],
        ["currentMedicationsNotes", 1e3],
        ["doctorName", 120],
        ["doctorSpecialty", 120],
        ["doctorPhone", 30],
        ["carePlanNotes", 1e3]
      ];
      function isDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [year, month, day] = value.split("-").map(Number);
        const parsed = new Date(Date.UTC(year, month - 1, day));
        return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
      }
      function validateId(value, field = "id") {
        if (!/^\d+$/.test(value) || value === "0") {
          throw new PatientValidationError({ [field]: "Identificador inv\xE1lido" });
        }
      }
      function validatePatient(input, editing = false) {
        const details = {};
        const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
        const birthDate = typeof input.birthDate === "string" ? input.birthDate : "";
        if (!fullName || fullName.length > 150) details.fullName = "Informe um nome com at\xE9 150 caracteres";
        if (!isDate(birthDate)) details.birthDate = "Informe uma data de nascimento v\xE1lida";
        else if (birthDate > (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) details.birthDate = "A data de nascimento n\xE3o pode ser futura";
        const patient = { fullName, birthDate };
        for (const [field, maxLength] of OPTIONAL_TEXT_FIELDS) {
          const value = typeof input[field] === "string" ? input[field].trim() : "";
          if (value.length > maxLength) details[field] = `Use no m\xE1ximo ${maxLength} caracteres`;
          patient[field] = value || null;
        }
        if (patient.sex && !SEX_OPTIONS.has(patient.sex)) details.sex = "Selecione uma op\xE7\xE3o v\xE1lida";
        if (patient.mobility && !MOBILITY_OPTIONS.has(patient.mobility)) details.mobility = "Selecione uma op\xE7\xE3o v\xE1lida";
        if (Object.keys(details).length) throw new PatientValidationError(details);
        patient.isActive = editing ? input.isActive !== false : true;
        return patient;
      }
      function createPatientsService(repository) {
        async function getAll(userId) {
          return repository.getAll(userId);
        }
        async function getById(id, userId) {
          validateId(id);
          const patient = await repository.getById(id, userId);
          if (!patient) throw new PatientNotFoundError();
          return patient;
        }
        async function create(input, userId) {
          return { id: await repository.create(validatePatient(input ?? {}), userId) };
        }
        async function update(id, input, userId) {
          validateId(id);
          if (!await repository.update(id, validatePatient(input ?? {}, true), userId)) throw new PatientNotFoundError();
        }
        async function remove(id, userId) {
          validateId(id);
          if (!await repository.remove(id, userId)) throw new PatientNotFoundError();
        }
        return Object.freeze({ create, getAll, getById, remove, update });
      }
      module.exports = createPatientsService;
    }
  });

  // ../Loryscare/backend/src/errors/auth-validation-error.js
  var require_auth_validation_error = __commonJS({
    "../Loryscare/backend/src/errors/auth-validation-error.js"(exports, module) {
      var AuthValidationError = class extends Error {
        constructor(details) {
          super("Dados de cadastro inv\xE1lidos");
          this.name = "AuthValidationError";
          this.details = details;
        }
      };
      module.exports = AuthValidationError;
    }
  });

  // ../Loryscare/backend/src/errors/auth-authentication-error.js
  var require_auth_authentication_error = __commonJS({
    "../Loryscare/backend/src/errors/auth-authentication-error.js"(exports, module) {
      var AuthenticationError = class extends Error {
        constructor(message = "Credenciais inv\xE1lidas") {
          super(message);
          this.name = "AuthenticationError";
        }
      };
      module.exports = AuthenticationError;
    }
  });

  // ../Loryscare/backend/src/controllers/auth-controller.js
  var require_auth_controller = __commonJS({
    "../Loryscare/backend/src/controllers/auth-controller.js"(exports, module) {
      var AuthValidationError = require_auth_validation_error();
      var AuthenticationError = require_auth_authentication_error();
      function handle(error, response, next) {
        if (error instanceof AuthValidationError) response.status(400).json({ error: error.message, details: error.details });
        else if (error instanceof AuthenticationError) response.status(401).json({ error: error.message });
        else next(error);
      }
      function createAuthController(service) {
        const action = (callback) => async (request, response, next) => {
          try {
            await callback(request, response);
          } catch (error) {
            handle(error, response, next);
          }
        };
        return Object.freeze({
          signUp: action(async (request, response) => response.status(201).json({ data: await service.signUp(request.body) })),
          logIn: action(async (request, response) => response.json({ data: await service.logIn(request.body) })),
          getProfile: action(async (request, response) => response.json({ data: await service.getProfile(request.userId) })),
          updateProfile: action(async (request, response) => response.json({ data: await service.updateProfile(request.userId, request.body) })),
          changePassword: action(async (request, response) => {
            await service.changePassword(request.userId, request.body);
            response.status(204).send();
          }),
          updateAvatar: action(async (request, response) => response.json({ data: await service.updateAvatar(request.userId, request.body.avatarData) }))
        });
      }
      module.exports = createAuthController;
    }
  });

  // ../Loryscare/backend/src/repositories/users-repository.js
  var require_users_repository = __commonJS({
    "../Loryscare/backend/src/repositories/users-repository.js"(exports, module) {
      var pool = require_database();
      var PUBLIC_FIELDS = `id, name, email, phone, avatar_data AS "avatarData"`;
      async function findByEmail(email) {
        const result = await pool.query(
          `SELECT id, name, email, password_hash AS "passwordHash" FROM users WHERE LOWER(email) = LOWER($1)`,
          [email]
        );
        return result.rows[0] ?? null;
      }
      async function create(user) {
        const result = await pool.query(
          `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING ${PUBLIC_FIELDS}`,
          [user.name, user.email, user.passwordHash]
        );
        return result.rows[0];
      }
      async function getById(id) {
        const result = await pool.query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`, [id]);
        return result.rows[0] ?? null;
      }
      async function getPasswordHash(id) {
        const result = await pool.query(`SELECT password_hash AS "passwordHash" FROM users WHERE id = $1`, [id]);
        return result.rows[0] ?? null;
      }
      async function updateProfile(id, profile) {
        const result = await pool.query(
          `UPDATE users SET name = $1, email = $2, phone = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $4 RETURNING ${PUBLIC_FIELDS}`,
          [profile.name, profile.email, profile.phone, id]
        );
        return result.rows[0] ?? null;
      }
      async function updatePassword(id, passwordHash) {
        await pool.query(
          `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [passwordHash, id]
        );
      }
      async function updateAvatar(id, avatarData) {
        const result = await pool.query(
          `UPDATE users SET avatar_data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING ${PUBLIC_FIELDS}`,
          [avatarData, id]
        );
        return result.rows[0] ?? null;
      }
      module.exports = Object.freeze({
        create,
        findByEmail,
        getById,
        getPasswordHash,
        updateAvatar,
        updatePassword,
        updateProfile
      });
    }
  });

  // ../Loryscare/backend/src/middleware/auth-rate-limit.js
  var require_auth_rate_limit = __commonJS({
    "../Loryscare/backend/src/middleware/auth-rate-limit.js"(exports, module) {
      var rateLimit = require_passa();
      var authRateLimit = rateLimit({
        windowMs: 15 * 60 * 1e3,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }
      });
      module.exports = authRateLimit;
    }
  });

  // ../Loryscare/backend/src/routes/auth-routes.js
  var require_auth_routes = __commonJS({
    "../Loryscare/backend/src/routes/auth-routes.js"(exports, module) {
      var { Router } = require_express();
      var authRateLimit = require_auth_rate_limit();
      function createAuthRouter(controller, requireAuth) {
        const router = Router();
        router.post("/signup", authRateLimit, controller.signUp);
        router.post("/login", authRateLimit, controller.logIn);
        router.get("/profile", requireAuth, controller.getProfile);
        router.put("/profile", requireAuth, controller.updateProfile);
        router.put("/profile/password", requireAuth, controller.changePassword);
        router.put("/profile/avatar", requireAuth, controller.updateAvatar);
        return router;
      }
      module.exports = createAuthRouter;
    }
  });

  // (disabled):crypto
  var require_crypto = __commonJS({
    "(disabled):crypto"() {
    }
  });

  // node_modules/bcryptjs/umd/index.js
  var require_umd = __commonJS({
    "node_modules/bcryptjs/umd/index.js"(exports, module) {
      (function(global, factory) {
        function preferDefault(exports2) {
          return exports2.default || exports2;
        }
        if (typeof define === "function" && define.amd) {
          define(["crypto"], function(_crypto) {
            var exports2 = {};
            factory(exports2, _crypto);
            return preferDefault(exports2);
          });
        } else if (typeof exports === "object") {
          factory(exports, require_crypto());
          if (typeof module === "object") module.exports = preferDefault(exports);
        } else {
          (function() {
            var exports2 = {};
            factory(exports2, global.crypto);
            global.bcrypt = preferDefault(exports2);
          })();
        }
      })(
        typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : exports,
        function(_exports, _crypto) {
          "use strict";
          Object.defineProperty(_exports, "__esModule", {
            value: true
          });
          _exports.compare = compare;
          _exports.compareSync = compareSync;
          _exports.decodeBase64 = decodeBase64;
          _exports.default = void 0;
          _exports.encodeBase64 = encodeBase64;
          _exports.genSalt = genSalt;
          _exports.genSaltSync = genSaltSync;
          _exports.getRounds = getRounds;
          _exports.getSalt = getSalt;
          _exports.hash = hash;
          _exports.hashSync = hashSync;
          _exports.setRandomFallback = setRandomFallback;
          _exports.truncates = truncates;
          _crypto = _interopRequireDefault(_crypto);
          function _interopRequireDefault(e) {
            return e && e.__esModule ? e : { default: e };
          }
          var randomFallback = null;
          function randomBytes(len) {
            try {
              return crypto.getRandomValues(new Uint8Array(len));
            } catch {
            }
            try {
              return _crypto.default.randomBytes(len);
            } catch {
            }
            if (!randomFallback) {
              throw Error(
                "Neither WebCryptoAPI nor a crypto module is available. Use bcrypt.setRandomFallback to set an alternative"
              );
            }
            return randomFallback(len);
          }
          function setRandomFallback(random) {
            randomFallback = random;
          }
          function genSaltSync(rounds, seed_length) {
            rounds = rounds || GENSALT_DEFAULT_LOG2_ROUNDS;
            if (typeof rounds !== "number")
              throw Error(
                "Illegal arguments: " + typeof rounds + ", " + typeof seed_length
              );
            if (rounds < 4) rounds = 4;
            else if (rounds > 31) rounds = 31;
            var salt = [];
            salt.push("$2b$");
            if (rounds < 10) salt.push("0");
            salt.push(rounds.toString());
            salt.push("$");
            salt.push(base64_encode(randomBytes(BCRYPT_SALT_LEN), BCRYPT_SALT_LEN));
            return salt.join("");
          }
          function genSalt(rounds, seed_length, callback) {
            if (typeof seed_length === "function")
              callback = seed_length, seed_length = void 0;
            if (typeof rounds === "function")
              callback = rounds, rounds = void 0;
            if (typeof rounds === "undefined") rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
            else if (typeof rounds !== "number")
              throw Error("illegal arguments: " + typeof rounds);
            function _async(callback2) {
              nextTick(function() {
                try {
                  callback2(null, genSaltSync(rounds));
                } catch (err) {
                  callback2(err);
                }
              });
            }
            if (callback) {
              if (typeof callback !== "function")
                throw Error("Illegal callback: " + typeof callback);
              _async(callback);
            } else
              return new Promise(function(resolve, reject) {
                _async(function(err, res) {
                  if (err) {
                    reject(err);
                    return;
                  }
                  resolve(res);
                });
              });
          }
          function hashSync(password, salt) {
            if (typeof salt === "undefined") salt = GENSALT_DEFAULT_LOG2_ROUNDS;
            if (typeof salt === "number") salt = genSaltSync(salt);
            if (typeof password !== "string" || typeof salt !== "string")
              throw Error(
                "Illegal arguments: " + typeof password + ", " + typeof salt
              );
            return _hash(password, salt);
          }
          function hash(password, salt, callback, progressCallback) {
            function _async(callback2) {
              if (typeof password === "string" && typeof salt === "number")
                genSalt(salt, function(err, salt2) {
                  _hash(password, salt2, callback2, progressCallback);
                });
              else if (typeof password === "string" && typeof salt === "string")
                _hash(password, salt, callback2, progressCallback);
              else
                nextTick(
                  callback2.bind(
                    this,
                    Error(
                      "Illegal arguments: " + typeof password + ", " + typeof salt
                    )
                  )
                );
            }
            if (callback) {
              if (typeof callback !== "function")
                throw Error("Illegal callback: " + typeof callback);
              _async(callback);
            } else
              return new Promise(function(resolve, reject) {
                _async(function(err, res) {
                  if (err) {
                    reject(err);
                    return;
                  }
                  resolve(res);
                });
              });
          }
          function safeStringCompare(known, unknown) {
            var diff = known.length ^ unknown.length;
            for (var i = 0; i < known.length; ++i) {
              diff |= known.charCodeAt(i) ^ unknown.charCodeAt(i);
            }
            return diff === 0;
          }
          function compareSync(password, hash2) {
            if (typeof password !== "string" || typeof hash2 !== "string")
              throw Error(
                "Illegal arguments: " + typeof password + ", " + typeof hash2
              );
            if (hash2.length !== 60) return false;
            return safeStringCompare(
              hashSync(password, hash2.substring(0, hash2.length - 31)),
              hash2
            );
          }
          function compare(password, hashValue, callback, progressCallback) {
            function _async(callback2) {
              if (typeof password !== "string" || typeof hashValue !== "string") {
                nextTick(
                  callback2.bind(
                    this,
                    Error(
                      "Illegal arguments: " + typeof password + ", " + typeof hashValue
                    )
                  )
                );
                return;
              }
              if (hashValue.length !== 60) {
                nextTick(callback2.bind(this, null, false));
                return;
              }
              hash(
                password,
                hashValue.substring(0, 29),
                function(err, comp) {
                  if (err) callback2(err);
                  else callback2(null, safeStringCompare(comp, hashValue));
                },
                progressCallback
              );
            }
            if (callback) {
              if (typeof callback !== "function")
                throw Error("Illegal callback: " + typeof callback);
              _async(callback);
            } else
              return new Promise(function(resolve, reject) {
                _async(function(err, res) {
                  if (err) {
                    reject(err);
                    return;
                  }
                  resolve(res);
                });
              });
          }
          function getRounds(hash2) {
            if (typeof hash2 !== "string")
              throw Error("Illegal arguments: " + typeof hash2);
            return parseInt(hash2.split("$")[2], 10);
          }
          function getSalt(hash2) {
            if (typeof hash2 !== "string")
              throw Error("Illegal arguments: " + typeof hash2);
            if (hash2.length !== 60)
              throw Error("Illegal hash length: " + hash2.length + " != 60");
            return hash2.substring(0, 29);
          }
          function truncates(password) {
            if (typeof password !== "string")
              throw Error("Illegal arguments: " + typeof password);
            return utf8Length(password) > 72;
          }
          var nextTick = typeof setImmediate === "function" ? setImmediate : typeof scheduler === "object" && typeof scheduler.postTask === "function" ? scheduler.postTask.bind(scheduler) : setTimeout;
          function utf8Length(string) {
            var len = 0, c = 0;
            for (var i = 0; i < string.length; ++i) {
              c = string.charCodeAt(i);
              if (c < 128) len += 1;
              else if (c < 2048) len += 2;
              else if ((c & 64512) === 55296 && (string.charCodeAt(i + 1) & 64512) === 56320) {
                ++i;
                len += 4;
              } else len += 3;
            }
            return len;
          }
          function utf8Array(string) {
            var offset = 0, c1, c2;
            var buffer = new Array(utf8Length(string));
            for (var i = 0, k = string.length; i < k; ++i) {
              c1 = string.charCodeAt(i);
              if (c1 < 128) {
                buffer[offset++] = c1;
              } else if (c1 < 2048) {
                buffer[offset++] = c1 >> 6 | 192;
                buffer[offset++] = c1 & 63 | 128;
              } else if ((c1 & 64512) === 55296 && ((c2 = string.charCodeAt(i + 1)) & 64512) === 56320) {
                c1 = 65536 + ((c1 & 1023) << 10) + (c2 & 1023);
                ++i;
                buffer[offset++] = c1 >> 18 | 240;
                buffer[offset++] = c1 >> 12 & 63 | 128;
                buffer[offset++] = c1 >> 6 & 63 | 128;
                buffer[offset++] = c1 & 63 | 128;
              } else {
                buffer[offset++] = c1 >> 12 | 224;
                buffer[offset++] = c1 >> 6 & 63 | 128;
                buffer[offset++] = c1 & 63 | 128;
              }
            }
            return buffer;
          }
          var BASE64_CODE = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split(
            ""
          );
          var BASE64_INDEX = [
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            0,
            1,
            54,
            55,
            56,
            57,
            58,
            59,
            60,
            61,
            62,
            63,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
            14,
            15,
            16,
            17,
            18,
            19,
            20,
            21,
            22,
            23,
            24,
            25,
            26,
            27,
            -1,
            -1,
            -1,
            -1,
            -1,
            -1,
            28,
            29,
            30,
            31,
            32,
            33,
            34,
            35,
            36,
            37,
            38,
            39,
            40,
            41,
            42,
            43,
            44,
            45,
            46,
            47,
            48,
            49,
            50,
            51,
            52,
            53,
            -1,
            -1,
            -1,
            -1,
            -1
          ];
          function base64_encode(b, len) {
            var off = 0, rs = [], c1, c2;
            if (len <= 0 || len > b.length) throw Error("Illegal len: " + len);
            while (off < len) {
              c1 = b[off++] & 255;
              rs.push(BASE64_CODE[c1 >> 2 & 63]);
              c1 = (c1 & 3) << 4;
              if (off >= len) {
                rs.push(BASE64_CODE[c1 & 63]);
                break;
              }
              c2 = b[off++] & 255;
              c1 |= c2 >> 4 & 15;
              rs.push(BASE64_CODE[c1 & 63]);
              c1 = (c2 & 15) << 2;
              if (off >= len) {
                rs.push(BASE64_CODE[c1 & 63]);
                break;
              }
              c2 = b[off++] & 255;
              c1 |= c2 >> 6 & 3;
              rs.push(BASE64_CODE[c1 & 63]);
              rs.push(BASE64_CODE[c2 & 63]);
            }
            return rs.join("");
          }
          function base64_decode(s, len) {
            var off = 0, slen = s.length, olen = 0, rs = [], c1, c2, c3, c4, o, code;
            if (len <= 0) throw Error("Illegal len: " + len);
            while (off < slen - 1 && olen < len) {
              code = s.charCodeAt(off++);
              c1 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
              code = s.charCodeAt(off++);
              c2 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
              if (c1 == -1 || c2 == -1) break;
              o = c1 << 2 >>> 0;
              o |= (c2 & 48) >> 4;
              rs.push(String.fromCharCode(o));
              if (++olen >= len || off >= slen) break;
              code = s.charCodeAt(off++);
              c3 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
              if (c3 == -1) break;
              o = (c2 & 15) << 4 >>> 0;
              o |= (c3 & 60) >> 2;
              rs.push(String.fromCharCode(o));
              if (++olen >= len || off >= slen) break;
              code = s.charCodeAt(off++);
              c4 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
              o = (c3 & 3) << 6 >>> 0;
              o |= c4;
              rs.push(String.fromCharCode(o));
              ++olen;
            }
            var res = [];
            for (off = 0; off < olen; off++) res.push(rs[off].charCodeAt(0));
            return res;
          }
          var BCRYPT_SALT_LEN = 16;
          var GENSALT_DEFAULT_LOG2_ROUNDS = 10;
          var BLOWFISH_NUM_ROUNDS = 16;
          var MAX_EXECUTION_TIME = 100;
          var P_ORIG = [
            608135816,
            2242054355,
            320440878,
            57701188,
            2752067618,
            698298832,
            137296536,
            3964562569,
            1160258022,
            953160567,
            3193202383,
            887688300,
            3232508343,
            3380367581,
            1065670069,
            3041331479,
            2450970073,
            2306472731
          ];
          var S_ORIG = [
            3509652390,
            2564797868,
            805139163,
            3491422135,
            3101798381,
            1780907670,
            3128725573,
            4046225305,
            614570311,
            3012652279,
            134345442,
            2240740374,
            1667834072,
            1901547113,
            2757295779,
            4103290238,
            227898511,
            1921955416,
            1904987480,
            2182433518,
            2069144605,
            3260701109,
            2620446009,
            720527379,
            3318853667,
            677414384,
            3393288472,
            3101374703,
            2390351024,
            1614419982,
            1822297739,
            2954791486,
            3608508353,
            3174124327,
            2024746970,
            1432378464,
            3864339955,
            2857741204,
            1464375394,
            1676153920,
            1439316330,
            715854006,
            3033291828,
            289532110,
            2706671279,
            2087905683,
            3018724369,
            1668267050,
            732546397,
            1947742710,
            3462151702,
            2609353502,
            2950085171,
            1814351708,
            2050118529,
            680887927,
            999245976,
            1800124847,
            3300911131,
            1713906067,
            1641548236,
            4213287313,
            1216130144,
            1575780402,
            4018429277,
            3917837745,
            3693486850,
            3949271944,
            596196993,
            3549867205,
            258830323,
            2213823033,
            772490370,
            2760122372,
            1774776394,
            2652871518,
            566650946,
            4142492826,
            1728879713,
            2882767088,
            1783734482,
            3629395816,
            2517608232,
            2874225571,
            1861159788,
            326777828,
            3124490320,
            2130389656,
            2716951837,
            967770486,
            1724537150,
            2185432712,
            2364442137,
            1164943284,
            2105845187,
            998989502,
            3765401048,
            2244026483,
            1075463327,
            1455516326,
            1322494562,
            910128902,
            469688178,
            1117454909,
            936433444,
            3490320968,
            3675253459,
            1240580251,
            122909385,
            2157517691,
            634681816,
            4142456567,
            3825094682,
            3061402683,
            2540495037,
            79693498,
            3249098678,
            1084186820,
            1583128258,
            426386531,
            1761308591,
            1047286709,
            322548459,
            995290223,
            1845252383,
            2603652396,
            3431023940,
            2942221577,
            3202600964,
            3727903485,
            1712269319,
            422464435,
            3234572375,
            1170764815,
            3523960633,
            3117677531,
            1434042557,
            442511882,
            3600875718,
            1076654713,
            1738483198,
            4213154764,
            2393238008,
            3677496056,
            1014306527,
            4251020053,
            793779912,
            2902807211,
            842905082,
            4246964064,
            1395751752,
            1040244610,
            2656851899,
            3396308128,
            445077038,
            3742853595,
            3577915638,
            679411651,
            2892444358,
            2354009459,
            1767581616,
            3150600392,
            3791627101,
            3102740896,
            284835224,
            4246832056,
            1258075500,
            768725851,
            2589189241,
            3069724005,
            3532540348,
            1274779536,
            3789419226,
            2764799539,
            1660621633,
            3471099624,
            4011903706,
            913787905,
            3497959166,
            737222580,
            2514213453,
            2928710040,
            3937242737,
            1804850592,
            3499020752,
            2949064160,
            2386320175,
            2390070455,
            2415321851,
            4061277028,
            2290661394,
            2416832540,
            1336762016,
            1754252060,
            3520065937,
            3014181293,
            791618072,
            3188594551,
            3933548030,
            2332172193,
            3852520463,
            3043980520,
            413987798,
            3465142937,
            3030929376,
            4245938359,
            2093235073,
            3534596313,
            375366246,
            2157278981,
            2479649556,
            555357303,
            3870105701,
            2008414854,
            3344188149,
            4221384143,
            3956125452,
            2067696032,
            3594591187,
            2921233993,
            2428461,
            544322398,
            577241275,
            1471733935,
            610547355,
            4027169054,
            1432588573,
            1507829418,
            2025931657,
            3646575487,
            545086370,
            48609733,
            2200306550,
            1653985193,
            298326376,
            1316178497,
            3007786442,
            2064951626,
            458293330,
            2589141269,
            3591329599,
            3164325604,
            727753846,
            2179363840,
            146436021,
            1461446943,
            4069977195,
            705550613,
            3059967265,
            3887724982,
            4281599278,
            3313849956,
            1404054877,
            2845806497,
            146425753,
            1854211946,
            1266315497,
            3048417604,
            3681880366,
            3289982499,
            290971e4,
            1235738493,
            2632868024,
            2414719590,
            3970600049,
            1771706367,
            1449415276,
            3266420449,
            422970021,
            1963543593,
            2690192192,
            3826793022,
            1062508698,
            1531092325,
            1804592342,
            2583117782,
            2714934279,
            4024971509,
            1294809318,
            4028980673,
            1289560198,
            2221992742,
            1669523910,
            35572830,
            157838143,
            1052438473,
            1016535060,
            1802137761,
            1753167236,
            1386275462,
            3080475397,
            2857371447,
            1040679964,
            2145300060,
            2390574316,
            1461121720,
            2956646967,
            4031777805,
            4028374788,
            33600511,
            2920084762,
            1018524850,
            629373528,
            3691585981,
            3515945977,
            2091462646,
            2486323059,
            586499841,
            988145025,
            935516892,
            3367335476,
            2599673255,
            2839830854,
            265290510,
            3972581182,
            2759138881,
            3795373465,
            1005194799,
            847297441,
            406762289,
            1314163512,
            1332590856,
            1866599683,
            4127851711,
            750260880,
            613907577,
            1450815602,
            3165620655,
            3734664991,
            3650291728,
            3012275730,
            3704569646,
            1427272223,
            778793252,
            1343938022,
            2676280711,
            2052605720,
            1946737175,
            3164576444,
            3914038668,
            3967478842,
            3682934266,
            1661551462,
            3294938066,
            4011595847,
            840292616,
            3712170807,
            616741398,
            312560963,
            711312465,
            1351876610,
            322626781,
            1910503582,
            271666773,
            2175563734,
            1594956187,
            70604529,
            3617834859,
            1007753275,
            1495573769,
            4069517037,
            2549218298,
            2663038764,
            504708206,
            2263041392,
            3941167025,
            2249088522,
            1514023603,
            1998579484,
            1312622330,
            694541497,
            2582060303,
            2151582166,
            1382467621,
            776784248,
            2618340202,
            3323268794,
            2497899128,
            2784771155,
            503983604,
            4076293799,
            907881277,
            423175695,
            432175456,
            1378068232,
            4145222326,
            3954048622,
            3938656102,
            3820766613,
            2793130115,
            2977904593,
            26017576,
            3274890735,
            3194772133,
            1700274565,
            1756076034,
            4006520079,
            3677328699,
            720338349,
            1533947780,
            354530856,
            688349552,
            3973924725,
            1637815568,
            332179504,
            3949051286,
            53804574,
            2852348879,
            3044236432,
            1282449977,
            3583942155,
            3416972820,
            4006381244,
            1617046695,
            2628476075,
            3002303598,
            1686838959,
            431878346,
            2686675385,
            1700445008,
            1080580658,
            1009431731,
            832498133,
            3223435511,
            2605976345,
            2271191193,
            2516031870,
            1648197032,
            4164389018,
            2548247927,
            300782431,
            375919233,
            238389289,
            3353747414,
            2531188641,
            2019080857,
            1475708069,
            455242339,
            2609103871,
            448939670,
            3451063019,
            1395535956,
            2413381860,
            1841049896,
            1491858159,
            885456874,
            4264095073,
            4001119347,
            1565136089,
            3898914787,
            1108368660,
            540939232,
            1173283510,
            2745871338,
            3681308437,
            4207628240,
            3343053890,
            4016749493,
            1699691293,
            1103962373,
            3625875870,
            2256883143,
            3830138730,
            1031889488,
            3479347698,
            1535977030,
            4236805024,
            3251091107,
            2132092099,
            1774941330,
            1199868427,
            1452454533,
            157007616,
            2904115357,
            342012276,
            595725824,
            1480756522,
            206960106,
            497939518,
            591360097,
            863170706,
            2375253569,
            3596610801,
            1814182875,
            2094937945,
            3421402208,
            1082520231,
            3463918190,
            2785509508,
            435703966,
            3908032597,
            1641649973,
            2842273706,
            3305899714,
            1510255612,
            2148256476,
            2655287854,
            3276092548,
            4258621189,
            236887753,
            3681803219,
            274041037,
            1734335097,
            3815195456,
            3317970021,
            1899903192,
            1026095262,
            4050517792,
            356393447,
            2410691914,
            3873677099,
            3682840055,
            3913112168,
            2491498743,
            4132185628,
            2489919796,
            1091903735,
            1979897079,
            3170134830,
            3567386728,
            3557303409,
            857797738,
            1136121015,
            1342202287,
            507115054,
            2535736646,
            337727348,
            3213592640,
            1301675037,
            2528481711,
            1895095763,
            1721773893,
            3216771564,
            62756741,
            2142006736,
            835421444,
            2531993523,
            1442658625,
            3659876326,
            2882144922,
            676362277,
            1392781812,
            170690266,
            3921047035,
            1759253602,
            3611846912,
            1745797284,
            664899054,
            1329594018,
            3901205900,
            3045908486,
            2062866102,
            2865634940,
            3543621612,
            3464012697,
            1080764994,
            553557557,
            3656615353,
            3996768171,
            991055499,
            499776247,
            1265440854,
            648242737,
            3940784050,
            980351604,
            3713745714,
            1749149687,
            3396870395,
            4211799374,
            3640570775,
            1161844396,
            3125318951,
            1431517754,
            545492359,
            4268468663,
            3499529547,
            1437099964,
            2702547544,
            3433638243,
            2581715763,
            2787789398,
            1060185593,
            1593081372,
            2418618748,
            4260947970,
            69676912,
            2159744348,
            86519011,
            2512459080,
            3838209314,
            1220612927,
            3339683548,
            133810670,
            1090789135,
            1078426020,
            1569222167,
            845107691,
            3583754449,
            4072456591,
            1091646820,
            628848692,
            1613405280,
            3757631651,
            526609435,
            236106946,
            48312990,
            2942717905,
            3402727701,
            1797494240,
            859738849,
            992217954,
            4005476642,
            2243076622,
            3870952857,
            3732016268,
            765654824,
            3490871365,
            2511836413,
            1685915746,
            3888969200,
            1414112111,
            2273134842,
            3281911079,
            4080962846,
            172450625,
            2569994100,
            980381355,
            4109958455,
            2819808352,
            2716589560,
            2568741196,
            3681446669,
            3329971472,
            1835478071,
            660984891,
            3704678404,
            4045999559,
            3422617507,
            3040415634,
            1762651403,
            1719377915,
            3470491036,
            2693910283,
            3642056355,
            3138596744,
            1364962596,
            2073328063,
            1983633131,
            926494387,
            3423689081,
            2150032023,
            4096667949,
            1749200295,
            3328846651,
            309677260,
            2016342300,
            1779581495,
            3079819751,
            111262694,
            1274766160,
            443224088,
            298511866,
            1025883608,
            3806446537,
            1145181785,
            168956806,
            3641502830,
            3584813610,
            1689216846,
            3666258015,
            3200248200,
            1692713982,
            2646376535,
            4042768518,
            1618508792,
            1610833997,
            3523052358,
            4130873264,
            2001055236,
            3610705100,
            2202168115,
            4028541809,
            2961195399,
            1006657119,
            2006996926,
            3186142756,
            1430667929,
            3210227297,
            1314452623,
            4074634658,
            4101304120,
            2273951170,
            1399257539,
            3367210612,
            3027628629,
            1190975929,
            2062231137,
            2333990788,
            2221543033,
            2438960610,
            1181637006,
            548689776,
            2362791313,
            3372408396,
            3104550113,
            3145860560,
            296247880,
            1970579870,
            3078560182,
            3769228297,
            1714227617,
            3291629107,
            3898220290,
            166772364,
            1251581989,
            493813264,
            448347421,
            195405023,
            2709975567,
            677966185,
            3703036547,
            1463355134,
            2715995803,
            1338867538,
            1343315457,
            2802222074,
            2684532164,
            233230375,
            2599980071,
            2000651841,
            3277868038,
            1638401717,
            4028070440,
            3237316320,
            6314154,
            819756386,
            300326615,
            590932579,
            1405279636,
            3267499572,
            3150704214,
            2428286686,
            3959192993,
            3461946742,
            1862657033,
            1266418056,
            963775037,
            2089974820,
            2263052895,
            1917689273,
            448879540,
            3550394620,
            3981727096,
            150775221,
            3627908307,
            1303187396,
            508620638,
            2975983352,
            2726630617,
            1817252668,
            1876281319,
            1457606340,
            908771278,
            3720792119,
            3617206836,
            2455994898,
            1729034894,
            1080033504,
            976866871,
            3556439503,
            2881648439,
            1522871579,
            1555064734,
            1336096578,
            3548522304,
            2579274686,
            3574697629,
            3205460757,
            3593280638,
            3338716283,
            3079412587,
            564236357,
            2993598910,
            1781952180,
            1464380207,
            3163844217,
            3332601554,
            1699332808,
            1393555694,
            1183702653,
            3581086237,
            1288719814,
            691649499,
            2847557200,
            2895455976,
            3193889540,
            2717570544,
            1781354906,
            1676643554,
            2592534050,
            3230253752,
            1126444790,
            2770207658,
            2633158820,
            2210423226,
            2615765581,
            2414155088,
            3127139286,
            673620729,
            2805611233,
            1269405062,
            4015350505,
            3341807571,
            4149409754,
            1057255273,
            2012875353,
            2162469141,
            2276492801,
            2601117357,
            993977747,
            3918593370,
            2654263191,
            753973209,
            36408145,
            2530585658,
            25011837,
            3520020182,
            2088578344,
            530523599,
            2918365339,
            1524020338,
            1518925132,
            3760827505,
            3759777254,
            1202760957,
            3985898139,
            3906192525,
            674977740,
            4174734889,
            2031300136,
            2019492241,
            3983892565,
            4153806404,
            3822280332,
            352677332,
            2297720250,
            60907813,
            90501309,
            3286998549,
            1016092578,
            2535922412,
            2839152426,
            457141659,
            509813237,
            4120667899,
            652014361,
            1966332200,
            2975202805,
            55981186,
            2327461051,
            676427537,
            3255491064,
            2882294119,
            3433927263,
            1307055953,
            942726286,
            933058658,
            2468411793,
            3933900994,
            4215176142,
            1361170020,
            2001714738,
            2830558078,
            3274259782,
            1222529897,
            1679025792,
            2729314320,
            3714953764,
            1770335741,
            151462246,
            3013232138,
            1682292957,
            1483529935,
            471910574,
            1539241949,
            458788160,
            3436315007,
            1807016891,
            3718408830,
            978976581,
            1043663428,
            3165965781,
            1927990952,
            4200891579,
            2372276910,
            3208408903,
            3533431907,
            1412390302,
            2931980059,
            4132332400,
            1947078029,
            3881505623,
            4168226417,
            2941484381,
            1077988104,
            1320477388,
            886195818,
            18198404,
            3786409e3,
            2509781533,
            112762804,
            3463356488,
            1866414978,
            891333506,
            18488651,
            661792760,
            1628790961,
            3885187036,
            3141171499,
            876946877,
            2693282273,
            1372485963,
            791857591,
            2686433993,
            3759982718,
            3167212022,
            3472953795,
            2716379847,
            445679433,
            3561995674,
            3504004811,
            3574258232,
            54117162,
            3331405415,
            2381918588,
            3769707343,
            4154350007,
            1140177722,
            4074052095,
            668550556,
            3214352940,
            367459370,
            261225585,
            2610173221,
            4209349473,
            3468074219,
            3265815641,
            314222801,
            3066103646,
            3808782860,
            282218597,
            3406013506,
            3773591054,
            379116347,
            1285071038,
            846784868,
            2669647154,
            3771962079,
            3550491691,
            2305946142,
            453669953,
            1268987020,
            3317592352,
            3279303384,
            3744833421,
            2610507566,
            3859509063,
            266596637,
            3847019092,
            517658769,
            3462560207,
            3443424879,
            370717030,
            4247526661,
            2224018117,
            4143653529,
            4112773975,
            2788324899,
            2477274417,
            1456262402,
            2901442914,
            1517677493,
            1846949527,
            2295493580,
            3734397586,
            2176403920,
            1280348187,
            1908823572,
            3871786941,
            846861322,
            1172426758,
            3287448474,
            3383383037,
            1655181056,
            3139813346,
            901632758,
            1897031941,
            2986607138,
            3066810236,
            3447102507,
            1393639104,
            373351379,
            950779232,
            625454576,
            3124240540,
            4148612726,
            2007998917,
            544563296,
            2244738638,
            2330496472,
            2058025392,
            1291430526,
            424198748,
            50039436,
            29584100,
            3605783033,
            2429876329,
            2791104160,
            1057563949,
            3255363231,
            3075367218,
            3463963227,
            1469046755,
            985887462
          ];
          var C_ORIG = [
            1332899944,
            1700884034,
            1701343084,
            1684370003,
            1668446532,
            1869963892
          ];
          function _encipher(lr, off, P, S) {
            var n, l = lr[off], r = lr[off + 1];
            l ^= P[0];
            n = S[l >>> 24];
            n += S[256 | l >> 16 & 255];
            n ^= S[512 | l >> 8 & 255];
            n += S[768 | l & 255];
            r ^= n ^ P[1];
            n = S[r >>> 24];
            n += S[256 | r >> 16 & 255];
            n ^= S[512 | r >> 8 & 255];
            n += S[768 | r & 255];
            l ^= n ^ P[2];
            n = S[l >>> 24];
            n += S[256 | l >> 16 & 255];
            n ^= S[512 | l >> 8 & 255];
            n += S[768 | l & 255];
            r ^= n ^ P[3];
            n = S[r >>> 24];
            n += S[256 | r >> 16 & 255];
            n ^= S[512 | r >> 8 & 255];
            n += S[768 | r & 255];
            l ^= n ^ P[4];
            n = S[l >>> 24];
            n += S[256 | l >> 16 & 255];
            n ^= S[512 | l >> 8 & 255];
            n += S[768 | l & 255];
            r ^= n ^ P[5];
            n = S[r >>> 24];
            n += S[256 | r >> 16 & 255];
            n ^= S[512 | r >> 8 & 255];
            n += S[768 | r & 255];
            l ^= n ^ P[6];
            n = S[l >>> 24];
            n += S[256 | l >> 16 & 255];
            n ^= S[512 | l >> 8 & 255];
            n += S[768 | l & 255];
            r ^= n ^ P[7];
            n = S[r >>> 24];
            n += S[256 | r >> 16 & 255];
            n ^= S[512 | r >> 8 & 255];
            n += S[768 | r & 255];
            l ^= n ^ P[8];
            n = S[l >>> 24];
            n += S[256 | l >> 16 & 255];
            n ^= S[512 | l >> 8 & 255];
            n += S[768 | l & 255];
            r ^= n ^ P[9];
            n = S[r >>> 24];
            n += S[256 | r >> 16 & 255];
            n ^= S[512 | r >> 8 & 255];
            n += S[768 | r & 255];
            l ^= n ^ P[10];
            n = S[l >>> 24];
            n += S[256 | l >> 16 & 255];
            n ^= S[512 | l >> 8 & 255];
            n += S[768 | l & 255];
            r ^= n ^ P[11];
            n = S[r >>> 24];
            n += S[256 | r >> 16 & 255];
            n ^= S[512 | r >> 8 & 255];
            n += S[768 | r & 255];
            l ^= n ^ P[12];
            n = S[l >>> 24];
            n += S[256 | l >> 16 & 255];
            n ^= S[512 | l >> 8 & 255];
            n += S[768 | l & 255];
            r ^= n ^ P[13];
            n = S[r >>> 24];
            n += S[256 | r >> 16 & 255];
            n ^= S[512 | r >> 8 & 255];
            n += S[768 | r & 255];
            l ^= n ^ P[14];
            n = S[l >>> 24];
            n += S[256 | l >> 16 & 255];
            n ^= S[512 | l >> 8 & 255];
            n += S[768 | l & 255];
            r ^= n ^ P[15];
            n = S[r >>> 24];
            n += S[256 | r >> 16 & 255];
            n ^= S[512 | r >> 8 & 255];
            n += S[768 | r & 255];
            l ^= n ^ P[16];
            lr[off] = r ^ P[BLOWFISH_NUM_ROUNDS + 1];
            lr[off + 1] = l;
            return lr;
          }
          function _streamtoword(data, offp) {
            for (var i = 0, word = 0; i < 4; ++i)
              word = word << 8 | data[offp] & 255, offp = (offp + 1) % data.length;
            return {
              key: word,
              offp
            };
          }
          function _key(key, P, S) {
            var offset = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
            for (var i = 0; i < plen; i++)
              sw = _streamtoword(key, offset), offset = sw.offp, P[i] = P[i] ^ sw.key;
            for (i = 0; i < plen; i += 2)
              lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
            for (i = 0; i < slen; i += 2)
              lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
          }
          function _ekskey(data, key, P, S) {
            var offp = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
            for (var i = 0; i < plen; i++)
              sw = _streamtoword(key, offp), offp = sw.offp, P[i] = P[i] ^ sw.key;
            offp = 0;
            for (i = 0; i < plen; i += 2)
              sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
            for (i = 0; i < slen; i += 2)
              sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
          }
          function _crypt(b, salt, rounds, callback, progressCallback) {
            var cdata = C_ORIG.slice(), clen = cdata.length, err;
            if (rounds < 4 || rounds > 31) {
              err = Error("Illegal number of rounds (4-31): " + rounds);
              if (callback) {
                nextTick(callback.bind(this, err));
                return;
              } else throw err;
            }
            if (salt.length !== BCRYPT_SALT_LEN) {
              err = Error(
                "Illegal salt length: " + salt.length + " != " + BCRYPT_SALT_LEN
              );
              if (callback) {
                nextTick(callback.bind(this, err));
                return;
              } else throw err;
            }
            rounds = 1 << rounds >>> 0;
            var P, S, i = 0, j;
            if (typeof Int32Array === "function") {
              P = new Int32Array(P_ORIG);
              S = new Int32Array(S_ORIG);
            } else {
              P = P_ORIG.slice();
              S = S_ORIG.slice();
            }
            _ekskey(salt, b, P, S);
            function next() {
              if (progressCallback) progressCallback(i / rounds);
              if (i < rounds) {
                var start = Date.now();
                for (; i < rounds; ) {
                  i = i + 1;
                  _key(b, P, S);
                  _key(salt, P, S);
                  if (Date.now() - start > MAX_EXECUTION_TIME) break;
                }
              } else {
                for (i = 0; i < 64; i++)
                  for (j = 0; j < clen >> 1; j++) _encipher(cdata, j << 1, P, S);
                var ret = [];
                for (i = 0; i < clen; i++)
                  ret.push((cdata[i] >> 24 & 255) >>> 0), ret.push((cdata[i] >> 16 & 255) >>> 0), ret.push((cdata[i] >> 8 & 255) >>> 0), ret.push((cdata[i] & 255) >>> 0);
                if (callback) {
                  callback(null, ret);
                  return;
                } else return ret;
              }
              if (callback) nextTick(next);
            }
            if (typeof callback !== "undefined") {
              next();
            } else {
              var res;
              while (true)
                if (typeof (res = next()) !== "undefined") return res || [];
            }
          }
          function _hash(password, salt, callback, progressCallback) {
            var err;
            if (typeof password !== "string" || typeof salt !== "string") {
              err = Error("Invalid string / salt: Not a string");
              if (callback) {
                nextTick(callback.bind(this, err));
                return;
              } else throw err;
            }
            var minor, offset;
            if (salt.charAt(0) !== "$" || salt.charAt(1) !== "2") {
              err = Error("Invalid salt version: " + salt.substring(0, 2));
              if (callback) {
                nextTick(callback.bind(this, err));
                return;
              } else throw err;
            }
            if (salt.charAt(2) === "$")
              minor = String.fromCharCode(0), offset = 3;
            else {
              minor = salt.charAt(2);
              if (minor !== "a" && minor !== "b" && minor !== "y" || salt.charAt(3) !== "$") {
                err = Error("Invalid salt revision: " + salt.substring(2, 4));
                if (callback) {
                  nextTick(callback.bind(this, err));
                  return;
                } else throw err;
              }
              offset = 4;
            }
            if (salt.charAt(offset + 2) > "$") {
              err = Error("Missing salt rounds");
              if (callback) {
                nextTick(callback.bind(this, err));
                return;
              } else throw err;
            }
            var r1 = parseInt(salt.substring(offset, offset + 1), 10) * 10, r2 = parseInt(salt.substring(offset + 1, offset + 2), 10), rounds = r1 + r2, real_salt = salt.substring(offset + 3, offset + 25);
            password += minor >= "a" ? "\0" : "";
            var passwordb = utf8Array(password), saltb = base64_decode(real_salt, BCRYPT_SALT_LEN);
            function finish(bytes) {
              var res = [];
              res.push("$2");
              if (minor >= "a") res.push(minor);
              res.push("$");
              if (rounds < 10) res.push("0");
              res.push(rounds.toString());
              res.push("$");
              res.push(base64_encode(saltb, saltb.length));
              res.push(base64_encode(bytes, C_ORIG.length * 4 - 1));
              return res.join("");
            }
            if (typeof callback == "undefined")
              return finish(_crypt(passwordb, saltb, rounds));
            else {
              _crypt(
                passwordb,
                saltb,
                rounds,
                function(err2, bytes) {
                  if (err2) callback(err2, null);
                  else callback(null, finish(bytes));
                },
                progressCallback
              );
            }
          }
          function encodeBase64(bytes, length) {
            return base64_encode(bytes, length);
          }
          function decodeBase64(string, length) {
            return base64_decode(string, length);
          }
          var _default = _exports.default = {
            setRandomFallback,
            genSaltSync,
            genSalt,
            hashSync,
            hash,
            compareSync,
            compare,
            getRounds,
            getSalt,
            truncates,
            encodeBase64,
            decodeBase64
          };
        }
      );
    }
  });

  // shims/jsonwebtoken.js
  var require_jsonwebtoken = __commonJS({
    "shims/jsonwebtoken.js"(exports, module) {
      var DURACOES = { s: 1, m: 60, h: 3600, d: 86400 };
      function codificar(objeto) {
        return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(objeto))));
      }
      function decodificar(texto) {
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(texto), (c) => c.charCodeAt(0))));
      }
      function sign(payload, secret, options = {}) {
        const agora = Math.floor(Date.now() / 1e3);
        const corpo = { ...payload, iat: agora };
        const m = /^(\d+)([smhd])$/.exec(options.expiresIn || "");
        if (m) corpo.exp = agora + Number(m[1]) * DURACOES[m[2]];
        return "demo." + codificar(corpo);
      }
      function verify(token) {
        if (typeof token !== "string" || !token.startsWith("demo.")) throw new Error("invalid token");
        const corpo = decodificar(token.slice(5));
        if (corpo.exp && corpo.exp < Math.floor(Date.now() / 1e3)) throw new Error("jwt expired");
        return corpo;
      }
      module.exports = { sign, verify };
    }
  });

  // ../Loryscare/backend/src/services/auth-service.js
  var require_auth_service = __commonJS({
    "../Loryscare/backend/src/services/auth-service.js"(exports, module) {
      var bcrypt = require_umd();
      var jwt = require_jsonwebtoken();
      var AuthValidationError = require_auth_validation_error();
      var AuthenticationError = require_auth_authentication_error();
      var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      var TOKEN_EXPIRATION = "7d";
      function secret() {
        const value = "demo";
        if (!value) throw new Error("JWT_SECRET n\xE3o configurado");
        return value;
      }
      function validateSignUp(input) {
        const details = {};
        const name = typeof input.name === "string" ? input.name.trim() : "";
        const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
        const password = typeof input.password === "string" ? input.password : "";
        if (!name || name.length > 120) details.name = "Informe um nome com at\xE9 120 caracteres";
        if (!email || email.length > 180 || !EMAIL_PATTERN.test(email)) details.email = "Informe um e-mail v\xE1lido";
        if (password.length < 8) details.password = "A senha deve ter ao menos 8 caracteres";
        if (Object.keys(details).length) throw new AuthValidationError(details);
        return { name, email, password };
      }
      function validateLogIn(input) {
        const details = {};
        const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
        const password = typeof input.password === "string" ? input.password : "";
        if (!email) details.email = "Informe o e-mail";
        if (!password) details.password = "Informe a senha";
        if (Object.keys(details).length) throw new AuthValidationError(details);
        return { email, password };
      }
      function validateProfile(input, current) {
        const details = {};
        const name = typeof input.name === "string" ? input.name.trim() : current.name;
        const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : current.email;
        const phone = typeof input.phone === "string" ? input.phone.trim() : current.phone;
        if (!name || name.length > 120) details.name = "Informe um nome com at\xE9 120 caracteres";
        if (!email || email.length > 180 || !EMAIL_PATTERN.test(email)) details.email = "Informe um e-mail v\xE1lido";
        if (phone && phone.length > 30) details.phone = "Use no m\xE1ximo 30 caracteres";
        if (Object.keys(details).length) throw new AuthValidationError(details);
        return { name, email, phone: phone || null };
      }
      function validatePasswordChange(input) {
        const details = {};
        const currentPassword = typeof input.currentPassword === "string" ? input.currentPassword : "";
        const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
        if (!currentPassword) details.currentPassword = "Informe a senha atual";
        if (newPassword.length < 8) details.newPassword = "A nova senha deve ter ao menos 8 caracteres";
        if (Object.keys(details).length) throw new AuthValidationError(details);
        return { currentPassword, newPassword };
      }
      var AVATAR_PATTERN = /^data:image\/(png|jpe?g|webp|gif);base64,/;
      var MAX_AVATAR_LENGTH = 2e6;
      function validateAvatar(avatarData) {
        if (avatarData === null || avatarData === void 0) return null;
        if (typeof avatarData !== "string" || !AVATAR_PATTERN.test(avatarData) || avatarData.length > MAX_AVATAR_LENGTH) {
          throw new AuthValidationError({ avatarData: "Envie uma imagem v\xE1lida de at\xE9 2 MB" });
        }
        return avatarData;
      }
      function issueToken(user) {
        return jwt.sign({ userId: user.id }, secret(), { expiresIn: TOKEN_EXPIRATION });
      }
      function createAuthService(repository) {
        async function signUp(input) {
          const { name, email, password } = validateSignUp(input ?? {});
          if (await repository.findByEmail(email)) {
            throw new AuthValidationError({ email: "Este e-mail j\xE1 est\xE1 cadastrado" });
          }
          const passwordHash = await bcrypt.hash(password, 10);
          const user = await repository.create({ name, email, passwordHash });
          return { token: issueToken(user), user };
        }
        async function logIn(input) {
          const { email, password } = validateLogIn(input ?? {});
          const user = await repository.findByEmail(email);
          if (!user || !await bcrypt.compare(password, user.passwordHash)) {
            throw new AuthenticationError("E-mail ou senha incorretos");
          }
          const { passwordHash, ...publicUser } = user;
          return { token: issueToken(publicUser), user: publicUser };
        }
        function verifyToken(token) {
          if (!token) throw new AuthenticationError("Token ausente");
          try {
            const payload = jwt.verify(token, secret());
            return { userId: String(payload.userId) };
          } catch (error) {
            throw new AuthenticationError("Token inv\xE1lido ou expirado");
          }
        }
        async function getProfile(userId) {
          const user = await repository.getById(userId);
          if (!user) throw new AuthenticationError("Usu\xE1rio n\xE3o encontrado");
          return user;
        }
        async function updateProfile(userId, input) {
          const current = await repository.getById(userId);
          if (!current) throw new AuthenticationError("Usu\xE1rio n\xE3o encontrado");
          const profile = validateProfile(input ?? {}, current);
          const existing = await repository.findByEmail(profile.email);
          if (existing && String(existing.id) !== String(userId)) {
            throw new AuthValidationError({ email: "Este e-mail j\xE1 est\xE1 cadastrado" });
          }
          return repository.updateProfile(userId, profile);
        }
        async function changePassword(userId, input) {
          const { currentPassword, newPassword } = validatePasswordChange(input ?? {});
          const user = await repository.getPasswordHash(userId);
          if (!user || !await bcrypt.compare(currentPassword, user.passwordHash)) {
            throw new AuthenticationError("Senha atual incorreta");
          }
          await repository.updatePassword(userId, await bcrypt.hash(newPassword, 10));
        }
        async function updateAvatar(userId, avatarData) {
          return repository.updateAvatar(userId, validateAvatar(avatarData));
        }
        return Object.freeze({ changePassword, getProfile, logIn, signUp, updateAvatar, updateProfile, verifyToken });
      }
      module.exports = createAuthService;
    }
  });

  // ../Loryscare/backend/src/errors/caregiver-profile-not-found-error.js
  var require_caregiver_profile_not_found_error = __commonJS({
    "../Loryscare/backend/src/errors/caregiver-profile-not-found-error.js"(exports, module) {
      var CaregiverProfileNotFoundError = class extends Error {
        constructor(message = "Cuidador n\xE3o encontrado") {
          super(message);
          this.name = "CaregiverProfileNotFoundError";
        }
      };
      module.exports = CaregiverProfileNotFoundError;
    }
  });

  // ../Loryscare/backend/src/errors/caregiver-profile-validation-error.js
  var require_caregiver_profile_validation_error = __commonJS({
    "../Loryscare/backend/src/errors/caregiver-profile-validation-error.js"(exports, module) {
      var CaregiverProfileValidationError = class extends Error {
        constructor(details) {
          super("Dados do cuidador inv\xE1lidos");
          this.name = "CaregiverProfileValidationError";
          this.details = details;
        }
      };
      module.exports = CaregiverProfileValidationError;
    }
  });

  // ../Loryscare/backend/src/controllers/caregiver-profiles-controller.js
  var require_caregiver_profiles_controller = __commonJS({
    "../Loryscare/backend/src/controllers/caregiver-profiles-controller.js"(exports, module) {
      var CaregiverProfileNotFoundError = require_caregiver_profile_not_found_error();
      var CaregiverProfileValidationError = require_caregiver_profile_validation_error();
      function handle(error, response, next) {
        if (error instanceof CaregiverProfileValidationError) response.status(400).json({ error: error.message, details: error.details });
        else if (error instanceof CaregiverProfileNotFoundError) response.status(404).json({ error: error.message });
        else next(error);
      }
      function createCaregiverProfilesController(service, changeBus) {
        const action = (callback) => async (request, response, next) => {
          try {
            await callback(request, response);
          } catch (error) {
            handle(error, response, next);
          }
        };
        return Object.freeze({
          getAll: action(async (request, response) => response.json({ data: await service.getAll(request.userId) })),
          create: action(async (request, response) => {
            const data = await service.create(request.body, request.userId);
            changeBus.publish(request.userId, { resource: "caregiver-profiles", action: "created" });
            response.status(201).json({ data });
          }),
          update: action(async (request, response) => {
            const data = await service.update(request.params.id, request.body, request.userId);
            changeBus.publish(request.userId, { resource: "caregiver-profiles", action: "updated" });
            response.json({ data });
          }),
          remove: action(async (request, response) => {
            await service.remove(request.params.id, request.userId);
            changeBus.publish(request.userId, { resource: "caregiver-profiles", action: "removed" });
            response.status(204).send();
          }),
          setPin: action(async (request, response) => {
            const data = await service.setPin(request.params.id, request.body.pin, request.userId);
            response.status(200).json({ data });
          }),
          verifyPin: action(async (request, response) => {
            await service.verifyPin(request.params.id, request.body.pin, request.userId);
            response.status(200).json({ data: true });
          })
        });
      }
      module.exports = createCaregiverProfilesController;
    }
  });

  // ../Loryscare/backend/src/repositories/caregiver-profiles-repository.js
  var require_caregiver_profiles_repository = __commonJS({
    "../Loryscare/backend/src/repositories/caregiver-profiles-repository.js"(exports, module) {
      var pool = require_database();
      var PUBLIC_FIELDS = `id, name, avatar_color AS "avatarColor", is_active AS "isActive", (pin_hash IS NOT NULL) AS "hasPin"`;
      async function getAll(userId) {
        const result = await pool.query(
          `SELECT ${PUBLIC_FIELDS} FROM caregiver_profiles
     WHERE user_id = $1 ORDER BY is_active DESC, name`,
          [userId]
        );
        return result.rows;
      }
      async function create(profile) {
        const result = await pool.query(
          `INSERT INTO caregiver_profiles (name, avatar_color, user_id, pin_hash)
     VALUES ($1, $2, $3, $4) RETURNING ${PUBLIC_FIELDS}`,
          [profile.name, profile.avatarColor, profile.userId, profile.pinHash]
        );
        return result.rows[0];
      }
      async function update(id, profile, userId) {
        const result = await pool.query(
          `UPDATE caregiver_profiles SET name = $1, avatar_color = $2, is_active = $3,
       pin_hash = COALESCE($4, pin_hash), updated_at = CURRENT_TIMESTAMP
     WHERE id = $5 AND user_id = $6 RETURNING ${PUBLIC_FIELDS}`,
          [profile.name, profile.avatarColor, profile.isActive, profile.pinHash, id, userId]
        );
        return result.rows[0] ?? null;
      }
      async function remove(id, userId) {
        const result = await pool.query(
          "DELETE FROM caregiver_profiles WHERE id = $1 AND user_id = $2 RETURNING id",
          [id, userId]
        );
        return result.rowCount > 0;
      }
      async function belongsToUser(profileId, userId) {
        const result = await pool.query(
          "SELECT 1 FROM caregiver_profiles WHERE id = $1 AND user_id = $2",
          [profileId, userId]
        );
        return result.rowCount > 0;
      }
      async function getPinHash(id, userId) {
        const result = await pool.query(
          `SELECT pin_hash AS "pinHash" FROM caregiver_profiles WHERE id = $1 AND user_id = $2`,
          [id, userId]
        );
        return result.rows[0] ?? null;
      }
      async function getPinStatus(id, userId) {
        const result = await pool.query(
          `SELECT (pin_hash IS NOT NULL) AS "hasPin" FROM caregiver_profiles WHERE id = $1 AND user_id = $2`,
          [id, userId]
        );
        return result.rows[0] ?? null;
      }
      async function setPin(id, pinHash, userId) {
        const result = await pool.query(
          `UPDATE caregiver_profiles SET pin_hash = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND user_id = $3 RETURNING ${PUBLIC_FIELDS}`,
          [pinHash, id, userId]
        );
        return result.rows[0] ?? null;
      }
      module.exports = Object.freeze({
        belongsToUser,
        create,
        getAll,
        getPinHash,
        getPinStatus,
        remove,
        setPin,
        update
      });
    }
  });

  // ../Loryscare/backend/src/routes/caregiver-profiles-routes.js
  var require_caregiver_profiles_routes = __commonJS({
    "../Loryscare/backend/src/routes/caregiver-profiles-routes.js"(exports, module) {
      var { Router } = require_express();
      function createCaregiverProfilesRouter(controller) {
        const router = Router();
        router.get("/", controller.getAll);
        router.post("/", controller.create);
        router.put("/:id", controller.update);
        router.delete("/:id", controller.remove);
        router.post("/:id/set-pin", controller.setPin);
        router.post("/:id/verify-pin", controller.verifyPin);
        return router;
      }
      module.exports = createCaregiverProfilesRouter;
    }
  });

  // ../Loryscare/backend/src/services/caregiver-profiles-service.js
  var require_caregiver_profiles_service = __commonJS({
    "../Loryscare/backend/src/services/caregiver-profiles-service.js"(exports, module) {
      var bcrypt = require_umd();
      var CaregiverProfileNotFoundError = require_caregiver_profile_not_found_error();
      var CaregiverProfileValidationError = require_caregiver_profile_validation_error();
      var PIN_PATTERN = /^\d{4}$/;
      function validateId(value, field = "id") {
        if (!/^\d+$/.test(String(value ?? "")) || value === "0") {
          throw new CaregiverProfileValidationError({ [field]: "Identificador inv\xE1lido" });
        }
      }
      function validatePin(pin) {
        if (!PIN_PATTERN.test(String(pin ?? ""))) {
          throw new CaregiverProfileValidationError({ pin: "Informe um PIN de 4 d\xEDgitos" });
        }
      }
      function validateProfile(input, editing = false) {
        const details = {};
        const name = typeof input.name === "string" ? input.name.trim() : "";
        const avatarColor = typeof input.avatarColor === "string" ? input.avatarColor.trim() : "";
        const pin = typeof input.pin === "string" ? input.pin.trim() : "";
        if (!name || name.length > 80) details.name = "Informe um nome com at\xE9 80 caracteres";
        if (!avatarColor) details.avatarColor = "Escolha uma cor de avatar";
        if (pin && !PIN_PATTERN.test(pin)) details.pin = "Informe um PIN de 4 d\xEDgitos";
        if (Object.keys(details).length) throw new CaregiverProfileValidationError(details);
        return { name, avatarColor, pin: pin || null, isActive: editing ? input.isActive !== false : true };
      }
      function createCaregiverProfilesService(repository) {
        async function create(input, userId) {
          const profile = validateProfile(input ?? {});
          const pinHash = profile.pin ? await bcrypt.hash(profile.pin, 10) : null;
          return repository.create({ name: profile.name, avatarColor: profile.avatarColor, pinHash, userId });
        }
        async function getAll(userId) {
          return repository.getAll(userId);
        }
        async function update(id, input, userId) {
          validateId(id);
          const profile = validateProfile(input ?? {}, true);
          const pinHash = profile.pin ? await bcrypt.hash(profile.pin, 10) : null;
          const updated = await repository.update(
            id,
            { name: profile.name, avatarColor: profile.avatarColor, isActive: profile.isActive, pinHash },
            userId
          );
          if (!updated) throw new CaregiverProfileNotFoundError();
          return updated;
        }
        async function remove(id, userId) {
          validateId(id);
          if (!await repository.remove(id, userId)) throw new CaregiverProfileNotFoundError();
        }
        async function verifyPin(id, pin, userId) {
          validateId(id);
          validatePin(pin);
          const record = await repository.getPinHash(id, userId);
          if (!record || !record.pinHash) throw new CaregiverProfileNotFoundError();
          if (!await bcrypt.compare(pin, record.pinHash)) {
            throw new CaregiverProfileValidationError({ pin: "PIN incorreto" });
          }
        }
        async function setPin(id, pin, userId) {
          validateId(id);
          validatePin(pin);
          const status = await repository.getPinStatus(id, userId);
          if (!status) throw new CaregiverProfileNotFoundError();
          if (status.hasPin) throw new CaregiverProfileValidationError({ pin: "Este perfil j\xE1 possui um PIN" });
          return repository.setPin(id, await bcrypt.hash(pin, 10), userId);
        }
        return Object.freeze({ create, getAll, remove, setPin, update, verifyPin });
      }
      module.exports = createCaregiverProfilesService;
    }
  });

  // ../Loryscare/backend/src/errors/work-shift-validation-error.js
  var require_work_shift_validation_error = __commonJS({
    "../Loryscare/backend/src/errors/work-shift-validation-error.js"(exports, module) {
      var WorkShiftValidationError = class extends Error {
        constructor(details) {
          super("Dados do plant\xE3o inv\xE1lidos");
          this.name = "WorkShiftValidationError";
          this.details = details;
        }
      };
      module.exports = WorkShiftValidationError;
    }
  });

  // ../Loryscare/backend/src/controllers/work-shifts-controller.js
  var require_work_shifts_controller = __commonJS({
    "../Loryscare/backend/src/controllers/work-shifts-controller.js"(exports, module) {
      var WorkShiftValidationError = require_work_shift_validation_error();
      function handle(error, response, next) {
        if (error instanceof WorkShiftValidationError) response.status(400).json({ error: error.message, details: error.details });
        else next(error);
      }
      function createWorkShiftsController(service) {
        const action = (callback) => async (request, response, next) => {
          try {
            await callback(request, response);
          } catch (error) {
            handle(error, response, next);
          }
        };
        return Object.freeze({
          start: action(async (request, response) => {
            const data = await service.start(request.body, request.userId, request.profileId);
            response.status(201).json({ data });
          }),
          getCurrent: action(async (request, response) => {
            response.json({ data: await service.getCurrent(request.userId) });
          })
        });
      }
      module.exports = createWorkShiftsController;
    }
  });

  // ../Loryscare/backend/src/repositories/work-shifts-repository.js
  var require_work_shifts_repository = __commonJS({
    "../Loryscare/backend/src/repositories/work-shifts-repository.js"(exports, module) {
      var pool = require_database();
      var SHIFT_FIELDS = `
  id,
  profile_id AS "profileId",
  to_char(started_at, 'HH24:MI') AS "startedTime",
  to_char(expected_end_at, 'HH24:MI') AS "expectedEndTime",
  duration_hours AS "durationHours"
`;
      async function createExclusive(shift) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [shift.userId]);
          const current = await client.query(
            `SELECT ws.profile_id AS "profileId", cp.name AS "profileName",
         to_char(ws.started_at, 'HH24:MI') AS "startedTime",
         to_char(ws.expected_end_at, 'HH24:MI') AS "expectedEndTime",
         ws.duration_hours AS "durationHours"
       FROM work_shifts ws
       JOIN caregiver_profiles cp ON cp.id = ws.profile_id
       WHERE ws.user_id = $1 AND ws.ended_at IS NULL
         AND ws.started_at <= $2::timestamp AND ws.expected_end_at > $2::timestamp
       ORDER BY ws.started_at DESC
       LIMIT 1`,
            [shift.userId, shift.now]
          );
          if (current.rows[0]) {
            await client.query("COMMIT");
            return { created: false, shift: current.rows[0] };
          }
          const result = await client.query(
            `INSERT INTO work_shifts (user_id, profile_id, started_at, duration_hours, expected_end_at, schedule_shift_id, scheduled_start_at, scheduled_end_at)
       VALUES (
         $1, $2, $3::timestamp, $4::smallint,
         COALESCE($8::timestamp, $3::timestamp + ($4::text || ' hours')::interval),
         $5, $6::timestamp, $7::timestamp
       )
       RETURNING ${SHIFT_FIELDS}`,
            [
              shift.userId,
              shift.profileId,
              shift.startedAt,
              shift.durationHours,
              shift.scheduleShiftId ?? null,
              shift.scheduledStartAt ?? null,
              shift.scheduledEndAt ?? null,
              shift.expectedEndAt ?? null
            ]
          );
          await client.query("COMMIT");
          return { created: true, shift: result.rows[0] };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      async function existsForScheduleShift(scheduleShiftId, userId) {
        const result = await pool.query(
          `SELECT 1 FROM work_shifts ws
     JOIN schedule_shifts ss ON ss.id = ws.schedule_shift_id
     WHERE ws.schedule_shift_id = $1 AND ss.user_id = $2`,
          [scheduleShiftId, userId]
        );
        return result.rowCount > 0;
      }
      async function findCurrent(userId, now) {
        const result = await pool.query(
          `SELECT ws.profile_id AS "profileId", cp.name AS "profileName",
       to_char(ws.started_at, 'HH24:MI') AS "startedTime",
       to_char(ws.expected_end_at, 'HH24:MI') AS "expectedEndTime"
     FROM work_shifts ws
     JOIN caregiver_profiles cp ON cp.id = ws.profile_id
     WHERE ws.user_id = $1 AND ws.ended_at IS NULL AND ws.expected_end_at > $2::timestamp
     ORDER BY ws.started_at DESC
     LIMIT 1`,
          [userId, now]
        );
        return result.rows[0] ?? null;
      }
      async function findCovering(userId, at) {
        const result = await pool.query(
          `SELECT ws.profile_id AS "profileId", cp.name AS "profileName",
       to_char(ws.started_at, 'HH24:MI') AS "startedTime",
       to_char(COALESCE(ws.ended_at, ws.expected_end_at), 'HH24:MI') AS "endTime"
     FROM work_shifts ws
     JOIN caregiver_profiles cp ON cp.id = ws.profile_id
     WHERE ws.user_id = $1 AND ws.started_at <= $2::timestamp AND $2::timestamp < COALESCE(ws.ended_at, ws.expected_end_at)
     ORDER BY ws.started_at DESC
     LIMIT 1`,
          [userId, at]
        );
        return result.rows[0] ?? null;
      }
      module.exports = Object.freeze({ createExclusive, existsForScheduleShift, findCovering, findCurrent });
    }
  });

  // ../Loryscare/backend/src/routes/work-shifts-routes.js
  var require_work_shifts_routes = __commonJS({
    "../Loryscare/backend/src/routes/work-shifts-routes.js"(exports, module) {
      var { Router } = require_express();
      function createWorkShiftsRouter(controller) {
        const router = Router();
        router.get("/current", controller.getCurrent);
        router.post("/", controller.start);
        return router;
      }
      module.exports = createWorkShiftsRouter;
    }
  });

  // ../Loryscare/backend/src/services/work-shifts-service.js
  var require_work_shifts_service = __commonJS({
    "../Loryscare/backend/src/services/work-shifts-service.js"(exports, module) {
      var WorkShiftValidationError = require_work_shift_validation_error();
      function isDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [year, month, day] = value.split("-").map(Number);
        const parsed = new Date(Date.UTC(year, month - 1, day));
        return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
      }
      function pad2(value) {
        return String(value).padStart(2, "0");
      }
      function nowTimestamp() {
        const now = /* @__PURE__ */ new Date();
        return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
      }
      function periodFromHour(hour) {
        if (hour >= 6 && hour < 12) return "Manh\xE3";
        if (hour >= 12 && hour < 18) return "Tarde";
        if (hour >= 18) return "Noite";
        return "Madrugada";
      }
      function attachPeriod(shift) {
        if (!shift) return null;
        return { ...shift, period: periodFromHour(Number(shift.startedTime.slice(0, 2))) };
      }
      function validateInput(input) {
        const details = {};
        const startedDate = typeof input.startedDate === "string" ? input.startedDate : "";
        const startedTime = typeof input.startedTime === "string" ? input.startedTime.trim() : "";
        const durationHours = Number(input.durationHours);
        if (!isDate(startedDate)) details.startedDate = "Informe uma data v\xE1lida";
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startedTime)) details.startedTime = "Informe um hor\xE1rio v\xE1lido";
        if (durationHours !== 12 && durationHours !== 24) details.durationHours = "Escolha 12h ou 24h";
        if (Object.keys(details).length) throw new WorkShiftValidationError(details);
        const startedAt = `${startedDate} ${startedTime}:00`;
        if (startedAt > nowTimestamp()) {
          throw new WorkShiftValidationError({ startedTime: "O in\xEDcio do plant\xE3o n\xE3o pode ser no futuro" });
        }
        return { startedAt, durationHours };
      }
      function createWorkShiftsService(repository, scheduleShiftsRepository) {
        async function startFromSchedule(scheduleShiftId, userId) {
          if (!/^\d+$/.test(String(scheduleShiftId ?? ""))) {
            throw new WorkShiftValidationError({ scheduleShiftId: "Identificador inv\xE1lido" });
          }
          const scheduleShift = await scheduleShiftsRepository.findById(scheduleShiftId, userId);
          if (!scheduleShift) throw new WorkShiftValidationError({ scheduleShiftId: "Plant\xE3o programado n\xE3o encontrado" });
          if (await repository.existsForScheduleShift(scheduleShiftId, userId)) {
            throw new WorkShiftValidationError({ scheduleShiftId: "Este plant\xE3o j\xE1 foi iniciado" });
          }
          const now = /* @__PURE__ */ new Date();
          if (new Date(scheduleShift.scheduledStartAt) > now || new Date(scheduleShift.scheduledEndAt) <= now) {
            throw new WorkShiftValidationError({ scheduleShiftId: "Este plant\xE3o programado n\xE3o est\xE1 no hor\xE1rio de agora" });
          }
          const durationHours = Math.round(
            (new Date(scheduleShift.scheduledEndAt) - new Date(scheduleShift.scheduledStartAt)) / 36e5
          );
          if (durationHours !== 12 && durationHours !== 24) {
            throw new WorkShiftValidationError({
              scheduleShiftId: "A dura\xE7\xE3o deste plant\xE3o programado \xE9 inv\xE1lida (12h ou 24h esperado)."
            });
          }
          const scheduledEndAt = `${scheduleShift.scheduledEndDate} ${scheduleShift.scheduledEndTime}:00`;
          const result = await repository.createExclusive({
            userId,
            profileId: scheduleShift.profileId,
            startedAt: nowTimestamp(),
            durationHours,
            now: nowTimestamp(),
            scheduleShiftId,
            scheduledStartAt: `${scheduleShift.scheduledDate} ${scheduleShift.scheduledStartTime}:00`,
            scheduledEndAt,
            expectedEndAt: scheduledEndAt
          });
          if (!result.created && String(result.shift.profileId) !== String(scheduleShift.profileId)) {
            throw new WorkShiftValidationError({
              scheduleShiftId: `${result.shift.profileName} j\xE1 est\xE1 de plant\xE3o at\xE9 ${result.shift.expectedEndTime}`
            });
          }
          return { ...attachPeriod(result.shift), alreadyActive: !result.created };
        }
        async function start(input, userId, profileId) {
          const body = input ?? {};
          if (body.scheduleShiftId) return startFromSchedule(body.scheduleShiftId, userId);
          if (!profileId) {
            throw new WorkShiftValidationError({ profileId: "Selecione um cuidador para iniciar o plant\xE3o" });
          }
          const { startedAt, durationHours } = validateInput(body);
          const result = await repository.createExclusive({
            userId,
            profileId,
            startedAt,
            durationHours,
            now: nowTimestamp()
          });
          if (!result.created && String(result.shift.profileId) !== String(profileId)) {
            throw new WorkShiftValidationError({
              profileId: `${result.shift.profileName} j\xE1 est\xE1 de plant\xE3o at\xE9 ${result.shift.expectedEndTime}`
            });
          }
          return { ...attachPeriod(result.shift), alreadyActive: !result.created };
        }
        async function getCurrent(userId) {
          return attachPeriod(await repository.findCurrent(userId, nowTimestamp()));
        }
        return Object.freeze({ getCurrent, start });
      }
      module.exports = createWorkShiftsService;
    }
  });

  // ../Loryscare/backend/src/errors/schedule-month-validation-error.js
  var require_schedule_month_validation_error = __commonJS({
    "../Loryscare/backend/src/errors/schedule-month-validation-error.js"(exports, module) {
      var ScheduleMonthValidationError = class extends Error {
        constructor(details) {
          super("Dados da escala inv\xE1lidos");
          this.name = "ScheduleMonthValidationError";
          this.details = details;
        }
      };
      module.exports = ScheduleMonthValidationError;
    }
  });

  // ../Loryscare/backend/src/errors/schedule-month-not-found-error.js
  var require_schedule_month_not_found_error = __commonJS({
    "../Loryscare/backend/src/errors/schedule-month-not-found-error.js"(exports, module) {
      var ScheduleMonthNotFoundError = class extends Error {
        constructor() {
          super("Escala do m\xEAs n\xE3o encontrada");
          this.name = "ScheduleMonthNotFoundError";
        }
      };
      module.exports = ScheduleMonthNotFoundError;
    }
  });

  // ../Loryscare/backend/src/controllers/schedule-months-controller.js
  var require_schedule_months_controller = __commonJS({
    "../Loryscare/backend/src/controllers/schedule-months-controller.js"(exports, module) {
      var ScheduleMonthValidationError = require_schedule_month_validation_error();
      var ScheduleMonthNotFoundError = require_schedule_month_not_found_error();
      function handle(error, response, next) {
        if (error instanceof ScheduleMonthValidationError) response.status(400).json({ error: error.message, details: error.details });
        else if (error instanceof ScheduleMonthNotFoundError) response.status(404).json({ error: error.message });
        else next(error);
      }
      function createScheduleMonthsController(service, changeBus) {
        const action = (callback) => async (request, response, next) => {
          try {
            await callback(request, response);
          } catch (error) {
            handle(error, response, next);
          }
        };
        return Object.freeze({
          getByYearMonth: action(async (request, response) => {
            const data = await service.getByYearMonth(request.query.year, request.query.month, request.userId);
            response.json({ data });
          }),
          create: action(async (request, response) => {
            const data = await service.create(request.body, request.userId);
            changeBus.publish(request.userId, { resource: "schedule-months", action: "created" });
            response.status(201).json({ data });
          }),
          getEarnings: action(async (request, response) => {
            const data = await service.getEarnings(request.params.id, request.userId, request.profileId);
            response.json({ data });
          }),
          setShiftRate: action(async (request, response) => {
            await service.setShiftRate(request.params.id, request.body, request.userId);
            changeBus.publish(request.userId, { resource: "schedule-months", action: "rate-updated" });
            response.status(204).send();
          }),
          remove: action(async (request, response) => {
            await service.remove(request.params.id, request.userId);
            changeBus.publish(request.userId, { resource: "schedule-months", action: "removed" });
            response.status(204).send();
          })
        });
      }
      module.exports = createScheduleMonthsController;
    }
  });

  // ../Loryscare/backend/src/repositories/schedule-months-repository.js
  var require_schedule_months_repository = __commonJS({
    "../Loryscare/backend/src/repositories/schedule-months-repository.js"(exports, module) {
      var pool = require_database();
      var MONTH_FIELDS = `
  id,
  year,
  month,
  duration_hours AS "durationHours",
  to_char(first_start_time, 'HH24:MI') AS "firstStartTime",
  to_char(second_start_time, 'HH24:MI') AS "secondStartTime",
  shift_rate_cents AS "shiftRateCents"
`;
      async function findByYearMonth(userId, year, month) {
        const result = await pool.query(
          `SELECT ${MONTH_FIELDS} FROM schedule_months WHERE user_id = $1 AND year = $2 AND month = $3`,
          [userId, year, month]
        );
        return result.rows[0] ?? null;
      }
      async function getCaregivers(scheduleMonthId) {
        const result = await pool.query(
          `SELECT smc.profile_id AS "profileId", smc.position, cp.name
     FROM schedule_month_caregivers smc
     JOIN caregiver_profiles cp ON cp.id = smc.profile_id
     WHERE smc.schedule_month_id = $1 ORDER BY smc.position`,
          [scheduleMonthId]
        );
        return result.rows;
      }
      async function updateShiftRate(scheduleMonthId, shiftRateCents) {
        await pool.query("UPDATE schedule_months SET shift_rate_cents = $2 WHERE id = $1", [scheduleMonthId, shiftRateCents]);
      }
      async function getEarningsData(scheduleMonthId, profileId) {
        const result = await pool.query(
          `SELECT sm.duration_hours AS "durationHours",
            sm.shift_rate_cents AS "rateCents",
            COALESCE((
              SELECT SUM(EXTRACT(EPOCH FROM ss.scheduled_end_at - ss.scheduled_start_at) / 60)
              FROM schedule_shifts ss
              WHERE ss.schedule_month_id = sm.id AND ss.profile_id = $2
            ), 0)::float AS "totalMinutes"
     FROM schedule_months sm
     WHERE sm.id = $1`,
          [scheduleMonthId, profileId]
        );
        return result.rows[0];
      }
      async function create({
        userId,
        year,
        month,
        durationHours,
        firstStartTime,
        secondStartTime,
        caregiverIds,
        slots,
        shiftRateCents = null
      }) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const monthResult = await client.query(
            `INSERT INTO schedule_months (user_id, year, month, duration_hours, first_start_time, second_start_time, shift_rate_cents)
       VALUES ($1, $2, $3, $4, $5::time, $6::time, $7) RETURNING id`,
            [userId, year, month, durationHours, firstStartTime, secondStartTime, shiftRateCents]
          );
          const scheduleMonthId = monthResult.rows[0].id;
          for (let index = 0; index < caregiverIds.length; index += 1) {
            await client.query(
              `INSERT INTO schedule_month_caregivers (schedule_month_id, profile_id, position) VALUES ($1, $2, $3)`,
              [scheduleMonthId, caregiverIds[index], index + 1]
            );
          }
          for (const slot of slots) {
            await client.query(
              `INSERT INTO schedule_shifts (schedule_month_id, user_id, scheduled_start_at, scheduled_end_at, original_profile_id, profile_id)
         VALUES ($1, $2, $3::timestamp, $4::timestamp, $5, $5)`,
              [scheduleMonthId, userId, slot.scheduledStartAt, slot.scheduledEndAt, slot.profileId]
            );
          }
          await client.query("COMMIT");
          return scheduleMonthId;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      async function hasStartedShift(scheduleMonthId) {
        const result = await pool.query(
          `SELECT 1 FROM schedule_shifts ss
     JOIN work_shifts ws ON ws.schedule_shift_id = ss.id
     WHERE ss.schedule_month_id = $1 LIMIT 1`,
          [scheduleMonthId]
        );
        return result.rowCount > 0;
      }
      async function belongsToUser(id, userId) {
        const result = await pool.query("SELECT 1 FROM schedule_months WHERE id = $1 AND user_id = $2", [id, userId]);
        return result.rowCount > 0;
      }
      async function remove(id, userId) {
        const result = await pool.query(
          "DELETE FROM schedule_months WHERE id = $1 AND user_id = $2 RETURNING id",
          [id, userId]
        );
        return result.rowCount > 0;
      }
      module.exports = Object.freeze({
        belongsToUser,
        create,
        findByYearMonth,
        getCaregivers,
        getEarningsData,
        hasStartedShift,
        remove,
        updateShiftRate
      });
    }
  });

  // ../Loryscare/backend/src/routes/schedule-months-routes.js
  var require_schedule_months_routes = __commonJS({
    "../Loryscare/backend/src/routes/schedule-months-routes.js"(exports, module) {
      var { Router } = require_express();
      function createScheduleMonthsRouter(controller) {
        const router = Router();
        router.get("/", controller.getByYearMonth);
        router.post("/", controller.create);
        router.get("/:id/earnings", controller.getEarnings);
        router.put("/:id/rate", controller.setShiftRate);
        router.delete("/:id", controller.remove);
        return router;
      }
      module.exports = createScheduleMonthsRouter;
    }
  });

  // ../Loryscare/backend/src/services/schedule-months-service.js
  var require_schedule_months_service = __commonJS({
    "../Loryscare/backend/src/services/schedule-months-service.js"(exports, module) {
      var ScheduleMonthValidationError = require_schedule_month_validation_error();
      var ScheduleMonthNotFoundError = require_schedule_month_not_found_error();
      function pad2(value) {
        return String(value).padStart(2, "0");
      }
      function isTime(value) {
        return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
      }
      function minutesOf(value) {
        return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
      }
      function daysInMonth(year, month) {
        return new Date(Date.UTC(year, month, 0)).getUTCDate();
      }
      function addDays(dateStr, amount) {
        const [year, month, day] = dateStr.split("-").map(Number);
        const next = new Date(Date.UTC(year, month - 1, day + amount));
        return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
      }
      function buildSlots({ year, month, durationHours, firstStartTime, secondStartTime, caregiverIds }) {
        const totalDays = daysInMonth(year, month);
        const slots = [];
        let caregiverIndex = 0;
        const nextCaregiver = () => {
          const profileId = caregiverIds[caregiverIndex % caregiverIds.length];
          caregiverIndex += 1;
          return profileId;
        };
        for (let day = 1; day <= totalDays; day += 1) {
          const dateStr = `${year}-${pad2(month)}-${pad2(day)}`;
          const nextDate = addDays(dateStr, 1);
          if (durationHours === 24) {
            slots.push({
              scheduledStartAt: `${dateStr} ${firstStartTime}:00`,
              scheduledEndAt: `${nextDate} ${firstStartTime}:00`,
              profileId: nextCaregiver()
            });
          } else {
            slots.push({
              scheduledStartAt: `${dateStr} ${firstStartTime}:00`,
              scheduledEndAt: `${dateStr} ${secondStartTime}:00`,
              profileId: nextCaregiver()
            });
            slots.push({
              scheduledStartAt: `${dateStr} ${secondStartTime}:00`,
              scheduledEndAt: `${nextDate} ${firstStartTime}:00`,
              profileId: nextCaregiver()
            });
          }
        }
        return slots;
      }
      function validateInput(input) {
        const details = {};
        const year = Number(input.year);
        const month = Number(input.month);
        const durationHours = Number(input.durationHours);
        const firstStartTime = typeof input.firstStartTime === "string" ? input.firstStartTime.trim() : "";
        const secondStartTime = typeof input.secondStartTime === "string" ? input.secondStartTime.trim() : "";
        const caregiverIds = Array.isArray(input.caregiverIds) ? input.caregiverIds.map(String) : [];
        if (!Number.isInteger(year) || year < 2020 || year > 2100) details.year = "Informe um ano v\xE1lido";
        if (!Number.isInteger(month) || month < 1 || month > 12) details.month = "Informe um m\xEAs v\xE1lido";
        if (durationHours !== 12 && durationHours !== 24) details.durationHours = "Escolha 12h ou 24h";
        if (!isTime(firstStartTime)) details.firstStartTime = "Informe um hor\xE1rio v\xE1lido";
        if (durationHours === 12 && !isTime(secondStartTime)) details.secondStartTime = "Informe um hor\xE1rio v\xE1lido";
        if (durationHours === 12 && isTime(firstStartTime) && isTime(secondStartTime) && (minutesOf(secondStartTime) - minutesOf(firstStartTime) + 1440) % 1440 !== 720) {
          details.secondStartTime = "Em plant\xF5es de 12h os dois per\xEDodos devem come\xE7ar com 12 horas de diferen\xE7a";
        }
        if (!caregiverIds.length) details.caregiverIds = "Selecione ao menos um cuidador";
        if (new Set(caregiverIds).size !== caregiverIds.length) {
          details.caregiverIds = "Cada cuidador s\xF3 pode aparecer uma vez na ordem";
        }
        if (Object.keys(details).length) throw new ScheduleMonthValidationError(details);
        return {
          year,
          month,
          durationHours,
          firstStartTime,
          secondStartTime: durationHours === 12 ? secondStartTime : null,
          caregiverIds
        };
      }
      var MAX_RATE_CENTS = 1e8;
      function parseShiftRate(rawValue) {
        if (rawValue === null || rawValue === void 0 || String(rawValue).trim() === "") return null;
        const value = Number(String(rawValue).trim().replace(",", "."));
        const rateCents = Math.round(value * 100);
        if (!Number.isFinite(value) || rateCents < 0 || rateCents > MAX_RATE_CENTS) {
          throw new ScheduleMonthValidationError({ shiftRate: "Informe um valor de plant\xE3o v\xE1lido" });
        }
        return rateCents;
      }
      function createScheduleMonthsService(repository, caregiverProfilesRepository) {
        async function create(input, userId) {
          const data = validateInput(input ?? {});
          const shiftRateCents = parseShiftRate(input?.shiftRate);
          for (const profileId of data.caregiverIds) {
            if (!await caregiverProfilesRepository.belongsToUser(profileId, userId)) {
              throw new ScheduleMonthValidationError({ caregiverIds: "Cuidador inv\xE1lido" });
            }
          }
          if (await repository.findByYearMonth(userId, data.year, data.month)) {
            throw new ScheduleMonthValidationError({
              month: "J\xE1 existe uma escala para este m\xEAs. Exclua-a antes de gerar novamente."
            });
          }
          const slots = buildSlots(data);
          const id = await repository.create({ userId, ...data, slots, shiftRateCents });
          return { id, ...data, shiftRateCents };
        }
        async function getByYearMonth(year, month, userId) {
          const scheduleMonth = await repository.findByYearMonth(userId, Number(year), Number(month));
          if (!scheduleMonth) return null;
          const caregivers = await repository.getCaregivers(scheduleMonth.id);
          return { ...scheduleMonth, caregivers };
        }
        async function setShiftRate(id, input, userId) {
          if (!await repository.belongsToUser(id, userId)) throw new ScheduleMonthNotFoundError();
          const shiftRateCents = parseShiftRate(input?.shiftRate);
          if (shiftRateCents === null) throw new ScheduleMonthValidationError({ shiftRate: "Informe o valor do plant\xE3o" });
          await repository.updateShiftRate(id, shiftRateCents);
        }
        async function getEarnings(id, userId, profileId) {
          if (!profileId) throw new ScheduleMonthValidationError({ profileId: "Selecione um perfil" });
          if (!await repository.belongsToUser(id, userId)) throw new ScheduleMonthNotFoundError();
          const { durationHours, rateCents, totalMinutes } = await repository.getEarningsData(id, profileId);
          const shiftCount = Math.round(totalMinutes / (durationHours * 60) * 100) / 100;
          const totalCents = rateCents === null ? null : Math.round(rateCents * totalMinutes / (durationHours * 60));
          return { profileId: String(profileId), shiftCount, rateCents, totalCents };
        }
        async function remove(id, userId) {
          if (!await repository.belongsToUser(id, userId)) throw new ScheduleMonthNotFoundError();
          if (await repository.hasStartedShift(id)) {
            throw new ScheduleMonthValidationError({
              month: "Este m\xEAs j\xE1 tem plant\xF5es iniciados; n\xE3o \xE9 poss\xEDvel excluir a escala."
            });
          }
          await repository.remove(id, userId);
        }
        return Object.freeze({ create, getByYearMonth, getEarnings, remove, setShiftRate });
      }
      module.exports = createScheduleMonthsService;
    }
  });

  // ../Loryscare/backend/src/errors/schedule-shift-validation-error.js
  var require_schedule_shift_validation_error = __commonJS({
    "../Loryscare/backend/src/errors/schedule-shift-validation-error.js"(exports, module) {
      var ScheduleShiftValidationError = class extends Error {
        constructor(details) {
          super("Dados do plant\xE3o inv\xE1lidos");
          this.name = "ScheduleShiftValidationError";
          this.details = details;
        }
      };
      module.exports = ScheduleShiftValidationError;
    }
  });

  // ../Loryscare/backend/src/errors/schedule-shift-not-found-error.js
  var require_schedule_shift_not_found_error = __commonJS({
    "../Loryscare/backend/src/errors/schedule-shift-not-found-error.js"(exports, module) {
      var ScheduleShiftNotFoundError = class extends Error {
        constructor() {
          super("Plant\xE3o programado n\xE3o encontrado");
          this.name = "ScheduleShiftNotFoundError";
        }
      };
      module.exports = ScheduleShiftNotFoundError;
    }
  });

  // ../Loryscare/backend/src/controllers/schedule-shifts-controller.js
  var require_schedule_shifts_controller = __commonJS({
    "../Loryscare/backend/src/controllers/schedule-shifts-controller.js"(exports, module) {
      var ScheduleShiftValidationError = require_schedule_shift_validation_error();
      var ScheduleShiftNotFoundError = require_schedule_shift_not_found_error();
      function handle(error, response, next) {
        if (error instanceof ScheduleShiftValidationError) response.status(400).json({ error: error.message, details: error.details });
        else if (error instanceof ScheduleShiftNotFoundError) response.status(404).json({ error: error.message });
        else next(error);
      }
      function createScheduleShiftsController(service, changeBus) {
        const action = (callback) => async (request, response, next) => {
          try {
            await callback(request, response);
          } catch (error) {
            handle(error, response, next);
          }
        };
        return Object.freeze({
          listByMonth: action(async (request, response) => {
            response.json({ data: await service.listByMonth(request.query.year, request.query.month, request.userId) });
          }),
          getCurrent: action(async (request, response) => {
            response.json({ data: await service.findCurrentForProfile(request.query.profileId, request.userId) });
          }),
          update: action(async (request, response) => {
            await service.update(request.params.id, request.body, request.userId, request.profileId);
            changeBus.publish(request.userId, { resource: "schedule-shifts", action: "updated" });
            response.status(204).send();
          }),
          remove: action(async (request, response) => {
            await service.remove(request.params.id, request.userId);
            changeBus.publish(request.userId, { resource: "schedule-shifts", action: "removed" });
            response.status(204).send();
          }),
          swap: action(async (request, response) => {
            await service.swap(request.body.shiftIdA, request.body.shiftIdB, request.userId, request.profileId);
            changeBus.publish(request.userId, { resource: "schedule-shifts", action: "swapped" });
            response.status(204).send();
          }),
          split: action(async (request, response) => {
            await service.split(request.params.id, request.body.coveringProfileId, request.userId);
            changeBus.publish(request.userId, { resource: "schedule-shifts", action: "split" });
            response.status(204).send();
          })
        });
      }
      module.exports = createScheduleShiftsController;
    }
  });

  // ../Loryscare/backend/src/repositories/schedule-shifts-repository.js
  var require_schedule_shifts_repository = __commonJS({
    "../Loryscare/backend/src/repositories/schedule-shifts-repository.js"(exports, module) {
      var pool = require_database();
      var SHIFT_FIELDS = `
  ss.id,
  ss.schedule_month_id AS "scheduleMonthId",
  to_char(ss.scheduled_start_at, 'YYYY-MM-DD') AS "scheduledDate",
  to_char(ss.scheduled_end_at, 'YYYY-MM-DD') AS "scheduledEndDate",
  to_char(ss.scheduled_start_at, 'HH24:MI') AS "scheduledStartTime",
  to_char(ss.scheduled_end_at, 'HH24:MI') AS "scheduledEndTime",
  ss.scheduled_start_at AS "scheduledStartAt",
  ss.scheduled_end_at AS "scheduledEndAt",
  ss.original_profile_id AS "originalProfileId",
  ss.profile_id AS "profileId",
  cp.name AS "profileName",
  cp.avatar_color AS "profileColor",
  ws.id AS "workShiftId",
  ws.ended_at AS "workShiftEndedAt"
`;
      async function listByMonth(userId, year, month) {
        const result = await pool.query(
          `SELECT ${SHIFT_FIELDS}
     FROM schedule_shifts ss
     JOIN schedule_months sm ON sm.id = ss.schedule_month_id
     JOIN caregiver_profiles cp ON cp.id = ss.profile_id
     LEFT JOIN work_shifts ws ON ws.schedule_shift_id = ss.id
     WHERE ss.user_id = $1 AND sm.year = $2 AND sm.month = $3
     ORDER BY ss.scheduled_start_at`,
          [userId, year, month]
        );
        return result.rows;
      }
      async function findById(id, userId) {
        const result = await pool.query(
          `SELECT ${SHIFT_FIELDS}
     FROM schedule_shifts ss
     JOIN caregiver_profiles cp ON cp.id = ss.profile_id
     LEFT JOIN work_shifts ws ON ws.schedule_shift_id = ss.id
     WHERE ss.id = $1 AND ss.user_id = $2`,
          [id, userId]
        );
        return result.rows[0] ?? null;
      }
      async function findCurrentForProfile(userId, profileId, now) {
        const result = await pool.query(
          `SELECT ${SHIFT_FIELDS}
     FROM schedule_shifts ss
     JOIN caregiver_profiles cp ON cp.id = ss.profile_id
     LEFT JOIN work_shifts ws ON ws.schedule_shift_id = ss.id
     WHERE ss.user_id = $1 AND ss.profile_id = $2
       AND ss.scheduled_start_at <= $3::timestamp AND ss.scheduled_end_at > $3::timestamp
     ORDER BY ss.scheduled_start_at DESC LIMIT 1`,
          [userId, profileId, now]
        );
        return result.rows[0] ?? null;
      }
      async function create(data, userId) {
        const result = await pool.query(
          `INSERT INTO schedule_shifts (schedule_month_id, user_id, scheduled_start_at, scheduled_end_at, original_profile_id, profile_id)
     VALUES ($1, $2, $3::timestamp, $4::timestamp, $5, $5) RETURNING id`,
          [data.scheduleMonthId, userId, data.scheduledStartAt, data.scheduledEndAt, data.profileId]
        );
        return result.rows[0].id;
      }
      async function update(id, changes, userId) {
        const result = await pool.query(
          `UPDATE schedule_shifts SET profile_id = $1, scheduled_start_at = $2::timestamp, scheduled_end_at = $3::timestamp,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $4 AND user_id = $5 RETURNING id`,
          [changes.profileId, changes.scheduledStartAt, changes.scheduledEndAt, id, userId]
        );
        return result.rowCount > 0;
      }
      async function remove(id, userId) {
        const result = await pool.query(
          "DELETE FROM schedule_shifts WHERE id = $1 AND user_id = $2 RETURNING id",
          [id, userId]
        );
        return result.rowCount > 0;
      }
      async function swapProfiles(idA, idB, userId) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const rows = await client.query(
            `SELECT id, profile_id AS "profileId" FROM schedule_shifts WHERE id IN ($1, $2) AND user_id = $3 FOR UPDATE`,
            [idA, idB, userId]
          );
          if (rows.rowCount !== 2) {
            await client.query("ROLLBACK");
            return null;
          }
          const shiftA = rows.rows.find((row) => String(row.id) === String(idA));
          const shiftB = rows.rows.find((row) => String(row.id) === String(idB));
          await client.query(
            "UPDATE schedule_shifts SET profile_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
            [shiftB.profileId, shiftA.id]
          );
          await client.query(
            "UPDATE schedule_shifts SET profile_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
            [shiftA.profileId, shiftB.id]
          );
          await client.query("COMMIT");
          return {
            shiftA: { id: shiftA.id, previousProfileId: shiftA.profileId, newProfileId: shiftB.profileId },
            shiftB: { id: shiftB.id, previousProfileId: shiftB.profileId, newProfileId: shiftA.profileId }
          };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      async function hasWorkShift(id, userId) {
        const result = await pool.query(
          `SELECT 1 FROM work_shifts ws
     JOIN schedule_shifts ss ON ss.id = ws.schedule_shift_id
     WHERE ws.schedule_shift_id = $1 AND ss.user_id = $2`,
          [id, userId]
        );
        return result.rowCount > 0;
      }
      async function recordSwap({ scheduleShiftId, previousProfileId, newProfileId, changedByProfileId }) {
        await pool.query(
          `INSERT INTO schedule_shift_swaps (schedule_shift_id, previous_profile_id, new_profile_id, changed_by_profile_id)
     VALUES ($1, $2, $3, $4)`,
          [scheduleShiftId, previousProfileId, newProfileId, changedByProfileId]
        );
      }
      module.exports = Object.freeze({
        create,
        findById,
        findCurrentForProfile,
        hasWorkShift,
        listByMonth,
        recordSwap,
        remove,
        swapProfiles,
        update
      });
    }
  });

  // ../Loryscare/backend/src/routes/schedule-shifts-routes.js
  var require_schedule_shifts_routes = __commonJS({
    "../Loryscare/backend/src/routes/schedule-shifts-routes.js"(exports, module) {
      var { Router } = require_express();
      function createScheduleShiftsRouter(controller) {
        const router = Router();
        router.get("/current", controller.getCurrent);
        router.get("/", controller.listByMonth);
        router.post("/swap", controller.swap);
        router.patch("/:id", controller.update);
        router.post("/:id/split", controller.split);
        router.delete("/:id", controller.remove);
        return router;
      }
      module.exports = createScheduleShiftsRouter;
    }
  });

  // ../Loryscare/backend/src/services/schedule-shifts-service.js
  var require_schedule_shifts_service = __commonJS({
    "../Loryscare/backend/src/services/schedule-shifts-service.js"(exports, module) {
      var ScheduleShiftValidationError = require_schedule_shift_validation_error();
      var ScheduleShiftNotFoundError = require_schedule_shift_not_found_error();
      function isTime(value) {
        return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
      }
      function pad2(value) {
        return String(value).padStart(2, "0");
      }
      function formatTimestamp(date) {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
      }
      function validateId(value, field = "id") {
        if (!/^\d+$/.test(String(value ?? "")) || value === "0") {
          throw new ScheduleShiftValidationError({ [field]: "Identificador inv\xE1lido" });
        }
      }
      function computeStatus(shift, now) {
        const started = Boolean(shift.workShiftId);
        const windowEnded = new Date(shift.scheduledEndAt) <= now;
        if (started && shift.workShiftEndedAt) return "Conclu\xEDdo";
        if (started && windowEnded) return "Conclu\xEDdo";
        if (started) return "Em andamento";
        if (windowEnded) return "N\xE3o realizado";
        return "Programado";
      }
      function createScheduleShiftsService(repository, caregiverProfilesRepository) {
        async function listByMonth(year, month, userId) {
          const rows = await repository.listByMonth(userId, Number(year), Number(month));
          const now = /* @__PURE__ */ new Date();
          return rows.map((row) => ({ ...row, status: computeStatus(row, now) }));
        }
        async function findCurrentForProfile(profileId, userId) {
          validateId(profileId, "profileId");
          if (!await caregiverProfilesRepository.belongsToUser(profileId, userId)) {
            throw new ScheduleShiftValidationError({ profileId: "Cuidador inv\xE1lido" });
          }
          const now = /* @__PURE__ */ new Date();
          const pad22 = (value) => String(value).padStart(2, "0");
          const nowText = `${now.getFullYear()}-${pad22(now.getMonth() + 1)}-${pad22(now.getDate())} ${pad22(now.getHours())}:${pad22(now.getMinutes())}:${pad22(now.getSeconds())}`;
          const shift = await repository.findCurrentForProfile(userId, profileId, nowText);
          if (!shift) return null;
          return { ...shift, status: computeStatus(shift, now), alreadyStarted: Boolean(shift.workShiftId) };
        }
        async function update(id, input, userId, profileId) {
          validateId(id);
          const details = {};
          const scheduledDate = typeof input.scheduledDate === "string" ? input.scheduledDate : "";
          const scheduledEndDate = typeof input.scheduledEndDate === "string" && input.scheduledEndDate ? input.scheduledEndDate : scheduledDate;
          const scheduledStartTime = typeof input.scheduledStartTime === "string" ? input.scheduledStartTime.trim() : "";
          const scheduledEndTime = typeof input.scheduledEndTime === "string" ? input.scheduledEndTime.trim() : "";
          const newProfileId = input.profileId;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) details.scheduledDate = "Informe uma data v\xE1lida";
          if (!isTime(scheduledStartTime)) details.scheduledStartTime = "Informe um hor\xE1rio v\xE1lido";
          if (!isTime(scheduledEndTime)) details.scheduledEndTime = "Informe um hor\xE1rio v\xE1lido";
          if (!/^\d+$/.test(String(newProfileId ?? ""))) details.profileId = "Selecione um cuidador";
          if (Object.keys(details).length) throw new ScheduleShiftValidationError(details);
          const scheduledStartAt = `${scheduledDate} ${scheduledStartTime}:00`;
          const scheduledEndAt = `${scheduledEndDate} ${scheduledEndTime}:00`;
          if (scheduledEndAt <= scheduledStartAt) {
            throw new ScheduleShiftValidationError({ scheduledEndTime: "O t\xE9rmino deve ser depois do in\xEDcio" });
          }
          const durationHours = (new Date(scheduledEndAt) - new Date(scheduledStartAt)) / 36e5;
          if (durationHours !== 12 && durationHours !== 24) {
            throw new ScheduleShiftValidationError({ scheduledEndTime: "A dura\xE7\xE3o deve ser de 12 ou 24 horas" });
          }
          if (!await caregiverProfilesRepository.belongsToUser(newProfileId, userId)) {
            throw new ScheduleShiftValidationError({ profileId: "Cuidador inv\xE1lido" });
          }
          const existing = await repository.findById(id, userId);
          if (!existing) throw new ScheduleShiftNotFoundError();
          if (await repository.hasWorkShift(id, userId)) {
            throw new ScheduleShiftValidationError({ id: "N\xE3o \xE9 poss\xEDvel editar um plant\xE3o que j\xE1 foi iniciado" });
          }
          const previousProfileId = existing.profileId;
          if (!await repository.update(id, { profileId: newProfileId, scheduledStartAt, scheduledEndAt }, userId)) {
            throw new ScheduleShiftNotFoundError();
          }
          if (String(previousProfileId) !== String(newProfileId)) {
            await repository.recordSwap({
              scheduleShiftId: id,
              previousProfileId,
              newProfileId,
              changedByProfileId: profileId ?? null
            });
          }
        }
        async function remove(id, userId) {
          validateId(id);
          if (!await repository.remove(id, userId)) throw new ScheduleShiftNotFoundError();
        }
        async function swap(shiftIdA, shiftIdB, userId, profileId) {
          validateId(shiftIdA, "shiftIdA");
          validateId(shiftIdB, "shiftIdB");
          if (String(shiftIdA) === String(shiftIdB)) {
            throw new ScheduleShiftValidationError({ shiftIdB: "Escolha dois plant\xF5es diferentes" });
          }
          if (await repository.hasWorkShift(shiftIdA, userId) || await repository.hasWorkShift(shiftIdB, userId)) {
            throw new ScheduleShiftValidationError({ shiftIdA: "N\xE3o \xE9 poss\xEDvel trocar um plant\xE3o que j\xE1 foi iniciado" });
          }
          const result = await repository.swapProfiles(shiftIdA, shiftIdB, userId);
          if (!result) throw new ScheduleShiftNotFoundError();
          await repository.recordSwap({
            scheduleShiftId: result.shiftA.id,
            previousProfileId: result.shiftA.previousProfileId,
            newProfileId: result.shiftA.newProfileId,
            changedByProfileId: profileId ?? null
          });
          await repository.recordSwap({
            scheduleShiftId: result.shiftB.id,
            previousProfileId: result.shiftB.previousProfileId,
            newProfileId: result.shiftB.newProfileId,
            changedByProfileId: profileId ?? null
          });
        }
        async function split(id, coveringProfileId, userId) {
          validateId(id);
          validateId(coveringProfileId, "coveringProfileId");
          if (!await caregiverProfilesRepository.belongsToUser(coveringProfileId, userId)) {
            throw new ScheduleShiftValidationError({ coveringProfileId: "Cuidador inv\xE1lido" });
          }
          const existing = await repository.findById(id, userId);
          if (!existing) throw new ScheduleShiftNotFoundError();
          if (await repository.hasWorkShift(id, userId)) {
            throw new ScheduleShiftValidationError({ id: "N\xE3o \xE9 poss\xEDvel dividir um plant\xE3o que j\xE1 foi iniciado" });
          }
          const start = new Date(existing.scheduledStartAt);
          const end = new Date(existing.scheduledEndAt);
          const durationHours = (end - start) / 36e5;
          if (durationHours !== 24) {
            throw new ScheduleShiftValidationError({ id: "S\xF3 \xE9 poss\xEDvel dividir um plant\xE3o de 24 horas" });
          }
          const midpoint = new Date(start.getTime() + 12 * 36e5);
          await repository.update(id, {
            profileId: existing.profileId,
            scheduledStartAt: formatTimestamp(start),
            scheduledEndAt: formatTimestamp(midpoint)
          }, userId);
          await repository.create({
            scheduleMonthId: existing.scheduleMonthId,
            scheduledStartAt: formatTimestamp(midpoint),
            scheduledEndAt: formatTimestamp(end),
            profileId: coveringProfileId
          }, userId);
        }
        return Object.freeze({ findCurrentForProfile, listByMonth, remove, split, swap, update });
      }
      module.exports = createScheduleShiftsService;
    }
  });

  // ../Loryscare/backend/src/middleware/require-auth.js
  var require_require_auth = __commonJS({
    "../Loryscare/backend/src/middleware/require-auth.js"(exports, module) {
      var AuthenticationError = require_auth_authentication_error();
      function createRequireAuth(authService) {
        return function requireAuth(request, response, next) {
          try {
            const header = request.headers.authorization ?? "";
            const [scheme, token] = header.split(" ");
            if (scheme !== "Bearer" || !token) throw new AuthenticationError("Fa\xE7a login para continuar");
            const { userId } = authService.verifyToken(token);
            request.userId = userId;
            next();
          } catch (error) {
            if (error instanceof AuthenticationError) response.status(401).json({ error: error.message });
            else next(error);
          }
        };
      }
      module.exports = createRequireAuth;
    }
  });

  // ../Loryscare/backend/src/middleware/attach-profile.js
  var require_attach_profile = __commonJS({
    "../Loryscare/backend/src/middleware/attach-profile.js"(exports, module) {
      function createAttachProfile(caregiverProfilesRepository) {
        return async function attachProfile(request, response, next) {
          try {
            const header = request.headers["x-profile-id"];
            if (!header) {
              request.profileId = null;
              return next();
            }
            if (!/^\d+$/.test(header)) {
              return response.status(400).json({ error: "Perfil inv\xE1lido" });
            }
            if (!await caregiverProfilesRepository.belongsToUser(header, request.userId)) {
              return response.status(400).json({ error: "Perfil inv\xE1lido" });
            }
            request.profileId = header;
            next();
          } catch (error) {
            next(error);
          }
        };
      }
      module.exports = createAttachProfile;
    }
  });

  // ../Loryscare/backend/src/realtime/change-bus.js
  var require_change_bus = __commonJS({
    "../Loryscare/backend/src/realtime/change-bus.js"(exports, module) {
      function createChangeBus() {
        const subscribers = /* @__PURE__ */ new Map();
        function subscribe(userId, res) {
          const key = String(userId);
          if (!subscribers.has(key)) subscribers.set(key, /* @__PURE__ */ new Set());
          subscribers.get(key).add(res);
        }
        function unsubscribe(userId, res) {
          const key = String(userId);
          const set = subscribers.get(key);
          if (!set) return;
          set.delete(res);
          if (set.size === 0) subscribers.delete(key);
        }
        function publish(userId, event) {
          const set = subscribers.get(String(userId));
          if (!set) return;
          const payload = `data: ${JSON.stringify(event)}

`;
          for (const res of set) res.write(payload);
        }
        return Object.freeze({ publish, subscribe, unsubscribe });
      }
      module.exports = createChangeBus;
    }
  });

  // ../Loryscare/backend/src/app.js
  var require_app = __commonJS({
    "../Loryscare/backend/src/app.js"(exports, module) {
      var path = require_path();
      var cors = require_passa();
      var express = require_express();
      var pool = require_database();
      var createVitalsController = require_vitals_controller();
      var vitalsRepository = require_vitals_repository();
      var createVitalsRouter = require_vitals_routes();
      var createVitalsService = require_vitals_service();
      var createMedicationsController = require_medications_controller();
      var medicationsRepository = require_medications_repository();
      var createMedicationsRouter = require_medications_routes();
      var createMedicationsService = require_medications_service();
      var createRoutinesController = require_routines_controller();
      var routinesRepository = require_routines_repository();
      var createRoutinesRouter = require_routines_routes();
      var createRoutinesService = require_routines_service();
      var createEventsController = require_events_controller();
      var eventsRepository = require_events_repository();
      var createEventsRouter = require_events_routes();
      var createEventsService = require_events_service();
      var createNursingNotesController = require_nursing_notes_controller();
      var nursingNotesRepository = require_nursing_notes_repository();
      var createNursingNotesRouter = require_nursing_notes_routes();
      var createNursingNotesService = require_nursing_notes_service();
      var createPatientsController = require_patients_controller();
      var patientsRepository = require_patients_repository();
      var createPatientsRouter = require_patients_routes();
      var createPatientsService = require_patients_service();
      var createAuthController = require_auth_controller();
      var usersRepository = require_users_repository();
      var createAuthRouter = require_auth_routes();
      var createAuthService = require_auth_service();
      var createCaregiverProfilesController = require_caregiver_profiles_controller();
      var caregiverProfilesRepository = require_caregiver_profiles_repository();
      var createCaregiverProfilesRouter = require_caregiver_profiles_routes();
      var createCaregiverProfilesService = require_caregiver_profiles_service();
      var createWorkShiftsController = require_work_shifts_controller();
      var workShiftsRepository = require_work_shifts_repository();
      var createWorkShiftsRouter = require_work_shifts_routes();
      var createWorkShiftsService = require_work_shifts_service();
      var createScheduleMonthsController = require_schedule_months_controller();
      var scheduleMonthsRepository = require_schedule_months_repository();
      var createScheduleMonthsRouter = require_schedule_months_routes();
      var createScheduleMonthsService = require_schedule_months_service();
      var createScheduleShiftsController = require_schedule_shifts_controller();
      var scheduleShiftsRepository = require_schedule_shifts_repository();
      var createScheduleShiftsRouter = require_schedule_shifts_routes();
      var createScheduleShiftsService = require_schedule_shifts_service();
      var createRequireAuth = require_require_auth();
      var createAttachProfile = require_attach_profile();
      var createChangeBus = require_change_bus();
      var app = express();
      var changeBus = createChangeBus();
      app.use(cors({ origin: true }));
      app.use(express.json({ limit: "2mb" }));
      app.use(express.static(path.join(__dirname, "../../frontend")));
      var authService = createAuthService(usersRepository);
      var authController = createAuthController(authService);
      var requireAuth = createRequireAuth(authService);
      var attachProfile = createAttachProfile(caregiverProfilesRepository);
      app.use("/api/auth", createAuthRouter(authController, requireAuth));
      var vitalsService = createVitalsService(vitalsRepository);
      var vitalsController = createVitalsController(vitalsService, changeBus);
      app.use("/api/vitals", requireAuth, attachProfile, createVitalsRouter(vitalsController));
      var medicationsService = createMedicationsService(medicationsRepository);
      var medicationsController = createMedicationsController(medicationsService, changeBus);
      app.use("/api/medications", requireAuth, attachProfile, createMedicationsRouter(medicationsController));
      var routinesService = createRoutinesService(routinesRepository);
      var routinesController = createRoutinesController(routinesService, changeBus);
      app.use("/api/routines", requireAuth, attachProfile, createRoutinesRouter(routinesController));
      var patientsService = createPatientsService(patientsRepository);
      var patientsController = createPatientsController(patientsService);
      app.use("/api/patients", requireAuth, createPatientsRouter(patientsController));
      var eventsService = createEventsService(eventsRepository);
      var eventsController = createEventsController(eventsService, changeBus);
      app.use("/api/events", requireAuth, attachProfile, createEventsRouter(eventsController));
      var nursingNotesService = createNursingNotesService(nursingNotesRepository, workShiftsRepository);
      var nursingNotesController = createNursingNotesController(nursingNotesService, changeBus);
      app.use("/api/nursing-notes", requireAuth, attachProfile, createNursingNotesRouter(nursingNotesController));
      var caregiverProfilesService = createCaregiverProfilesService(caregiverProfilesRepository);
      var caregiverProfilesController = createCaregiverProfilesController(caregiverProfilesService, changeBus);
      app.use("/api/caregiver-profiles", requireAuth, createCaregiverProfilesRouter(caregiverProfilesController));
      var workShiftsService = createWorkShiftsService(workShiftsRepository, scheduleShiftsRepository);
      var workShiftsController = createWorkShiftsController(workShiftsService);
      app.use("/api/work-shifts", requireAuth, attachProfile, createWorkShiftsRouter(workShiftsController));
      var scheduleMonthsService = createScheduleMonthsService(scheduleMonthsRepository, caregiverProfilesRepository);
      var scheduleMonthsController = createScheduleMonthsController(scheduleMonthsService, changeBus);
      app.use("/api/schedule-months", requireAuth, attachProfile, createScheduleMonthsRouter(scheduleMonthsController));
      var scheduleShiftsService = createScheduleShiftsService(scheduleShiftsRepository, caregiverProfilesRepository);
      var scheduleShiftsController = createScheduleShiftsController(scheduleShiftsService, changeBus);
      app.use("/api/schedule-shifts", requireAuth, attachProfile, createScheduleShiftsRouter(scheduleShiftsController));
      app.get("/api/stream", (request, response) => {
        let userId;
        try {
          ({ userId } = authService.verifyToken(request.query.token));
        } catch (error) {
          response.status(401).end();
          return;
        }
        response.set({
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive"
        });
        response.flushHeaders();
        response.write("retry: 3000\n\n");
        changeBus.subscribe(userId, response);
        request.on("close", () => changeBus.unsubscribe(userId, response));
      });
      app.get("/health", (request, response) => {
        response.status(200).json({
          status: "ok",
          service: "Lory's Care API"
        });
      });
      app.get("/health/database", async (request, response) => {
        try {
          const result = await pool.query(
            "SELECT CURRENT_DATABASE() AS database, CURRENT_TIMESTAMP AS checked_at"
          );
          response.status(200).json({
            status: "ok",
            database: result.rows[0].database,
            checkedAt: result.rows[0].checked_at
          });
        } catch (error) {
          console.error("Falha ao verificar o banco de dados:", error.message);
          response.status(503).json({
            status: "error",
            message: "Banco de dados indispon\xEDvel"
          });
        }
      });
      app.use((error, request, response, next) => {
        console.error("Erro inesperado na API:", error.message);
        response.status(500).json({
          error: "Erro interno do servidor"
        });
      });
      module.exports = app;
      module.exports.changeBus = changeBus;
    }
  });

  // entry.js
  var require_entry = __commonJS({
    "entry.js"(exports, module) {
      var { definirBanco } = require_pg();
      var app = require_app();
      module.exports = { app, definirBanco };
    }
  });
  return require_entry();
})();
