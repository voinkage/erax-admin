/**
 * Müfredat içerikleri router – erax-admin
 * Sadece kitaplar (Ünite Sihirbazı). Path: /api/mufredat/icerikleri/kitaplar
 */
const express = require('express');
const router = express.Router();
const kitaplarRouter = require('./kitaplar');

router.use('/kitaplar', kitaplarRouter);

module.exports = router;
