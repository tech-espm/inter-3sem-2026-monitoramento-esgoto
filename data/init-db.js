const sql = require("./sql");

async function query(conn, sqlStr, values) {
	try {
		return await conn.query(sqlStr, values);
	} catch (error) {
		console.error("[DB]", error.message);
		throw error;
	}
}

async function tryMigration(description, callback) {
	try {
		await callback();
	} catch (error) {
		console.warn("[DB] Migração ignorada (" + description + "):", error.message);
	}
}

async function ensureIndex(conn, tableName, indexName, definition) {
	const total = await conn.scalar(
		`SELECT COUNT(*)
		 FROM information_schema.statistics
		 WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
		[tableName, indexName]
	);
	if (!total) {
		await query(conn, `ALTER TABLE \`${tableName}\` ADD ${definition}`);
	}
}

async function ensureColumn(conn, tableName, columnName, definition) {
	const total = await conn.scalar(
		`SELECT COUNT(*)
		 FROM information_schema.columns
		 WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
		[tableName, columnName]
	);
	if (!total) {
		await query(conn, `ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
	}
}

async function ensureForeignKey(conn, tableName, columnName, constraintSql) {
	const total = await conn.scalar(
		`SELECT COUNT(*)
		 FROM information_schema.key_column_usage
		 WHERE table_schema = DATABASE()
		   AND table_name = ?
		   AND column_name = ?
		   AND referenced_table_name = 'sensor'`,
		[tableName, columnName]
	);
	if (!total) {
		await query(conn, `ALTER TABLE \`${tableName}\` ADD ${constraintSql}`);
	}
}

