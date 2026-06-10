const mysql = require("mysql2");

let pool = null;

class Sql {
	constructor() {
		// https://www.npmjs.com/package/mysql2
		this.connection = null;
		this.pendingTransaction = false;
		this.affectedRows = 0;
		this.resultFields = null;
	}
	static async connect(callback) {
		if (!pool)
			throw new Error("Pool MySQL não inicializado");
		if (typeof callback !== "function")
			throw new Error("Callback de conexão inválido");

		const connection = await new Promise((resolve, reject) => {
			pool.getConnection((error, conn) => error ? reject(error) : resolve(conn));
		});
		const sql = new Sql();
		sql.connection = connection;

		try {
			return await callback(sql);
		} finally {
			if (sql.pendingTransaction) {
				try {
					await sql.rollback();
				} catch (error) {
					console.error("Falha ao desfazer transação MySQL:", error.message);
				}
			}
			sql.connection = null;
			sql.resultFields = null;
			connection.release();
		}
	}
	static init(poolConfig) {
		if (!poolConfig)
			throw new Error("Missing poolConfig");
		if (!pool)
			pool = mysql.createPool(poolConfig);
	}
	async query(queryStr, values) {
		if (!this.connection)
			throw new Error("Conexão MySQL não disponível");
		return new Promise((resolve, reject) => {
			const callback = (error, results, fields) => {
				if (error) {
					reject(error);
					return;
				}
				this.affectedRows = parseInt(results.affectedRows) | 0;
				this.resultFields = (fields || null);
				resolve(results);
			};
			if (values && values.length)
				this.connection.query(queryStr, values, callback);
			else
				this.connection.query(queryStr, callback);
		});
	}
	async scalar(queryStr, values) {
		if (!this.connection)
			throw new Error("Conexão MySQL não disponível");
		return new Promise((resolve, reject) => {
			const callback = (error, results, fields) => {
				if (error) {
					reject(error);
					return;
				}
				this.affectedRows = parseInt(results.affectedRows) | 0;
				this.resultFields = (fields || null);
				if (results) {
					const r = results[0];
					if (r) {
						for (let i in r) {
							resolve(r[i]);
							return;
						}
					}
				}
				resolve(null);
			};
			if (values && values.length)
				this.connection.query(queryStr, values, callback);
			else
				this.connection.query(queryStr, callback);
		});
	}
	async beginTransaction() {
		if (this.pendingTransaction)
			throw new Error("There is already an open transaction in this connection");
		if (!this.connection)
			throw new Error("Conexão MySQL não disponível");
		return new Promise((resolve, reject) => {
			this.connection.beginTransaction((error) => {
				if (error) {
					reject(error);
					return;
				}
				this.pendingTransaction = true;
				resolve();
			});
		});
	}
	async commit() {
		if (!this.pendingTransaction)
			return;
		if (!this.connection)
			throw new Error("Conexão MySQL não disponível");
		return new Promise((resolve, reject) => {
			this.connection.commit((error) => {
				if (error) {
					reject(error);
					return;
				}
				this.pendingTransaction = false;
				resolve();
			});
		});
	}
	async rollback() {
		if (!this.pendingTransaction)
			return;
		if (!this.connection)
			throw new Error("Conexão MySQL não disponível");
		return new Promise((resolve, reject) => {
			this.connection.rollback(() => {
				this.pendingTransaction = false;
				resolve();
			});
		});
	}
}

module.exports = Sql;
