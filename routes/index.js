const express = require("express");
const wrap = require("express-async-error-wrapper");
const axios = require("axios");
const sql = require("../data/sql");

const router = express.Router();
const url_api = process.env.url_api || "";

function pad2(n) {
	return String(n).padStart(2, "0");
}

function codigoOdor(idSensor) {
	return "odor" + pad2(idSensor);
}

async function sincronizarOdor(sqlConn) {
	if (!url_api) {
		return 0;
	}

	let idInferior = 0;
	try {
		const maxRow = await sqlConn.query("SELECT COALESCE(MAX(id), 0) AS id FROM odor");
		if (maxRow[0]) {
			idInferior = Number(maxRow[0].id) || 0;
		}
	} catch (e) {
		return 0;
	}

	const response = await axios.get(url_api + "?sensor=odor&id_inferior=" + idInferior, { timeout: 12000 });
	const dadosNovos = Array.isArray(response.data) ? response.data : [];

	for (let i = 0; i < dadosNovos.length; i++) {
		const d = dadosNovos[i];
		await sqlConn.query(
			"INSERT IGNORE INTO odor (id, data, id_sensor, delta, bateria, h2s, umidade, nh3, temperatura) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			[d.id, d.data, d.id_sensor, d.delta, d.bateria, d.h2s, d.umidade, d.nh3, d.temperatura]
		);
		await gerarAlertasOdor(sqlConn, d);
	}

	return dadosNovos.length;
}

async function gerarAlertasOdor(sqlConn, leitura) {
	const codigo = codigoOdor(leitura.id_sensor);
	const rows = await sqlConn.query(
		"SELECT id, codigo, h2s_critico, nh3_critico FROM sensor WHERE codigo = ? AND ativo = 1 LIMIT 1",
		[codigo]
	);
	if (!rows.length) {
		return;
	}

	const sensorRef = rows[0];

	if (Number(leitura.h2s) >= Number(sensorRef.h2s_critico)) {
		const existe = await sqlConn.scalar(
			"SELECT COUNT(*) FROM alerta WHERE id_sensor = ? AND tipo = 'h2s_elevado' AND resolvido = 0 AND data >= DATE_SUB(NOW(), INTERVAL 1 HOUR)",
			[sensorRef.id]
		);
		if (!existe) {
			await sqlConn.query(
				"INSERT INTO alerta (id_sensor, tipo, mensagem, severidade) VALUES (?, 'h2s_elevado', ?, 'alta')",
				[sensorRef.id, "H2S elevado em " + sensorRef.codigo + " (" + leitura.h2s + " ppm)"]
			);
		}
	}

	if (Number(leitura.nh3) >= Number(sensorRef.nh3_critico)) {
		const existe = await sqlConn.scalar(
			"SELECT COUNT(*) FROM alerta WHERE id_sensor = ? AND tipo = 'nh3_elevado' AND resolvido = 0 AND data >= DATE_SUB(NOW(), INTERVAL 1 HOUR)",
			[sensorRef.id]
		);
		if (!existe) {
			await sqlConn.query(
				"INSERT INTO alerta (id_sensor, tipo, mensagem, severidade) VALUES (?, 'nh3_elevado', ?, 'media')",
				[sensorRef.id, "NH3 elevado em " + sensorRef.codigo + " (" + leitura.nh3 + " ppm)"]
			);
		}
	}
}

async function carregarResumo() {
	return sql.connect(async (conn) => {
		const sensoresAtivos = await conn.scalar("SELECT COUNT(*) FROM sensor WHERE ativo = 1") || 0;
		const alertasAbertos = await conn.scalar("SELECT COUNT(*) FROM alerta WHERE resolvido = 0") || 0;
		const ultimoNivel = await conn.query(
			`SELECT n.nivel_percentual, n.data, s.codigo
			 FROM nivel_esgoto n
			 INNER JOIN sensor s ON s.id = n.id_sensor
			 WHERE s.tipo = 'nivel' AND n.nivel_percentual IS NOT NULL
			 ORDER BY n.data DESC LIMIT 1`
		);
		const ultimoOdor = await conn.query(
			"SELECT h2s, data, id_sensor, bateria FROM odor ORDER BY data DESC LIMIT 2"
		);
		return {
			sensoresAtivos,
			alertasAbertos,
			ultimoNivel: ultimoNivel[0] || null,
			ultimoOdor: ultimoOdor || []
		};
	});
}

