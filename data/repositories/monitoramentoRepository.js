const sql = require("../sql");

async function carregarResumo() {
	return sql.connect(async (conn) => {
		const sensoresAtivos = await conn.scalar(
			"SELECT COUNT(*) FROM sensor WHERE ativo = 1"
		) || 0;
		const alertasAbertos = await conn.scalar(
			"SELECT COUNT(*) FROM alerta WHERE resolvido = 0"
		) || 0;
		const ultimoNivel = await conn.query(
			`SELECT n.nivel_percentual, n.data, s.codigo
			 FROM nivel_esgoto n
			 INNER JOIN sensor s ON s.id = n.id_sensor
			 WHERE s.tipo = 'nivel' AND n.nivel_percentual IS NOT NULL
			 ORDER BY n.data DESC, n.id DESC
			 LIMIT 1`
		);
		const ultimoOdor = await conn.query(
			`SELECT o.h2s, o.data, o.id_sensor, o.bateria, s.codigo
			 FROM odor o
			 INNER JOIN sensor s ON s.id = o.id_sensor
			 ORDER BY o.data DESC, o.id DESC
			 LIMIT 2`
		);

		return {
			sensoresAtivos: Number(sensoresAtivos),
			alertasAbertos: Number(alertasAbertos),
			ultimoNivel: ultimoNivel[0] || null,
			ultimoOdor
		};
	});
}

async function carregarDashboard() {
	return sql.connect(async (conn) => {
		const sensores = await conn.query(
			`SELECT s.*,
				o.data AS odor_data,
				o.h2s AS ultimo_h2s,
				o.nh3 AS ultimo_nh3,
				o.bateria AS odor_bateria,
				n.data AS nivel_data,
				n.nivel_percentual AS ultimo_nivel,
				n.pressao AS ultima_pressao
			 FROM sensor s
			 LEFT JOIN odor o ON o.id = (
				SELECT o2.id
				FROM odor o2
				WHERE o2.id_sensor = s.id
				ORDER BY o2.data DESC, o2.id DESC
				LIMIT 1
			 )
			 LEFT JOIN nivel_esgoto n ON n.id = (
				SELECT n2.id
				FROM nivel_esgoto n2
				WHERE n2.id_sensor = s.id
				ORDER BY n2.data DESC, n2.id DESC
				LIMIT 1
			 )
			 WHERE s.ativo = 1
			 ORDER BY s.codigo`
		);
		const leiturasOdor = await conn.query(
			`SELECT o.*, s.codigo
			 FROM odor o
			 INNER JOIN sensor s ON s.id = o.id_sensor
			 WHERE o.data >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
			 ORDER BY s.codigo, o.data ASC, o.id ASC`
		);
		const niveis = await conn.query(
			`SELECT n.*, s.codigo, s.nivel_critico
			 FROM nivel_esgoto n
			 INNER JOIN sensor s ON s.id = n.id_sensor
			 WHERE s.tipo = 'nivel'
			   AND n.nivel_percentual IS NOT NULL
			   AND n.data >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
			 ORDER BY s.codigo, n.data ASC, n.id ASC`
		);
		const pressoes = await conn.query(
			`SELECT n.data, n.pressao, s.codigo, s.id AS id_sensor
			 FROM nivel_esgoto n
			 INNER JOIN sensor s ON s.id = n.id_sensor
			 WHERE s.tipo = 'pressao'
			   AND n.pressao IS NOT NULL
			   AND n.data >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
			 ORDER BY s.codigo, n.data ASC, n.id ASC`
		);
		const alertas = await conn.query(
			`SELECT a.*, s.codigo, s.nome
			 FROM alerta a
			 INNER JOIN sensor s ON s.id = a.id_sensor
			 WHERE a.resolvido = 0
			 ORDER BY a.data DESC, a.id DESC
			 LIMIT 20`
		);

		return { sensores, leiturasOdor, niveis, pressoes, alertas };
	});
}