async function seedDatabase(conn) {
	const totalSensores = await conn.scalar("SELECT COUNT(*) FROM sensor");
	if (!totalSensores) {
		await query(conn, `
			INSERT IGNORE INTO sensor
				(codigo, nome, tipo, localizacao, nivel_critico, h2s_critico, nh3_critico, ativo)
			VALUES
				('odor01', 'Sensor Odor 01', 'odor', 'Poço de visita A - Zona Norte', 85, 0.05, 0.03, 1),
				('odor02', 'Sensor Odor 02', 'odor', 'Estação elevatória B', 85, 0.05, 0.03, 1),
				('nivel01', 'Sensor Nível 01', 'nivel', 'Coletor principal - Trecho 3', 80, 0.05, 0.03, 1),
				('press01', 'Sensor Pressão 01', 'pressao', 'Tubulação forçada - Ramal 2', 75, 0.05, 0.03, 1)
		`);
	}

	const totalNiveis = await conn.scalar("SELECT COUNT(*) FROM nivel_esgoto");
	if (!totalNiveis) {
		await query(conn, `
			INSERT IGNORE INTO nivel_esgoto (id_sensor, data, nivel_percentual, vazao, pressao)
			SELECT id, DATE_SUB(NOW(), INTERVAL 6 HOUR), 42.5, 12.3, 1.12 FROM sensor WHERE codigo = 'nivel01'
			UNION ALL
			SELECT id, DATE_SUB(NOW(), INTERVAL 4 HOUR), 55.8, 14.5, 1.25 FROM sensor WHERE codigo = 'nivel01'
			UNION ALL
			SELECT id, DATE_SUB(NOW(), INTERVAL 2 HOUR), 71.3, 16.8, 1.42 FROM sensor WHERE codigo = 'nivel01'
			UNION ALL
			SELECT id, NOW(), 83.2, 18.1, 1.52 FROM sensor WHERE codigo = 'nivel01'
			UNION ALL
			SELECT id, DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL, NULL, 1.18 FROM sensor WHERE codigo = 'press01'
			UNION ALL
			SELECT id, NOW(), NULL, NULL, 1.41 FROM sensor WHERE codigo = 'press01'
		`);
	}

	const totalAlertas = await conn.scalar("SELECT COUNT(*) FROM alerta");
	if (!totalAlertas) {
		await query(conn, `
			INSERT IGNORE INTO alerta (id_sensor, tipo, mensagem, severidade, data, resolvido)
			SELECT id, 'h2s_elevado', 'Concentração de H₂S acima do limite em odor01', 'alta',
				DATE_SUB(NOW(), INTERVAL 2 HOUR), 0
			FROM sensor WHERE codigo = 'odor01'
			UNION ALL
			SELECT id, 'nivel_critico', 'Nível de esgoto próximo ao limite crítico (83,2%)', 'media',
				DATE_SUB(NOW(), INTERVAL 30 MINUTE), 0
			FROM sensor WHERE codigo = 'nivel01'
			UNION ALL
			SELECT id, 'pressao_anomala', 'Pressão da tubulação com variação anômala', 'baixa',
				DATE_SUB(NOW(), INTERVAL 1 DAY), 1
			FROM sensor WHERE codigo = 'press01'
		`);
	}

	const totalOdor = await conn.scalar("SELECT COUNT(*) FROM odor");
	if (!totalOdor) {
		await query(conn, `
			INSERT IGNORE INTO odor
				(id, data, id_sensor, delta, bateria, h2s, umidade, nh3, temperatura)
			SELECT 900001, DATE_SUB(NOW(), INTERVAL 5 HOUR), id, 300, 98, 0.018, 72, 0.008, 24.1
				FROM sensor WHERE codigo = 'odor01'
			UNION ALL
			SELECT 900002, DATE_SUB(NOW(), INTERVAL 4 HOUR), id, 300, 97, 0.022, 74, 0.009, 24.3
				FROM sensor WHERE codigo = 'odor01'
			UNION ALL
			SELECT 900003, DATE_SUB(NOW(), INTERVAL 3 HOUR), id, 300, 97, 0.031, 76, 0.011, 24.5
				FROM sensor WHERE codigo = 'odor01'
			UNION ALL
			SELECT 900004, DATE_SUB(NOW(), INTERVAL 2 HOUR), id, 300, 96, 0.045, 78, 0.014, 24.8
				FROM sensor WHERE codigo = 'odor01'
			UNION ALL
			SELECT 900005, DATE_SUB(NOW(), INTERVAL 1 HOUR), id, 300, 95, 0.052, 80, 0.016, 25.0
				FROM sensor WHERE codigo = 'odor01'
			UNION ALL
			SELECT 900006, NOW(), id, 300, 95, 0.048, 79, 0.015, 25.1
				FROM sensor WHERE codigo = 'odor01'
			UNION ALL
			SELECT 900011, DATE_SUB(NOW(), INTERVAL 3 HOUR), id, 300, 99, 0.015, 70, 0.007, 23.8
				FROM sensor WHERE codigo = 'odor02'
			UNION ALL
			SELECT 900012, DATE_SUB(NOW(), INTERVAL 1 HOUR), id, 300, 98, 0.019, 71, 0.008, 24.0
				FROM sensor WHERE codigo = 'odor02'
			UNION ALL
			SELECT 900013, NOW(), id, 300, 98, 0.021, 72, 0.009, 24.2
				FROM sensor WHERE codigo = 'odor02'
		`);
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
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`);

		await query(conn, `
			CREATE TABLE IF NOT EXISTS odor (
				id BIGINT NOT NULL,
				data DATETIME NOT NULL,
				id_sensor INT NOT NULL,
				delta INT NOT NULL DEFAULT 0,
				bateria TINYINT NOT NULL DEFAULT 100,
				h2s FLOAT NOT NULL DEFAULT 0,
				umidade FLOAT NOT NULL DEFAULT 0,
				nh3 FLOAT NOT NULL DEFAULT 0,
				temperatura FLOAT NOT NULL DEFAULT 0,
				PRIMARY KEY (id),
				KEY odor_data_id_sensor (data, id_sensor),
				KEY odor_id_sensor (id_sensor),
				CONSTRAINT fk_odor_sensor FOREIGN KEY (id_sensor) REFERENCES sensor (id) ON DELETE CASCADE
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
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
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
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
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`);

		await tryMigration("tipo de odor.id_sensor", () =>
			query(conn, "ALTER TABLE odor MODIFY id_sensor INT NOT NULL")
		);
		await tryMigration("coluna alerta.resolvido_em", () =>
			ensureColumn(conn, "alerta", "resolvido_em", "resolvido_em DATETIME NULL")
		);
		await tryMigration("nullable de nivel_esgoto.nivel_percentual", () =>
			query(conn, "ALTER TABLE nivel_esgoto MODIFY nivel_percentual DECIMAL(5,2) NULL")
		);

		await tryMigration("índice sensor.codigo", () =>
			ensureIndex(conn, "sensor", "sensor_codigo", "UNIQUE KEY sensor_codigo (codigo)")
		);
		await tryMigration("índice odor.data + odor.id_sensor", () =>
			ensureIndex(conn, "odor", "odor_data_id_sensor", "KEY odor_data_id_sensor (data, id_sensor)")
		);
		await tryMigration("índice odor.id_sensor", () =>
			ensureIndex(conn, "odor", "odor_id_sensor", "KEY odor_id_sensor (id_sensor)")
		);
		await tryMigration("índice nivel_esgoto.id_sensor + nivel_esgoto.data", () =>
			ensureIndex(conn, "nivel_esgoto", "nivel_esgoto_sensor_data", "KEY nivel_esgoto_sensor_data (id_sensor, data)")
		);
		await tryMigration("índice alerta.id_sensor", () =>
			ensureIndex(conn, "alerta", "alerta_sensor", "KEY alerta_sensor (id_sensor)")
		);
		await tryMigration("índice alerta.resolvido + alerta.data", () =>
			ensureIndex(conn, "alerta", "alerta_resolvido", "KEY alerta_resolvido (resolvido, data)")
		);

		await tryMigration("foreign key odor -> sensor", () =>
			ensureForeignKey(
				conn,
				"odor",
				"id_sensor",
				"CONSTRAINT fk_odor_sensor FOREIGN KEY (id_sensor) REFERENCES sensor (id) ON DELETE CASCADE"
			)
		);
		await tryMigration("foreign key nivel_esgoto -> sensor", () =>
			ensureForeignKey(
				conn,
				"nivel_esgoto",
				"id_sensor",
				"CONSTRAINT fk_nivel_sensor FOREIGN KEY (id_sensor) REFERENCES sensor (id) ON DELETE CASCADE"
			)
		);
		await tryMigration("foreign key alerta -> sensor", () =>
			ensureForeignKey(
				conn,
				"alerta",
				"id_sensor",
				"CONSTRAINT fk_alerta_sensor FOREIGN KEY (id_sensor) REFERENCES sensor (id) ON DELETE CASCADE"
			)
		);

		await seedDatabase(conn);
	});

	console.log("Banco de dados verificado e pronto.");
}

module.exports = { ensureSchema };