function montarCardsSensores(sensores, leiturasOdor, niveis, pressoes) {
	const cards = [];

	for (let i = 0; i < sensores.length; i++) {
		const s = sensores[i];
		let card = {
			codigo: s.codigo,
			nome: s.nome,
			localizacao: s.localizacao,
			tipo: s.tipo,
			status: "offline",
			badge: "Offline",
			valorHtml: "Sem leitura",
			classe: "sensor-card offline"
		};

		if (s.tipo === "odor") {
			const num = parseInt(s.codigo.replace(/\D/g, ""), 10);
			const leituras = leiturasOdor.filter((o) => o.id_sensor === num);
			const ultima = leituras.length ? leituras[leituras.length - 1] : null;
			if (ultima) {
				const critico = Number(ultima.h2s) >= Number(s.h2s_critico);
				card.status = critico ? "alert" : "online";
				card.badge = critico ? "Alerta" : "Online";
				card.valorHtml = Number(ultima.h2s).toFixed(3) + ' <small>ppm H₂S</small>';
				card.classe = "sensor-card " + card.status;
			}
		} else if (s.tipo === "nivel") {
			const leituras = niveis.filter((n) => n.id_sensor === s.id && n.nivel_percentual != null);
			const ultima = leituras.length ? leituras[leituras.length - 1] : null;
			if (ultima) {
				const critico = Number(ultima.nivel_percentual) >= Number(s.nivel_critico);
				card.status = critico ? "alert" : "online";
				card.badge = critico ? "Alerta" : "Online";
				card.valorHtml = Number(ultima.nivel_percentual).toFixed(1) + " <small>%</small>";
				card.classe = "sensor-card " + card.status;
			}
		} else if (s.tipo === "pressao") {
			const leituras = pressoes.filter((p) => p.codigo === s.codigo);
			const ultima = leituras.length ? leituras[leituras.length - 1] : null;
			if (ultima) {
				card.status = "online";
				card.badge = "Online";
				card.valorHtml = Number(ultima.pressao).toFixed(2) + " <small>bar</small>";
				card.classe = "sensor-card online";
			}
		}

		cards.push(card);
	}

	return cards;
}

function montarGraficos(leiturasOdor, niveis, pressoes) {
	const odor1 = leiturasOdor.filter((r) => r.id_sensor === 1);
	const odor2 = leiturasOdor.filter((r) => r.id_sensor === 2);
	const listaOdor = odor1.length ? odor1 : odor2.length ? odor2 : leiturasOdor;

	const graficoOdor = {
		labels: listaOdor.map((r) => formatarHora(r.data)),
		values: listaOdor.map((r) => Number(r.h2s))
	};

	const niveisComValor = niveis.filter((n) => n.nivel_percentual != null);
	const graficoNivel = {
		labels: niveisComValor.map((n) => formatarHora(n.data)),
		values: niveisComValor.map((n) => Number(n.nivel_percentual))
	};

	const graficoPressao = {
		labels: pressoes.map((p) => formatarHora(p.data)),
		values: pressoes.map((p) => Number(p.pressao))
	};

	const graficoTemp = {
		labels: listaOdor.map((r) => formatarHora(r.data)),
		temp: listaOdor.map((r) => Number(r.temperatura)),
		umidade: listaOdor.map((r) => Number(r.umidade))
	};

	return { graficoOdor, graficoNivel, graficoPressao, graficoTemp };
}

