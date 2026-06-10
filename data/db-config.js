function positiveInteger(value, fallback) {
	const parsed = Number.parseInt(value, 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanValue(value, fallback) {
	if (value == null || value === "") {
		return fallback;
	}

	const normalized = String(value).trim().toLowerCase();
	if (["1", "true", "yes", "sim"].includes(normalized)) {
		return true;
	}
	if (["0", "false", "no", "nao"].includes(normalized)) {
		return false;
	}
	return fallback;
}

function getDatabaseConfig(env) {
	const missing = ["sql_host", "sql_user", "sql_database"]
		.filter((name) => !env[name] || !String(env[name]).trim());

	return {
		missing,
		config: {
			connectionLimit: positiveInteger(env.sql_connectionLimit, 30),
			waitForConnections: booleanValue(env.sql_waitForConnections, true),
			charset: env.sql_charset || "utf8mb4",
			host: env.sql_host,
			port: positiveInteger(env.sql_port, 3306),
			user: env.sql_user,
			password: env.sql_password || "",
			database: env.sql_database
		}
	};
}

module.exports = { getDatabaseConfig, positiveInteger };