async function listarSensores() {
	return sql.connect((conn) =>
		conn.query("SELECT * FROM sensor ORDER BY codigo")
	);
}

async function criarSensor(sensor) {
	return sql.connect((conn) =>
		conn.query(
			`INSERT INTO sensor
				(codigo, nome, tipo, localizacao, nivel_critico, h2s_critico, nh3_critico, ativo)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
			[
				sensor.codigo,
				sensor.nome,
				sensor.tipo,
				sensor.localizacao,
				sensor.nivel_critico,
				sensor.h2s_critico,
				sensor.nh3_critico
			]
		)
	);
}

async function desativarSensor(id) {
	return sql.connect((conn) =>
		conn.query("UPDATE sensor SET ativo = 0 WHERE id = ?", [id])
	);
}

async function carregarNiveis() {
	return sql.connect(async (conn) => {
		const sensores = await conn.query(
			`SELECT id, codigo, nome, tipo
			 FROM sensor
			 WHERE tipo IN ('nivel', 'pressao') AND ativo = 1
			 ORDER BY codigo`
		);
		const niveis = await conn.query(
			`SELECT n.*, s.codigo, s.nome, s.nivel_critico, s.tipo
			 FROM nivel_esgoto n
			 INNER JOIN sensor s ON s.id = n.id_sensor
			 WHERE s.tipo IN ('nivel', 'pressao')
			 ORDER BY n.data DESC, n.id DESC
			 LIMIT 50`
		);
		return { sensores, niveis };
	});
}

async function registrarNivel(leitura) {
	return sql.connect(async (conn) => {
		await conn.beginTransaction();

		const sensores = await conn.query(
			`SELECT *
			 FROM sensor
			 WHERE id = ? AND tipo IN ('nivel', 'pressao') AND ativo = 1
			 LIMIT 1`,
			[leitura.id_sensor]
		);
		const sensor = sensores[0];
		if (!sensor) {
			const error = new Error("Sensor não encontrado ou inativo");
			error.code = "SENSOR_INVALIDO";
			throw error;
		}

		await conn.query(
			`INSERT INTO nivel_esgoto
				(id_sensor, data, nivel_percentual, vazao, pressao)
			 VALUES (?, NOW(), ?, ?, ?)`,
			[
				leitura.id_sensor,
				leitura.nivel_percentual,
				leitura.vazao,
				leitura.pressao
			]
		);

		if (
			leitura.nivel_percentual !== null &&
			Number(leitura.nivel_percentual) >= Number(sensor.nivel_critico)
		) {
			const alertaAberto = await conn.scalar(
				`SELECT COUNT(*)
				 FROM alerta
				 WHERE id_sensor = ?
				   AND tipo = 'nivel_critico'
				   AND resolvido = 0
				   AND data >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
				[sensor.id]
			);
			if (!alertaAberto) {
				await conn.query(
					`INSERT INTO alerta (id_sensor, tipo, mensagem, severidade)
					 VALUES (?, 'nivel_critico', ?, 'alta')`,
					[sensor.id, "Nível crítico em " + sensor.codigo + ": " + leitura.nivel_percentual + "%"]
				);
			}
		}

		await conn.commit();
	});
}

async function listarAlertas() {
	return sql.connect((conn) =>
		conn.query(
			`SELECT a.*, s.codigo, s.nome, s.localizacao
			 FROM alerta a
			 INNER JOIN sensor s ON s.id = a.id_sensor
			 ORDER BY a.resolvido ASC, a.data DESC, a.id DESC
			 LIMIT 100`
		)
	);
}

async function resolverAlerta(id) {
	return sql.connect((conn) =>
		conn.query(
			`UPDATE alerta
			 SET resolvido = 1, resolvido_em = NOW()
			 WHERE id = ? AND resolvido = 0`,
			[id]
		)
	);
}

module.exports = {
	carregarResumo,
	carregarDashboard,
	listarSensores,
	criarSensor,
	desativarSensor,
	carregarNiveis,
	registrarNivel,
	listarAlertas,
	resolverAlerta
};
