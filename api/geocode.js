const { send } = require("./_forward");

module.exports = (req, res) => send("/api/geocode", req, res);
