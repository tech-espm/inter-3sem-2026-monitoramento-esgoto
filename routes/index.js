const express = require("express");
const wrap = require("express-async-error-wrapper");
const axios = require("axios");
const sql = require("../data/sql");

const router = express.Router();
const url_api = process.env.url_api;

async function sincronizarOdor(sqlConn) {
	let idInferior = 0;
	const maxRow = await sqlConn.query("SELECT COALESCE(MAX(id), 0) AS id FROM odor");
	if (maxRow[0] && maxRow[0].id) {
		idInferior = maxRow[0].id;
	}

	const response = await axios.get(url_api + "?sensor=odor&id_inferior=" + idInferior, { timeout: 15000 });
	const dadosNovos = response.data || [];

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
	const sensores = await sqlConn.query(
		"SELECT id, codigo, h2s_critico, nh3_critico FROM sensor WHERE tipo = 'odor' AND ativo = 1"
	);

	let sensorRef = null;
	for (let i = 0; i < sensores.length; i++) {
		if (sensores[i].codigo === "odor" + String(leitura.id_sensor).padStart(2, "0")) {
			sensorRef = sensores[i];
			break;
		}
	}
	if (!sensorRef) {
		return;
	}

	if (leitura.h2s >= parseFloat(sensorRef.h2s_critico)) {
		const existe = await sqlConn.scalar(
			"SELECT COUNT(*) FROM alerta WHERE id_sensor = ? AND tipo = 'h2s_elevado' AND resolvido = 0 AND data >= DATE_SUB(NOW(), INTERVAL 1 HOUR)",
			[sensorRef.id]
		);
		if (!existe) {
			await sqlConn.query(
				"INSERT INTO alerta (id_sensor, tipo, mensagem, severidade) VALUES (?, 'h2s_elevado', ?, 'alta')",
				[sensorRef.id, "H₂S elevado em " + sensorRef.codigo + " (" + leitura.h2s + " ppm)"]
			);
		}
	}

	if (leitura.nh3 >= parseFloat(sensorRef.nh3_critico)) {
		const existe = await sqlConn.scalar(
			"SELECT COUNT(*) FROM alerta WHERE id_sensor = ? AND tipo = 'nh3_elevado' AND resolvido = 0 AND data >= DATE_SUB(NOW(), INTERVAL 1 HOUR)",
			[sensorRef.id]
		);
		if (!existe) {
			await sqlConn.query(
				"INSERT INTO alerta (id_sensor, tipo, mensagem, severidade) VALUES (?, 'nh3_elevado', ?, 'media')",
				[sensorRef.id, "NH₃ elevado em " + sensorRef.codigo + " (" + leitura.nh3 + " ppm)"]
			);
		}
	}
}

async function carregarResumo() {
	return sql.connect(async (conn) => {
		const sensoresAtivos = await conn.scalar("SELECT COUNT(*) FROM sensor WHERE ativo = 1");
		const alertasAbertos = await conn.scalar("SELECT COUNT(*) FROM alerta WHERE resolvido = 0");
		const ultimoNivel = await conn.query(
			`SELECT n.nivel_percentual, n.data, s.codigo
			 FROM nivel_esgoto n
			 INNER JOIN sensor s ON s.id = n.id_sensor
			 WHERE s.tipo = 'nivel'
			 ORDER BY n.data DESC LIMIT 1`
		);
		const ultimoOdor = await conn.query(
			`SELECT o.h2s, o.data, o.id_sensor, o.bateria
			 FROM odor o
			 ORDER BY o.data DESC LIMIT 2`
		);
		return {
			sensoresAtivos: sensoresAtivos || 0,
			alertasAbertos: alertasAbertos || 0,
			ultimoNivel: ultimoNivel[0] || null,
			ultimoOdor: ultimoOdor || []
		};
	});
}

router.get("/", wrap(async (req, res) => {
	let sincronizados = 0;
	try {
		await sql.connect(async (conn) => {
			sincronizados = await sincronizarOdor(conn);
		});
	} catch (e) {
		console.error("Sync odor:", e.message);
	}

	const resumo = await carregarResumo();

	res.render("index/index", {
		titulo: "Início",
		usuario: "Operador",
		resumo,
		sincronizados
	});
}));

