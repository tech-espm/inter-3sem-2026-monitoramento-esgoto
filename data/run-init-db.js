const sql = require("./sql");
const { getDatabaseConfig } = require("./db-config");
const { ensureSchema } = require("./init-db");

require("dotenv").config({ encoding: "utf8" });

const database = getDatabaseConfig(process.env);

if (database.missing.length) {
	console.error("Variáveis obrigatórias ausentes: " + database.missing.join(", "));
	process.exitCode = 1;
} else {
	sql.init(database.config);
	ensureSchema()
		.then(() => process.exit(0))
		.catch((error) => {
			console.error("Não foi possível inicializar o banco:", error.message);
			process.exit(1);
		});
}