function formatarHora(data) {
	const d = new Date(data);
	return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

router.get("/", wrap(async (req, res) => {
	let sincronizados = 0;
	let avisoDb = null;

	try {
		await sql.connect(async (conn) => {
			sincronizados = await sincronizarOdor(conn);
		});
	} catch (e) {
		console.error("Sync:", e.message);
		avisoDb = "Não foi possível sincronizar com a API. Dados locais serão exibidos.";
	}

	let resumo = { sensoresAtivos: 0, alertasAbertos: 0, ultimoNivel: null, ultimoOdor: [] };
	try {
		resumo = await carregarResumo();
	} catch (e) {
		avisoDb = "Erro ao conectar no MySQL. Verifique o .env e execute o script.sql.";
	}

	res.render("index/index", {
		titulo: "Início",
		usuario: "Operador",
		resumo,
		sincronizados,
		avisoDb
	});
}));

router.get("/dashboard", wrap(async (req, res) => {
	const dados = await sql.connect(async (conn) => {
		try {
			await sincronizarOdor(conn);
		} catch (e) {
			console.error("Sync:", e.message);
		}

		const sensores = await conn.query("SELECT * FROM sensor WHERE ativo = 1 ORDER BY codigo");

		const leiturasOdor = await conn.query(
			`SELECT o.* FROM odor o
			 WHERE o.data >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
			 ORDER BY o.data ASC`
		);

		const niveis = await conn.query(
			`SELECT n.*, s.codigo, s.nivel_critico
			 FROM nivel_esgoto n
			 INNER JOIN sensor s ON s.id = n.id_sensor
			 WHERE n.data >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
			 ORDER BY n.data ASC`
		);

		const pressoes = await conn.query(
			`SELECT n.data, n.pressao, s.codigo, s.id AS id_sensor
			 FROM nivel_esgoto n
			 INNER JOIN sensor s ON s.id = n.id_sensor
			 WHERE s.tipo = 'pressao' AND n.pressao IS NOT NULL
			 ORDER BY n.data ASC`
		);

		const alertas = await conn.query(
			`SELECT a.*, s.codigo, s.nome
			 FROM alerta a
			 INNER JOIN sensor s ON s.id = a.id_sensor
			 WHERE a.resolvido = 0
			 ORDER BY a.data DESC
			 LIMIT 20`
		);

		const cards = montarCardsSensores(sensores, leiturasOdor, niveis, pressoes);
		const graficos = montarGraficos(leiturasOdor, niveis, pressoes);

		return { sensores, leiturasOdor, niveis, pressoes, alertas, cards, graficos };
	});

	res.render("index/dashboard", {
		titulo: "Dashboard",
		alertas: dados.alertas || [],
		cards: dados.cards || [],
		graficos: dados.graficos,
		atualizadoEm: new Date()
	});
}));

router.get("/sensores", wrap(async (req, res) => {
	const sensores = await sql.connect((conn) => conn.query("SELECT * FROM sensor ORDER BY codigo"));

	res.render("index/produtos", {
		titulo: "Sensores",
		produtos: sensores,
		mensagem: req.query.ok ? "Sensor salvo com sucesso." : null,
		erro: req.query.erro || null
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
	const { codigo, nome, tipo, localizacao, nivel_critico, h2s_critico, nh3_critico } = req.body;

	if (!codigo || !nome || !tipo || !localizacao) {
		return res.redirect("/sensores/novo?erro=Preencha todos os campos obrigatórios");
	}

	try {
		await sql.connect(async (conn) => {
			await conn.query(
				`INSERT INTO sensor (codigo, nome, tipo, localizacao, nivel_critico, h2s_critico, nh3_critico, ativo)
				 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
				[codigo.trim(), nome.trim(), tipo, localizacao.trim(),
					parseFloat(nivel_critico) || 80,
					parseFloat(h2s_critico) || 0.05,
					parseFloat(nh3_critico) || 0.03]
			);
		});
		res.redirect("/sensores?ok=1");
	} catch (e) {
		res.redirect("/sensores/novo?erro=" + encodeURIComponent(e.message));
	}
}));

router.post("/sensores/:id/excluir", wrap(async (req, res) => {
	await sql.connect(async (conn) => {
		await conn.query("UPDATE sensor SET ativo = 0 WHERE id = ?", [parseInt(req.params.id, 10)]);
	});
	res.redirect("/sensores?ok=1");
}));

router.get("/niveis", wrap(async (req, res) => {
	const dados = await sql.connect(async (conn) => {
		const sensores = await conn.query(
			"SELECT id, codigo, nome, tipo FROM sensor WHERE tipo IN ('nivel', 'pressao') AND ativo = 1 ORDER BY codigo"
		);
		const niveis = await conn.query(
			`SELECT n.*, s.codigo, s.nome, s.nivel_critico, s.tipo
			 FROM nivel_esgoto n
			 INNER JOIN sensor s ON s.id = n.id_sensor
			 ORDER BY n.data DESC
			 LIMIT 50`
		);
		return { sensores, niveis };
	});

	res.render("index/teste2", {
		titulo: "Níveis de Esgoto",
		sensores: dados.sensores || [],
		niveis: dados.niveis || [],
		mensagem: req.query.ok ? "Leitura registrada." : null,
		erro: req.query.erro || null
	});
}));

router.post("/niveis", wrap(async (req, res) => {
	const { id_sensor, nivel_percentual, vazao, pressao } = req.body;

	if (!id_sensor) {
		return res.redirect("/niveis?erro=" + encodeURIComponent("Selecione um sensor"));
	}

	const nivel = nivel_percentual !== "" && nivel_percentual != null ? parseFloat(nivel_percentual) : null;
	const vaz = vazao !== "" && vazao != null ? parseFloat(vazao) : null;
	const press = pressao !== "" && pressao != null ? parseFloat(pressao) : null;

	if (nivel === null && press === null) {
		return res.redirect("/niveis?erro=" + encodeURIComponent("Informe nível (%) ou pressão (bar)"));
	}

	await sql.connect(async (conn) => {
		const sensor = (await conn.query("SELECT * FROM sensor WHERE id = ?", [parseInt(id_sensor, 10)]))[0];
		if (!sensor) {
			throw new Error("Sensor não encontrado");
		}

		await conn.query(
			"INSERT INTO nivel_esgoto (id_sensor, data, nivel_percentual, vazao, pressao) VALUES (?, NOW(), ?, ?, ?)",
			[parseInt(id_sensor, 10), nivel, vaz, press]
		);

		if (nivel !== null && nivel >= Number(sensor.nivel_critico)) {
			await conn.query(
				"INSERT INTO alerta (id_sensor, tipo, mensagem, severidade) VALUES (?, 'nivel_critico', ?, 'alta')",
				[sensor.id, "Nivel critico em " + sensor.codigo + ": " + nivel + "%"]
			);
		}
	});

	res.redirect("/niveis?ok=1");
}));

router.get("/alertas", wrap(async (req, res) => {
	const alertas = await sql.connect(async (conn) => {
		return conn.query(
			`SELECT a.*, s.codigo, s.nome, s.localizacao
			 FROM alerta a
			 INNER JOIN sensor s ON s.id = a.id_sensor
			 ORDER BY a.resolvido ASC, a.data DESC
			 LIMIT 100`
		);
	});

	res.render("index/teste3", {
		titulo: "Alertas",
		alertas: alertas || [],
		mensagem: req.query.ok ? "Alerta atualizado." : null
	});
}));

router.post("/alertas/:id/resolver", wrap(async (req, res) => {
	await sql.connect(async (conn) => {
		await conn.query(
			"UPDATE alerta SET resolvido = 1, resolvido_em = NOW() WHERE id = ?",
			[parseInt(req.params.id, 10)]
		);
	});
	res.redirect("/alertas?ok=1");
}));

router.get("/dados/consolidadoDiaDaSemana", wrap(async (req, res) => {
	let dados;

	await sql.connect(async (conn) => {
		dados = await conn.query(
			`
			select dayofweek(data) dia_semana, extract(hour from data) hora, max(h2s) h2s, max(umidade) umidade, max(nh3) nh3, max(temperatura) temperatura
			from odor
			where data between ? and ?
			and id_sensor = 2
			group by dia_semana, hora
			`,
			[req.query["data_inicial"], req.query["data_final"]]
		);
	});

	res.json(dados);
}));

router.get("/dados/consolidadoDiaDoMesHora", wrap(async (req, res) => {
	let dados;

	await sql.connect(async (conn) => {
		dados = await conn.query(
			`
			select date_format(date(data), '%d/%m/%Y') dia, extract(hour from data) hora, max(h2s) h2s, max(umidade) umidade, max(nh3) nh3, max(temperatura) temperatura
			from odor
			where data between ? and ?
			and id_sensor = 2
			group by dia, hora
			`,
			[req.query["data_inicial"], req.query["data_final"]]
		);
	});

	res.json(dados);
}));

router.get("/dados/consolidadoDiaDoMes", wrap(async (req, res) => {
	let dados;

	await sql.connect(async (conn) => {
		dados = await conn.query(
			`
			select date_format(date(data), '%d/%m/%Y') dia, max(h2s) h2s, max(umidade) umidade, max(nh3) nh3, max(temperatura) temperatura
			from odor
			where data between ? and ?
			and id_sensor = 2
			group by dia
			`,
			[req.query["data_inicial"], req.query["data_final"]]
		);
	});

	res.json(dados);
}));

module.exports = router;