router.get("/dashboard", wrap(async (req, res) => {
	const dados = await sql.connect(async (conn) => {
		try {
			await sincronizarOdor(conn);
		} catch (e) {
			console.error("Sync odor:", e.message);
		}

		const sensores = await conn.query("SELECT * FROM sensor WHERE ativo = 1 ORDER BY codigo");

		const leiturasOdor = await conn.query(
			`SELECT o.*, s.codigo, s.h2s_critico, s.nh3_critico
			 FROM odor o
			 LEFT JOIN sensor s ON s.codigo = CONCAT('odor', LPAD(o.id_sensor, 2, '0'))
			 WHERE o.data >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
			 ORDER BY o.data ASC`
		);

		const niveis = await conn.query(
			`SELECT n.*, s.codigo, s.nivel_critico
			 FROM nivel_esgoto n
			 INNER JOIN sensor s ON s.id = n.id_sensor
			 WHERE n.data >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
			 ORDER BY n.data ASC`
		);

		const pressoes = await conn.query(
			`SELECT n.data, n.pressao, s.codigo
			 FROM nivel_esgoto n
			 INNER JOIN sensor s ON s.id = n.id_sensor
			 WHERE s.tipo = 'pressao' AND n.pressao IS NOT NULL
			 AND n.data >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
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

		const ultimasPorSensor = await conn.query(
			`SELECT s.codigo, s.tipo, s.nivel_critico, s.h2s_critico,
				(SELECT o.h2s FROM odor o WHERE o.id_sensor = CAST(SUBSTRING(s.codigo, 5) AS UNSIGNED) ORDER BY o.data DESC LIMIT 1) AS h2s,
				(SELECT o.bateria FROM odor o WHERE o.id_sensor = CAST(SUBSTRING(s.codigo, 5) AS UNSIGNED) ORDER BY o.data DESC LIMIT 1) AS bateria,
				(SELECT o.data FROM odor o WHERE o.id_sensor = CAST(SUBSTRING(s.codigo, 5) AS UNSIGNED) ORDER BY o.data DESC LIMIT 1) AS data_odor,
				(SELECT n.nivel_percentual FROM nivel_esgoto n WHERE n.id_sensor = s.id ORDER BY n.data DESC LIMIT 1) AS nivel,
				(SELECT n.pressao FROM nivel_esgoto n WHERE n.id_sensor = s.id ORDER BY n.data DESC LIMIT 1) AS pressao
			 FROM sensor s
			 WHERE s.ativo = 1
			 ORDER BY s.codigo`
		);

		return { sensores, leiturasOdor, niveis, pressoes, alertas, ultimasPorSensor };
	});

	res.render("index/dashboard", {
		titulo: "Dashboard",
		...dados,
		atualizadoEm: new Date()
	});
}));

router.get("/sensores", wrap(async (req, res) => {
	const sensores = await sql.connect(async (conn) => {
		return conn.query("SELECT * FROM sensor ORDER BY codigo");
	});

	res.render("index/produtos", {
		titulo: "Sensores",
		produtos: sensores,
		mensagem: req.query.ok ? "Sensor salvo com sucesso." : (req.query.erro || null)
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
}));

router.post("/sensores/:id/excluir", wrap(async (req, res) => {
	await sql.connect(async (conn) => {
		await conn.query("UPDATE sensor SET ativo = 0 WHERE id = ?", [parseInt(req.params.id)]);
	});
	res.redirect("/sensores?ok=1");
}));

router.get("/niveis", wrap(async (req, res) => {
	const dados = await sql.connect(async (conn) => {
		const sensores = await conn.query("SELECT id, codigo, nome FROM sensor WHERE tipo IN ('nivel', 'pressao') AND ativo = 1");
		const niveis = await conn.query(
			`SELECT n.*, s.codigo, s.nome, s.nivel_critico
			 FROM nivel_esgoto n
			 INNER JOIN sensor s ON s.id = n.id_sensor
			 ORDER BY n.data DESC
			 LIMIT 50`
		);
		return { sensores, niveis };
	});

	res.render("index/teste2", {
		titulo: "Níveis de Esgoto",
		...dados,
		mensagem: req.query.ok ? "Leitura registrada." : (req.query.erro || null)
	});
}));

router.post("/niveis", wrap(async (req, res) => {
	const { id_sensor, nivel_percentual, vazao, pressao } = req.body;

	if (!id_sensor) {
		return res.redirect("/niveis?erro=Selecione um sensor");
	}

	await sql.connect(async (conn) => {
		const nivel = parseFloat(nivel_percentual);
		const sensor = (await conn.query("SELECT * FROM sensor WHERE id = ?", [parseInt(id_sensor)]))[0];

		await conn.query(
			"INSERT INTO nivel_esgoto (id_sensor, data, nivel_percentual, vazao, pressao) VALUES (?, NOW(), ?, ?, ?)",
			[parseInt(id_sensor), nivel || null, parseFloat(vazao) || null, parseFloat(pressao) || null]
		);

		if (sensor && nivel >= parseFloat(sensor.nivel_critico)) {
			await conn.query(
				"INSERT INTO alerta (id_sensor, tipo, mensagem, severidade) VALUES (?, 'nivel_critico', ?, 'alta')",
				[sensor.id, "Nível crítico em " + sensor.codigo + ": " + nivel + "%"]
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
		alertas,
		mensagem: req.query.ok ? "Alerta atualizado." : null
	});
}));

router.post("/alertas/:id/resolver", wrap(async (req, res) => {
	await sql.connect(async (conn) => {
		await conn.query(
			"UPDATE alerta SET resolvido = 1, resolvido_em = NOW() WHERE id = ?",
			[parseInt(req.params.id)]
		);
	});
	res.redirect("/alertas?ok=1");
}));

router.get("/api/grafico/odor", wrap(async (req, res) => {
	const idSensor = parseInt(req.query.id_sensor) || 1;
	const dados = await sql.connect(async (conn) => {
		return conn.query(
			`SELECT DATE_FORMAT(data, '%H:%i') AS label, h2s, nh3, temperatura, umidade, bateria
			 FROM odor
			 WHERE id_sensor = ? AND data >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
			 ORDER BY data ASC
			 LIMIT 100`,
			[idSensor]
		);
	});
	res.json(dados);
}));

router.get("/teste", wrap(async (req, res) => {
	res.render("index/teste", { layout: "casca-teste", titulo: "Teste", sensor: null });
}));

router.get("/teste2", wrap(async (req, res) => {
	res.render("index/teste2", { layout: "casca-teste", titulo: "Teste 2" });
}));

router.get("/teste3", wrap(async (req, res) => {
	res.render("index/teste3", { layout: "casca-teste", titulo: "Teste 3" });
}));

module.exports = router;
