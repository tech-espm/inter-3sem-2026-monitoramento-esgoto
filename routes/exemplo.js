const express = require("express");
const wrap = require("express-async-error-wrapper");

const router = express.Router();

router.get("/", wrap(async (req, res) => {
	res.render("exemplo/index");
}));

router.get("/teste", wrap(async (req, res) => {
	res.render("exemplo/teste");
}));

module.exports = router;
