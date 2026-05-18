const express = require("express");
const wrap = require("express-async-error-wrapper");
const axios = require("axios");
const sql = require("../data/sql");

const router = express.Router();

const url_api = process.env.url_api;

router.get("/", wrap(async (req, res) => {
	await sql.connect(async sql => {
		let lista = await sql.query("select max(id) id from odor");

		let id_inferior = 47394;
		if (lista[0].id) {
			id_inferior = lista[0].id;
		}

		const response = await axios.get(url_api + "?sensor=odor&id_inferior=" + id_inferior);
		const dadosNovos = response.data;

		for (let i = 0; i < dadosNovos.length; i++) {
			const dadoNovo = dadosNovos[i];

			await sql.query("insert into odor (id, data, id_sensor, delta, bateria, h2s, umidade, nh3, temperatura) values (?, ?, ?, ?, ?, ?, ?, ?, ?)", [dadoNovo.id, dadoNovo.data, dadoNovo.id_sensor, dadoNovo.delta, dadoNovo.bateria, dadoNovo.h2s, dadoNovo.umidade, dadoNovo.nh3, dadoNovo.temperatura]);
		}
	});

	let nomeDoUsuarioQueVeioDoBanco = "Rafael";

	let opcoes = {
		usuario: nomeDoUsuarioQueVeioDoBanco,
		quantidadeDeRepeticoes: 5
	};

	res.render("index/dashboard", opcoes);
}));

router.get("/teste", wrap(async (req, res) => {
	let opcoes = {
		layout: "casca-teste"
	};

	res.render("index/teste", opcoes);
}));

router.get("/teste2", wrap(async (req, res) => {
	let opcoes = {
		layout: "casca-teste"
	};

	res.render("index/teste2", opcoes);
}));

router.get("/teste3", wrap(async (req, res) => {
	let opcoes = {
		layout: "casca-teste"
	};

	res.render("index/teste3", opcoes);
}));

router.get("/produtos", wrap(async (req, res) => {
	let produtoA = {
		id: 1,
		nome: "Produto A",
		valor: 25
	};

	let produtoB = {
		id: 2,
		nome: "Produto B",
		valor: 15
	};

	let produtoC = {
		id: 3,
		nome: "Produto C",
		valor: 100
	};

	let produtosVindosDoBanco = [ produtoA, produtoB, produtoC ];

	let opcoes = {
		titulo: "Listagem de Produtos",
		produtos: produtosVindosDoBanco
	};

	res.render("index/produtos", opcoes);
}));

module.exports = router;

