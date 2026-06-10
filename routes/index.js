const express = require("express");
const wrap = require("express-async-error-wrapper");
const axios = require("axios");
const sql = require("../data/sql");
const repository = require("../data/repositories/monitoramentoRepository");

const router = express.Router();
const DB_MESSAGE = "Não foi possível consultar o MySQL. Verifique a conexão e tente novamente.";

function pad2(value) {
	return String(value).padStart(2, "0");
}

function codigoOdor(idSensor) {
	return "odor" + pad2(idSensor);
}

function parseId(value) {
	const parsed = Number.parseInt(value, 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalNumber(value) {
	if (value == null || value === "") {
		return null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : NaN;
}

function parseNumberOrDefault(value, fallback) {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function emptyGraphs() {
	return {
		graficoOdor: { labels: [], values: [] },
		graficoNivel: { labels: [], values: [] },
		graficoPressao: { labels: [], values: [] },
		graficoTemp: { labels: [], temp: [], umidade: [] }
	};
}

function emptyDashboard() {
	return {
		sensores: [],
		leiturasOdor: [],
		niveis: [],
		pressoes: [],
		alertas: [],
		cards: [],
		graficos: emptyGraphs()
	};
}

function logDatabaseError(context, error) {
	let message = error && error.message;
	if (!message && error && Array.isArray(error.errors)) {
		message = error.errors
			.map((item) => item.message || item.code)
			.filter(Boolean)
			.join("; ");
	}
	console.error("[DB][" + context + "]", message || (error && error.code) || "Falha de conexão com o MySQL");
}

async function gerarAlertasOdor(conn, sensor, leitura) {
	if (Number(leitura.h2s) >= Number(sensor.h2s_critico)) {
		const existe = await conn.scalar(
			`SELECT COUNT(*)
			 FROM alerta
			 WHERE id_sensor = ?
			   AND tipo = 'h2s_elevado'
			   AND resolvido = 0
			   AND data >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
			[sensor.id]
		);
		if (!existe) {
			await conn.query(
				`INSERT INTO alerta (id_sensor, tipo, mensagem, severidade)
				 VALUES (?, 'h2s_elevado', ?, 'alta')`,
				[sensor.id, "H₂S elevado em " + sensor.codigo + " (" + leitura.h2s + " ppm)"]
			);
		}
	}

	if (Number(leitura.nh3) >= Number(sensor.nh3_critico)) {
		const existe = await conn.scalar(
			`SELECT COUNT(*)
			 FROM alerta
			 WHERE id_sensor = ?
			   AND tipo = 'nh3_elevado'
			   AND resolvido = 0
			   AND data >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
			[sensor.id]
		);
		if (!existe) {
			await conn.query(
				`INSERT INTO alerta (id_sensor, tipo, mensagem, severidade)
				 VALUES (?, 'nh3_elevado', ?, 'media')`,
				[sensor.id, "NH₃ elevado em " + sensor.codigo + " (" + leitura.nh3 + " ppm)"]
			);
		}
	}
}

async function sincronizarOdor(conn) {
	const urlApi = process.env.url_api || "";
	if (!urlApi) {
		return 0;
	}

	const idInferior = Number(await conn.scalar(
		"SELECT COALESCE(MAX(id), 0) FROM odor"
	)) || 0;
	const response = await axios.get(urlApi, {
		params: { sensor: "odor", id_inferior: idInferior },
		timeout: 12000
	});
	const dadosNovos = Array.isArray(response.data) ? response.data : [];
	const sensores = await conn.query(
		`SELECT id, codigo, h2s_critico, nh3_critico
		 FROM sensor
		 WHERE tipo = 'odor' AND ativo = 1`
	);
	const sensoresPorCodigo = new Map(sensores.map((sensor) => [sensor.codigo, sensor]));
	let inseridos = 0;

	for (const leitura of dadosNovos) {
		const sensor = sensoresPorCodigo.get(codigoOdor(leitura.id_sensor));
		if (!sensor) {
			continue;
		}

		await conn.query(
			`INSERT IGNORE INTO odor
				(id, data, id_sensor, delta, bateria, h2s, umidade, nh3, temperatura)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				leitura.id,
				leitura.data,
				sensor.id,
				leitura.delta,
				leitura.bateria,
				leitura.h2s,
				leitura.umidade,
				leitura.nh3,
				leitura.temperatura
			]
		);

		if (conn.affectedRows > 0) {
			inseridos++;
			await gerarAlertasOdor(conn, sensor, leitura);
		}
	}

	return inseridos;
}

function sincronizarOdorEmSegundoPlano() {
	if (!process.env.url_api) {
		return;
	}

	sql.connect(sincronizarOdor)
		.then((total) => {
			if (total > 0) {
				console.log(total + " leitura(s) de odor sincronizada(s).");
			}
		})
		.catch((error) => {
			console.error("[API odor]", error.message);
		});
}

function montarCardsSensores(sensores) {
	return sensores.map((sensor) => {
		const card = {
			codigo: sensor.codigo,
			nome: sensor.nome,
			localizacao: sensor.localizacao,
			tipo: sensor.tipo,
			status: "offline",
			badge: "Offline",
			valorHtml: "Sem leitura",
			classe: "sensor-card offline"
		};

		if (sensor.tipo === "odor" && sensor.ultimo_h2s != null) {
			const critico = Number(sensor.ultimo_h2s) >= Number(sensor.h2s_critico);
			card.status = critico ? "alert" : "online";
			card.badge = critico ? "Alerta" : "Online";
			card.valorHtml = Number(sensor.ultimo_h2s).toFixed(3) + " <small>ppm H₂S</small>";
		} else if (sensor.tipo === "nivel" && sensor.ultimo_nivel != null) {
			const critico = Number(sensor.ultimo_nivel) >= Number(sensor.nivel_critico);
			card.status = critico ? "alert" : "online";
			card.badge = critico ? "Alerta" : "Online";
			card.valorHtml = Number(sensor.ultimo_nivel).toFixed(1) + " <small>%</small>";
		} else if (sensor.tipo === "pressao" && sensor.ultima_pressao != null) {
			card.status = "online";
			card.badge = "Online";
			card.valorHtml = Number(sensor.ultima_pressao).toFixed(2) + " <small>bar</small>";
		}

		if (card.status !== "offline") {
			card.classe = "sensor-card " + card.status;
		}
		return card;
	});
}

function formatarHora(data) {
	const date = new Date(data);
	return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function primeiraSerie(rows, valueField) {
	const validRows = rows.filter((row) => row[valueField] != null);
	if (!validRows.length) {
		return [];
	}
	const codigo = validRows[0].codigo;
	return validRows.filter((row) => row.codigo === codigo);
}

function montarGraficos(leiturasOdor, niveis, pressoes) {
	const odor = primeiraSerie(leiturasOdor, "h2s");
	const nivel = primeiraSerie(niveis, "nivel_percentual");
	const pressao = primeiraSerie(pressoes, "pressao");

	return {
		graficoOdor: {
			labels: odor.map((row) => formatarHora(row.data)),
			values: odor.map((row) => Number(row.h2s))
		},
		graficoNivel: {
			labels: nivel.map((row) => formatarHora(row.data)),
			values: nivel.map((row) => Number(row.nivel_percentual))
		},
		graficoPressao: {
			labels: pressao.map((row) => formatarHora(row.data)),
			values: pressao.map((row) => Number(row.pressao))
		},
		graficoTemp: {
			labels: odor.map((row) => formatarHora(row.data)),
			temp: odor.map((row) => Number(row.temperatura)),
			umidade: odor.map((row) => Number(row.umidade))
		}
	};
}

async function carregarDashboardCompleto() {
	const dados = await repository.carregarDashboard();
	return {
		...dados,
		cards: montarCardsSensores(dados.sensores),
		graficos: montarGraficos(dados.leiturasOdor, dados.niveis, dados.pressoes)
	};
}

router.get("/", wrap(async (req, res) => {
	let resumo = {
		sensoresAtivos: 0,
		alertasAbertos: 0,
		ultimoNivel: null,
		ultimoOdor: []
	};
	let avisoDb = null;

	try {
		resumo = await repository.carregarResumo();
		sincronizarOdorEmSegundoPlano();
	} catch (error) {
		logDatabaseError("resumo", error);
		avisoDb = DB_MESSAGE;
	}

	res.render("index/index", {
		titulo: "Início",
		usuario: "Operador",
		resumo,
		sincronizados: 0,
		avisoDb
	});
}));

router.get("/dashboard", wrap(async (req, res) => {
	let dados = emptyDashboard();
	let avisoDb = null;

	try {
		dados = await carregarDashboardCompleto();
		sincronizarOdorEmSegundoPlano();
	} catch (error) {
		logDatabaseError("dashboard", error);
		avisoDb = DB_MESSAGE;
	}

	res.render("index/dashboard", {
		titulo: "Dashboard",
		alertas: dados.alertas,
		cards: dados.cards,
		graficos: dados.graficos,
		atualizadoEm: new Date(),
		avisoDb
	});
}));

router.get("/sensores", wrap(async (req, res) => {
	let sensores = [];
	let erro = req.query.erro || null;

	try {
		sensores = await repository.listarSensores();
	} catch (error) {
		logDatabaseError("sensores", error);
		erro = DB_MESSAGE;
	}

	res.render("index/produtos", {
		titulo: "Sensores",
		produtos: sensores,
		mensagem: req.query.ok ? "Sensor salvo com sucesso." : null,
		erro
	});
}));

router.get("/sensores/novo", wrap(async (req, res) => {
	res.render("index/teste", {
		titulo: "Novo Sensor",
		sensor: null,
		erro: req.query.erro || null
	});
}));

router.post("/sensores/novo", wrap(async (req, res) => {
	const { codigo, nome, tipo, localizacao } = req.body;
	if (!codigo || !nome || !tipo || !localizacao) {
		return res.redirect("/sensores/novo?erro=" + encodeURIComponent("Preencha todos os campos obrigatórios"));
	}
	if (!["odor", "nivel", "pressao"].includes(tipo)) {
		return res.redirect("/sensores/novo?erro=" + encodeURIComponent("Tipo de sensor inválido"));
	}

	try {
		await repository.criarSensor({
			codigo: codigo.trim(),
			nome: nome.trim(),
			tipo,
			localizacao: localizacao.trim(),
			nivel_critico: parseNumberOrDefault(req.body.nivel_critico, 80),
			h2s_critico: parseNumberOrDefault(req.body.h2s_critico, 0.05),
			nh3_critico: parseNumberOrDefault(req.body.nh3_critico, 0.03)
		});
		res.redirect("/sensores?ok=1");
	} catch (error) {
		logDatabaseError("novo sensor", error);
		const message = error.code === "ER_DUP_ENTRY"
			? "Já existe um sensor com esse código."
			: "Não foi possível salvar o sensor no MySQL.";
		res.redirect("/sensores/novo?erro=" + encodeURIComponent(message));
	}
}));

router.post("/sensores/:id/excluir", wrap(async (req, res) => {
	const id = parseId(req.params.id);
	if (!id) {
		return res.redirect("/sensores?erro=" + encodeURIComponent("Sensor inválido"));
	}

	try {
		await repository.desativarSensor(id);
		res.redirect("/sensores?ok=1");
	} catch (error) {
		logDatabaseError("desativar sensor", error);
		res.redirect("/sensores?erro=" + encodeURIComponent("Não foi possível desativar o sensor."));
	}
}));

router.get("/niveis", wrap(async (req, res) => {
	let dados = { sensores: [], niveis: [] };
	let erro = req.query.erro || null;

	try {
		dados = await repository.carregarNiveis();
	} catch (error) {
		logDatabaseError("níveis", error);
		erro = DB_MESSAGE;
	}

	res.render("index/teste2", {
		titulo: "Níveis de Esgoto",
		sensores: dados.sensores,
		niveis: dados.niveis,
		mensagem: req.query.ok ? "Leitura registrada." : null,
		erro
	});
}));

router.post("/niveis", wrap(async (req, res) => {
	const idSensor = parseId(req.body.id_sensor);
	const nivel = parseOptionalNumber(req.body.nivel_percentual);
	const vazao = parseOptionalNumber(req.body.vazao);
	const pressao = parseOptionalNumber(req.body.pressao);

	if (!idSensor) {
		return res.redirect("/niveis?erro=" + encodeURIComponent("Selecione um sensor"));
	}
	if ([nivel, vazao, pressao].some(Number.isNaN)) {
		return res.redirect("/niveis?erro=" + encodeURIComponent("Informe apenas valores numéricos válidos"));
	}
	if (nivel === null && pressao === null) {
		return res.redirect("/niveis?erro=" + encodeURIComponent("Informe nível (%) ou pressão (bar)"));
	}
	if (nivel !== null && (nivel < 0 || nivel > 100)) {
		return res.redirect("/niveis?erro=" + encodeURIComponent("O nível deve estar entre 0 e 100%"));
	}

	try {
		await repository.registrarNivel({
			id_sensor: idSensor,
			nivel_percentual: nivel,
			vazao,
			pressao
		});
		res.redirect("/niveis?ok=1");
	} catch (error) {
		logDatabaseError("registrar nível", error);
		const message = error.code === "SENSOR_INVALIDO"
			? error.message
			: "Não foi possível registrar a leitura no MySQL.";
		res.redirect("/niveis?erro=" + encodeURIComponent(message));
	}
}));

router.get("/alertas", wrap(async (req, res) => {
	let alertas = [];
	let erro = req.query.erro || null;

	try {
		alertas = await repository.listarAlertas();
	} catch (error) {
		logDatabaseError("alertas", error);
		erro = DB_MESSAGE;
	}

	res.render("index/teste3", {
		titulo: "Alertas",
		alertas,
		mensagem: req.query.ok ? "Alerta atualizado." : null,
		erro
	});
}));

router.post("/alertas/:id/resolver", wrap(async (req, res) => {
	const id = parseId(req.params.id);
	if (!id) {
		return res.redirect("/alertas?erro=" + encodeURIComponent("Alerta inválido"));
	}

	try {
		await repository.resolverAlerta(id);
		res.redirect("/alertas?ok=1");
	} catch (error) {
		logDatabaseError("resolver alerta", error);
		res.redirect("/alertas?erro=" + encodeURIComponent("Não foi possível atualizar o alerta."));
	}
}));

router.get("/api/resumo", wrap(async (req, res) => {
	try {
		res.json(await repository.carregarResumo());
	} catch (error) {
		logDatabaseError("api/resumo", error);
		res.status(503).json({
			erro: DB_MESSAGE,
			sensoresAtivos: 0,
			alertasAbertos: 0,
			ultimoNivel: null,
			ultimoOdor: []
		});
	}
}));

router.get("/api/dashboard", wrap(async (req, res) => {
	try {
		res.json(await carregarDashboardCompleto());
	} catch (error) {
		logDatabaseError("api/dashboard", error);
		res.status(503).json({ erro: DB_MESSAGE, ...emptyDashboard() });
	}
}));

router.get("/api/sensores", wrap(async (req, res) => {
	try {
		res.json(await repository.listarSensores());
	} catch (error) {
		logDatabaseError("api/sensores", error);
		res.status(503).json({ erro: DB_MESSAGE, sensores: [] });
	}
}));

router.get("/api/niveis", wrap(async (req, res) => {
	try {
		res.json(await repository.carregarNiveis());
	} catch (error) {
		logDatabaseError("api/niveis", error);
		res.status(503).json({ erro: DB_MESSAGE, sensores: [], niveis: [] });
	}
}));

router.get("/api/alertas", wrap(async (req, res) => {
	try {
		res.json(await repository.listarAlertas());
	} catch (error) {
		logDatabaseError("api/alertas", error);
		res.status(503).json({ erro: DB_MESSAGE, alertas: [] });
	}
}));

module.exports = router;
