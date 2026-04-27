const express = require("express");
const wrap = require("express-async-error-wrapper");
const axios = require("axios");
const sql = require("../data/sql");

const router = express.Router();

const url_api = process.env.url_api;

router.get("/", wrap(async (req, res) => {
	const response = await axios.get(url_api + "?sensor=passage&data_inicial=2026-04-26&data_final=2026-04-28");
	const dados = response.data;
	console.log(dados);

	await sql.connect(async sql => {
		const lista = await sql.query("select 1");

		console.log(lista);
	});

	let nomeDoUsuarioQueVeioDoBanco = "Rafael";

	let opcoes = {
		usuario: nomeDoUsuarioQueVeioDoBanco,
		quantidadeDeRepeticoes: 5
	};

	res.render("index/index", opcoes);
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
