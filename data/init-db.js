const sql = require("./sql");

async function query(conn, sqlStr, values) {
	try {
		return await conn.query(sqlStr, values);
	} catch (e) {
		console.error("[DB]", e.message);
		throw e;
	}
}

async function ensureSchema() {
	await sql.connect(async (conn) => {
		await query(conn, `
			CREATE TABLE IF NOT EXISTS sensor (
				id INT NOT NULL AUTO_INCREMENT,
				codigo VARCHAR(20) NOT NULL,
				nome VARCHAR(100) NOT NULL,
				tipo ENUM('odor', 'nivel', 'pressao') NOT NULL DEFAULT 'odor',
				localizacao VARCHAR(150) NOT NULL,
				nivel_critico DECIMAL(5,2) NOT NULL DEFAULT 80.00,
				h2s_critico DECIMAL(6,3) NOT NULL DEFAULT 0.050,
				nh3_critico DECIMAL(6,3) NOT NULL DEFAULT 0.030,
				ativo TINYINT(1) NOT NULL DEFAULT 1,
				criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				UNIQUE KEY sensor_codigo (codigo)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
		`);

		await query(conn, `
			CREATE TABLE IF NOT EXISTS odor (
				id BIGINT NOT NULL,
				data DATETIME NOT NULL,
				id_sensor TINYINT NOT NULL,
				delta INT NOT NULL DEFAULT 0,
				bateria TINYINT NOT NULL DEFAULT 100,
				h2s FLOAT NOT NULL DEFAULT 0,
				umidade FLOAT NOT NULL DEFAULT 0,
				nh3 FLOAT NOT NULL DEFAULT 0,
				temperatura FLOAT NOT NULL DEFAULT 0,
				PRIMARY KEY (id),
				KEY odor_data_id_sensor (data, id_sensor),
				KEY odor_id_sensor (id_sensor)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
		`);

		await query(conn, `
			CREATE TABLE IF NOT EXISTS nivel_esgoto (
				id BIGINT NOT NULL AUTO_INCREMENT,
				id_sensor INT NOT NULL,
				data DATETIME NOT NULL,
				nivel_percentual DECIMAL(5,2) NULL,
				vazao DECIMAL(8,2) NULL,
				pressao DECIMAL(6,3) NULL,
				PRIMARY KEY (id),
				KEY nivel_esgoto_sensor_data (id_sensor, data),
				CONSTRAINT fk_nivel_sensor FOREIGN KEY (id_sensor) REFERENCES sensor (id) ON DELETE CASCADE
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
		`);

		await query(conn, `
			CREATE TABLE IF NOT EXISTS alerta (
				id BIGINT NOT NULL AUTO_INCREMENT,
				id_sensor INT NOT NULL,
				tipo VARCHAR(50) NOT NULL,
				mensagem VARCHAR(255) NOT NULL,
				severidade ENUM('baixa', 'media', 'alta', 'critica') NOT NULL DEFAULT 'media',
				data DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				resolvido TINYINT(1) NOT NULL DEFAULT 0,
				resolvido_em DATETIME NULL,
				PRIMARY KEY (id),
				KEY alerta_sensor (id_sensor),
				KEY alerta_resolvido (resolvido, data),
				CONSTRAINT fk_alerta_sensor FOREIGN KEY (id_sensor) REFERENCES sensor (id) ON DELETE CASCADE
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
		`);

		try {
			await query(conn, "ALTER TABLE nivel_esgoto MODIFY nivel_percentual DECIMAL(5,2) NULL");
		} catch (e) { /* ok */ }

		const totalSensores = await conn.scalar("SELECT COUNT(*) FROM sensor");
		if (!totalSensores) {
			await query(conn, `
				INSERT INTO sensor (codigo, nome, tipo, localizacao, nivel_critico, h2s_critico, nh3_critico, ativo) VALUES
				('odor01', 'Sensor Odor 01', 'odor', 'Poço de visita A - Zona Norte', 85, 0.05, 0.03, 1),
				('odor02', 'Sensor Odor 02', 'odor', 'Estação elevatória B', 85, 0.05, 0.03, 1),
				('nivel01', 'Sensor Nível 01', 'nivel', 'Coletor principal - Trecho 3', 80, 0.05, 0.03, 1),
				('press01', 'Sensor Pressão 01', 'pressao', 'Tubulação forçada - Ramal 2', 75, 0.05, 0.03, 1)
			`);
		}

		const totalNiveis = await conn.scalar("SELECT COUNT(*) FROM nivel_esgoto");
		if (!totalNiveis) {
			await query(conn, `
				INSERT INTO nivel_esgoto (id_sensor, data, nivel_percentual, vazao, pressao) VALUES
				(3, DATE_SUB(NOW(), INTERVAL 6 HOUR), 42.5, 12.3, 1.12),
				(3, DATE_SUB(NOW(), INTERVAL 4 HOUR), 55.8, 14.5, 1.25),
				(3, DATE_SUB(NOW(), INTERVAL 2 HOUR), 71.3, 16.8, 1.42),
				(3, NOW(), 83.2, 18.1, 1.52),
				(4, DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL, NULL, 1.18),
				(4, NOW(), NULL, NULL, 1.41)
			`);
		}

		const totalAlertas = await conn.scalar("SELECT COUNT(*) FROM alerta");
		if (!totalAlertas) {
			await query(conn, `
				INSERT INTO alerta (id_sensor, tipo, mensagem, severidade, data, resolvido) VALUES
				(1, 'h2s_elevado', 'Concentração de H₂S acima do limite em odor01', 'alta', DATE_SUB(NOW(), INTERVAL 2 HOUR), 0),
				(3, 'nivel_critico', 'Nível de esgoto próximo ao limite crítico (83,2%)', 'media', DATE_SUB(NOW(), INTERVAL 30 MINUTE), 0),
				(4, 'pressao_anomala', 'Pressão da tubulação com variação anômala', 'baixa', DATE_SUB(NOW(), INTERVAL 1 DAY), 1)
			`);
		}

		const totalOdor = await conn.scalar("SELECT COUNT(*) FROM odor");
		if (!totalOdor) {
			await query(conn, `
				INSERT INTO odor (id, data, id_sensor, delta, bateria, h2s, umidade, nh3, temperatura) VALUES
				(900001, DATE_SUB(NOW(), INTERVAL 5 HOUR), 1, 300, 98, 0.018, 72, 0.008, 24.1),
				(900002, DATE_SUB(NOW(), INTERVAL 4 HOUR), 1, 300, 97, 0.022, 74, 0.009, 24.3),
				(900003, DATE_SUB(NOW(), INTERVAL 3 HOUR), 1, 300, 97, 0.031, 76, 0.011, 24.5),
				(900004, DATE_SUB(NOW(), INTERVAL 2 HOUR), 1, 300, 96, 0.045, 78, 0.014, 24.8),
				(900005, DATE_SUB(NOW(), INTERVAL 1 HOUR), 1, 300, 95, 0.052, 80, 0.016, 25.0),
				(900006, NOW(), 1, 300, 95, 0.048, 79, 0.015, 25.1),
				(900011, DATE_SUB(NOW(), INTERVAL 3 HOUR), 2, 300, 99, 0.015, 70, 0.007, 23.8),
				(900012, DATE_SUB(NOW(), INTERVAL 1 HOUR), 2, 300, 98, 0.019, 71, 0.008, 24.0),
				(900013, NOW(), 2, 300, 98, 0.021, 72, 0.009, 24.2)
			`);
		}
	});

	console.log("Banco de dados verificado e pronto.");
}

module.exports = { ensureSchema };
